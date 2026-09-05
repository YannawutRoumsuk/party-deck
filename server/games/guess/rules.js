// server/games/guess/rules.js — เกมทายของ 20 คำถาม
//
// ผลัดกันเล่น แต่ละตาเลือกได้ว่าจะ "ถาม" หรือ "ทาย"
// ถามได้ไม่จำกัด แต่ทายชื่อได้แค่ 3 ครั้ง ใครทายถูกก่อนชนะ
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GuessRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_GUESSES = 3;
  var TURN_MS = 60000;    // ฝั่งถามมีเวลาคิดคำถาม 1 นาที
  var ANSWER_MS = 60000;  // ฝั่งตอบมีเวลาตัดสิน 1 นาที

  var WIN_POINTS = 3;
  var DRAW_POINTS = 1;

  function createMatch(playerIds, options) {
    var opts = options || {};
    if (playerIds.length !== 2) throw new Error("เกมนี้เล่น 2 คนพอดี");

    var seats = {};
    playerIds.forEach(function (id) {
      seats[id] = {
        secret: null,        // สิ่งที่เจ้าของตั้งไว้ให้อีกฝ่ายทาย
        asked: [],           // [{question, answer}] คำถามที่ยิงใส่ของชิ้นนี้
        guesses: [],         // [{value, correct}]
        found: false
      };
    });

    return {
      playerIds: [playerIds[0], playerIds[1]],
      packId: opts.packId || null,
      level: opts.level || "common",
      seats: seats,
      phase: "picking",      // picking | asking | answering | finished
      turn: null,            // ใครกำลังเล่นตานี้
      pending: null,         // { kind:'question'|'guess', text }
      deadline: null,
      fouls: {},
      result: null,
      log: []
    };
  }

  function opponentOf(match, id) {
    return match.playerIds[0] === id ? match.playerIds[1] : match.playerIds[0];
  }

  // ที่นั่งของอีกฝ่าย = สิ่งที่ "เรา" ต้องทาย
  function targetOf(match, guesserId) {
    return match.seats[opponentOf(match, guesserId)];
  }

  function setSecret(match, playerId, text) {
    if (match.phase !== "picking") throw new Error("เลยขั้นตอนตั้งคำไปแล้ว");
    if (match.playerIds.indexOf(playerId) < 0) throw new Error("ไม่ใช่ผู้เล่นในเกมนี้");

    var clean = String(text || "").trim().replace(/\s+/g, " ");
    if (!clean) throw new Error("ยังไม่ได้ใส่คำ");
    if (clean.length > 40) throw new Error("คำยาวเกินไป");

    match.seats[playerId].secret = clean;

    if (match.seats[match.playerIds[0]].secret && match.seats[match.playerIds[1]].secret) {
      match.phase = "asking";
      match.turn = match.playerIds[0];
      match.deadline = Date.now() + TURN_MS;
    }
    return match;
  }

  function guessesLeft(match, guesserId) {
    return Math.max(0, MAX_GUESSES - targetOf(match, guesserId).guesses.length);
  }

  /** ตานี้จะถาม — ส่งคำถามไปให้อีกฝ่ายกดใช่/ไม่ใช่ */
  function ask(match, playerId, question) {
    if (match.phase !== "asking") throw new Error("ตอนนี้ยังถามไม่ได้");
    if (match.turn !== playerId) throw new Error("ยังไม่ถึงตาของคุณ");

    var clean = String(question || "").trim();
    if (!clean) throw new Error("ยังไม่ได้พิมพ์คำถาม");

    match.pending = { kind: "question", text: clean, byId: playerId };
    match.phase = "answering";
    match.deadline = Date.now() + ANSWER_MS;
    return match;
  }

  /** ตานี้จะทาย — เปลืองสิทธิ์ 1 ใน 3 ครั้ง */
  function guess(match, playerId, value) {
    if (match.phase !== "asking") throw new Error("ตอนนี้ยังทายไม่ได้");
    if (match.turn !== playerId) throw new Error("ยังไม่ถึงตาของคุณ");
    if (guessesLeft(match, playerId) <= 0) throw new Error("ใช้สิทธิ์ทายครบ 3 ครั้งแล้ว");

    var clean = String(value || "").trim();
    if (!clean) throw new Error("ยังไม่ได้พิมพ์คำทาย");

    match.pending = { kind: "guess", text: clean, byId: playerId };
    match.phase = "answering";
    match.deadline = Date.now() + ANSWER_MS;
    return match;
  }

  function nextTurn(match) {
    match.turn = opponentOf(match, match.turn);
    match.phase = "asking";
    match.pending = null;
    match.deadline = Date.now() + TURN_MS;
  }

  function finish(match, winnerId) {
    match.phase = "finished";
    match.turn = null;
    match.pending = null;
    match.deadline = null;

    var scores = {};
    if (winnerId) {
      scores[winnerId] = WIN_POINTS;
      scores[opponentOf(match, winnerId)] = 0;
      match.result = { winner: winnerId, draw: false, scores: scores };
    } else {
      scores[match.playerIds[0]] = DRAW_POINTS;
      scores[match.playerIds[1]] = DRAW_POINTS;
      match.result = { winner: null, draw: true, scores: scores };
    }
    return match;
  }

  /** ทั้งคู่ใช้สิทธิ์ทายหมดแล้วโดยไม่มีใครถูก = เสมอ */
  function bothOutOfGuesses(match) {
    return match.playerIds.every(function (id) {
      var t = targetOf(match, id);
      return !t.found && t.guesses.length >= MAX_GUESSES;
    });
  }

  /**
   * เจ้าของคำตอบกดตัดสิน
   * @param {boolean} yes คำถาม -> ใช่/ไม่ใช่ | การทาย -> ถูก/ผิด
   */
  function respond(match, playerId, yes) {
    if (match.phase !== "answering") throw new Error("ตอนนี้ยังไม่มีอะไรให้ตอบ");
    if (!match.pending) throw new Error("ไม่มีคำถามค้างอยู่");
    if (match.pending.byId === playerId) throw new Error("ตอบคำถามตัวเองไม่ได้");

    var asker = match.pending.byId;
    var target = targetOf(match, asker);
    var entry = { text: match.pending.text, kind: match.pending.kind, byId: asker, yes: !!yes };

    if (match.pending.kind === "question") {
      target.asked.push({ question: match.pending.text, answer: !!yes });
      match.log.push(entry);
      nextTurn(match);
      return match;
    }

    target.guesses.push({ value: match.pending.text, correct: !!yes });
    match.log.push(entry);

    if (yes) {
      target.found = true;
      return finish(match, asker);
    }
    if (bothOutOfGuesses(match)) return finish(match, null);

    nextTurn(match);
    return match;
  }

  /**
   * หมดเวลาในตาไหน คนนั้นเสียตา
   * ฝั่งถามหมดเวลา -> เสียตา อีกฝ่ายเล่นต่อ
   * ฝั่งตอบหมดเวลา -> ถือว่าตอบ "ไม่ใช่" ไปก่อน เกมต้องเดินต่อได้
   */
  function timeout(match) {
    if (match.phase === "asking") {
      match.fouls[match.turn] = (match.fouls[match.turn] || 0) + 1;
      match.log.push({ kind: "foul", byId: match.turn, text: "หมดเวลาคิดคำถาม เสียตานี้" });
      nextTurn(match);
      return match;
    }
    if (match.phase === "answering") {
      var answerer = opponentOf(match, match.pending.byId);
      match.fouls[answerer] = (match.fouls[answerer] || 0) + 1;
      match.log.push({ kind: "foul", byId: answerer, text: "หมดเวลาตอบ ระบบตอบว่าไม่ใช่ให้" });
      return respond(match, answerer, false);
    }
    return match;
  }

  return {
    MAX_GUESSES: MAX_GUESSES,
    TURN_MS: TURN_MS,
    ANSWER_MS: ANSWER_MS,
    WIN_POINTS: WIN_POINTS,
    DRAW_POINTS: DRAW_POINTS,
    createMatch: createMatch,
    setSecret: setSecret,
    ask: ask,
    guess: guess,
    respond: respond,
    timeout: timeout,
    opponentOf: opponentOf,
    targetOf: targetOf,
    guessesLeft: guessesLeft
  };
});
