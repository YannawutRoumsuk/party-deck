const test = require("node:test");
const assert = require("node:assert");
const C = require("./rules");

function game(seed) {
  return C.createGame(["เอ", "บี", "ซี"], { seed: seed || "ทะเล" });
}

const cur = (g) => C.currentPlayer(g).id;
const P = (g, id) => C.playerById(g, id);

test("ต้องมีอย่างน้อย 3 คน", () => {
  assert.throws(() => C.createGame(["เอ", "บี"]), /อย่างน้อย 3 คน/);
});

test("เริ่มเกมมีคำตั้งต้นและวนตามลำดับ", () => {
  const g = game("ทะเล");
  assert.strictEqual(g.chain[0].word, "ทะเล");
  assert.strictEqual(cur(g), "p0");

  C.submitWord(g, "p0", "ปลา");
  assert.strictEqual(cur(g), "p1");
  C.submitWord(g, "p1", "ตลาด");
  assert.strictEqual(cur(g), "p2");
  C.submitWord(g, "p2", "เงิน");
  assert.strictEqual(cur(g), "p0", "วนกลับมาคนแรก");
});

test("ส่งคำผิดตาไม่ได้", () => {
  const g = game();
  assert.throws(() => C.submitWord(g, "p1", "ปลา"), /ยังไม่ถึงตาของคุณ/);
});

test("ใช้พยางค์ซ้ำ ตกรอบทันที", () => {
  const g = game("ใบไม้");
  const r = C.submitWord(g, "p0", "ต้นไม้");

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.eliminated, true);
  assert.strictEqual(P(g, "p0").alive, false);
  assert.match(P(g, "p0").outReason, /ไม้/);
  assert.strictEqual(cur(g), "p1", "ต้องข้ามไปคนถัดไป");
});

test("คำที่ตกรอบไปแล้วไม่ถูกนับเข้ากองคำที่ใช้", () => {
  const g = game("ใบไม้");
  C.submitWord(g, "p0", "ต้นไม้");
  assert.strictEqual(g.usedWords.indexOf("ต้นไม้"), -1, "คำที่ทำให้ตกรอบต้องไม่เข้ากอง");
});

test("หมดเวลาพิมพ์ ตกรอบ", () => {
  const g = game();
  C.timeout(g);
  assert.strictEqual(P(g, "p0").alive, false);
  assert.match(P(g, "p0").outReason, /หมดเวลา/);
  assert.strictEqual(cur(g), "p1");
});

test("รอดหนึ่งตาได้ 1 แต้ม", () => {
  const g = game();
  C.submitWord(g, "p0", "ปลา");
  assert.strictEqual(P(g, "p0").score, 1);
});

test("เหลือคนเดียวจบเกม คนสุดท้ายได้โบนัส", () => {
  const g = game();
  C.timeout(g);   // p0 ออก
  C.timeout(g);   // p1 ออก

  assert.strictEqual(g.phase, "finished");
  assert.strictEqual(g.winnerId, "p2");
  assert.strictEqual(P(g, "p2").score, C.POINT_WINNER);
});

// ---------- ชาเลนจ์ ----------

test("ชาเลนจ์แล้วโหวตว่าไม่เชื่อมโยง คนพูดตกรอบ คนชาเลนจ์ได้แต้ม", () => {
  const g = C.createGame(["เอ", "บี", "ซี", "ดี"], { seed: "ทะเล" });
  C.submitWord(g, "p0", "ปลา");           // p0 พูด "ปลา"

  C.startChallenge(g, "p1");
  assert.strictEqual(g.phase, "challenge");

  // คู่กรณีโหวตไม่ได้ เหลือ p2 p3 โหวต
  assert.throws(() => C.vote(g, "p0", true), /คู่กรณีโหวตไม่ได้/);
  assert.throws(() => C.vote(g, "p1", false), /คู่กรณีโหวตไม่ได้/);

  C.vote(g, "p2", false);
  C.vote(g, "p3", false);
  C.resolveChallenge(g);

  assert.strictEqual(P(g, "p0").alive, false, "คนพูดต้องตกรอบ");
  assert.strictEqual(P(g, "p1").score, C.POINT_CHALLENGE_WIN);
  assert.strictEqual(P(g, "p1").canChallenge, true, "ชนะแล้วยังชาเลนจ์ได้อีก");
  assert.strictEqual(g.usedWords.indexOf("ปลา"), -1, "คำที่ถูกตีตกต้องถูกถอนออก");
});

