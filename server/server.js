// server/server.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomRoomCode, assignWordsNoSelf } = require("./rooms");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ROOM_EMPTY_TTL_MS = 2 * 60 * 1000;

// serve static
app.use(express.static(path.join(__dirname, "..", "public")));

// in-memory rooms
// rooms: Map roomCode -> room
// room = { code, hostId, users: Map(socketId -> {name, word, assigned}), round: {running, paused, endsAt, durationMs, remainingMs}, timer, emptyTimer }
const rooms = new Map();

function scheduleRoomCleanup(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.users.size > 0) return;

  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  room.emptyTimer = setTimeout(() => {
    const latest = rooms.get(roomCode);
    if (!latest || latest.users.size > 0) return;
    rooms.delete(roomCode);
  }, ROOM_EMPTY_TTL_MS);
}

function clearRoomCleanup(room) {
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
}

function roomPublicState(room) {
  const users = [...room.users.entries()].map(([id, u]) => ({
    id,
    name: u.name,
    hasWord: !!(u.word && String(u.word).trim()),
    score: u.score || 0,
    roundScore: u.roundScore || 0,
    roundLost: !!u.roundLost,
    lostBy: u.lostBy || null
  }));

  return {
    code: room.code,
    hostId: room.hostId,
    users,
    round: room.round
  };
}

function buildResults(room) {
  return [...room.users.values()].map((u) => ({
    name: u.name,
    word: u.assigned || "-"
  }));
}

function resetRoundState(room, { updateScores = false, resetScores = false } = {}) {
  for (const u of room.users.values()) {
    const winPoints = Number(u.roundScore || 0);
    if (updateScores && room.round.running) {
      if (!u.roundLost) {
        u.score = (u.score || 0) + 1 + winPoints;
      }
    }
    if (resetScores) {
      u.score = 0;
    }
    u.roundScore = 0;
    u.roundLost = false;
    u.lostBy = null;
    u.word = null;
    u.assigned = null;
  }
}

function endRound(roomCode, reason, { revealAll = false, updateScores = false, resetScores = false } = {}) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  if (revealAll && room.round.running) {
    io.to(roomCode).emit("results-reveal", { results: buildResults(room) });
  }

  resetRoundState(room, { updateScores, resetScores });

  room.round.running = false;
  room.round.paused = false;
  room.round.endsAt = null;
  room.round.remainingMs = null;

  io.to(roomCode).emit("round-ended", { reason });
  broadcastRoomState(roomCode);
}

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room-state", roomPublicState(room));
}


function pauseRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.round.paused) return;

  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  const remaining = room.round.endsAt
    ? Math.max(0, room.round.endsAt - Date.now())
    : Math.max(0, room.round.remainingMs || 0);

  room.round.paused = true;
  room.round.remainingMs = remaining;
  room.round.endsAt = null;

  io.to(roomCode).emit("round-paused", { remainingMs: remaining });
  broadcastRoomState(roomCode);
}

function resumeRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.round.paused) return;

  const remaining = Math.max(0, room.round.remainingMs || 0);
  if (remaining <= 0) {
    endRound(roomCode, "timeup", { revealAll: true, updateScores: true });
    return;
  }

  room.round.paused = false;
  room.round.endsAt = Date.now() + remaining;

  io.to(roomCode).emit("round-resumed", { endsAt: room.round.endsAt, remainingMs: remaining });

  room.timer = setTimeout(() => {
    endRound(roomCode, "timeup", { revealAll: true, updateScores: true });
  }, remaining);

  broadcastRoomState(roomCode);
}

function sendPersonalResults(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // สำหรับ user แต่ละคน: ส่งรายการ "คนอื่น" พร้อม assigned word ของคนอื่น
  for (const [viewerId] of room.users.entries()) {
    const others = [];
    for (const [id, u] of room.users.entries()) {
      if (id === viewerId) continue;
      // คนอื่นจะเห็นคำ assigned ของเรา (ที่เราได้รับจากสุ่ม)
      // แต่เราเองจะไม่เห็นของตัวเอง เพราะถูก filter ออกไปแล้ว
      others.push({
        name: u.name,
        word: u.assigned
      });
    }

    io.to(viewerId).emit("result", { others });
  }
}

