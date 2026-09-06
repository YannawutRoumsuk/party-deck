// server/games/guess/solo.js — เกมทายของโหมดเล่นคนเดียว (สู้กับ AI)
//
// โหมดปกติต้องมี 2 คน คนหนึ่งคิดของ อีกคนทาย
// โหมดนี้ให้ระบบสุ่มของจากคลังคำ แล้ว AI ทำหน้าที่ "คนตอบ" อย่างเดียว
// คนเล่นยังเป็นฝ่ายคิดคำถามและทายเอง ซึ่งเป็นส่วนที่สนุกของเกม
//
// ทำไมให้ AI ตอบอย่างเดียว ไม่ให้ถามด้วย: ครึ่งเดียวก็เล่นได้ครบเกม
// แต่ยิง API น้อยลงครึ่งหนึ่ง และคนเล่นได้ใช้สมองเต็มๆ ไม่ใช่นั่งดู AI เล่น
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GuessSolo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_QUESTIONS = 20;   // ชื่อเกมคือ 20 คำถาม
  var MAX_GUESSES = 3;
  var ANSWERS = ["ใช่", "ไม่ใช่", "ไม่แน่ชัด"];

  function createSolo(secret, options) {
    var s = String(secret || "").trim();
    if (!s) throw new Error("ต้องมีคำลับ");
    var opts = options || {};

    return {
      secret: s,
      packId: opts.packId || null,
      level: opts.level || "common",
      asked: [],              // [{question, answer}]
      guesses: [],            // [{value, correct}]
      guessesLeft: MAX_GUESSES,
      found: false,
      phase: "asking"         // asking | won | lost
    };
  }

  function isOver(game) { return game.phase !== "asking"; }
  function questionsLeft(game) { return MAX_QUESTIONS - game.asked.length; }
  function canAsk(game) { return !isOver(game) && questionsLeft(game) > 0; }

  function recordAnswer(game, question, answer) {
    if (isOver(game)) throw new Error("เกมจบแล้ว");
    if (questionsLeft(game) <= 0) throw new Error("ถามครบ 20 คำถามแล้ว ทายได้อย่างเดียว");
    if (ANSWERS.indexOf(answer) < 0) throw new Error("คำตอบต้องเป็น ใช่ / ไม่ใช่ / ไม่แน่ชัด");

    game.asked.push({ question: String(question || "").trim(), answer: answer });
    return game;
  }

  function recordGuess(game, value, correct) {
    if (isOver(game)) throw new Error("เกมจบแล้ว");

    game.guesses.push({ value: String(value || "").trim(), correct: !!correct });

    if (correct) {
      game.found = true;
      game.phase = "won";
    } else {
      game.guessesLeft -= 1;
      if (game.guessesLeft <= 0) game.phase = "lost";
    }
    return game;
  }

  /**
   * ถามน้อยได้แต้มเยอะ — เพดาน 20 ลดลงตามจำนวนคำถามที่ใช้
   * ชนะยังไงก็ได้อย่างน้อย 1 แต้ม จะได้ไม่รู้สึกว่าเล่นเสียเวลาเปล่า
   */
  function score(game) {
    if (!game.found) return 0;
    return Math.max(1, MAX_QUESTIONS - game.asked.length);
  }

  /**
   * ประวัติที่ส่งไปให้โมเดล — ตัดคำลับออก
   * โมเดลได้คำลับมาทาง field แยกอยู่แล้ว ไม่ต้องส่งซ้ำมาในประวัติ
   * และการแยกกันชัดๆ ทำให้เผลอ log ประวัติทิ้งไว้ก็ไม่หลุดคำเฉลย
   */
  function historyForModel(game) {
    return game.asked.map(function (a) {
      return { q: a.question, a: a.answer };
    });
  }

  return {
    MAX_QUESTIONS: MAX_QUESTIONS,
    MAX_GUESSES: MAX_GUESSES,
    ANSWERS: ANSWERS,
    createSolo: createSolo,
    recordAnswer: recordAnswer,
    recordGuess: recordGuess,
    questionsLeft: questionsLeft,
    canAsk: canAsk,
    isOver: isOver,
    score: score,
    historyForModel: historyForModel
  };
});
