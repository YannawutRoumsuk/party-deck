// server/games/numbers/rules.js — กติกาเกมทายเลข (ไม่รู้จัก socket ไม่รู้จัก DOM)
//
// ไฟล์นี้ถูกโหลดทั้งจาก server (require) และจากเบราว์เซอร์ (<script>)
// โหมดต่อหน้ากันจึงใช้กติกาชุดเดียวกับโหมดออนไลน์เป๊ะ ไม่มีทางเพี้ยนคนละทาง
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NumbersRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN = 1;
  var MAX = 99;
  var MIN_GUESSES = 3;
  var MAX_GUESSES = 10;
  var DEFAULT_GUESSES = 5;

  var ALTERNATE_WIN = 3;
  var ALTERNATE_DRAW = 1;

  // ---------- เลขลับของผู้เล่นหนึ่งคน + ประวัติการทายที่ยิงใส่เลขนี้ ----------

  function createTarget(secret) {
    return {
      secret: secret,
      low: MIN,
      high: MAX,
      guesses: [],   // [{ value, verdict }]
      found: false
    };
  }

  function isValidSecret(value) {
    return Number.isInteger(value) && value >= MIN && value <= MAX;
  }

  /**
   * เช็คก่อนว่าทายได้ไหม — ทายนอกช่วงหรือทายซ้ำถือเป็นการพิมพ์ผิด
   * ไม่ใช่การตัดสินใจ จึงไม่ควรกินตา
   */
  function checkGuess(target, value) {
    if (!Number.isInteger(value)) return { ok: false, reason: "ต้องเป็นจำนวนเต็ม" };
    if (value < MIN || value > MAX) {
      return { ok: false, reason: "ทายได้เฉพาะ " + MIN + "-" + MAX };
    }
    if (target.found) return { ok: false, reason: "เลขนี้ถูกทายเจอไปแล้ว" };
    if (value < target.low || value > target.high) {
      return { ok: false, reason: "เลขนี้ถูกตัดออกไปแล้ว เหลือแค่ " + target.low + "-" + target.high };
    }
    for (var i = 0; i < target.guesses.length; i++) {
      if (target.guesses[i].value === value) return { ok: false, reason: "ทายเลขนี้ไปแล้ว" };
    }
    return { ok: true };
  }

  /** ทายจริง — ผู้เรียกต้องผ่าน checkGuess มาก่อน */
  function applyGuess(target, value) {
    var verdict;
    if (value === target.secret) {
      verdict = "hit";
      target.found = true;
    } else if (value > target.secret) {
      verdict = "high";               // สูงไป เพดานลดลงมาต่ำกว่าเลขที่ทาย
      target.high = value - 1;
    } else {
      verdict = "low";                // ต่ำไป พื้นขยับขึ้นเหนือเลขที่ทาย
      target.low = value + 1;
    }

    target.guesses.push({ value: value, verdict: verdict });
    return { verdict: verdict, low: target.low, high: target.high, found: target.found };
  }

  function remaining(target) {
    if (target.found) return 0;
    return Math.max(0, target.high - target.low + 1);
  }

  // ---------- คะแนน ----------

  /**
   * เจอเร็วได้แต้มเยอะ: ใช้ครั้งแรกได้เต็ม N, ครั้งสุดท้ายได้ 1, ไม่เจอได้ 0
   * สูตรเดียวทำให้ "ใครใช้ครั้งน้อยกว่าชนะ" เป็นจริงในตัว
   */
  function scoreForSingle(found, guessCount, maxGuesses) {
    if (!found) return 0;
    return Math.max(0, maxGuesses - guessCount + 1);
  }

  // ---------- แมตช์ ----------

  function createMatch(options) {
    var opts = options || {};
    var ids = opts.playerIds || [];
    if (ids.length !== 2) throw new Error("เกมทายเลขต้องมีผู้เล่น 2 คนพอดี");

    var format = opts.format === "alternate" ? "alternate" : "single";
    var raw = Number(opts.maxGuesses);
    var maxGuesses = Number.isFinite(raw)
      ? Math.max(MIN_GUESSES, Math.min(Math.round(raw), MAX_GUESSES))
      : DEFAULT_GUESSES;

    var targets = {};
    targets[ids[0]] = null;
    targets[ids[1]] = null;

    return {
      format: format,
      maxGuesses: maxGuesses,
      playerIds: [ids[0], ids[1]],
      firstGuesser: opts.firstGuesser === ids[1] ? ids[1] : ids[0],
      phase: "picking",
      targets: targets,
      turn: null,
      phasesDone: [],       // single: ใครทายครบเฟสตัวเองแล้วบ้าง
      equalizerFor: null,   // alternate: ใครกำลังได้ตาแก้ตัว
      result: null
    };
  }

  function opponentOf(match, id) {
    return match.playerIds[0] === id ? match.playerIds[1] : match.playerIds[0];
  }

  function guessCountAgainst(match, ownerId) {
    var t = match.targets[ownerId];
    return t ? t.guesses.length : 0;
  }

  function hasSecret(match, id) {
    return !!match.targets[id];
  }

  function bothReady(match) {
    return hasSecret(match, match.playerIds[0]) && hasSecret(match, match.playerIds[1]);
  }

  function setSecret(match, playerId, value) {
    if (match.phase !== "picking") throw new Error("เลยขั้นตอนเลือกเลขไปแล้ว");
    if (match.playerIds.indexOf(playerId) < 0) throw new Error("ไม่ใช่ผู้เล่นในเกมนี้");
    if (!isValidSecret(value)) throw new Error("เลขลับต้องเป็นจำนวนเต็ม " + MIN + "-" + MAX);

    match.targets[playerId] = createTarget(value);

    if (bothReady(match)) {
      match.phase = "playing";
      match.turn = match.firstGuesser;
    }
    return match;
  }

  // ---------- เดินเกม ----------

  function finish(match) {
    match.phase = "finished";
    match.turn = null;
    match.equalizerFor = null;

    var a = match.playerIds[0];
    var b = match.playerIds[1];
    var scores = {};

    if (match.format === "single") {
      // ทายของ opponent = ประวัติอยู่ที่ target ของ opponent
      var ta = match.targets[opponentOf(match, a)];
      var tb = match.targets[opponentOf(match, b)];
      scores[a] = scoreForSingle(ta.found, ta.guesses.length, match.maxGuesses);
      scores[b] = scoreForSingle(tb.found, tb.guesses.length, match.maxGuesses);

      var winner = null;
      if (scores[a] > scores[b]) winner = a;
      else if (scores[b] > scores[a]) winner = b;

      match.result = { winner: winner, draw: winner === null, scores: scores };
      return match;
    }

    // alternate: ดูว่าใครทายเจอบ้าง
    var aFound = match.targets[opponentOf(match, a)].found;
    var bFound = match.targets[opponentOf(match, b)].found;

    if (aFound && !bFound) {
      scores[a] = ALTERNATE_WIN; scores[b] = 0;
      match.result = { winner: a, draw: false, scores: scores };
    } else if (bFound && !aFound) {
      scores[a] = 0; scores[b] = ALTERNATE_WIN;
      match.result = { winner: b, draw: false, scores: scores };
    } else {
      // เจอทั้งคู่ (ตาแก้ตัวสำเร็จ) หรือไม่เจอเลยทั้งคู่ = เสมอ
      scores[a] = ALTERNATE_DRAW; scores[b] = ALTERNATE_DRAW;
      match.result = { winner: null, draw: true, scores: scores };
    }
    return match;
  }

  function advanceSingle(match, guesserId) {
    var target = match.targets[opponentOf(match, guesserId)];
    var done = target.found || target.guesses.length >= match.maxGuesses;
    if (!done) return match;

    if (match.phasesDone.indexOf(guesserId) < 0) match.phasesDone.push(guesserId);

    if (match.phasesDone.length >= 2) return finish(match);

    match.turn = opponentOf(match, guesserId);
    return match;
  }

  function advanceAlternate(match, guesserId) {
    var other = opponentOf(match, guesserId);
    var justFound = match.targets[other].found;

    // อยู่ในตาแก้ตัวอยู่แล้ว -> ตานี้จบเกมไม่ว่าผลออกมายังไง
    if (match.equalizerFor === guesserId) return finish(match);

    if (justFound) {
      // คนที่ทายทีหลังยังทายน้อยกว่า ต้องได้ตาแก้ตัวให้เท่ากันก่อน
      var mine = guessCountAgainst(match, other);
      var theirs = guessCountAgainst(match, guesserId);
      if (theirs < mine) {
        match.equalizerFor = other;
        match.turn = other;
        return match;
      }
      return finish(match);
    }

    // ทายครบเพดานทั้งคู่แล้ว = เสมอ
    var usedA = guessCountAgainst(match, match.playerIds[0]);
    var usedB = guessCountAgainst(match, match.playerIds[1]);
    if (usedA >= match.maxGuesses && usedB >= match.maxGuesses) return finish(match);

    match.turn = other;
    return match;
  }

  /**
   * @returns {{verdict, low, high, found, value}} ผลของการทายครั้งนี้
   * @throws {Error} ถ้าทายไม่ได้ (ผิดตา / นอกช่วง / ซ้ำ)
   */
  function guess(match, playerId, value) {
    if (match.phase !== "playing") throw new Error("ยังไม่ถึงตาเล่น");
    if (match.turn !== playerId) throw new Error("ยังไม่ถึงตาของคุณ");

    var target = match.targets[opponentOf(match, playerId)];
    var check = checkGuess(target, value);
    if (!check.ok) throw new Error(check.reason);

    var outcome = applyGuess(target, value);
    outcome.value = value;

    if (match.format === "single") advanceSingle(match, playerId);
    else advanceAlternate(match, playerId);

    return outcome;
  }

  /** ครั้งที่เหลือของคนที่กำลังทาย (single ใช้เพดาน alternate ก็ใช้เหมือนกัน) */
  function guessesLeft(match, guesserId) {
    var used = guessCountAgainst(match, opponentOf(match, guesserId));
    return Math.max(0, match.maxGuesses - used);
  }

  return {
    MIN: MIN,
    MAX: MAX,
    MIN_GUESSES: MIN_GUESSES,
    MAX_GUESSES: MAX_GUESSES,
    DEFAULT_GUESSES: DEFAULT_GUESSES,
    ALTERNATE_WIN: ALTERNATE_WIN,
    ALTERNATE_DRAW: ALTERNATE_DRAW,

    createTarget: createTarget,
    isValidSecret: isValidSecret,
    checkGuess: checkGuess,
    applyGuess: applyGuess,
    remaining: remaining,
    scoreForSingle: scoreForSingle,

    createMatch: createMatch,
    setSecret: setSecret,
    guess: guess,
    opponentOf: opponentOf,
    guessCountAgainst: guessCountAgainst,
    guessesLeft: guessesLeft,
    hasSecret: hasSecret,
    bothReady: bothReady
  };
});
