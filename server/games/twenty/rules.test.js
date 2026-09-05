// server/games/twenty/rules.test.js
const test = require("node:test");
const assert = require("node:assert");
const T = require("./rules");

// ---------- ตัวคำนวณเฉลย ----------

test("ชุดง่ายๆ ต้องหาเฉลยเจอ", () => {
  assert.strictEqual(T.hasSolution([4, 6, 1, 1]), true);   // 4*6*1*1
  assert.strictEqual(T.hasSolution([8, 3, 3, 1]), true);
  assert.strictEqual(T.hasSolution([6, 6, 6, 6]), true);   // 6+6+6+6
});

test("ชุดที่ทำไม่ได้จริง ต้องตอบว่าไม่มีเฉลย", () => {
  // 1 1 1 1 มากสุดได้แค่ 4 ทำ 24 ไม่ได้แน่นอน
  assert.strictEqual(T.hasSolution([1, 1, 1, 1]), false);
  assert.strictEqual(T.solve([1, 1, 1, 1]).count, 0);
});

test("เคสคลาสสิก 3 3 8 8 ต้องเจอ — ข้อพิสูจน์ว่าใช้เศษส่วนแท้จริง", () => {
  // เฉลยเดียวคือ 8/(3-8/3) ซึ่งถ้าใช้ทศนิยมจะเพี้ยนจนหาไม่เจอ
  const r = T.solve([3, 3, 8, 8]);
  assert.ok(r.count >= 1, "ต้องเจออย่างน้อย 1 วิธี");
  assert.ok(
    r.solutions.some((s) => s.includes("/")),
    "เฉลยต้องมีการหารที่ให้ผลเป็นเศษส่วน"
  );
});

test("เคส 1 3 4 6 ต้องเจอ (6/(1-3/4))", () => {
  assert.strictEqual(T.hasSolution([1, 3, 4, 6]), true);
});

test("นับจำนวนวิธีได้ และทุกวิธีที่นับต้องคำนวณได้ 24 จริง", () => {
  const cards = [4, 6, 2, 3];
  const r = T.solve(cards);

  assert.ok(r.count > 1, "ชุดนี้ควรมีหลายวิธี");
  for (const expr of r.solutions) {
    const check = T.checkExpression(expr, cards);
    assert.strictEqual(check.ok, true, "เฉลยที่ระบบให้มาต้องถูกจริง: " + expr + " -> " + check.reason);
  }
});

test("ไม่นับวิธีซ้ำจากการสลับที่ของ + และ *", () => {
  const r = T.solve([6, 6, 6, 6]);
  const unique = new Set(r.solutions);
  assert.strictEqual(unique.size, r.solutions.length, "ต้องไม่มีสตริงซ้ำ");
});

// ---------- ตรวจสูตรที่ผู้เล่นพิมพ์ ----------

test("สูตรถูกต้องผ่าน", () => {
  assert.strictEqual(T.checkExpression("4*6*1*1", [4, 6, 1, 1]).ok, true);
  assert.strictEqual(T.checkExpression("(4+2)*(6-2)", [4, 2, 6, 2]).ok, true);
  assert.strictEqual(T.checkExpression("8/(3-8/3)", [8, 3, 8, 3]).ok, true);
});

test("รับเครื่องหมาย × ÷ ที่คนไทยพิมพ์กันด้วย", () => {
  assert.strictEqual(T.checkExpression("4×6×1×1", [4, 6, 1, 1]).ok, true);
  assert.strictEqual(T.checkExpression("(12÷2)×(2+2)", [12, 2, 2, 2]).ok, true);
});

test("ผลลัพธ์ไม่ใช่ 24 ต้องบอกว่าได้เท่าไหร่", () => {
  const r = T.checkExpression("4+6+1+1", [4, 6, 1, 1]);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /ได้ 12/);
});

test("ใช้เลขไม่ครบ หรือใช้เลขนอกชุด ต้องไม่ผ่าน", () => {
  assert.match(T.checkExpression("4*6", [4, 6, 1, 1]).reason, /ต้องใช้เลขทั้ง 4 ตัว/);
  assert.match(T.checkExpression("4*6*1*9", [4, 6, 1, 1]).reason, /ไม่ได้อยู่ในชุด/);
});

test("ใช้เลขซ้ำเกินจำนวนที่มี ต้องไม่ผ่าน", () => {
  // มี 4 ตัวเดียว แต่สูตรใช้ 4 สองครั้ง
  assert.strictEqual(T.checkExpression("4*4+6+2", [4, 6, 2, 1]).ok, false);
});

test("เลขซ้ำในชุด ใช้ได้ตามจำนวนที่มีจริง", () => {
  assert.strictEqual(T.checkExpression("8*3*(8-3)/5", [8, 3, 8, 3]).ok, false, "5 ไม่ได้อยู่ในชุด");
  assert.strictEqual(T.checkExpression("8/(3-8/3)", [8, 3, 8, 3]).ok, true);
});

test("สูตรเขียนผิดรูป ต้องบอกสาเหตุ ไม่ใช่พัง", () => {
  const cases = ["4*6*1*", "((4+6)*1*1", "4**6*1*1", "4*6*1*1)", "abc"];
  for (const bad of cases) {
    const r = T.checkExpression(bad, [4, 6, 1, 1]);
    assert.strictEqual(r.ok, false, bad);
    assert.ok(typeof r.reason === "string" && r.reason.length > 0, "ต้องมีเหตุผล: " + bad);
  }
});

test("หารด้วยศูนย์ต้องไม่พัง", () => {
  const r = T.checkExpression("4/(6-6)*1", [4, 6, 6, 1]);
  assert.strictEqual(r.ok, false);
});

test("ลำดับการคำนวณถูกต้อง คูณหารก่อนบวกลบ", () => {
  // 2+2*11 = 24 ไม่ใช่ (2+2)*11 = 44
  assert.strictEqual(T.checkExpression("2+2*11*1", [2, 2, 11, 1]).ok, true);
});

// ---------- สุ่มชุด ----------

test("ชุดที่สุ่มมาต้องมีเฉลยเสมอ", () => {
  for (let i = 0; i < 60; i++) {
    const cards = T.dealCards();
    assert.strictEqual(cards.length, 4);
    for (const c of cards) {
      assert.ok(Number.isInteger(c) && c >= T.CARD_MIN && c <= T.CARD_MAX, "เลข " + c + " นอกช่วง");
    }
    assert.strictEqual(T.hasSolution(cards), true, "ชุด " + cards.join(",") + " ต้องมีเฉลย");
  }
});

test("สั่งให้สุ่มชุดที่มีหลายวิธีได้", () => {
  for (let i = 0; i < 15; i++) {
    const cards = T.dealCards({ minSolutions: 5 });
    assert.ok(T.solve(cards).count >= 5, "ชุด " + cards.join(",") + " ควรมีอย่างน้อย 5 วิธี");
  }
});

test("solve กับ hasSolution ต้องเห็นตรงกันเสมอ", () => {
  for (let i = 0; i < 40; i++) {
    const cards = [1, 2, 3, 4].map(() => 1 + Math.floor(Math.random() * 13));
    assert.strictEqual(
      T.hasSolution(cards),
      T.solve(cards).count > 0,
      "ชุด " + cards.join(",") + " ตอบไม่ตรงกัน"
    );
  }
});
