// server/games/chain/state.js — ประกอบ state รายคนของเกมคำต้องเชื่อม
//
// เกมนี้ไม่มีคำลับ ทุกคนเห็นสายคำเหมือนกันหมด
// สิ่งที่ต่างกันรายคนคือสิทธิ์: ถึงตาฉันพิมพ์ไหม ฉันชาเลนจ์ได้ไหม ฉันโหวตได้ไหม
// คำนวณให้ที่ server เพื่อไม่ให้ client คนไหนกดข้ามสิทธิ์ได้
"use strict";

const C = require("./rules");

function gameView(game, viewerId) {
  if (!game) return null;

  const me = C.playerById(game, viewerId);
  const cur = C.currentPlayer(game);
  const last = C.lastWord(game);
  const ch = game.challenge;

  let challenge = null;
  if (ch) {
    const eligible = C.eligibleVoters(game);
    const canVote = !!me && me.alive &&
      viewerId !== ch.challengerId && viewerId !== ch.defenderId;

    challenge = {
      challengerId: ch.challengerId,
      challengerName: ch.challengerName,
      defenderId: ch.defenderId,
      defenderName: ch.defenderName,
      word: ch.word,
      // ส่งแค่ยอดรวม ไม่ส่งว่าใครโหวตอะไร กันกดตามเพื่อน
      tally: C.voteTally(game),
      needed: eligible.length,
      voterIds: eligible.map((p) => p.id),
      votedIds: Object.keys(ch.votes),
      myVote: ch.votes[viewerId] === undefined ? null : ch.votes[viewerId],
      canVote,
      aiOpinion: ch.aiOpinion,
      aiUsed: ch.aiUsed
    };
  }

  return {
    phase: game.phase,
    round: game.round,
    deadline: game.deadline,
    chain: game.chain,
    usedCount: game.usedWords.length,

    currentId: cur ? cur.id : null,
    currentName: cur ? cur.name : null,
    isMyTurn: !!me && me.alive && !!cur && cur.id === viewerId,

    lastWord: last ? last.word : null,
    lastById: last ? last.byId : null,
    lastByName: last ? last.byName : null,

    // ชาเลนจ์คำตัวเองไม่ได้ และต้องยังไม่เคยใช้สิทธิ์ในรอบนี้
    canChallenge: !!me && me.alive && game.phase === "playing" &&
                  !!last && !!last.byId && last.byId !== viewerId && me.canChallenge,

    challenge,
    canAskReferee: !!game.aiReferee && C.canAskReferee(game),
    aiReferee: !!game.aiReferee,

    lastEvent: game.lastEvent,
    winnerId: game.winnerId,
    players: game.players.map((p) => ({
      id: p.id, name: p.name, alive: p.alive, score: p.score,
      canChallenge: p.canChallenge, outReason: p.outReason
    })),
    standings: C.standings(game).map((p) => ({
      id: p.id, name: p.name, score: p.score, alive: p.alive
    }))
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
    settings: room.chainSettings,
    game: gameView(room.chainGame, viewerId)
  };
}

module.exports = { roomView, gameView };
