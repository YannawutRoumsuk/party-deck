// server/games/spyfall/rules.js — วงจรเกม Spyfall
//
// สายลับ 1 คนไม่รู้ว่าอยู่ที่ไหน คนอื่นรู้สถานที่แต่ไม่รู้ว่าใครเป็นสายลับ
// ถามตอบกันจนหมดเวลา แล้วโหวตหาสายลับ
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(
    typeof require === "function" ? require("./locations") : root.SpyfallLocations
  );
  else root.SpyfallRules = factory(root.SpyfallLocations);
})(typeof self !== "undefined" ? self : this, function (LOC) {
  "use strict";

  var MIN_PLAYERS = 3;
  var MAX_PLAYERS = 12;
  var DEFAULT_MINUTES = 8;

  // คะแนนตามเกมต้นฉบับ
  var PT_SPY_GUESSED = 4;      // สายลับทายสถานที่ถูก
  var PT_SPY_ESCAPED = 2;      // หมดเวลาโดยไม่ถูกจับ หรือโหวตผิดตัว
  var PT_CAUGHT_SPY = 1;       // ทุกคนที่ไม่ใช่สายลับ เมื่อจับสายลับได้
  var PT_ACCUSER_BONUS = 1;    // คนที่เปิดโหวตแล้วจับถูก ได้เพิ่ม

  function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function createGame(playerIds, options) {
    var opts = options || {};
    if (playerIds.length < MIN_PLAYERS) {
      throw new Error("ต้องมีผู้เล่นอย่างน้อย " + MIN_PLAYERS + " คน");
    }
    if (playerIds.length > MAX_PLAYERS) {
      throw new Error("เล่นได้สูงสุด " + MAX_PLAYERS + " คน");
    }

    return {
      playerIds: playerIds.slice(),
      packIds: opts.packIds && opts.packIds.length ? opts.packIds.slice() : ["thai"],
      minutes: opts.minutes || DEFAULT_MINUTES,
      round: 0,
      phase: "idle",     // idle | playing | voting | finished
      location: null,
      spyId: null,
      roles: {},         // playerId -> ชื่อบทบาทในสถานที่นั้น
      firstAskerId: null,
      endsAt: null,
      vote: null,
      result: null,
      history: []
    };
  }

  function startRound(game) {
    var loc = LOC.pickLocation(game.packIds);
    if (!loc) throw new Error("ยังไม่ได้เลือกชุดสถานที่");

    var order = shuffle(game.playerIds);
    var spyId = order[0];

    // แจกบทบาทให้คนที่ไม่ใช่สายลับ วนบทบาทถ้าคนเยอะกว่าบทบาทที่มี
    var roles = {};
    var pool = shuffle(loc.roles);
    var k = 0;
    game.playerIds.forEach(function (id) {
      if (id === spyId) return;
      roles[id] = pool[k % pool.length];
      k++;
    });

    game.round += 1;
    game.phase = "playing";
    game.location = loc.name;
    game.spyId = spyId;
    game.roles = roles;
    game.firstAskerId = order[1] || order[0];
    game.endsAt = Date.now() + game.minutes * 60000;
    game.vote = null;
    game.result = null;
    return game;
  }

  function isSpy(game, playerId) {
    return game.spyId === playerId;
  }

  // ---------- สายลับหยุดเกมเพื่อทายสถานที่ ----------

  function spyGuess(game, playerId, locationName) {
    if (game.phase !== "playing") throw new Error("ตอนนี้ทายไม่ได้");
    if (!isSpy(game, playerId)) throw new Error("มีแต่สายลับที่ทายสถานที่ได้");

    var correct = String(locationName || "").trim() === game.location;
    var scores = {};

    if (correct) {
      scores[game.spyId] = PT_SPY_GUESSED;
    } else {
      game.playerIds.forEach(function (id) {
        if (id !== game.spyId) scores[id] = PT_CAUGHT_SPY;
      });
    }

    return finish(game, {
      type: "spy-guess",
      correct: correct,
      guess: locationName,
      spyWins: correct,
      scores: scores,
      message: correct
        ? "สายลับทายถูก! สถานที่คือ " + game.location
        : "สายลับทายผิด (ทายว่า " + locationName + ") สถานที่จริงคือ " + game.location
    });
  }

  // ---------- โหวตจับสายลับ ----------

  /** ใครก็ได้เปิดโหวตกล่าวหาคนหนึ่ง — ใช้เสียงข้างมากของคนที่เหลือ */
  function startVote(game, accuserId, targetId) {
    if (game.phase !== "playing") throw new Error("ตอนนี้เปิดโหวตไม่ได้");
    if (accuserId === targetId) throw new Error("กล่าวหาตัวเองไม่ได้");
    if (game.playerIds.indexOf(targetId) < 0) throw new Error("ไม่พบผู้เล่นคนนี้");

    game.phase = "voting";
    game.vote = {
      accuserId: accuserId,
      targetId: targetId,
      votes: {},           // voterId -> true(ใช่สายลับ) / false
      startedAt: Date.now()
    };
    return game;
  }

  function castVote(game, voterId, agree) {
    if (game.phase !== "voting") throw new Error("ตอนนี้ไม่มีการโหวต");
    var v = game.vote;
    if (voterId === v.targetId) throw new Error("คนถูกกล่าวหาโหวตไม่ได้");
    if (game.playerIds.indexOf(voterId) < 0) throw new Error("ไม่พบผู้เล่นคนนี้");

    v.votes[voterId] = !!agree;
    return game;
  }

  function voteEligible(game) {
    return game.playerIds.filter(function (id) { return id !== game.vote.targetId; });
  }

  function voteTally(game) {
    var v = game.vote;
    var yes = 0, no = 0;
    Object.keys(v.votes).forEach(function (id) { if (v.votes[id]) yes++; else no++; });
    return { yes: yes, no: no, total: yes + no, needed: voteEligible(game).length };
  }

  /** ปิดโหวต — เสียงข้างมากของคนที่โหวตได้ ถือว่ากล่าวหาสำเร็จ */
  function resolveVote(game) {
    if (game.phase !== "voting") throw new Error("ตอนนี้ไม่มีการโหวต");

    var v = game.vote;
    var tally = voteTally(game);
    var passed = tally.yes > tally.no;

    if (!passed) {
      // กล่าวหาไม่สำเร็จ เกมเดินต่อ
      game.phase = "playing";
      game.history.push({
        type: "vote-failed",
        targetId: v.targetId,
        yes: tally.yes,
        no: tally.no
      });
      game.vote = null;
      return game;
    }

    var caught = v.targetId === game.spyId;
    var scores = {};

    if (caught) {
      game.playerIds.forEach(function (id) {
        if (id !== game.spyId) scores[id] = PT_CAUGHT_SPY;
      });
      scores[v.accuserId] = (scores[v.accuserId] || 0) + PT_ACCUSER_BONUS;
    } else {
      scores[game.spyId] = PT_SPY_ESCAPED;
    }

    return finish(game, {
      type: "vote",
      caught: caught,
      targetId: v.targetId,
      accuserId: v.accuserId,
      spyWins: !caught,
      scores: scores,
      message: caught
        ? "จับสายลับได้! สถานที่คือ " + game.location
        : "โหวตผิดตัว สายลับรอด สถานที่คือ " + game.location
    });
  }

  /** หมดเวลาโดยไม่มีใครถูกจับ = สายลับรอด */
  function timeUp(game) {
    if (game.phase !== "playing") return game;

    var scores = {};
    scores[game.spyId] = PT_SPY_ESCAPED;

    return finish(game, {
      type: "timeup",
      spyWins: true,
      scores: scores,
      message: "หมดเวลา สายลับรอดไปได้ สถานที่คือ " + game.location
    });
  }

  function finish(game, result) {
    game.phase = "finished";
    game.endsAt = null;
    game.vote = null;
    result.spyId = game.spyId;
    result.location = game.location;
    game.result = result;
    game.history.push(result);
    return game;
  }

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    DEFAULT_MINUTES: DEFAULT_MINUTES,
    PT_SPY_GUESSED: PT_SPY_GUESSED,
    PT_SPY_ESCAPED: PT_SPY_ESCAPED,
    PT_CAUGHT_SPY: PT_CAUGHT_SPY,
    PT_ACCUSER_BONUS: PT_ACCUSER_BONUS,
    createGame: createGame,
    startRound: startRound,
    isSpy: isSpy,
    spyGuess: spyGuess,
    startVote: startVote,
    castVote: castVote,
    voteEligible: voteEligible,
    voteTally: voteTally,
    resolveVote: resolveVote,
    timeUp: timeUp
  };
});
