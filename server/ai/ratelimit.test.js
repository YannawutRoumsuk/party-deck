const test = require("node:test");
const assert = require("node:assert");
const { createLimiter } = require("./ratelimit");

test("ยิงเกินเพดานต่อคนถูกกั้น", () => {
  const l = createLimiter({ max: 2, windowMs: 60000, dailyMax: 100 });
  assert.strictEqual(l.take("a").ok, true);
  assert.strictEqual(l.take("a").ok, true);
  const third = l.take("a");
  assert.strictEqual(third.ok, false);
  assert.strictEqual(third.reason, "burst");
});

test("คนละคนมีโควตาของตัวเอง", () => {
  const l = createLimiter({ max: 1, windowMs: 60000, dailyMax: 100 });
  assert.strictEqual(l.take("a").ok, true);
  assert.strictEqual(l.take("b").ok, true, "คนอื่นต้องไม่โดนหางเลข");
});

test("เพดานรวมทั้งระบบต่อวันกันโควตาหมดข้ามคืน", () => {
  const l = createLimiter({ max: 99, windowMs: 60000, dailyMax: 2 });
  l.take("a"); l.take("b");
  const blocked = l.take("c");
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.reason, "daily");
});

test("บอกเวลารอกลับไปด้วย", () => {
  const l = createLimiter({ max: 1, windowMs: 60000, dailyMax: 100 });
  l.take("a");
  const r = l.take("a");
  assert.ok(r.retryAfterMs > 0 && r.retryAfterMs <= 60000);
});