io.on("connection", (socket) => {
  // ---- CREATE ROOM ----
  socket.on("create-room", ({ name }) => {
    const trimmed = String(name || "").trim().slice(0, 30);
    if (!trimmed) {
      socket.emit("error-msg", { message: "Name is required." });
      return;
    }

    const code = randomRoomCode(new Set(rooms.keys()));
    const room = {
      code,
      hostId: socket.id,
      users: new Map(),
      round: { running: false, paused: false, endsAt: null, durationMs: 60000, remainingMs: null },
      timer: null,
      emptyTimer: null
    };

    room.users.set(socket.id, {
      name: trimmed,
      word: null,
      assigned: null,
      score: 0,
      roundScore: 0,
      roundLost: false,
      lostBy: null
    });
    rooms.set(code, room);

    socket.join(code);
    socket.emit("room-created", { roomCode: code });
    broadcastRoomState(code);
  });

  // ---- JOIN ROOM ----
  socket.on("join-room", ({ roomCode, name }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const trimmed = String(name || "").trim().slice(0, 30);

    if (!code || !trimmed) {
      socket.emit("error-msg", { message: "Room code and name are required." });
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      socket.emit("error-msg", { message: "Room not found." });
      return;
    }

    clearRoomCleanup(room);

    // กันชื่อซ้ำแบบง่ายๆ: ถ้าซ้ำให้เติมท้าย
    let finalName = trimmed;
    const existingNames = new Set([...room.users.values()].map((u) => u.name));
    if (existingNames.has(finalName)) {
      let i = 2;
      while (existingNames.has(`${finalName}${i}`)) i++;
      finalName = `${finalName}${i}`;
    }

    room.users.set(socket.id, {
      name: finalName,
      word: null,
      assigned: null,
      score: 0,
      roundScore: 0,
      roundLost: false,
      lostBy: null
    });
    if (!room.users.has(room.hostId)) {
      room.hostId = socket.id;
    }
    socket.join(code);

    socket.emit("joined", { roomCode: code, yourId: socket.id });
    broadcastRoomState(code);
  });

  // ---- SUBMIT WORD ----
  socket.on("submit-word", ({ roomCode, word }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (!user) return;

    if (room.round.running) {
      socket.emit("error-msg", { message: "Round already started. Wait for next round." });
      return;
    }

    const w = String(word || "").trim();
    if (!w) {
      socket.emit("error-msg", { message: "Word cannot be empty." });
      return;
    }
    if (w.length > 40) {
      socket.emit("error-msg", { message: "Word too long (max 40 chars)." });
      return;
    }

    user.word = w;
    broadcastRoomState(code);
  });

  // ---- START ROUND (HOST) ----
  socket.on("start-round", ({ roomCode, durationMs }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (socket.id !== room.hostId) {
      socket.emit("error-msg", { message: "Only host can start the round." });
      return;
    }
    if (room.round.running) {
      socket.emit("error-msg", { message: "Round already running." });
      return;
    }

    const ids = [...room.users.keys()];
    if (ids.length < 2) {
      socket.emit("error-msg", { message: "Need at least 2 players." });
      return;
    }

    const dur = Number(durationMs);
    const finalDuration = Number.isFinite(dur) ? Math.max(10_000, Math.min(dur, 300_000)) : room.round.durationMs;
    room.round.durationMs = finalDuration;

    try {
      for (const u of room.users.values()) {
        u.roundScore = 0;
        u.roundLost = false;
        u.lostBy = null;
      }
      assignWordsNoSelf(room.users);
    } catch (e) {
      socket.emit("error-msg", { message: e.message || "Cannot start round." });
      return;
    }

    room.round.running = true;
    room.round.paused = false;
    room.round.endsAt = Date.now() + finalDuration;
    room.round.remainingMs = finalDuration;

    // ส่งผลแบบ personal: แต่ละคนเห็นของคนอื่น ยกเว้นตัวเอง
    sendPersonalResults(code);

    // Broadcast timer start
    io.to(code).emit("round-started", {
      endsAt: room.round.endsAt,
      durationMs: finalDuration
    });

    // set timer
    room.timer = setTimeout(() => {
      endRound(code, "timeup", { revealAll: true, updateScores: true });
    }, finalDuration);

    broadcastRoomState(code);
  });

  // ---- END GAME (HOST) ----
  socket.on("end-game", ({ roomCode }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (socket.id !== room.hostId) {
      socket.emit("error-msg", { message: "Only host can end the game." });
      return;
    }
    if (!room.round.running) {
      socket.emit("error-msg", { message: "Round not running." });
      return;
    }

    endRound(code, "endgame", { revealAll: true, updateScores: true });
  });

  // ---- PAUSE/RESUME (HOST) ----
  socket.on("toggle-pause", ({ roomCode }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (socket.id !== room.hostId) {
      socket.emit("error-msg", { message: "Only host can pause/resume." });
      return;
    }
    if (!room.round.running) {
      socket.emit("error-msg", { message: "Round not running." });
      return;
    }

    if (room.round.paused) {
      resumeRound(code);
    } else {
      pauseRound(code);
    }
  });

  // ---- RESET (HOST) ----
  socket.on("reset-round", ({ roomCode }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (socket.id !== room.hostId) {
      socket.emit("error-msg", { message: "Only host can reset." });
      return;
    }

    endRound(code, "reset", { resetScores: true });
  });

  // ---- MARK LOSS (HOST) ----
  socket.on("mark-loss", ({ roomCode, loserId, winnerId }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (socket.id !== room.hostId) {
      socket.emit("error-msg", { message: "Only host can mark loss." });
      return;
    }
    if (!room.round.running) {
      socket.emit("error-msg", { message: "Round not running." });
      return;
    }
    if (!room.users.has(loserId) || !room.users.has(winnerId)) return;
    if (loserId === winnerId) {
      socket.emit("error-msg", { message: "Winner and loser must be different." });
      return;
    }

    const loser = room.users.get(loserId);
    if (loser.roundLost) return;
    loser.roundLost = true;
    loser.lostBy = winnerId;

    const winner = room.users.get(winnerId);
    winner.roundScore = (winner.roundScore || 0) + 1;

    broadcastRoomState(code);
  });

  // ---- KICK PLAYER (HOST) ----
  socket.on("kick-player", ({ roomCode, targetId }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (socket.id !== room.hostId) {
      socket.emit("error-msg", { message: "Only host can kick players." });
      return;
    }
    if (!room.users.has(targetId)) return;
    if (targetId === room.hostId) {
      socket.emit("error-msg", { message: "Host cannot be kicked." });
      return;
    }

    room.users.delete(targetId);

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.leave(code);
      targetSocket.emit("kicked");
    }

    if (room.users.size === 0) {
      if (room.timer) clearTimeout(room.timer);
      scheduleRoomCleanup(code);
      return;
    }

    if (room.round.running) {
      endRound(code, "player_left");
      return;
    }

    broadcastRoomState(code);
  });

  // ---- LEAVE ROOM ----
  socket.on("leave-room", ({ roomCode }) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    room.users.delete(socket.id);
    socket.leave(code);

    // ถ้าห้องว่าง -> ลบทิ้ง
    if (room.users.size === 0) {
      if (room.timer) clearTimeout(room.timer);
      scheduleRoomCleanup(code);
      return;
    }

    // ถ้า host ออก -> ย้าย host ให้คนแรก
    if (room.hostId === socket.id) {
      room.hostId = [...room.users.keys()][0];
    }

    // ถ้ากำลังเล่นอยู่ แล้วคนออก -> ให้จบรอบเลย (กันความปวดหัว)
    if (room.round.running) {
      endRound(code, "player_left");
      return;
    }

    broadcastRoomState(code);
  });

  // ---- DISCONNECT ----
  socket.on("disconnect", () => {
    // ไล่หา room ที่มี socket นี้อยู่
    for (const [code, room] of rooms.entries()) {
      if (!room.users.has(socket.id)) continue;

      room.users.delete(socket.id);
      socket.leave(code);

      if (room.users.size === 0) {
        if (room.timer) clearTimeout(room.timer);
        scheduleRoomCleanup(code);
        continue;
      }

      if (room.hostId === socket.id) {
        room.hostId = [...room.users.keys()][0];
      }

      if (room.round.running) {
        endRound(code, "player_left");
      } else {
        broadcastRoomState(code);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
