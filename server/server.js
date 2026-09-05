// server/server.js — ต่อสาย socket เข้ากับกติกาใน game.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const cfg = require("./config");
const R = require("./rooms");
const G = require("./game");
const { stateFor } = require("./state");
const NR = require("./games/numbers/rules");
const NState = require("./games/numbers/state");
const SF = require("./games/spyfall/rules");
const SFState = require("./games/spyfall/state");
const WW = require("./games/werewolf/rules");
const WWRoles = require("./games/werewolf/roles");
const WWState = require("./games/werewolf/state");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 20000, pingInterval: 10000 });

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.disable("x-powered-by");

// HTML ต้องไม่ถูกแคช ไม่งั้น deploy ใหม่แล้วคนยังได้หน้าเก่าค้างอยู่เป็นชั่วโมง
// ส่วน css/js แคชได้ แต่ต้อง revalidate ทุกครั้ง กันโหลดโค้ดเก่ามาชนกัน
app.use(express.static(path.join(__dirname, "..", "public"), {
  etag: true,
  setHeaders(res, filePath) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Cache-Control",
      filePath.endsWith(".html") ? "no-store" : "no-cache"
    );
  }
}));
// เสิร์ฟไลบรารี QR จาก node_modules ตรงๆ ไม่ต้อง bundle และไม่ต้องพึ่ง CDN
// (เล่นในวงเหล้า/เน็ตบ้านบางที่ CDN โดนบล็อก QR ต้องขึ้นให้ได้อยู่ดี)
// โหมดต่อหน้ากันรันกติกาในเบราว์เซอร์ล้วน จึงต้องใช้ไฟล์เดียวกับที่ server ใช้
// ถ้าก๊อปไปไว้อีกที่ วันหนึ่งสองฝั่งจะเพี้ยนกันแน่นอน
// ทะเบียนเกม หน้า hub อ่านจากไฟล์เดียวกับที่ server ใช้
const CATALOG = require.resolve("./games/catalog");
app.get("/catalog.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(CATALOG);
});

const NUMBERS_RULES = require.resolve("./games/numbers/rules");
app.get("/numbers-rules.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(NUMBERS_RULES);
});

// เกมที่รันในเบราว์เซอร์ล้วน แต่ใช้ไฟล์กติกาเดียวกับที่เทสต์ฝั่ง node
// เสิร์ฟตรงจากซอร์ส ไม่ก๊อป ไม่ bundle จึงไม่มีทางเพี้ยนคนละทาง
[
  ["/twenty-rules.js", "./games/twenty/rules"],
  ["/twenty-match.js", "./games/twenty/match"],
  ["/guess-words.js", "./games/guess/words"],
  ["/guess-rules.js", "./games/guess/rules"],
  ["/chain-thai.js", "./games/chain/thai"],
  ["/chain-rules.js", "./games/chain/rules"],
  ["/spyfall-locations.js", "./games/spyfall/locations"],
  ["/werewolf-roles.js", "./games/werewolf/roles"]
].forEach(([route, mod]) => {
  const file = require.resolve(mod);
  app.get(route, (_req, res) => {
    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(file);
  });
});

const QRCODE_LIB = require.resolve("qrcode-generator");
app.get("/vendor/qrcode.js", (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(QRCODE_LIB);
});

app.get("/healthz", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// ---------- helpers ----------

function fail(socket, message) {
  socket.emit("error-msg", { message });
}

// ส่ง state แยกรายคน เพราะแต่ละคนเห็นคำไม่เหมือนกัน
function pushState(code) {
  const room = rooms.get(code);
  if (!room) return;

  const builders = {
    numbers: (viewerId) => NState.roomView(room, viewerId),
    spyfall: (viewerId) => SFState.roomView(room, viewerId),
    werewolf: (viewerId) => WWState.roomView(room, viewerId)
  };
  const build = builders[room.gameType] || ((viewerId) => stateFor(room, viewerId));

  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit("state", build(p.id));
  }
  // จอฉายมีเฉพาะเกมคำต้องห้าม
  if (room.gameType === "forbidden") {
    for (const sid of room.spectators) {
      io.to(sid).emit("state", stateFor(room, null));
    }
  }
}

function announce(code, event, payload) {
  if (!rooms.has(code)) return;
  io.to(code).emit(event, payload);
}

function endRound(code, reason, { commit = true } = {}) {
  const room = rooms.get(code);
  if (!room || !room.round.running) return;

  const results = G.finishRound(room, { commit });
  announce(code, "round-ended", { reason, results, roundNumber: room.round.number });
  pushState(code);
}

