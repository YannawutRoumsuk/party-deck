// server/games/spyfall/state.js — ประกอบ state รายคน
//
// กฎเหล็กสองข้อ:
// 1. สายลับต้องไม่ได้รับชื่อสถานที่
// 2. คนที่ไม่ใช่สายลับต้องไม่รู้ว่าใครเป็นสายลับ
const R = require("./rules");
const LOC = require("./locations");

function gameView(game, viewerId) {
  if (!game || game.phase === "idle") return null;

  const reveal = game.phase === "finished";
  const viewerIsSpy = game.spyId === viewerId;

  // การ์ดของตัวเอง — ตรงนี้คือจุดเดียวที่ข้อมูลลับออกไป ต้องอ่านง่ายและตรวจง่าย
  let card;
  if (viewerIsSpy) {
    card = { spy: true, location: null, role: "สายลับ" };
  } else if (game.playerIds.indexOf(viewerId) >= 0) {
    card = { spy: false, location: game.location, role: game.roles[viewerId] || null };
  } else {
    card = null;
  }

  const players = game.playerIds.map((id) => ({
    id,
    // ตอนจบเกมค่อยเฉลยว่าใครเป็นสายลับ
    isSpy: reveal ? id === game.spyId : null
  }));

  return {
    round: game.round,
    phase: game.phase,
    minutes: game.minutes,
    endsAt: game.endsAt,
    firstAskerId: game.firstAskerId,
    players,
    card,
    // รายชื่อสถานที่ทั้งหมด ทุกคนเห็นได้ ไม่ใช่ความลับ
    // สายลับใช้เดา คนอื่นใช้ตัดตัวเลือกตอนถาม
    locationNames: LOC.locationNames(game.packIds),
    // สถานที่จริงเปิดตอนจบเท่านั้น
    location: reveal ? game.location : null,
    spyId: reveal ? game.spyId : null,
    vote: game.vote
      ? {
          accuserId: game.vote.accuserId,
          targetId: game.vote.targetId,
          voted: Object.keys(game.vote.votes),
          myVote: game.vote.votes[viewerId] === undefined ? null : game.vote.votes[viewerId],
          tally: R.voteTally(game)
        }
      : null,
    result: game.result || null
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
    settings: room.spyfallSettings,
    game: gameView(room.spyfallGame, viewerId)
  };
}

module.exports = { roomView, gameView };
