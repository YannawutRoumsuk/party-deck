// server/games/guess/solo.test.js
const test = require("node:test");
const assert = require("node:assert");
const S = require("./solo");

test("เริ่มเกมได้ ต้องมีคำลับ", () => {
  const g = S.createSolo("ช้าง");
  assert.strictEqual(g.secret, "ช้าง");
  assert.strictEqual(g.phase, "asking");
  assert.strictEqual(g.asked.length, 0);
  assert.strictEqual(g.guessesLeft, S.MAX_GUESSES);
});

test("ไม่มีคำลับเริ่มไม่ได้", () => {
  assert.throws(() => S.createSolo(""));
  assert.throws(() => S.createSolo(null));
});

test("ถามแล้วบันทึกคำตอบ นับคำถามเพิ่ม", () => {
  const g = S.createSolo("ช้าง");
  S.recordAnswer(g, "เป็นสัตว์ไหม", "ใช่");
  assert.strictEqual(g.asked.length, 1);
  assert.deepStrictEqual(g.asked[0], { question: "เป็นสัตว์ไหม", answer: "ใช่" });
  assert.strictEqual(S.questionsLeft(g), S.MAX_QUESTIONS - 1);
});

test("คำตอบนอกเหนือ ใช่/ไม่ใช่/ไม่แน่ชัด ไม่รับ", () => {
  const g = S.createSolo("ช้าง");
  assert.throws(() => S.recordAnswer(g, "อะไร", "อาจจะ"));
});

test("ถามครบโควตาแล้วถามต่อไม่ได้ ต้องทายอย่างเดียว", () => {
  const g = S.createSolo("ช้าง");
  for (let i = 0; i < S.MAX_QUESTIONS; i++) S.recordAnswer(g, "ถาม" + i, "ใช่");
  assert.strictEqual(S.questionsLeft(g), 0);
  assert.strictEqual(S.canAsk(g), false);
  assert.throws(() => S.recordAnswer(g, "เกิน", "ใช่"));
});

test("ทายถูกจบเกมทันที", () => {
  const g = S.createSolo("ช้าง");
  S.recordAnswer(g, "เป็นสัตว์ไหม", "ใช่");
  S.recordGuess(g, "ช้าง", true);
  assert.strictEqual(g.phase, "won");
  assert.strictEqual(g.found, true);
});

test("ทายผิดครบ 3 ครั้งแพ้", () => {
  const g = S.createSolo("ช้าง");
  S.recordGuess(g, "หมา", false);
  S.recordGuess(g, "แมว", false);
  assert.strictEqual(g.phase, "asking");
  S.recordGuess(g, "วัว", false);
  assert.strictEqual(g.phase, "lost");
  assert.strictEqual(g.guessesLeft, 0);
});

test("จบเกมแล้วเล่นต่อไม่ได้", () => {
  const g = S.createSolo("ช้าง");
  S.recordGuess(g, "ช้าง", true);
  assert.throws(() => S.recordAnswer(g, "ถามอีก", "ใช่"));
  assert.throws(() => S.recordGuess(g, "อีกที", false));
});

test("ยิ่งถามน้อยยิ่งได้แต้มเยอะ", () => {
  const fast = S.createSolo("ช้าง");
  S.recordAnswer(fast, "q", "ใช่");
  S.recordGuess(fast, "ช้าง", true);

  const slow = S.createSolo("ช้าง");
  for (let i = 0; i < 15; i++) S.recordAnswer(slow, "q" + i, "ใช่");
  S.recordGuess(slow, "ช้าง", true);

  assert.ok(S.score(fast) > S.score(slow), "ถามน้อยต้องได้แต้มมากกว่า");
  assert.ok(S.score(slow) >= 1, "ชนะยังไงก็ต้องได้แต้ม");
});

test("แพ้ได้ 0 แต้ม", () => {
  const g = S.createSolo("ช้าง");
  S.recordGuess(g, "a", false);
  S.recordGuess(g, "b", false);
  S.recordGuess(g, "c", false);
  assert.strictEqual(S.score(g), 0);
});

test("ประวัติที่ส่งให้ AI ต้องไม่มีคำลับติดไปด้วย", () => {
  const g = S.createSolo("ช้าง");
  S.recordAnswer(g, "เป็นสัตว์ไหม", "ใช่");
  S.recordGuess(g, "หมา", false);
  const h = S.historyForModel(g);
  assert.ok(!JSON.stringify(h).includes("ช้าง"), "คำลับต้องไม่หลุดไปกับประวัติ");
});
