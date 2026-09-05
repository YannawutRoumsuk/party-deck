// server/games/werewolf/rules.js — วงจรเกมหมาป่า
//
// แอปเป็นคนคุมเกมแทนคน ทุกคนจึงได้เล่นครบไม่ต้องมีใครเสียสละมานั่งคุม
// กลางคืนแอปปลุกทีละบทบาทตามลำดับ กลางวันประกาศผลแล้วให้โหวตประหาร
//
// กติกาสำคัญ: ตายแล้วไม่เปิดเฉลยบทบาท เฉลยตอนจบเกมเท่านั้น
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(
    typeof require === "function" ? require("./roles") : root.WerewolfRoles
  );
  else root.WerewolfRules = factory(root.WerewolfRoles);
})(typeof self !== "undefined" ? self : this, function (RL) {
  "use strict";

  var NIGHT_STEP_MS = 45000;
  var DAY_MS = 240000;
  var VOTE_MS = 60000;

  function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  // ---------- สร้างเกม ----------

  function createGame(players, comp) {
    var check = RL.validate(comp, players.length);
    if (!check.ok) throw new Error(check.problems[0]);

    // กองบทบาทตามชุดที่จัดไว้ แล้วสับก่อนแจก
    var pool = [];
    Object.keys(comp).forEach(function (roleId) {
      for (var i = 0; i < comp[roleId]; i++) pool.push(roleId);
    });
    pool = shuffle(pool);

    var list = players.map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        roleId: pool[i],
        alive: true,
        score: p.score || 0,
        deathReason: null,
        protectedLast: null
      };
    });

    var game = {
      players: list,
      comp: comp,
      day: 0,
      phase: "night",
      nightQueue: [],
      nightIndex: 0,
      night: null,
      lovers: null,
      pendingHunter: null,
      lastNight: null,
      vote: null,
      result: null,
      log: [],
      deadline: null
    };

    beginNight(game);
    return game;
  }

  function byId(game, id) {
    for (var i = 0; i < game.players.length; i++) {
      if (game.players[i].id === id) return game.players[i];
    }
    return null;
  }

  function alive(game) {
    return game.players.filter(function (p) { return p.alive; });
  }

  function roleOf(game, id) {
    var p = byId(game, id);
    return p ? RL.roleById(p.roleId) : null;
  }

  function isWolfTeam(game, id) {
    var r = roleOf(game, id);
    return !!r && r.team === "wolf";
  }

  /** หมาป่าที่ออกล่าจริง (ลูกสมุนกับแม่มดดำไม่ได้ล่า) */
  function killingWolves(game) {
    return alive(game).filter(function (p) {
      var r = RL.roleById(p.roleId);
      return r && r.team === "wolf" && r.action === "kill";
    });
  }

  function playersWithRole(game, roleId) {
    return alive(game).filter(function (p) { return p.roleId === roleId; });
  }

  // ---------- กลางคืน ----------

  function buildNightQueue(game) {
    var steps = [];
    var seen = {};

    game.players.forEach(function (p) {
      var r = RL.roleById(p.roleId);
      if (!r || !r.night || seen[r.id]) return;
      // beginNight เพิ่ม day ไปแล้วก่อนเรียกตรงนี้ คืนแรกจึงเป็น day 1 ไม่ใช่ 0
      if (r.firstNightOnly && game.day > 1) return;
      seen[r.id] = true;

      // หมาป่ากับลูกหมาป่าตื่นพร้อมกัน รวมเป็นขั้นเดียว
      var key = r.action === "kill" ? "wolves" : r.id;
      if (seen["step:" + key]) return;
      seen["step:" + key] = true;

      steps.push({ key: key, roleId: r.id, action: r.action, order: r.night });
    });

    steps.sort(function (a, b) { return a.order - b.order; });
    return steps;
  }

  function actorsOf(game, step) {
    if (step.key === "wolves") return killingWolves(game);
    return playersWithRole(game, step.roleId);
  }

  function beginNight(game) {
    game.day += 1;
    game.phase = "night";
    game.night = {
      wolfVotes: {},
      protectedId: null,
      healUsed: false,
      poisonId: null,
      inspections: {},   // playerId -> { targetId, result }
      wolfTargetId: null
    };
    game.nightQueue = buildNightQueue(game);
    game.nightIndex = 0;
    game.vote = null;
    skipEmptySteps(game);
    return game;
  }

  function currentStep(game) {
    return game.nightQueue[game.nightIndex] || null;
  }

  function skipEmptySteps(game) {
    while (game.nightIndex < game.nightQueue.length) {
      var step = game.nightQueue[game.nightIndex];
      if (actorsOf(game, step).length > 0) {
        game.deadline = Date.now() + NIGHT_STEP_MS;
        return;
      }
      game.nightIndex += 1;
    }
    resolveNight(game);
  }

  function advanceStep(game) {
    game.nightIndex += 1;
    skipEmptySteps(game);
  }

  /**
   * ผู้เล่นทำสิ่งที่บทบาทตัวเองทำได้ในคืนนี้
   * @param {object} payload ขึ้นกับ action เช่น { targetId } หรือ { healTarget, poisonTarget }
   */
  function nightAction(game, playerId, payload) {
    if (game.phase !== "night") throw new Error("ตอนนี้ไม่ใช่กลางคืน");

    var step = currentStep(game);
    if (!step) throw new Error("คืนนี้ไม่มีอะไรให้ทำแล้ว");

    var actor = byId(game, playerId);
    if (!actor || !actor.alive) throw new Error("คนที่ตายแล้วทำอะไรไม่ได้");

    var actors = actorsOf(game, step);
    if (!actors.some(function (p) { return p.id === playerId; })) {
      throw new Error("ยังไม่ถึงตาของบทบาทคุณ");
    }

    var data = payload || {};
    var target = data.targetId ? byId(game, data.targetId) : null;

    if (step.action === "kill") {
      if (!target || !target.alive) throw new Error("เลือกคนที่ยังมีชีวิตอยู่");
      if (isWolfTeam(game, target.id)) throw new Error("หมาป่ากัดพวกเดียวกันไม่ได้");
      game.night.wolfVotes[playerId] = target.id;

      // หมาป่าทุกตัวลงคะแนนครบแล้วค่อยไปขั้นถัดไป
      if (Object.keys(game.night.wolfVotes).length >= actors.length) {
        game.night.wolfTargetId = tallyWolfVotes(game);
        advanceStep(game);
      }
      return game;
    }

    if (step.action === "protect") {
      if (!target || !target.alive) throw new Error("เลือกคนที่ยังมีชีวิตอยู่");
      if (actor.protectedLast === target.id) throw new Error("ปกป้องคนเดิมสองคืนติดไม่ได้");
      game.night.protectedId = target.id;
      actor.protectedLast = target.id;
      advanceStep(game);
      return game;
    }

    if (step.action === "potion") {
      // แม่มดเห็นเหยื่อของหมาป่าก่อนตัดสินใจ
      if (data.heal && !actor.usedHeal) {
        game.night.healUsed = true;
        actor.usedHeal = true;
      }
      if (data.poisonTarget) {
        if (actor.usedPoison) throw new Error("ใช้ยาพิษไปแล้ว");
        var victim = byId(game, data.poisonTarget);
        if (!victim || !victim.alive) throw new Error("เลือกคนที่ยังมีชีวิตอยู่");
        game.night.poisonId = victim.id;
        actor.usedPoison = true;
      }
      advanceStep(game);
      return game;
    }

    if (step.action === "inspect" || step.action === "aura" || step.action === "findSeer") {
      if (!target || !target.alive) throw new Error("เลือกคนที่ยังมีชีวิตอยู่");

      var result;
      if (step.action === "inspect") result = isWolfTeam(game, target.id) && roleOf(game, target.id).action === "kill";
      else if (step.action === "findSeer") result = target.roleId === "seer";
      else result = target.roleId !== "villager";

      game.night.inspections[playerId] = { targetId: target.id, result: result };
      advanceStep(game);
      return game;
    }

    if (step.action === "link") {
      var a = byId(game, data.firstId);
      var b = byId(game, data.secondId);
      if (!a || !b || a.id === b.id) throw new Error("เลือกคนละสองคน");
      game.lovers = [a.id, b.id];
      advanceStep(game);
      return game;
    }

    throw new Error("บทบาทนี้ไม่มีอะไรให้ทำ");
  }

  /** เสียงข้างมากของหมาป่า เสมอให้สุ่มจากตัวเลือกที่ได้คะแนนสูงสุด */
  function tallyWolfVotes(game) {
    var counts = {};
    Object.keys(game.night.wolfVotes).forEach(function (wolfId) {
      var t = game.night.wolfVotes[wolfId];
      counts[t] = (counts[t] || 0) + 1;
    });

    var best = -1, tied = [];
    Object.keys(counts).forEach(function (id) {
      if (counts[id] > best) { best = counts[id]; tied = [id]; }
      else if (counts[id] === best) tied.push(id);
    });
    return tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
  }

  /** ข้ามขั้นตอนที่ไม่มีใครทำ (หมดเวลา) */
  function skipStep(game) {
    if (game.phase !== "night") return game;
    var step = currentStep(game);
    if (step && step.action === "kill" && !game.night.wolfTargetId) {
      game.night.wolfTargetId = tallyWolfVotes(game);
    }
    advanceStep(game);
    return game;
  }

  // ---------- รุ่งเช้า ----------

  function killPlayer(game, id, reason, deaths) {
    var p = byId(game, id);
    if (!p || !p.alive) return;

    p.alive = false;
    p.deathReason = reason;
    deaths.push({ id: p.id, name: p.name, reason: reason });

    // นักล่าตายแล้วได้ลากคนไปด้วย ค้างไว้ให้เลือกตอนกลางวัน
    if (p.roleId === "hunter" && !game.pendingHunter) game.pendingHunter = p.id;

    // คู่รักตายตามกัน
    if (game.lovers && game.lovers.indexOf(id) >= 0) {
      var other = game.lovers[0] === id ? game.lovers[1] : game.lovers[0];
      var o = byId(game, other);
      if (o && o.alive) killPlayer(game, other, "อกหักตายตามคู่รัก", deaths);
    }
  }

  function resolveNight(game) {
    var n = game.night;
    var deaths = [];
    var savedByDoctor = false;
    var savedByWitch = false;

    if (n.wolfTargetId) {
      var victim = byId(game, n.wolfTargetId);
      if (victim && victim.alive) {
        if (n.protectedId === victim.id) savedByDoctor = true;
        else if (n.healUsed) savedByWitch = true;
        else if (victim.roleId === "elder" && !victim.elderBitten) {
          victim.elderBitten = true;   // ผู้เฒ่ารอดครั้งแรก
        } else {
          killPlayer(game, victim.id, "ถูกหมาป่ากัด", deaths);
        }
      }
    }

    if (n.poisonId) killPlayer(game, n.poisonId, "ถูกวางยา", deaths);

    game.lastNight = {
      deaths: deaths.map(function (d) { return { id: d.id, name: d.name }; }),
      saved: savedByDoctor || savedByWitch
    };
    game.log.push({ type: "night", day: game.day, deaths: game.lastNight.deaths });

    if (checkEnd(game)) return game;

    game.phase = "day";
    game.deadline = Date.now() + DAY_MS;
    return game;
  }

  // ---------- กลางวัน ----------

  function startVote(game) {
    if (game.phase !== "day") throw new Error("ตอนนี้ยังโหวตไม่ได้");
    if (game.pendingHunter) throw new Error("รอให้นักล่าเลือกคนก่อน");

    game.phase = "vote";
    game.vote = { votes: {} };
    game.deadline = Date.now() + VOTE_MS;
    return game;
  }

  function castVote(game, voterId, targetId) {
    if (game.phase !== "vote") throw new Error("ตอนนี้ไม่ได้อยู่ในช่วงโหวต");
    var voter = byId(game, voterId);
    if (!voter || !voter.alive) throw new Error("คนที่ตายแล้วโหวตไม่ได้");

    if (targetId === null) { delete game.vote.votes[voterId]; return game; }

    var target = byId(game, targetId);
    if (!target || !target.alive) throw new Error("โหวตคนที่ยังมีชีวิตอยู่เท่านั้น");
    game.vote.votes[voterId] = targetId;
    return game;
  }

  function voteTally(game) {
    var counts = {};
    Object.keys(game.vote.votes).forEach(function (v) {
      var t = game.vote.votes[v];
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }

  /** ปิดโหวต — เสียงข้างมาก เสมอถือว่าไม่ประหารใคร */
  function resolveVote(game) {
    if (game.phase !== "vote") throw new Error("ตอนนี้ไม่ได้อยู่ในช่วงโหวต");

    var counts = voteTally(game);
    var best = 0, tied = [];
    Object.keys(counts).forEach(function (id) {
      if (counts[id] > best) { best = counts[id]; tied = [id]; }
      else if (counts[id] === best) tied.push(id);
    });

    if (!tied.length || tied.length > 1) {
      game.log.push({ type: "lynch", day: game.day, lynchedId: null, tie: tied.length > 1 });
      game.vote = null;
      if (checkEnd(game)) return game;
      beginNight(game);
      return game;
    }

    var deaths = [];
    var lynchedId = tied[0];
    killPlayer(game, lynchedId, "ถูกโหวตประหาร", deaths);
    game.log.push({ type: "lynch", day: game.day, lynchedId: lynchedId, deaths: deaths });
    game.vote = null;

    // คนฟอกหนังชนะทันทีถ้าถูกประหาร
    if (byId(game, lynchedId).roleId === "tanner") {
      return finish(game, "tanner", [lynchedId]);
    }

    if (checkEnd(game)) return game;
    if (game.pendingHunter) { game.phase = "day"; return game; }

    beginNight(game);
    return game;
  }

  /** นักล่าเลือกคนที่จะลากไปด้วย */
  function hunterShoot(game, hunterId, targetId) {
    if (game.pendingHunter !== hunterId) throw new Error("ยังไม่ถึงตาคุณ");
    var target = byId(game, targetId);
    if (!target || !target.alive) throw new Error("เลือกคนที่ยังมีชีวิตอยู่");

    var deaths = [];
    game.pendingHunter = null;
    killPlayer(game, targetId, "ถูกนักล่ายิง", deaths);
    game.log.push({ type: "hunter", by: hunterId, deaths: deaths });

    if (checkEnd(game)) return game;
    if (game.phase === "day") return game;
    beginNight(game);
    return game;
  }

  // ---------- จบเกม ----------

  function checkEnd(game) {
    if (game.pendingHunter) return false;

    var living = alive(game);

    // คู่รักเหลือสองคนสุดท้าย ชนะร่วมกัน
    if (game.lovers && living.length === 2 &&
        living.every(function (p) { return game.lovers.indexOf(p.id) >= 0; })) {
      finish(game, "lovers", game.lovers.slice());
      return true;
    }

    var wolves = living.filter(function (p) { return isWolfTeam(game, p.id); });
    var villagers = living.filter(function (p) { return !isWolfTeam(game, p.id); });

    if (wolves.length === 0) {
      finish(game, "village", villagers.map(function (p) { return p.id; }));
      return true;
    }
    if (wolves.length >= villagers.length) {
      finish(game, "wolf", wolves.map(function (p) { return p.id; }));
      return true;
    }
    return false;
  }

  function finish(game, winner, winnerIds) {
    game.phase = "finished";
    game.deadline = null;
    game.vote = null;

    var label = {
      village: "ฝ่ายชาวบ้านชนะ",
      wolf: "ฝ่ายหมาป่าชนะ",
      lovers: "คู่รักชนะ",
      tanner: "คนฟอกหนังชนะ"
    }[winner];

    var scores = {};
    winnerIds.forEach(function (id) { scores[id] = 3; });
    // รอดจนจบเกมได้แต้มปลอบใจ แม้ฝ่ายจะแพ้
    alive(game).forEach(function (p) {
      if (!scores[p.id]) scores[p.id] = 1;
    });

    game.result = { winner: winner, label: label, winnerIds: winnerIds, scores: scores };
    game.log.push({ type: "end", winner: winner });
    return game;
  }

  function standings(game) {
    return game.players.slice().sort(function (a, b) {
      return b.score - a.score || a.name.localeCompare(b.name);
    });
  }

  return {
    NIGHT_STEP_MS: NIGHT_STEP_MS,
    DAY_MS: DAY_MS,
    VOTE_MS: VOTE_MS,
    createGame: createGame,
    byId: byId,
    alive: alive,
    roleOf: roleOf,
    isWolfTeam: isWolfTeam,
    killingWolves: killingWolves,
    currentStep: currentStep,
    actorsOf: actorsOf,
    nightAction: nightAction,
    skipStep: skipStep,
    startVote: startVote,
    castVote: castVote,
    voteTally: voteTally,
    resolveVote: resolveVote,
    hunterShoot: hunterShoot,
    standings: standings,
    beginNight: beginNight
  };
});
