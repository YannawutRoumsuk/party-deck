// server/assign.test.js — ทดสอบอัลกอริทึมแจกคำแบบยิงสุ่มหนักๆ
const test = require("node:test");
const assert = require("node:assert");
const { derange, checkFeasible } = require("./assign");

// สร้างชุดคำสุ่ม โดยคุมไม่ให้คำไหนซ้ำเกินครึ่งวง (คือเคสที่ต้องแจกได้เสมอ)
function randomFeasibleWords(n) {
  const pool = ["กิน", "รถ", "ไก่", "น้ำ", "บ้าน", "หมา", "เงิน", "นอน"];
  const half = Math.floor(n / 2);

  for (let attempt = 0; attempt < 200; attempt++) {
    const words = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]);
    const counts = new Map();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);

    const maxCount = Math.max(...counts.values());
    if (counts.size >= 2 && maxCount <= half) return words;
  }
  return null;
}

test("property: ทุกชุดคำที่แจกได้ ต้องแจกสำเร็จและไม่มีใครได้คำตัวเอง", () => {
  let checked = 0;

  for (let n = 2; n <= 12; n++) {
    for (let trial = 0; trial < 400; trial++) {
      const words = randomFeasibleWords(n);
      if (!words) continue;

      const assigned = derange(words);

      assert.strictEqual(assigned.length, n);
      for (let i = 0; i < n; i++) {
        assert.notStrictEqual(assigned[i], words[i], `n=${n} ${JSON.stringify(words)}`);
      }

      // ต้องเป็นการสลับคำชุดเดิม ไม่ใช่เสกคำใหม่หรือทำคำหาย
      assert.deepStrictEqual([...assigned].sort(), [...words].sort());
      checked++;
    }
  }

  assert.ok(checked > 3000, `ทดสอบไปแค่ ${checked} เคส น้อยเกินไป`);
});

test("property: เคสที่แจกไม่ได้ ต้อง throw ไม่ใช่คืนคำตัวเองเงียบๆ", () => {
  const impossible = [
    ["ก", "ก"],
    ["ก", "ก", "ข"],
    ["ก", "ก", "ก", "ข"],
    ["ก", "ก", "ก", "ข", "ค"]
  ];

  for (const words of impossible) {
    assert.strictEqual(checkFeasible(words).ok, false, JSON.stringify(words));
    assert.throws(() => derange(words), /Error/, JSON.stringify(words));
  }
});

test("ขอบเขต: 2 คนคำต่างกัน ต้องสลับกันพอดี", () => {
  for (let i = 0; i < 100; i++) {
    const assigned = derange(["กิน", "รถ"]);
    assert.deepStrictEqual(assigned, ["รถ", "กิน"]);
  }
});

test("ซ้ำได้พอดีครึ่งวง ต้องยังแจกได้", () => {
  for (let i = 0; i < 300; i++) {
    const words = ["ก", "ก", "ข", "ค"]; // ก 2 จาก 4 = พอดีครึ่ง
    const assigned = derange(words);
    words.forEach((w, idx) => assert.notStrictEqual(assigned[idx], w));
  }
});

test("ผลลัพธ์ต้องไม่ซ้ำเดิมทุกครั้ง (มีความสุ่มจริง)", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    seen.add(derange(["ก", "ข", "ค", "ง", "จ"]).join("|"));
  }
  assert.ok(seen.size > 5, `ได้ผลต่างกันแค่ ${seen.size} แบบ ดูเหมือนไม่สุ่มจริง`);
});

test("ข้อความ error ต้องบอกจำนวนคนที่ต้องเปลี่ยนคำ", () => {
  const res = checkFeasible(["ก", "ก", "ก", "ข", "ค"]); // ก 3 จาก 5
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /"ก"/);
  assert.match(res.reason, /เปลี่ยนคำอย่างน้อย 1 คน/);
});
