// server/games/twenty/match.test.js — เน้นทดสอบระบบกันโกง
const test = require("node:test");
const assert = require("node:assert");
const M = require("./match");

function game() {
  const g = M.createGame(["เอ", "บี"]);
  M.nextRound(g);
  // ล็อกชุดเลขให้แน่นอน จะได้เทสต์ได้ตรงๆ
  g.cards = [4, 6, 1, 1];
  g.solutionCount = 1;
  return g;
}

const A = "p0";
const B = "p1";
const score = (g, id) => M.playerById(g, id).score;

test("แจกชุดใหม่แล้วต้องมีเฉลยและนับวิธีได้", () => {
  const g = M.createGame(["เอ", "บี"]);
  M.nextRound(g);
  assert.strictEqual(g.cards.length, 4);
  assert.ok(g.solutionCount >= 1, "ชุดที่แจกต้องมีเฉลย");
  assert.strictEqual(g.phase, "showing");
});

test("ทางด่วน: กดตอบแล้วอีกฝ่ายกดว่าถูก จบตาทันที", () => {
  const g = game();
  M.claim(g, A);
  assert.strictEqual(g.phase, "claimed");

  M.judge(g, true);
  assert.strictEqual(g.phase, "roundEnd");
  assert.strictEqual(score(g, A), 1);
  assert.strictEqual(score(g, B), 0);
});

test("หมดเวลาพูด = ฟาวล์ ติดลบ", () => {
  const g = game();
  M.claim(g, A);
  M.speakTimeout(g);

  assert.strictEqual(score(g, A), -1);
  assert.strictEqual(M.playerById(g, A).fouls, 1);
  assert.strictEqual(g.lastOutcome.type, "timeout");
});

// ---------- หัวใจ: กันโกง ----------

test("กันโกง: อีกฝ่ายปัดตกทั้งที่สูตรถูก คนปัดตกโดนหักแต้ม", () => {
  const g = game();
  M.claim(g, A);
  M.judge(g, false);                       // บี แกล้งกดว่าผิด
  assert.strictEqual(g.phase, "typing", "ต้องเปิดให้พิมพ์สูตรให้ระบบตัดสิน");

  M.submitExpression(g, "4*6*1*1", true);  // เอา พิมพ์สูตรที่ถูกจริง

  assert.strictEqual(score(g, A), 1, "เอาต้องได้แต้มตามจริง");
  assert.strictEqual(score(g, B), -1, "บีต้องโดนหักฐานปัดตกของจริง");
  assert.strictEqual(g.lastOutcome.type, "verified");
  assert.deepStrictEqual(g.lastOutcome.penalised, ["บี"]);
});

test("กันโกง: อีกฝ่ายเงียบไม่กดอะไร ระบบตัดสินแทน", () => {
  const g = game();
  M.claim(g, A);
  M.judgeTimeout(g);
  assert.strictEqual(g.phase, "typing");

  // ไม่มีใคร "ปัดตก" จึงไม่หักแต้มใคร แค่ให้ระบบยืนยัน
  M.submitExpression(g, "4*6*1*1", false);

  assert.strictEqual(score(g, A), 1);
  assert.strictEqual(score(g, B), 0, "เงียบเฉยๆ ไม่ถึงกับโดนหัก");
  assert.deepStrictEqual(g.lastOutcome.penalised, []);
});

test("กันมั่ว: กดตอบแล้วพิมพ์สูตรผิด คนกดตอบโดนหักเอง", () => {
  const g = game();
  M.claim(g, A);
  M.judge(g, false);
  M.submitExpression(g, "4+6+1+1", true);   // ได้ 12 ไม่ใช่ 24

  assert.strictEqual(score(g, A), -1);
  assert.strictEqual(score(g, B), 0, "บีปัดตกถูกแล้ว ต้องไม่โดนหัก");
  assert.strictEqual(g.lastOutcome.type, "rejected");
  assert.match(g.lastOutcome.reason, /ได้ 12/);
});

test("กันมั่ว: พิมพ์สูตรที่ใช้เลขนอกชุด ก็ไม่ผ่าน", () => {
  const g = game();
  M.claim(g, A);
  M.judge(g, false);
  M.submitExpression(g, "4*6*1*2", true);

  assert.strictEqual(score(g, A), -1);
  assert.match(g.lastOutcome.reason, /ไม่ได้อยู่ในชุด/);
});

test("สรุปแรงจูงใจ: ปัดตกของจริงขาดทุน ปัดตกของมั่วได้กำไร", () => {
  // เคส 1 — บีปัดตกทั้งที่เอาถูก
  const g1 = game();
  M.claim(g1, A); M.judge(g1, false); M.submitExpression(g1, "4*6*1*1", true);
  const bีWhenWrong = score(g1, B);

  // เคส 2 — บีปัดตกและเอาผิดจริง
  const g2 = game();
  M.claim(g2, A); M.judge(g2, false); M.submitExpression(g2, "4+6+1+1", true);
  const bีWhenRight = score(g2, B);

  assert.strictEqual(bีWhenWrong, -1);
  assert.strictEqual(bีWhenRight, 0);
  assert.ok(bีWhenRight > bีWhenWrong, "ปัดตกมั่วๆ ต้องแย่กว่าปัดตกอย่างมีเหตุผล");
});

// ---------- อื่นๆ ----------

test("กดตอบซ้อนกันไม่ได้ คนแรกที่กดได้สิทธิ์", () => {
  const g = game();
  M.claim(g, A);
  assert.throws(() => M.claim(g, B), /ยังกดตอบไม่ได้/);
  assert.strictEqual(g.claimerId, A);
});

test("ข้ามชุดได้เมื่อยังไม่มีใครกดตอบ", () => {
  const g = game();
  M.skipRound(g);
  assert.strictEqual(g.lastOutcome.type, "skipped");
  assert.strictEqual(score(g, A), 0);

  const g2 = game();
  M.claim(g2, A);
  assert.throws(() => M.skipRound(g2), /ข้ามได้เฉพาะ/);
});

test("ตัดสินตอนที่ยังไม่มีใครกดตอบ ต้องไม่ผ่าน", () => {
  const g = game();
  assert.throws(() => M.judge(g, true), /ยังไม่มีใครกดตอบ/);
  assert.throws(() => M.submitExpression(g, "4*6*1*1", false), /ยังไม่ต้องพิมพ์สูตร/);
});

test("คะแนนสะสมข้ามรอบ และเรียงอันดับถูก", () => {
  const g = game();
  M.claim(g, A); M.judge(g, true);          // เอา +1
  M.nextRound(g); g.cards = [4, 6, 1, 1];
  M.claim(g, B); M.judge(g, true);          // บี +1
  M.nextRound(g); g.cards = [4, 6, 1, 1];
  M.claim(g, B); M.judge(g, true);          // บี +1 อีก

  assert.strictEqual(score(g, A), 1);
  assert.strictEqual(score(g, B), 2);
  assert.strictEqual(M.standings(g)[0].name, "บี");
  assert.strictEqual(g.round, 3);
});

test("ประวัติเก็บทุกตาไว้ดูย้อนหลังได้", () => {
  const g = game();
  M.claim(g, A); M.judge(g, true);
  M.nextRound(g); g.cards = [4, 6, 1, 1];
  M.claim(g, B); M.speakTimeout(g);

  assert.strictEqual(g.history.length, 2);
  assert.strictEqual(g.history[0].type, "accepted");
  assert.strictEqual(g.history[1].type, "timeout");
});
