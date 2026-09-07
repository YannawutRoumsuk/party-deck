// server/games/twenty/state.js — ประกอบ state รายคนของเกม 24 แต้ม
//
// เกมนี้ไม่มีความลับ ไพ่ 4 ใบทุกคนเห็นเหมือนกันหมด
// สิ่งที่ต่างกันรายคนคือ "ตอนนี้ฉันทำอะไรได้บ้าง" — กดตอบ / ตัดสิน / พิมพ์สูตร
// คำนวณให้ที่ server เลยแทนที่จะให้ client เดาเอง จะได้ไม่มีทางเพี้ยนคนละทาง
"use strict";

const M = require("./match");

const HISTORY_LIMIT = 8;   // ย้อนหลังพอให้เห็นจังหวะเกม ไม่ต้องส่งทั้งกอง

/**
 * @param {object|null} game
 * @param {string|null} viewerId ผู้เล่นที่กำลังจะได้ state ก้อนนี้ (null = ยังไม่เข้าเกม)
 */
function gameView(game, viewerId) {
  if (!game) return null;

  const isPlayer = !!M.playerById(game, viewerId);
  const isClaimer = viewerId && game.claimerId === viewerId;
  const claimer = game.claimerId ? M.playerById(game, game.claimerId) : null;

  return {
    round: game.round,
    cards: game.cards,
    solutionCount: game.solutionCount,
    phase: game.phase,
    deadline: game.deadline,

    claimerId: game.claimerId,
    claimerName: claimer ? claimer.name : null,

    // ปุ่มไหนกดได้ตอนนี้ — client เอาไปเปิด/ปิดปุ่มตรงๆ ได้เลย
    canClaim: isPlayer && game.phase === "showing",
    canJudge: isPlayer && game.phase === "claimed" && !isClaimer,
    canType:  isPlayer && game.phase === "typing" && isClaimer,

    // ถึงหน้าพิมพ์สูตรเพราะโดนปัดตก หรือเพราะไม่มีใครกดตัดสิน
    // มีผลกับการหักแต้มคนปัดตก จึงต้องบอก client ให้ขึ้นข้อความต่างกัน
    wasRejected: !!game.wasRejected,

    lastOutcome: game.lastOutcome,
    history: game.history.slice(-HISTORY_LIMIT),
    standings: M.standings(game).map((p) => ({
      id: p.id, name: p.name, score: p.score, correct: p.correct, fouls: p.fouls
    }))
  };
}

function roomView(room, viewerId) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    score: p.score
  }));

  return {
    code: room.code,
    gameType: room.gameType,
    hostId: room.hostId,
    youId: viewerId,
    isHost: viewerId === room.hostId,
    players,
    playerCount: players.length,
    settings: room.twentySettings,
    game: gameView(room.twentyGame, viewerId)
  };
}

module.exports = { roomView, gameView, HISTORY_LIMIT };
