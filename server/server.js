// server/server.js — ต่อสาย socket เข้ากับกติกาใน game.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const cfg = require("./config");
const R = require("./rooms");
const G = require("./game");
const { stateFor } = require("./state");

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

  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit("state", stateFor(room, p.id));
  }
  for (const sid of room.spectators) {
    io.to(sid).emit("state", stateFor(room, null));
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
  socket.on("create-room", ({ name }) => {
    const raw = String(name || "").trim();
    if (!raw) return fail(socket, "กรุณาใส่ชื่อก่อน");

    let room;
    try {
      room = R.createRoom(rooms);
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
      playerId: player.id,
      spectatorKey: room.spectatorKey
    });
    pushState(room.code);
  });

  /**
   * เข้าห้อง หรือกลับเข้าห้องเดิม
   * ถ้าส่ง playerId ที่เคยได้มาและยังอยู่ในห้อง = ได้คะแนน/สถานะเดิมคืนทั้งหมด
   */
  socket.on("join-room", ({ roomCode, name, playerId }) => {
    const code = R.normalizeCode(roomCode);
    const room = rooms.get(code);
    if (!room) return fail(socket, "ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง");

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
        playerId: existing.id,
        reconnected: true,
        spectatorKey: room.hostId === existing.id ? room.spectatorKey : null
      });
      pushState(code);
      return;
    }

    if (room.players.size >= cfg.MAX_PLAYERS) {
      return fail(socket, `ห้องเต็มแล้ว (สูงสุด ${cfg.MAX_PLAYERS} คน)`);
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