function armTimer(code, ms) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => endRound(code, "timeup"), ms);
}

function autoEndIfDone(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (G.shouldAutoEnd(room)) endRound(code, "last-standing");
}

// หา room+player จาก socket ปัจจุบัน แล้วเช็คสิทธิ์ให้ครบในที่เดียว
function contextOf(socket, roomCode, { hostOnly = false } = {}) {
  const code = R.normalizeCode(roomCode);
  const room = rooms.get(code);
  if (!room) return { error: "ไม่พบห้องนี้ อาจถูกปิดไปแล้ว" };

  const player = R.findPlayerBySocket(room, socket.id);
  if (!player) return { error: "คุณไม่ได้อยู่ในห้องนี้" };

  if (hostOnly && room.hostId !== player.id) {
    return { error: "เฉพาะโฮสต์เท่านั้นที่ทำรายการนี้ได้" };
  }
  return { code, room, player };
}

// ---------- socket ----------

io.on("connection", (socket) => {
  socket.on("create-room", ({ name, gameType }) => {
    const raw = String(name || "").trim();
    if (!raw) return fail(socket, "กรุณาใส่ชื่อก่อน");

    let room;
    try {
      room = R.createRoom(rooms, gameType);
    } catch (e) {
      return fail(socket, e.message);
    }

    const player = R.createPlayer(R.uniqueName(room, raw));
    room.players.set(player.id, player);
    room.hostId = player.id;
    R.attachSocket(room, player, socket.id);
    socket.join(room.code);

    socket.emit("room-created", {
      roomCode: room.code,
      gameType: room.gameType,
      playerId: player.id,
      spectatorKey: room.spectatorKey
    });
    pushState(room.code);
  });

  /**
   * เข้าห้อง หรือกลับเข้าห้องเดิม
   * ถ้าส่ง playerId ที่เคยได้มาและยังอยู่ในห้อง = ได้คะแนน/สถานะเดิมคืนทั้งหมด
   */
  socket.on("join-room", ({ roomCode, name, playerId, gameType }) => {
    const code = R.normalizeCode(roomCode);
    const room = rooms.get(code);
    if (!room) return fail(socket, "ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง");

    // เอารหัสห้องข้ามเกมมาใส่ ต้องบอกให้ชัดว่าไปผิดหน้า ไม่ใช่พังเงียบๆ
    if (gameType && gameType !== room.gameType) {
      const label = {
        numbers: "เกมทายเลข",
        spyfall: "เกม Spyfall",
        werewolf: "เกมหมาป่า"
      }[room.gameType] || "เกมคำต้องห้าม";
      return socket.emit("wrong-game", {
        gameType: room.gameType,
        roomCode: code,
        message: "ห้อง " + code + " เป็นห้องของ" + label + " กำลังพาไปหน้าที่ถูกต้อง"
      });
    }

    R.clearRoomCleanup(room);

    const existing = playerId ? room.players.get(String(playerId)) : null;

    if (existing) {
      // เครื่องเดิมต้องถูกไล่ออกให้ชัดเจน ไม่ใช่ค้างอยู่กับกระดานเก่าที่ไม่อัปเดตแล้ว
      if (existing.connected && existing.socketId !== socket.id) {
        const old = io.sockets.sockets.get(existing.socketId);
        if (old) {
          old.emit("session-taken");
          old.leave(code);
        }
      }
      const wanted = String(name || "").trim();
      if (wanted && wanted !== existing.name) {
        existing.name = R.uniqueName(room, wanted, existing.id);
      }
      R.attachSocket(room, existing, socket.id);
      socket.join(code);
      R.ensureHost(room);

      socket.emit("joined", {
        roomCode: code,
        gameType: room.gameType,
        playerId: existing.id,
        reconnected: true,
        spectatorKey: room.hostId === existing.id ? room.spectatorKey : null
      });
      pushState(code);
      return;
    }

    const limit = room.gameType === "numbers" ? cfg.MAX_PLAYERS_NUMBERS
      : room.gameType === "spyfall" ? SF.MAX_PLAYERS
      : cfg.MAX_PLAYERS;
    if (room.players.size >= limit) {
      return fail(socket, `ห้องเต็มแล้ว (สูงสุด ${limit} คน)`);
    }

    const finalName = R.uniqueName(room, name);
    if (!finalName) return fail(socket, "กรุณาใส่ชื่อก่อน");

    const player = R.createPlayer(finalName);
    room.players.set(player.id, player);
    R.attachSocket(room, player, socket.id);
    socket.join(code);
    R.ensureHost(room);

    socket.emit("joined", {
      roomCode: code,
      gameType: room.gameType,
      playerId: player.id,
      reconnected: false,
      spectatorKey: room.hostId === player.id ? room.spectatorKey : null
    });
    pushState(code);
  });

  // จอฉาย/สตรีม เห็นคำของทุกคน จึงต้องมีคีย์
  socket.on("watch-room", ({ roomCode, key }) => {
    const code = R.normalizeCode(roomCode);
    const room = rooms.get(code);
    if (!room) return fail(socket, "ไม่พบห้องนี้");
    if (String(key || "") !== room.spectatorKey) {
      return fail(socket, "ลิงก์จอฉายไม่ถูกต้อง ขอลิงก์ใหม่จากโฮสต์");
    }

    R.clearRoomCleanup(room);
    room.spectators.add(socket.id);
    socket.join(code);
    socket.emit("watching", { roomCode: code });
    socket.emit("state", stateFor(room, null));
  });

  socket.on("submit-word", ({ roomCode, word }) => {
    const ctx = contextOf(socket, roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room, player } = ctx;

    if (room.round.running) return fail(socket, "รอบกำลังเล่นอยู่ รอรอบหน้านะ");

    const w = String(word || "").trim().replace(/\s+/g, " ");
    if (!w) return fail(socket, "ยังไม่ได้พิมพ์คำ");
    if (w.length > cfg.MAX_WORD_LEN) {
      return fail(socket, `คำยาวเกินไป (ไม่เกิน ${cfg.MAX_WORD_LEN} ตัวอักษร)`);
    }

    player.word = w;
    socket.emit("word-accepted", { word: w });
    pushState(code);
  });

  socket.on("start-round", ({ roomCode, durationMs }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    if (room.round.running) return fail(socket, "รอบนี้กำลังเล่นอยู่แล้ว");

    const raw = Number(durationMs);
    const dur = Number.isFinite(raw)
      ? Math.max(cfg.ROUND_MIN_MS, Math.min(raw, cfg.ROUND_MAX_MS))
      : cfg.ROUND_DEFAULT_MS;

    try {
      G.startRound(room, dur);
    } catch (e) {
      return fail(socket, e.message);
    }

    armTimer(code, dur);
    announce(code, "round-started", {
      endsAt: room.round.endsAt,
      durationMs: dur,
      number: room.round.number
    });
    pushState(code);
  });

  // ใครก็ได้ที่ยังอยู่ในรอบ กดจับผิดคนที่เผลอพูดคำตัวเองได้
  socket.on("call-out", ({ roomCode, targetId }) => {
    const ctx = contextOf(socket, roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room, player } = ctx;

    let event;
    try {
      event = G.callOut(room, player.id, String(targetId || ""));
    } catch (e) {
      return fail(socket, e.message);
    }

    announce(code, "called-out", {
      callerName: event.callerName,
      targetName: event.targetName,
      word: event.word
    });
    pushState(code);
    autoEndIfDone(code);
  });

  socket.on("undo-callout", ({ roomCode }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    let last;
    try {
      last = G.undoCallout(room);
    } catch (e) {
      return fail(socket, e.message);
    }

    announce(code, "callout-undone", { targetName: last.targetName });
    pushState(code);
  });

  socket.on("toggle-pause", ({ roomCode }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;
    if (!room.round.running) return fail(socket, "ยังไม่ได้เริ่มรอบ");

    if (room.round.paused) {
      const left = Math.max(0, room.round.remainingMs || 0);
      if (left <= 0) return endRound(code, "timeup");
      room.round.paused = false;
      room.round.endsAt = Date.now() + left;
      armTimer(code, left);
      announce(code, "round-resumed", { endsAt: room.round.endsAt });
    } else {
      if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
      }
      room.round.remainingMs = Math.max(0, (room.round.endsAt || Date.now()) - Date.now());
      room.round.paused = true;
      room.round.endsAt = null;
      announce(code, "round-paused", { remainingMs: room.round.remainingMs });
    }
    pushState(code);
  });

  socket.on("end-round", ({ roomCode }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    if (!ctx.room.round.running) return fail(socket, "ยังไม่ได้เริ่มรอบ");
    endRound(ctx.code, "host");
  });

  socket.on("reset-scores", ({ roomCode }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    room.round.running = false;
    room.round.paused = false;
    room.round.endsAt = null;
    G.resetScores(room);

    announce(code, "scores-reset", {});
    pushState(code);
  });

  socket.on("kick-player", ({ roomCode, targetId }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room, player } = ctx;

    const target = room.players.get(String(targetId || ""));
    if (!target) return;
    if (target.id === player.id) return fail(socket, "เตะตัวเองไม่ได้");

    if (target.socketId) {
      const s = io.sockets.sockets.get(target.socketId);
      if (s) {
        s.emit("kicked");
        s.leave(code);
      }
    }
    room.players.delete(target.id);

    R.ensureHost(room);
    pushState(code);
    autoEndIfDone(code);
  });

  socket.on("transfer-host", ({ roomCode, targetId }) => {
    const ctx = contextOf(socket, roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    const target = room.players.get(String(targetId || ""));
    if (!target || !target.connected) return fail(socket, "ผู้เล่นคนนี้ไม่ได้ออนไลน์");
    room.hostId = target.id;

    if (target.socketId) {
      io.to(target.socketId).emit("host-granted", { spectatorKey: room.spectatorKey });
    }
    pushState(code);
  });

  // ---------- เกมทายเลข ----------

  function numbersCtx(roomCode, opts) {
    const ctx = contextOf(socket, roomCode, opts);
    if (ctx.error) return ctx;
    if (ctx.room.gameType !== "numbers") return { error: "ห้องนี้ไม่ใช่เกมทายเลข" };
    return ctx;
  }

  socket.on("numbers-settings", ({ roomCode, format, maxGuesses }) => {
    const ctx = numbersCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    if (room.numbersMatch && room.numbersMatch.phase !== "finished") {
      return fail(socket, "เกมกำลังเล่นอยู่ ตั้งค่าใหม่ไม่ได้");
    }

    const raw = Number(maxGuesses);
    room.numbersSettings = {
      format: format === "alternate" ? "alternate" : "single",
      maxGuesses: Number.isFinite(raw)
        ? Math.max(NR.MIN_GUESSES, Math.min(Math.round(raw), NR.MAX_GUESSES))
        : NR.DEFAULT_GUESSES
    };
    pushState(code);
  });

  socket.on("numbers-start", ({ roomCode }) => {
    const ctx = numbersCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    const ids = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
    if (ids.length !== 2) return fail(socket, "เกมทายเลขต้องมีผู้เล่นออนไลน์ 2 คนพอดี");

    try {
      room.numbersMatch = NR.createMatch({
        playerIds: ids,
        format: room.numbersSettings.format,
        maxGuesses: room.numbersSettings.maxGuesses,
        // สลับคนเริ่มก่อนทุกเกม จะได้ไม่มีใครได้เปรียบสะสม
        firstGuesser: ids[(room.numbersGameNo || 0) % 2]
      });
      room.numbersGameNo = (room.numbersGameNo || 0) + 1;
    } catch (e) {
      return fail(socket, e.message);
    }

    announce(code, "numbers-started", { gameNo: room.numbersGameNo });
    pushState(code);
  });

  socket.on("numbers-secret", ({ roomCode, value }) => {
    const ctx = numbersCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room, player } = ctx;

    if (!room.numbersMatch) return fail(socket, "ยังไม่ได้เริ่มเกม");

    try {
      NR.setSecret(room.numbersMatch, player.id, Math.round(Number(value)));
    } catch (e) {
      return fail(socket, e.message);
    }

    socket.emit("numbers-secret-ok", { value: Math.round(Number(value)) });
    if (room.numbersMatch.phase === "playing") {
      announce(code, "numbers-playing", { turn: room.numbersMatch.turn });
    }
    pushState(code);
  });

  socket.on("numbers-guess", ({ roomCode, value }) => {
    const ctx = numbersCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room, player } = ctx;

    const match = room.numbersMatch;
    if (!match) return fail(socket, "ยังไม่ได้เริ่มเกม");

    let outcome;
    try {
      outcome = NR.guess(match, player.id, Math.round(Number(value)));
    } catch (e) {
      return fail(socket, e.message);
    }

    announce(code, "numbers-guessed", {
      byId: player.id,
      byName: player.name,
      value: outcome.value,
      verdict: outcome.verdict,
      low: outcome.low,
      high: outcome.high
    });

    if (match.phase === "finished") {
      // คะแนนสะสมข้ามเกม เก็บไว้ที่ player เหมือนเกมคำต้องห้าม
      for (const id of match.playerIds) {
        const p = room.players.get(id);
        if (p) p.score = (p.score || 0) + (match.result.scores[id] || 0);
      }
      announce(code, "numbers-finished", { result: match.result });
    }

    pushState(code);
  });

  // ---------- Spyfall ----------

  function sfCtx(roomCode, opts) {
    const ctx = contextOf(socket, roomCode, opts);
    if (ctx.error) return ctx;
    if (ctx.room.gameType !== "spyfall") return { error: "ห้องนี้ไม่ใช่เกม Spyfall" };
    return ctx;
  }

  socket.on("spyfall-settings", ({ roomCode, packIds, minutes }) => {
    const ctx = sfCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);

    const mins = Number(minutes);
    ctx.room.spyfallSettings = {
      packIds: Array.isArray(packIds) && packIds.length ? packIds : ["thai"],
      minutes: Number.isFinite(mins) ? Math.max(3, Math.min(Math.round(mins), 15)) : 8
    };
    pushState(ctx.code);
  });

  socket.on("spyfall-start", ({ roomCode }) => {
    const ctx = sfCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    const ids = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
    try {
      if (!room.spyfallGame || room.spyfallGame.playerIds.length !== ids.length) {
        room.spyfallGame = SF.createGame(ids, room.spyfallSettings);
      } else {
        room.spyfallGame.packIds = room.spyfallSettings.packIds;
        room.spyfallGame.minutes = room.spyfallSettings.minutes;
      }
      SF.startRound(room.spyfallGame);
    } catch (e) {
      return fail(socket, e.message);
    }

    announce(code, "spyfall-started", { round: room.spyfallGame.round });
    pushState(code);
  });

  socket.on("spyfall-guess", ({ roomCode, location }) => {
    const ctx = sfCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    try {
      SF.spyGuess(ctx.room.spyfallGame, ctx.player.id, location);
    } catch (e) {
      return fail(socket, e.message);
    }
    commitSpyfall(ctx.room);
    announce(ctx.code, "spyfall-ended", { result: ctx.room.spyfallGame.result });
    pushState(ctx.code);
  });

  socket.on("spyfall-accuse", ({ roomCode, targetId }) => {
    const ctx = sfCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    try {
      SF.startVote(ctx.room.spyfallGame, ctx.player.id, String(targetId || ""));
    } catch (e) {
      return fail(socket, e.message);
    }
    announce(ctx.code, "spyfall-vote-open", { targetId });
    pushState(ctx.code);
  });

  socket.on("spyfall-vote", ({ roomCode, agree }) => {
    const ctx = sfCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    try {
      SF.castVote(ctx.room.spyfallGame, ctx.player.id, !!agree);
    } catch (e) {
      return fail(socket, e.message);
    }

    // ทุกคนที่โหวตได้ลงคะแนนครบแล้วปิดโหวตเลย ไม่ต้องรอใครกด
    const g = ctx.room.spyfallGame;
    const tally = SF.voteTally(g);
    if (tally.total >= tally.needed) {
      SF.resolveVote(g);
      if (g.phase === "finished") {
        commitSpyfall(ctx.room);
        announce(ctx.code, "spyfall-ended", { result: g.result });
      } else {
        announce(ctx.code, "spyfall-vote-failed", {});
      }
    }
    pushState(ctx.code);
  });

  socket.on("spyfall-timeup", ({ roomCode }) => {
    const ctx = sfCtx(roomCode, { hostOnly: true });
    if (ctx.error) return;
    const g = ctx.room.spyfallGame;
    if (!g || g.phase !== "playing") return;

    SF.timeUp(g);
    commitSpyfall(ctx.room);
    announce(ctx.code, "spyfall-ended", { result: g.result });
    pushState(ctx.code);
  });

  function commitSpyfall(room) {
    const g = room.spyfallGame;
    if (!g || !g.result) return;
    Object.keys(g.result.scores).forEach((id) => {
      const p = room.players.get(id);
      if (p) p.score = (p.score || 0) + g.result.scores[id];
    });
  }

  // ---------- หมาป่า ----------

  function wwCtx(roomCode, opts) {
    const ctx = contextOf(socket, roomCode, opts);
    if (ctx.error) return ctx;
    if (ctx.room.gameType !== "werewolf") return { error: "ห้องนี้ไม่ใช่เกมหมาป่า" };
    return ctx;
  }

  socket.on("werewolf-settings", ({ roomCode, presetId, comp }) => {
    const ctx = wwCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);

    ctx.room.werewolfSettings = {
      presetId: presetId || null,
      comp: comp && typeof comp === "object" ? comp : null
    };
    pushState(ctx.code);
  });

  socket.on("werewolf-start", ({ roomCode }) => {
    const ctx = wwCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    const { code, room } = ctx;

    const list = [...room.players.values()]
      .filter((p) => p.connected)
      .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }));

    const settings = room.werewolfSettings || {};
    const comp = settings.comp || WWRoles.composeFromPreset(settings.presetId || "starter", list.length);

    try {
      room.werewolfGame = WW.createGame(list, comp);
    } catch (e) {
      return fail(socket, e.message);
    }

    announce(code, "werewolf-started", {});
    pushState(code);
  });

  socket.on("werewolf-night", ({ roomCode, payload }) => {
    const ctx = wwCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    try {
      WW.nightAction(ctx.room.werewolfGame, ctx.player.id, payload || {});
    } catch (e) {
      return fail(socket, e.message);
    }
    afterWerewolf(ctx);
  });

  socket.on("werewolf-skip", ({ roomCode }) => {
    const ctx = wwCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    WW.skipStep(ctx.room.werewolfGame);
    afterWerewolf(ctx);
  });

  socket.on("werewolf-start-vote", ({ roomCode }) => {
    const ctx = wwCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    try {
      WW.startVote(ctx.room.werewolfGame);
    } catch (e) {
      return fail(socket, e.message);
    }
    afterWerewolf(ctx);
  });

  socket.on("werewolf-vote", ({ roomCode, targetId }) => {
    const ctx = wwCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    try {
      WW.castVote(ctx.room.werewolfGame, ctx.player.id, targetId || null);
    } catch (e) {
      return fail(socket, e.message);
    }
    pushState(ctx.code);
  });

  socket.on("werewolf-resolve-vote", ({ roomCode }) => {
    const ctx = wwCtx(roomCode, { hostOnly: true });
    if (ctx.error) return fail(socket, ctx.error);
    try {
      WW.resolveVote(ctx.room.werewolfGame);
    } catch (e) {
      return fail(socket, e.message);
    }
    afterWerewolf(ctx);
  });

  socket.on("werewolf-hunter", ({ roomCode, targetId }) => {
    const ctx = wwCtx(roomCode);
    if (ctx.error) return fail(socket, ctx.error);
    try {
      WW.hunterShoot(ctx.room.werewolfGame, ctx.player.id, String(targetId || ""));
    } catch (e) {
      return fail(socket, e.message);
    }
    afterWerewolf(ctx);
  });

  function afterWerewolf(ctx) {
    const g = ctx.room.werewolfGame;
    if (g && g.phase === "finished" && !g.committed) {
      g.committed = true;
      Object.keys(g.result.scores).forEach((id) => {
        const p = ctx.room.players.get(id);
        if (p) p.score = (p.score || 0) + g.result.scores[id];
      });
      announce(ctx.code, "werewolf-ended", { result: g.result });
    }
    pushState(ctx.code);
  }

  socket.on("leave-room", ({ roomCode }) => {
    const ctx = contextOf(socket, roomCode);
    if (ctx.error) return;
    const { code, room, player } = ctx;

    room.players.delete(player.id);
    socket.leave(code);
    R.ensureHost(room);

    if (R.connectedPlayers(room).length === 0) {
      R.scheduleRoomCleanup(rooms, code);
      return;
    }
    pushState(code);
    autoEndIfDone(code);
  });

  /**
   * เน็ตหลุด: ไม่ลบผู้เล่นทันที และไม่ล้มรอบทิ้ง
   * เก็บที่นั่งไว้ตาม RECONNECT_GRACE_MS ให้กลับมาต่อได้พร้อมคะแนนเดิม
   */
  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      if (room.spectators.delete(socket.id)) continue;

      const player = R.findPlayerBySocket(room, socket.id);
      if (!player) continue;

      R.detachSocket(player);
      R.ensureHost(room);
      pushState(code);

      setTimeout(() => {
        const latest = rooms.get(code);
        if (!latest) return;
        const p = latest.players.get(player.id);
        if (!p || p.connected) return;

        latest.players.delete(p.id);
        R.ensureHost(latest);

        if (R.connectedPlayers(latest).length === 0) {
          R.scheduleRoomCleanup(rooms, code);
          return;
        }
        pushState(code);
        autoEndIfDone(code);
      }, cfg.RECONNECT_GRACE_MS);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
