const test = require("node:test");
const assert = require("node:assert");
const G = require("./rules");
const W = require("./words");

const A = "pa";
const B = "pb";

function ready() {
  const m = G.createMatch([A, B]);
  G.setSecret(m, A, "ช้าง");
  G.setSecret(m, B, "ตู้เย็น");
  return m;
}

test("ตั้งคำครบสองฝั่งแล้วถึงเริ่มเล่นได้", () => {
  const m = G.createMatch([A, B]);
  G.setSecret(m, A, "ช้าง");
  assert.strictEqual(m.phase, "picking");
  assert.throws(() => G.ask(m, A, "ใหญ่ไหม"), /ยังถามไม่ได้/);

  G.setSecret(m, B, "ตู้เย็น");
  assert.strictEqual(m.phase, "asking");
  assert.strictEqual(m.turn, A);
});

test("ถามแล้วอีกฝ่ายตอบ ตาก็สลับ", () => {
  const m = ready();
  G.ask(m, A, "ใหญ่กว่าคนไหม");
  assert.strictEqual(m.phase, "answering");

  G.respond(m, B, true);
  assert.strictEqual(m.turn, B, "ตอบแล้วต้องสลับตา");
  assert.strictEqual(m.phase, "asking");

  // คำถามถูกบันทึกไว้ที่ของฝั่งที่ถูกถาม
  const target = G.targetOf(m, A);
  assert.strictEqual(target.asked.length, 1);
  assert.strictEqual(target.asked[0].answer, true);
});

test("ตอบคำถามตัวเองไม่ได้", () => {
  const m = ready();
  G.ask(m, A, "ใหญ่ไหม");
  assert.throws(() => G.respond(m, A, true), /ตอบคำถามตัวเองไม่ได้/);
});

test("ทายถูกชนะทันที ได้ 3 แต้ม", () => {
  const m = ready();
  G.guess(m, A, "ตู้เย็น");
  G.respond(m, B, true);

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.winner, A);
  assert.strictEqual(m.result.scores[A], 3);
  assert.strictEqual(m.result.scores[B], 0);
});

test("ทายได้แค่ 3 ครั้ง ครั้งที่ 4 ต้องไม่ผ่าน", () => {
  const m = ready();
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(G.guessesLeft(m, A), 3 - i);
    G.guess(m, A, "ผิด" + i);
    G.respond(m, B, false);
    // สลับให้ B เล่นแล้วสลับกลับมา
    G.ask(m, B, "คำถามคั่น");
    G.respond(m, A, false);
  }
  assert.strictEqual(G.guessesLeft(m, A), 0);
  assert.throws(() => G.guess(m, A, "อีกที"), /ครบ 3 ครั้งแล้ว/);
});

test("ทายหมดสิทธิ์ทั้งคู่โดยไม่มีใครถูก = เสมอ ได้คนละ 1 แต้ม", () => {
  const m = ready();
  for (let i = 0; i < 3; i++) {
    G.guess(m, A, "มั่ว" + i); G.respond(m, B, false);
    G.guess(m, B, "มั่ว" + i); G.respond(m, A, false);
  }
  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.draw, true);
  assert.strictEqual(m.result.scores[A], 1);
  assert.strictEqual(m.result.scores[B], 1);
});

test("ยังถามได้เรื่อยๆ ไม่จำกัดจำนวน", () => {
  const m = ready();
  for (let i = 0; i < 25; i++) {
    G.ask(m, m.turn, "คำถามที่ " + i);
    G.respond(m, G.opponentOf(m, m.pending.byId), i % 2 === 0);
  }
  assert.strictEqual(m.phase, "asking", "ถาม 25 ครั้งแล้วเกมต้องยังเล่นอยู่");
});

test("หมดเวลาคิดคำถาม เสียตา อีกฝ่ายได้เล่นต่อ", () => {
  const m = ready();
  assert.strictEqual(m.turn, A);

  G.timeout(m);
  assert.strictEqual(m.turn, B, "A เสียตา ต้องเป็นตา B");
  assert.strictEqual(m.fouls[A], 1);
});

