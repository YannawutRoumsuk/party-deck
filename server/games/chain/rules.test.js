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

// ── กรรมการ AI (เสริม ไม่ใช่ตัวตัดสิน) ────────────────────────────────
const AI_NAMES = ["เอ", "บี", "ซี", "ดี"];

function challengeReady(opts) {
  const g = C.createGame(AI_NAMES, Object.assign({ seed: "ทะเล" }, opts || {}));
  C.submitWord(g, "p0", "เกลือ");
  C.startChallenge(g, "p1");
  return g;
}

test("โหมดปกติไม่มีกรรมการ AI ให้เรียก", () => {
  const g = challengeReady();
  assert.strictEqual(g.aiReferee, false);
  assert.strictEqual(C.canAskReferee(g), false);
});

test("host เปิดกรรมการ AI แล้วเรียกได้", () => {
  const g = challengeReady({ aiReferee: true });
  assert.strictEqual(g.aiReferee, true);
  assert.strictEqual(C.canAskReferee(g), true);
});

test("เรียกกรรมการได้ครั้งเดียวต่อหนึ่งชาเลนจ์", () => {
  const g = challengeReady({ aiReferee: true });
  C.applyRefereeOpinion(g, { linked: true, reason: "ทะเลมีเกลือ" });
  assert.strictEqual(C.canAskReferee(g), false);
  assert.throws(() => C.applyRefereeOpinion(g, { linked: false, reason: "x" }));
});

test("ความเห็นกรรมการล้างโหวตเดิม ให้ทุกคนโหวตใหม่หลังฟังเหตุผล", () => {
  const g = challengeReady({ aiReferee: true });
  C.vote(g, "p2", true);
  C.vote(g, "p3", false);
  assert.strictEqual(C.voteTally(g).total, 2);

  C.applyRefereeOpinion(g, { linked: true, reason: "ทะเลมีเกลือ" });
  assert.strictEqual(C.voteTally(g).total, 0, "ต้องเคลียร์โหวตให้โหวตใหม่");
  assert.strictEqual(g.challenge.aiOpinion.linked, true);
  assert.strictEqual(g.phase, "challenge", "ยังอยู่ในโหมดชาเลนจ์");
});

test("เสมอ + เปิด AI ไว้ = ควรถามกรรมการก่อนปิดโหวต", () => {
  const g = challengeReady({ aiReferee: true });
  C.vote(g, "p2", true);
  C.vote(g, "p3", false);
  assert.strictEqual(C.shouldConsultReferee(g), true);
});

test("ไม่เสมอ ไม่ต้องถามกรรมการ ให้จบด้วยเสียงคน", () => {
  const g = challengeReady({ aiReferee: true });
  C.vote(g, "p2", false);
  C.vote(g, "p3", false);
  assert.strictEqual(C.shouldConsultReferee(g), false);
});

test("ยังไม่มีใครโหวตเลย ไม่ยิง API ทิ้ง", () => {
  const g = challengeReady({ aiReferee: true });
  assert.strictEqual(C.shouldConsultReferee(g), false, "0-0 ไม่ใช่การหาข้อสรุปไม่ได้");
});

test("ฟัง AI แล้วโหวตใหม่ยังเสมอ ใช้กติกาเดิม คนชาเลนจ์แพ้", () => {
  const g = challengeReady({ aiReferee: true });
  C.vote(g, "p2", true);
  C.vote(g, "p3", false);
  C.applyRefereeOpinion(g, { linked: false, reason: "คนละเรื่อง" });

  C.vote(g, "p2", true);
  C.vote(g, "p3", false);
  assert.strictEqual(C.shouldConsultReferee(g), false, "ถามซ้ำไม่ได้แล้ว");

  C.resolveChallenge(g);
  assert.strictEqual(g.lastEvent.challengerWins, false, "เสมอ = คนชาเลนจ์แพ้ตามเดิม");
});

test("AI บอกว่าไม่เชื่อมโยง แต่คนโหวตว่าเชื่อมโยง คนชนะ", () => {
  const g = challengeReady({ aiReferee: true });
  C.applyRefereeOpinion(g, { linked: false, reason: "คนละเรื่อง" });
  C.vote(g, "p2", true);
  C.vote(g, "p3", true);
  C.resolveChallenge(g);

  assert.strictEqual(g.lastEvent.challengerWins, false, "เสียงคนต้องชนะความเห็น AI");
  assert.strictEqual(C.playerById(g, "p0").alive, true, "คนพูดต้องไม่ตกรอบ");
});

test("ชาเลนจ์ครั้งใหม่ เรียกกรรมการได้ใหม่", () => {
  const g = challengeReady({ aiReferee: true });
  C.applyRefereeOpinion(g, { linked: true, reason: "x" });
  C.vote(g, "p2", true);
  C.vote(g, "p3", true);
  C.resolveChallenge(g);

  C.submitWord(g, "p1", "น้ำปลา");
  C.startChallenge(g, "p2");
  assert.strictEqual(C.canAskReferee(g), true, "ชาเลนจ์ใหม่ = สิทธิ์ใหม่");
});

test("เรียกกรรมการนอกช่วงชาเลนจ์ไม่ได้", () => {
  const g = C.createGame(AI_NAMES, { seed: "ทะเล", aiReferee: true });
  assert.strictEqual(C.canAskReferee(g), false);
  assert.throws(() => C.applyRefereeOpinion(g, { linked: true, reason: "x" }));
});
