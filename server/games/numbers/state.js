// server/games/numbers/state.js — ประกอบ state รายคนสำหรับเกมทายเลข
//
// กฎเหล็กข้อเดียว: เลขลับของอีกฝ่ายต้องไม่ถูกส่งออกไปถึงเบราว์เซอร์ของคนทาย
// จนกว่าเกมจะจบ ซ่อนด้วย CSS ไม่นับว่าซ่อน
const R = require("./rules");

function targetView(target, opts) {
  if (!target) return null;

  const view = {
    low: target.low,
    high: target.high,
    remaining: R.remaining(target),
    found: target.found,
    guessCount: target.guesses.length,
    guesses: target.guesses.map((g) => ({ value: g.value, verdict: g.verdict }))
  };

  // เลขลับปล่อยให้เห็นเฉพาะเจ้าของ หรือตอนเฉลยจบเกม
  view.secret = opts.reveal || opts.owner ? target.secret : null;
  return view;
}

/**
 * @param match แมตช์ปัจจุบัน (null ได้ ถ้ายังไม่ตั้งค่า)
 * @param viewerId playerId ของคนที่จะได้ state นี้
 */
function matchView(match, viewerId) {
  if (!match) return null;

  const reveal = match.phase === "finished";
  const targets = {};

  for (const ownerId of match.playerIds) {
    targets[ownerId] = targetView(match.targets[ownerId], {
      owner: ownerId === viewerId,
      reveal
    });
  }

  const opponentId = match.playerIds.indexOf(viewerId) >= 0
    ? R.opponentOf(match, viewerId)
    : null;

  return {
    format: match.format,
    maxGuesses: match.maxGuesses,
    phase: match.phase,
    playerIds: match.playerIds,
    turn: match.turn,
    yourTurn: match.turn === viewerId,
    opponentId,
    equalizerFor: match.equalizerFor,
    phasesDone: match.phasesDone,
    targets,
    result: match.result,
    // ครั้งที่เหลือของคนที่กำลังทาย ใช้โชว์ "เหลืออีก 3 ครั้ง"
    guessesLeft: match.turn ? R.guessesLeft(match, match.turn) : null
  };
}

function roomView(room, viewerId) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    score: p.score || 0
  }));

  return {
    code: room.code,
    gameType: room.gameType,
    hostId: room.hostId,
    youId: viewerId,
    isHost: room.hostId === viewerId,
    players,
    playerCount: players.length,
    settings: room.numbersSettings,
    match: matchView(room.numbersMatch, viewerId)
  };
}

module.exports = { roomView, matchView };
