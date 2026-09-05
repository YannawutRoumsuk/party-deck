// server/rooms.js — จัดการห้องและผู้เล่น (state ผูกกับ playerId ไม่ใช่ socket.id)
const crypto = require("crypto");
const {
  ROOM_CODE_LEN,
  CODE_CHARS,
  MAX_NAME_LEN,
  ROOM_EMPTY_TTL_MS
} = require("./config");

function randomRoomCode(existingSet) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    }
    if (!existingSet.has(code)) return code;
  }
  throw new Error("ห้องเต็มระบบชั่วคราว กรุณาลองใหม่อีกครั้ง");
}

// คีย์สำหรับหน้าจอฉาย ใครไม่มีคีย์เปิดดูคำของคนอื่นไม่ได้
function randomSpectatorKey() {
  return crypto.randomBytes(9).toString("base64url");
}

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().slice(0, ROOM_CODE_LEN);
}

// ชื่อซ้ำให้เติมเลขท้าย โดยไม่นับตัวเองตอน reconnect
function uniqueName(room, raw, exceptPlayerId = null) {
  const base = String(raw || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LEN);
  if (!base) return "";

  const taken = new Set();
  for (const p of room.players.values()) {
    if (p.id !== exceptPlayerId) taken.add(p.name);
  }
  if (!taken.has(base)) return base;

  for (let i = 2; i < 100; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${crypto.randomInt(1000)}`;
}

function createPlayer(name) {
  return {
    id: crypto.randomUUID(),
    name,
    socketId: null,
    connected: false,
    disconnectedAt: null,
    word: null,        // คำที่ตัวเองส่งเข้าไป
    assigned: null,    // คำที่ได้รับ (ตัวเองมองไม่เห็น)
    playing: false,    // ร่วมรอบนี้อยู่ไหม
    out: false,        // โดนจับผิดไปแล้ว
    outBy: null,
    score: 0,
    roundScore: 0
  };
}

function createRoom(rooms) {
  const code = randomRoomCode(new Set(rooms.keys()));
  const room = {
    code,
    spectatorKey: randomSpectatorKey(),
    hostId: null,
    players: new Map(),   // playerId -> player
    spectators: new Set(), // socketId
    round: {
      running: false,
      paused: false,
      endsAt: null,
      remainingMs: null,
      durationMs: null,
      number: 0,
      revealed: false
    },
    lastCallout: null,
    timer: null,
    emptyTimer: null
  };
  rooms.set(code, room);
  return room;
}

function attachSocket(room, player, socketId) {
  player.socketId = socketId;
  player.connected = true;
  player.disconnectedAt = null;
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = player.id;
  return player;
}

function detachSocket(player) {
  player.socketId = null;
  player.connected = false;
  player.disconnectedAt = Date.now();
}

function findPlayerBySocket(room, socketId) {
  for (const p of room.players.values()) {
    if (p.socketId === socketId) return p;
  }
  return null;
}

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}

// ผู้เล่นที่ยังไม่โดนจับผิดในรอบนี้
function survivors(room) {
  return [...room.players.values()].filter((p) => p.playing && !p.out);
}

// โฮสต์ต้องเป็นคนที่ออนไลน์อยู่เสมอ ไม่งั้นห้องค้าง
function ensureHost(room) {
  const host = room.players.get(room.hostId);
  if (host && host.connected) return;

  const next = connectedPlayers(room).sort((a, b) => a.name.localeCompare(b.name))[0];
  room.hostId = next ? next.id : room.hostId;
}

function clearRoomCleanup(room) {
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
}

function scheduleRoomCleanup(rooms, code) {
  const room = rooms.get(code);
  if (!room) return;
  clearRoomCleanup(room);

  room.emptyTimer = setTimeout(() => {
    const latest = rooms.get(code);
    if (!latest) return;
    if (connectedPlayers(latest).length > 0) return;
    if (latest.timer) clearTimeout(latest.timer);
    rooms.delete(code);
  }, ROOM_EMPTY_TTL_MS);
}

module.exports = {
  randomRoomCode,
  randomSpectatorKey,
  normalizeCode,
  uniqueName,
  createPlayer,
  createRoom,
  attachSocket,
  detachSocket,
  findPlayerBySocket,
  connectedPlayers,
  survivors,
  ensureHost,
  clearRoomCleanup,
  scheduleRoomCleanup
};
