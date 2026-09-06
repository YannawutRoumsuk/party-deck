// server/games/packs-extra.test.js — เนื้อหาที่ generate มาต้องถูกผสมเข้าเกมอย่างถูกต้อง
//
// ไฟล์ *-extra.js สร้างด้วย scripts/gen-packs.js
// เทสชุดนี้ยัดข้อมูลปลอมเข้า require cache ก่อนโหลดโมดูลจริง
// เพื่อพิสูจน์ว่าตอนสคริปต์เติมของเข้ามาจริง เกมจะรับไปใช้ถูกต้อง
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

/** โหลดโมดูลใหม่โดยแทนที่ dependency ตัวหนึ่งด้วยของปลอม */
function loadWithStub(targetRel, stubRel, stubValue) {
  const target = require.resolve(targetRel);
  const stub = require.resolve(stubRel);

  const savedTarget = require.cache[target];
  const savedStub = require.cache[stub];

  require.cache[stub] = { id: stub, filename: stub, loaded: true, exports: stubValue };
  delete require.cache[target];

  try {
    return require(targetRel);
  } finally {
    delete require.cache[target];
    if (savedStub) require.cache[stub] = savedStub; else delete require.cache[stub];
    if (savedTarget) require.cache[target] = savedTarget;
  }
}

// ── Spyfall ──────────────────────────────────────────────────────────

test("สถานที่ที่ generate มาถูกเติมเข้าเกม", () => {
  const before = require("./spyfall/locations").totalLocations();
  const S = loadWithStub("./spyfall/locations", "./spyfall/locations-extra", {
    LOCATIONS: [
      { name: "ร้านซักผ้าหยอดเหรียญ", roles: ["a", "b", "c", "d", "e", "f", "g"] },
      { name: "โรงรับจำนำ", roles: ["a", "b", "c", "d", "e", "f", "g"] }
    ]
  });

  assert.strictEqual(S.totalLocations(), before + 2);
  assert.ok(S.locationNames().includes("ร้านซักผ้าหยอดเหรียญ"));
});

test("สถานที่ชื่อซ้ำกับของเดิม ไม่ถูกเติมซ้ำ", () => {
  const original = require("./spyfall/locations");
  const dup = original.allLocations()[0].name;
  const before = original.totalLocations();

  const S = loadWithStub("./spyfall/locations", "./spyfall/locations-extra", {
    LOCATIONS: [{ name: dup, roles: ["a", "b", "c", "d", "e", "f", "g"] }]
  });

  assert.strictEqual(S.totalLocations(), before, "ชื่อซ้ำต้องไม่เพิ่มจำนวน");
});

test("ไม่มีไฟล์ที่ generate มา เกมต้องยังเล่นได้ด้วยชุดที่คัดเอง", () => {
  const S = loadWithStub("./spyfall/locations", "./spyfall/locations-extra", {});
  assert.ok(S.totalLocations() >= 30, "ชุดคัดเองต้องยังอยู่ครบ");
  assert.ok(S.pickLocation(), "ยังสุ่มสถานที่ได้");
});

test("ทุกสถานที่ในไฟล์ที่ generate มาต้องมีบทบาทครบ 7", () => {
  const extra = require("./spyfall/locations-extra");
  const bad = extra.LOCATIONS.filter((l) => !l.roles || l.roles.length !== 7);
  assert.deepStrictEqual(bad, [], "Spyfall ต้องมี 7 บทบาทต่อสถานที่พอดี");
});

// ── เกมทายของ ────────────────────────────────────────────────────────

test("คำที่ generate มาถูกเติมเข้าแพ็กตาม id", () => {
  const original = require("./guess/words");
  const packId = original.PACKS[0].id;
  const before = original.totalWords();

  const W = loadWithStub("./guess/words", "./guess/words-extra", {
    BY_PACK: { [packId]: { common: ["คำใหม่หนึ่ง", "คำใหม่สอง"], rare: ["คำหายากใหม่"] } }
  });

  assert.strictEqual(W.totalWords(), before + 3);
  const pack = W.packById(packId);
  assert.ok(pack.common.includes("คำใหม่หนึ่ง"));
  assert.ok(pack.rare.includes("คำหายากใหม่"));
});

test("คำซ้ำกับที่มีอยู่แล้วในแพ็ก ไม่ถูกเติมซ้ำ", () => {
  const original = require("./guess/words");
  const pack = original.PACKS[0];
  const before = original.totalWords();

  const W = loadWithStub("./guess/words", "./guess/words-extra", {
    BY_PACK: { [pack.id]: { common: [pack.common[0]], rare: [pack.rare[0]] } }
  });

  assert.strictEqual(W.totalWords(), before, "คำซ้ำต้องไม่เพิ่มจำนวน");
});

test("packId ที่ไม่มีอยู่จริง ถูกข้ามไปเฉยๆ ไม่พัง", () => {
  const before = require("./guess/words").totalWords();
  const W = loadWithStub("./guess/words", "./guess/words-extra", {
    BY_PACK: { "แพ็กที่ไม่มีจริง": { common: ["x"], rare: [] } }
  });
  assert.strictEqual(W.totalWords(), before);
});

test("ไฟล์ที่ generate มาต้องอ้าง packId ที่มีอยู่จริงเท่านั้น", () => {
  const extra = require("./guess/words-extra");
  const valid = new Set(require("./guess/words").PACKS.map((p) => p.id));
  const unknown = Object.keys(extra.BY_PACK).filter((id) => !valid.has(id));
  assert.deepStrictEqual(unknown, [], "เจอ packId ที่ไม่มีในเกม");
});