test("ชาเลนจ์แล้วเสียงข้างน้อย คนชาเลนจ์หมดสิทธิ์ทั้งรอบ", () => {
  const g = C.createGame(["เอ", "บี", "ซี", "ดี"], { seed: "ทะเล" });
  C.submitWord(g, "p0", "ปลา");

  C.startChallenge(g, "p1");
  C.vote(g, "p2", true);
  C.vote(g, "p3", true);
  C.resolveChallenge(g);

  assert.strictEqual(P(g, "p0").alive, true, "คนพูดต้องรอด");
  assert.strictEqual(P(g, "p1").canChallenge, false, "คนชาเลนจ์หมดสิทธิ์");
  assert.throws(() => C.startChallenge(g, "p1"), /ใช้สิทธิ์ชาเลนจ์ไปแล้ว/);
  assert.strictEqual(g.usedWords.indexOf("ปลา") >= 0, true, "คำยังอยู่ในกอง");
});

test("เสมอถือว่าคนชาเลนจ์แพ้ (ต้องชนะให้ชัดถึงจะตีตกได้)", () => {
  const g = C.createGame(["เอ", "บี", "ซี", "ดี"], { seed: "ทะเล" });
  C.submitWord(g, "p0", "ปลา");

  C.startChallenge(g, "p1");
  C.vote(g, "p2", true);
  C.vote(g, "p3", false);
  C.resolveChallenge(g);

  assert.strictEqual(P(g, "p0").alive, true);
  assert.strictEqual(P(g, "p1").canChallenge, false);
});

test("ชาเลนจ์คำตัวเองไม่ได้ และชาเลนจ์คำตั้งต้นไม่ได้", () => {
  const g = game("ทะเล");
  assert.throws(() => C.startChallenge(g, "p1"), /คำตั้งต้นชาเลนจ์ไม่ได้/);

  C.submitWord(g, "p0", "ปลา");
  assert.throws(() => C.startChallenge(g, "p0"), /ชาเลนจ์คำตัวเองไม่ได้/);
});

test("คนตกรอบแล้วชาเลนจ์และโหวตไม่ได้", () => {
  const g = C.createGame(["เอ", "บี", "ซี", "ดี"], { seed: "ทะเล" });
  C.timeout(g);                      // p0 ออก
  C.submitWord(g, "p1", "ปลา");

  assert.throws(() => C.startChallenge(g, "p0"), /ตกรอบไปแล้ว/);

  C.startChallenge(g, "p2");
  assert.throws(() => C.vote(g, "p0", true), /ตกรอบแล้วโหวตไม่ได้/);
});

test("ตาที่ถูกตีตกแล้วเจ้าตัวตกรอบ ต้องเลื่อนตาให้ถูก", () => {
  const g = C.createGame(["เอ", "บี", "ซี", "ดี"], { seed: "ทะเล" });
  C.submitWord(g, "p0", "ปลา");
  assert.strictEqual(cur(g), "p1");

  C.startChallenge(g, "p1");
  C.vote(g, "p2", false);
  C.vote(g, "p3", false);
  C.resolveChallenge(g);

  assert.strictEqual(g.phase, "playing");
  assert.strictEqual(P(g, cur(g)).alive, true, "ตาปัจจุบันต้องเป็นคนที่ยังอยู่");
});

// ---------- รอบใหม่ ----------

test("รอบใหม่ล้างคำและคืนชีพทุกคน แต่คะแนนสะสมอยู่", () => {
  const g = game();
  C.submitWord(g, "p0", "ปลา");
  C.timeout(g);
  const scoreBefore = P(g, "p0").score;

  C.nextRound(g, "ภูเขา");

  assert.strictEqual(g.round, 2);
  assert.deepStrictEqual(g.usedWords, ["ภูเขา"]);
  assert.strictEqual(g.chain.length, 1);
  assert.ok(g.players.every((p) => p.alive), "ทุกคนต้องกลับมาเล่น");
  assert.ok(g.players.every((p) => p.canChallenge), "สิทธิ์ชาเลนจ์ต้องคืนมา");
  assert.strictEqual(P(g, "p0").score, scoreBefore, "คะแนนต้องไม่หาย");
});

test("คำที่ใช้ในรอบก่อน เอามาใช้ใหม่ได้ในรอบถัดไป", () => {
  const g = game("ทะเล");
  C.submitWord(g, "p0", "ปลา");
  C.nextRound(g, "ภูเขา");

  const r = C.submitWord(g, "p0", "ปลา");
  assert.strictEqual(r.ok, true, "คนละรอบแล้ว ต้องใช้ซ้ำได้");
});

test("จัดอันดับตามคะแนน", () => {
  const g = game();
  C.submitWord(g, "p0", "ปลา");
  C.submitWord(g, "p1", "ตลาด");
  C.submitWord(g, "p2", "เงิน");
  C.submitWord(g, "p0", "หมา");

  assert.strictEqual(C.standings(g)[0].id, "p0");
});

test("คำตั้งต้นสุ่มมาจากรายการที่เตรียมไว้", () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(C.SEED_WORDS.includes(C.randomSeed()));
  }
});
