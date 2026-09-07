// server/games/twenty/match.js — วงจรการเล่นเกม 24
//
// ระบบกันโกง:
// ปกติ A กดตอบ พูดสูตรออกมา แล้ว B กดยืนยันว่าถูก — เร็วดี แต่ B แกล้งไม่กดได้
// จึงให้ "ระบบเป็นกรรมการสูงสุด" เพราะมันรู้เฉลยทุกวิธีอยู่แล้ว
//
//   B กดว่าถูก           -> A ได้แต้ม จบตา (ทางด่วน ใช้ความเชื่อใจ เร็ว)
//   B กดว่าผิด           -> A ต้องพิมพ์สูตร ระบบตัดสิน
//   B ไม่กดอะไรจนหมดเวลา -> A ต้องพิมพ์สูตร ระบบตัดสิน
//
// ถ้าพิมพ์แล้วสูตรถูกจริง: A ได้แต้ม และ B โดนหักแต้มฐานปัดตกของจริง
// การแกล้งไม่กดจึงไม่ได้อะไร มีแต่เสีย
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(
    typeof require === "function" ? require("./rules") : root.TwentyRules
  );
  else root.TwentyMatch = factory(root.TwentyRules);
})(typeof self !== "undefined" ? self : this, function (T) {
  "use strict";

  var SPEAK_MS = 10000;      // กดตอบแล้วมีเวลาพูด 10 วิ
  var JUDGE_MS = 12000;      // อีกฝ่ายมีเวลาตัดสิน ถ้าเกินนี้ให้ระบบตัดสินแทน

  var POINT_CORRECT = 1;     // ตอบถูก
  var POINT_FOUL = -1;       // กดตอบแล้วผิด หรือหมดเวลาพูด
  var POINT_BAD_REJECT = -1; // ปัดตกคำตอบที่ถูกจริง

  /**
   * @param {Array} entries ชื่อผู้เล่น หรือ { id, name } ถ้าอยากกำหนด id เอง
   *
   * โหมดเครื่องเดียวส่งแค่ชื่อมา ระบบตั้ง id ให้เป็น p0 p1 ...
   * โหมดออนไลน์ต้องส่ง id จริงของห้องมาด้วย เพราะ state ต้องผูกกับตัวตนที่ข้ามการ reconnect ได้
   */
  function createGame(entries, options) {
    var opts = options || {};
    var players = entries.map(function (e, i) {
      var isObj = e && typeof e === "object";
      return {
        id: isObj && e.id ? String(e.id) : "p" + i,
        name: isObj ? String(e.name || "") : String(e),
        score: 0, correct: 0, fouls: 0
      };
    });

    return {
      players: players,
      round: 0,
      cards: [],
      solutionCount: 0,
      phase: "idle",        // idle | showing | claimed | typing | roundEnd
      claimerId: null,
      deadline: null,       // เวลาหมดอายุของ phase ปัจจุบัน
      lastOutcome: null,
      minSolutions: opts.minSolutions || 1,
      history: []
    };
  }

  function playerById(game, id) {
    for (var i = 0; i < game.players.length; i++) {
      if (game.players[i].id === id) return game.players[i];
    }
    return null;
  }

  function award(game, id, points) {
    var p = playerById(game, id);
    if (p) p.score += points;
    return p;
  }

  function nextRound(game) {
    game.cards = T.dealCards({ minSolutions: game.minSolutions });
    game.solutionCount = T.solve(game.cards).count;
    game.round += 1;
    game.phase = "showing";
    game.claimerId = null;
    game.deadline = null;
    game.lastOutcome = null;
    return game;
  }

  /** ผู้เล่นกดปุ่มตอบ — ได้สิทธิ์พูดคนเดียว */
  function claim(game, playerId, now) {
    if (game.phase !== "showing") throw new Error("ตอนนี้ยังกดตอบไม่ได้");
    if (!playerById(game, playerId)) throw new Error("ไม่พบผู้เล่น");

    game.phase = "claimed";
    game.claimerId = playerId;
    game.deadline = (now || Date.now()) + SPEAK_MS;
    return game;
  }

  /** หมดเวลาพูด = ฟาวล์ ไม่ต้องรอให้ใครตัดสิน */
  function speakTimeout(game) {
    if (game.phase !== "claimed") return game;

    var p = award(game, game.claimerId, POINT_FOUL);
    if (p) p.fouls += 1;

    game.phase = "roundEnd";
    game.lastOutcome = {
      type: "timeout",
      claimerId: game.claimerId,
      claimerName: p ? p.name : "",
      points: POINT_FOUL,
      message: (p ? p.name : "") + " หมดเวลาพูด ถือว่าฟาวล์"
    };
    game.history.push(game.lastOutcome);
    return game;
  }

  /**
   * อีกฝ่ายตัดสิน
   * ถูก -> จบตาเลย  |  ผิด -> ส่งต่อให้ระบบตัดสินด้วยการพิมพ์สูตร
   */
  function judge(game, accepted, now) {
    if (game.phase !== "claimed") throw new Error("ตอนนี้ยังไม่มีใครกดตอบ");

    if (accepted) {
      var p = award(game, game.claimerId, POINT_CORRECT);
      if (p) p.correct += 1;

      game.phase = "roundEnd";
      game.lastOutcome = {
        type: "accepted",
        claimerId: game.claimerId,
        claimerName: p ? p.name : "",
        points: POINT_CORRECT,
        message: (p ? p.name : "") + " ตอบถูก"
      };
      game.history.push(game.lastOutcome);
      return game;
    }

    game.phase = "typing";
    game.deadline = (now || Date.now()) + JUDGE_MS * 3;
    return game;
  }

  /** ไม่มีใครกดตัดสินจนหมดเวลา — ให้ระบบตัดสินแทน กันคนแกล้งเงียบ */
  function judgeTimeout(game, now) {
    if (game.phase !== "claimed") return game;
    game.phase = "typing";
    game.deadline = (now || Date.now()) + JUDGE_MS * 3;
    game.lastOutcome = {
      type: "escalated",
      claimerId: game.claimerId,
      message: "ไม่มีใครกดตัดสิน ให้พิมพ์สูตรแล้วระบบจะตัดสินเอง"
    };
    return game;
  }

  /**
   * คนที่กดตอบพิมพ์สูตรมาให้ระบบตัดสิน — คำตัดสินนี้เป็นที่สิ้นสุด
   * @param {boolean} wasRejected อีกฝ่ายกดว่าผิดไว้หรือเปล่า (ใช้ตัดสินว่าจะหักแต้มคนปัดตกไหม)
   */
  function submitExpression(game, text, wasRejected) {
    if (game.phase !== "typing") throw new Error("ตอนนี้ยังไม่ต้องพิมพ์สูตร");

    var check = T.checkExpression(text, game.cards);
    var claimer = playerById(game, game.claimerId);

    if (check.ok) {
      award(game, game.claimerId, POINT_CORRECT);
      if (claimer) claimer.correct += 1;

      // ปัดตกของจริงต้องมีราคา ไม่งั้นแกล้งกดผิดได้ฟรี
      var penalised = [];
      if (wasRejected) {
        game.players.forEach(function (p) {
          if (p.id === game.claimerId) return;
          p.score += POINT_BAD_REJECT;
          penalised.push(p.name);
        });
      }

      game.phase = "roundEnd";
      game.lastOutcome = {
        type: "verified",
        claimerId: game.claimerId,
        claimerName: claimer ? claimer.name : "",
        points: POINT_CORRECT,
        expression: text,
        penalised: penalised,
        message: penalised.length
          ? "ระบบยืนยันว่าสูตรถูก " + (claimer ? claimer.name : "") + " ได้แต้ม และคนที่ปัดตกโดนหักแต้ม"
          : "ระบบยืนยันว่าสูตรถูก " + (claimer ? claimer.name : "") + " ได้แต้ม"
      };
      game.history.push(game.lastOutcome);
      return game;
    }

    award(game, game.claimerId, POINT_FOUL);
    if (claimer) claimer.fouls += 1;

    game.phase = "roundEnd";
    game.lastOutcome = {
      type: "rejected",
      claimerId: game.claimerId,
      claimerName: claimer ? claimer.name : "",
      points: POINT_FOUL,
      expression: text,
      reason: check.reason,
      message: (claimer ? claimer.name : "") + " สูตรไม่ผ่าน: " + check.reason
    };
    game.history.push(game.lastOutcome);
    return game;
  }

  /** ไม่มีใครตอบได้ ข้ามชุดนี้ */
  function skipRound(game) {
    if (game.phase !== "showing") throw new Error("ข้ามได้เฉพาะตอนที่ยังไม่มีใครกดตอบ");
    game.phase = "roundEnd";
    game.lastOutcome = {
      type: "skipped",
      points: 0,
      message: "ข้ามชุดนี้ ไม่มีใครได้แต้ม"
    };
    game.history.push(game.lastOutcome);
    return game;
  }

  function standings(game) {
    return game.players.slice().sort(function (a, b) {
      return b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name);
    });
  }

  return {
    SPEAK_MS: SPEAK_MS,
    JUDGE_MS: JUDGE_MS,
    POINT_CORRECT: POINT_CORRECT,
    POINT_FOUL: POINT_FOUL,
    POINT_BAD_REJECT: POINT_BAD_REJECT,
    createGame: createGame,
    nextRound: nextRound,
    claim: claim,
    speakTimeout: speakTimeout,
    judge: judge,
    judgeTimeout: judgeTimeout,
    submitExpression: submitExpression,
    skipRound: skipRound,
    standings: standings,
    playerById: playerById
  };
});
