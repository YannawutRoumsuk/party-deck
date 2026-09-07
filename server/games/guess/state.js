// server/games/guess/state.js — ประกอบ state รายคนของเกมทายของ 20 คำถาม
//
// เกมนี้มีความลับจริง: ของที่เราตั้งไว้ให้อีกฝ่ายทาย
// กติกาคือแต่ละคนตั้งของให้อีกฝ่ายทาย ดังนั้น
//   seats[ฉัน].secret  = ของที่ฉันตั้ง อีกฝ่ายกำลังทาย -> ฉันเห็นได้
//   seats[อีกฝ่าย].secret = ของที่ฉันต้องทาย            -> ห้ามส่งมาให้ฉันเด็ดขาด
// จนกว่าเกมจะจบ ถึงเปิดได้ทั้งคู่
"use strict";

const G = require("./rules");

function seatView(match, seatOwnerId, viewerId, finished) {
  const seat = match.seats[seatOwnerId];
  const mine = seatOwnerId === viewerId;

  return {
    ownerId: seatOwnerId,
    // ของที่ฉันตั้งเอง ฉันรู้อยู่แล้ว / จบเกมแล้วเปิดหมด / นอกนั้นเป็น null
    secret: (mine || finished) ? seat.secret : null,
    hasSecret: !!seat.secret,
    asked: seat.asked,
    guesses: seat.guesses,
    guessesLeft: G.MAX_GUESSES - seat.guesses.length,
    found: seat.found
  };
}

function matchView(match, viewerId) {
  if (!match) return null;

  const finished = match.phase === "finished";
  const opp = G.opponentOf(match, viewerId);
  const isPlayer = match.playerIds.indexOf(viewerId) >= 0;

  return {
    phase: match.phase,
    turn: match.turn,
    deadline: match.deadline,
    packId: match.packId,
    level: match.level,

    youId: viewerId,
    opponentId: opp,
    isMyTurn: isPlayer && match.turn === viewerId,

    // คำถามที่ค้างอยู่ ต้องบอกว่าใครถาม เพื่อให้ฝั่งตอบรู้ว่าถึงคิวตัวเอง
    pending: match.pending
      ? { kind: match.pending.kind, text: match.pending.text, byId: match.pending.byId }
      : null,
    canRespond: isPlayer && match.phase === "answering" &&
                !!match.pending && match.pending.byId !== viewerId,

    mySeat: isPlayer ? seatView(match, viewerId, viewerId, finished) : null,
    theirSeat: isPlayer ? seatView(match, opp, viewerId, finished) : null,

    result: match.result,
    log: match.log
  };
}

function roomView(room, viewerId) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, connected: p.connected, score: p.score
  }));

  return {
    code: room.code,
    gameType: room.gameType,
    hostId: room.hostId,
    youId: viewerId,
    isHost: viewerId === room.hostId,
    players,
    playerCount: players.length,
    settings: room.guessSettings,
    match: matchView(room.guessMatch, viewerId)
  };
}

module.exports = { roomView, matchView, seatView };