test("หมดเวลาตอบ ระบบตอบไม่ใช่ให้ เกมเดินต่อได้", () => {
  const m = ready();
  G.ask(m, A, "ใหญ่ไหม");
  G.timeout(m);

  assert.strictEqual(m.fouls[B], 1);
  assert.strictEqual(m.phase, "asking");
  assert.strictEqual(G.targetOf(m, A).asked[0].answer, false);
});

test("หมดเวลาตอนอีกฝ่ายทาย ก็ต้องไม่ทำให้เขาชนะฟรี", () => {
  const m = ready();
  G.guess(m, A, "ตู้เย็น");   // ทายถูกจริง แต่ B ปล่อยหมดเวลา
  G.timeout(m);

  assert.strictEqual(m.phase, "asking", "ถือว่าตอบไม่ใช่ เกมเดินต่อ");
  assert.strictEqual(G.targetOf(m, A).guesses[0].correct, false);
  assert.strictEqual(m.fouls[B], 1, "แต่คนที่ปล่อยหมดเวลาโดนฟาวล์");
});

test("เล่นผิดตาไม่ได้", () => {
  const m = ready();
  assert.throws(() => G.ask(m, B, "แอบถาม"), /ยังไม่ถึงตาของคุณ/);
  assert.throws(() => G.guess(m, B, "แอบทาย"), /ยังไม่ถึงตาของคุณ/);
});

test("คำว่างหรือยาวเกินไป ต้องไม่ผ่าน", () => {
  const m = G.createMatch([A, B]);
  assert.throws(() => G.setSecret(m, A, "   "), /ยังไม่ได้ใส่คำ/);
  assert.throws(() => G.setSecret(m, A, "ก".repeat(41)), /ยาวเกินไป/);
});

// ---------- คลังคำ ----------

test("คลังคำมีของครบทุกชุด ทั้งแบบรู้จักดีและรู้จักน้อย", () => {
  assert.ok(W.PACKS.length >= 8, "ควรมีอย่างน้อย 8 ชุด");
  assert.ok(W.totalWords() >= 200, "มีคำ " + W.totalWords() + " คำ น้อยไป");

  for (const pack of W.PACKS) {
    assert.ok(pack.common.length >= 10, pack.name + " หมวดรู้จักดีน้อยไป");
    assert.ok(pack.rare.length >= 10, pack.name + " หมวดรู้จักน้อยน้อยไป");
    assert.ok(["สิ่งมีชีวิต", "สิ่งของ"].includes(pack.group), pack.name + " กลุ่มผิด");
  }
});

test("ไม่มีคำซ้ำข้ามชุด", () => {
  const seen = new Map();
  for (const pack of W.PACKS) {
    for (const word of pack.common.concat(pack.rare)) {
      assert.ok(!seen.has(word), 'คำว่า "' + word + '" ซ้ำใน ' + seen.get(word) + " และ " + pack.name);
      seen.set(word, pack.name);
    }
  }
});

test("สุ่มคำได้จากทุกชุดและทุกระดับ", () => {
  for (const pack of W.PACKS) {
    for (const level of ["common", "rare", "both"]) {
      const w = W.pickWord(pack.id, level);
      assert.ok(typeof w === "string" && w.length > 0, pack.id + "/" + level);
    }
  }
  assert.strictEqual(W.pickWord("ไม่มีชุดนี้", "common"), null);
});

test("คำถามแนะนำเลือกให้ตรงกลุ่ม และไม่ซ้ำของเดิม", () => {
  const forAnimal = W.hintsFor("mammal");
  const forThing = W.hintsFor("household");
  assert.notDeepStrictEqual(forAnimal, forThing, "สัตว์กับสิ่งของต้องใช้คำถามคนละชุด");

  const used = forAnimal.slice(0, forAnimal.length - 1);
  const next = W.randomHint("mammal", used);
  assert.strictEqual(next, forAnimal[forAnimal.length - 1], "ต้องเลี่ยงคำถามที่ใช้ไปแล้ว");
});
