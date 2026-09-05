// server/games/werewolf/state.js — ประกอบ state รายคน
//
// กฎเหล็ก:
// 1. บทบาทของคนอื่นห้ามหลุด แม้แต่คนที่ตายไปแล้ว (เฉลยตอนจบเกมเท่านั้น)
// 2. หมาป่าเห็นหน้ากันเอง ลูกสมุนเห็นหมาป่า แต่หมาป่าไม่เห็นลูกสมุน
// 3. ผลการตรวจของผู้พยากรณ์ถึงผู้พยากรณ์คนเดียว
const W = require("./rules");
const RL = require("./roles");

/** คนที่ viewer มองเห็นบทบาทได้ตั้งแต่ต้นเกม */
function knownAllies(game, viewerId) {
  const me = W.byId(game, viewerId);
  if (!me) return {};

  const role = RL.roleById(me.roleId);
  if (!role || !role.knows) return {};

  const out = {};
  if (role.knows === "wolves") {
    game.players.forEach((p) => {
      const r = RL.roleById(p.roleId);
      // ลูกสมุนเห็นหมาป่า แต่หมาป่าไม่เห็นลูกสมุน จึงดูที่ action ไม่ใช่ทีม
      if (r && r.team === "wolf" && r.action === "kill") out[p.id] = r.name;
    });
    if (role.action === "kill") out[viewerId] = role.name;
  } else if (role.knows === "masons") {
    game.players.forEach((p) => {
      if (p.roleId === "mason") out[p.id] = "พี่น้องร่วมสาบาน";
    });
  }
  return out;
}

function gameView(game, viewerId) {
  if (!game) return null;

  const reveal = game.phase === "finished";
  const me = W.byId(game, viewerId);
  const allies = knownAllies(game, viewerId);
  const step = W.currentStep(game);

  const players = game.players.map((p) => {
    let shownRole = null;
    if (reveal) shownRole = p.roleId;
    else if (p.id === viewerId) shownRole = p.roleId;
    else if (allies[p.id]) shownRole = p.roleId;

    return {
      id: p.id,
      name: p.name,
      alive: p.alive,
      score: p.score,
      // ตายแล้วก็ยังไม่บอกว่าเป็นอะไร ตามกติกาที่ตกลงกันไว้
      roleId: shownRole,
      deathReason: p.alive ? null : p.deathReason,
      isLover: game.lovers && game.lovers.indexOf(p.id) >= 0
        ? (reveal || (game.lovers.indexOf(viewerId) >= 0))
        : false
    };
  });

  // ตานี้ viewer ต้องทำอะไรไหม
  let myAction = null;
  if (game.phase === "night" && step && me && me.alive) {
    const actors = W.actorsOf(game, step);
    if (actors.some((p) => p.id === viewerId)) {
      myAction = {
        action: step.action,
        roleId: step.roleId,
        // แม่มดต้องเห็นเหยื่อของหมาป่าก่อนตัดสินใจใช้ยา
        wolfTargetId: step.action === "potion" ? game.night.wolfTargetId : null,
        alreadyVoted: step.action === "kill" ? game.night.wolfVotes[viewerId] || null : null,
        usedHeal: me.usedHeal || false,
        usedPoison: me.usedPoison || false
      };
    }
  }

  return {
    day: game.day,
    phase: game.phase,
    deadline: game.deadline,
    players,
    myRoleId: me ? me.roleId : null,
    alive: me ? me.alive : false,
    allies,
    myAction,
    // ผลการตรวจส่งถึงเจ้าตัวคนเดียว
    myInspection: game.night && game.night.inspections[viewerId]
      ? game.night.inspections[viewerId]
      : null,
    // กลางคืนบอกแค่ว่าถึงคิวบทบาทไหน ไม่บอกว่าใครเป็นคนนั้น
    currentStepRole: step ? step.roleId : null,
    lastNight: game.lastNight,
    pendingHunter: game.pendingHunter,
    amHunterPending: game.pendingHunter === viewerId,
    vote: game.vote
      ? { votes: game.vote.votes, tally: W.voteTally(game), myVote: game.vote.votes[viewerId] || null }
      : null,
    result: game.result,
    log: game.log
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
    settings: room.werewolfSettings,
    game: room.werewolfGame ? gameView(room.werewolfGame, viewerId) : null
  };
}

module.exports = { roomView, gameView, knownAllies };
