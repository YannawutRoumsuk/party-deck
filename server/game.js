// server/game.js — กติกาของรอบ: แจกคำ, จับผิด, คิดคะแนน, จบรอบ
const { MIN_PLAYERS_TO_START, CALLOUT_POINTS, SURVIVE_POINTS } = require("./config");
const { survivors } = require("./rooms");
const { derange } = require("./assign");

/**
 * แจกคำแบบ derangement: ห้ามใครได้ "คำที่ตัวเองส่ง"
 * เทียบด้วยข้อความ ไม่ใช่ตำแหน่ง เพราะคนละคนอาจส่งคำเดียวกันมา
 */
function assignWords(players) {
  if (players.length < MIN_PLAYERS_TO_START) {
    throw new Error(`ต้องมีผู้เล่นที่ส่งคำแล้วอย่างน้อย ${MIN_PLAYERS_TO_START} คน`);
  }

  const words = players.map((p) => String(p.word).trim());
  const assigned = derange(words);
  players.forEach((p, i) => { p.assigned = assigned[i]; });
}

function clearRoundFlags(room) {
  for (const p of room.players.values()) {
    p.playing = false;
    p.out = false;
    p.outBy = null;
    p.roundScore = 0;
    p.assigned = null;
  }
  room.lastCallout = null;
}

/**
 * ผู้ร่วมรอบ = คนที่ออนไลน์และส่งคำแล้ว
 * คนที่เน็ตหลุดหรือยังไม่ส่งคำ จะนั่งดูรอบนี้ไปก่อน ไม่บล็อกทั้งห้อง
 */
function eligiblePlayers(room) {
  return [...room.players.values()].filter(
    (p) => p.connected && p.word && String(p.word).trim()
  );
}

function startRound(room, durationMs) {
  // เก็บคำที่ส่งไว้ก่อน เพราะ clearRoundFlags จะล้าง assigned ของรอบเก่าทิ้ง
  const players = eligiblePlayers(room);
  clearRoundFlags(room);
  for (const p of players) p.playing = true;
  assignWords(players);

  room.round.number += 1;
  room.round.running = true;
  room.round.paused = false;
  room.round.revealed = false;
  room.round.durationMs = durationMs;
  room.round.remainingMs = durationMs;
  room.round.endsAt = Date.now() + durationMs;

  return players;
}

/**
 * จับผิด: ใครก็ได้ที่ยังอยู่ในรอบ กดจับคนที่เผลอพูดคำตัวเองได้
 * คนจับได้ 1 แต้ม คนโดนจับออกจากรอบ
 */
function callOut(room, callerId, targetId) {
  if (!room.round.running) throw new Error("ยังไม่ได้เริ่มรอบ");
  if (room.round.paused) throw new Error("ตอนนี้พักรอบอยู่");
  if (callerId === targetId) throw new Error("จับผิดตัวเองไม่ได้");

  const caller = room.players.get(callerId);
  const target = room.players.get(targetId);
  if (!caller || !target) throw new Error("ไม่พบผู้เล่น");
  if (!caller.playing || caller.out) throw new Error("คุณออกจากรอบนี้แล้ว จับผิดไม่ได้");
  if (!target.playing) throw new Error("คนนี้ไม่ได้เล่นรอบนี้");
  if (target.out) throw new Error("คนนี้ออกไปแล้ว");

  target.out = true;
  target.outBy = caller.id;
  caller.roundScore += CALLOUT_POINTS;

  room.lastCallout = {
    targetId: target.id,
    callerId: caller.id,
    targetName: target.name,
    callerName: caller.name,
    word: target.assigned,
    at: Date.now()
  };

  return room.lastCallout;
}

// โฮสต์กดยกเลิกการจับผิดครั้งล่าสุดได้ เผื่อกดพลาดหรือเถียงกันไม่จบ
function undoCallout(room) {
  const last = room.lastCallout;
  if (!last) throw new Error("ไม่มีรายการจับผิดให้ยกเลิก");

  const target = room.players.get(last.targetId);
  const caller = room.players.get(last.callerId);
  if (target) {
    target.out = false;
    target.outBy = null;
  }
  if (caller) caller.roundScore = Math.max(0, caller.roundScore - CALLOUT_POINTS);

  room.lastCallout = null;
  return last;
}

// จบรอบเมื่อเหลือคนรอดคนเดียว (หรือไม่เหลือเลย)
function shouldAutoEnd(room) {
  if (!room.round.running) return false;
  return survivors(room).length <= 1;
}

function buildResults(room) {
  return [...room.players.values()]
    .filter((p) => p.playing)
    .map((p) => ({
      id: p.id,
      name: p.name,
      word: p.assigned || "-",
      out: p.out,
      outBy: p.outBy,
      roundScore: p.roundScore || 0
    }));
}

/**
 * คิดคะแนนตอนจบรอบ
 * - จับผิดคนอื่นได้ ครั้งละ 2 แต้ม (สะสมมาตอนกดจับ)
 * - รอดจนจบรอบอีก 1 แต้ม
 * สองอย่างนี้บวกกันได้ คนที่จับผิดแล้วรอดด้วยจึงได้ 3
 */
function commitScores(room) {
  for (const p of room.players.values()) {
    if (!p.playing) continue;
    const survived = !p.out ? SURVIVE_POINTS : 0;
    p.score += (p.roundScore || 0) + survived;
  }
}

function finishRound(room, { commit = true } = {}) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  const results = buildResults(room);
  if (commit) commitScores(room);

  room.round.running = false;
  room.round.paused = false;
  room.round.endsAt = null;
  room.round.remainingMs = null;
  room.round.revealed = true;

  // ล้างคำไว้ให้พร้อมรอบถัดไป แต่คงคะแนนสะสมไว้
  for (const p of room.players.values()) {
    p.word = null;
  }

  return results;
}

function resetScores(room) {
  for (const p of room.players.values()) {
    p.score = 0;
    p.roundScore = 0;
    p.word = null;
    p.assigned = null;
    p.playing = false;
    p.out = false;
    p.outBy = null;
  }
  room.round.number = 0;
  room.round.revealed = false;
  room.lastCallout = null;
}

module.exports = {
  assignWords,
  eligiblePlayers,
  startRound,
  callOut,
  undoCallout,
  shouldAutoEnd,
  buildResults,
  finishRound,
  resetScores,
  clearRoundFlags
};
