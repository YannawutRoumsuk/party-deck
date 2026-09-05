// server/state.js — ประกอบ state ที่ส่งให้แต่ละคน
// หัวใจ: คำที่ตัวเองได้รับต้องไม่หลุดไปถึง client ของตัวเองเด็ดขาด
const { CALLOUT_UNDO_MS } = require("./config");

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    connected: p.connected,
    hasWord: !!(p.word && String(p.word).trim()),
    playing: p.playing,
    out: p.out,
    outBy: p.outBy,
    score: p.score || 0,
    roundScore: p.roundScore || 0
  };
}

function roundView(room) {
  return {
    running: room.round.running,
    paused: room.round.paused,
    endsAt: room.round.endsAt,
    remainingMs: room.round.remainingMs,
    durationMs: room.round.durationMs,
    number: room.round.number,
    revealed: room.round.revealed
  };
}

function calloutView(room) {
  const last = room.lastCallout;
  if (!last) return null;
  return {
    targetId: last.targetId,
    callerId: last.callerId,
    targetName: last.targetName,
    callerName: last.callerName,
    canUndo: Date.now() - last.at < CALLOUT_UNDO_MS
  };
}

/**
 * @param viewerId playerId ของคนที่จะได้รับ state นี้ (null = จอฉาย เห็นทุกคำ)
 */
function stateFor(room, viewerId) {
  const isSpectator = viewerId === null;

  const players = [...room.players.values()].map((p) => {
    const base = publicPlayer(p);
    const isSelf = !isSpectator && p.id === viewerId;

    // ระหว่างรอบ: เห็นของคนอื่น แต่ของตัวเองต้องไม่หลุดมาถึงเครื่องตัวเองเด็ดขาด
    // จบรอบแล้ว: เฉลยทั้งวง รวมคำของตัวเองด้วย
    if (room.round.revealed) {
      base.assigned = p.assigned;
    } else if (room.round.running && !isSelf) {
      base.assigned = p.assigned;
    } else {
      base.assigned = null;
    }
    return base;
  });

  return {
    code: room.code,
    hostId: room.hostId,
    youId: isSpectator ? null : viewerId,
    isHost: !isSpectator && room.hostId === viewerId,
    spectator: isSpectator,
    players,
    round: roundView(room),
    lastCallout: calloutView(room),
    playerCount: players.length
  };
}

module.exports = { stateFor, publicPlayer, roundView };
