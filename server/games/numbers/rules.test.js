// server/games/numbers/rules.test.js
const test = require("node:test");
const assert = require("node:assert");
const R = require("./rules");

const A = "player-a";
const B = "player-b";

function startMatch(opts) {
  const m = R.createMatch(Object.assign({ playerIds: [A, B] }, opts || {}));
  R.setSecret(m, A, (opts && opts.secretA) || 42);
  R.setSecret(m, B, (opts && opts.secretB) || 7);
  return m;
}

// ---------- ช่วงที่เหลือ ----------

test("ตัวอย่างจากโจทย์: เลขลับ 5 ทาย 6 ต้องเหลือ 1-5", () => {
  const t = R.createTarget(5);
  const out = R.applyGuess(t, 6);

  assert.strictEqual(out.verdict, "high");
  assert.strictEqual(t.low, 1);
  assert.strictEqual(t.high, 5);
});

test("ทายต่ำไป พื้นต้องขยับเหนือเลขที่ทาย", () => {
  const t = R.createTarget(50);
  R.applyGuess(t, 20);
  assert.deepStrictEqual([t.low, t.high], [21, 99]);
});

test("ช่วงบีบเข้าหากันจากทั้งสองด้าน", () => {
  const t = R.createTarget(50);
  R.applyGuess(t, 20);   // 21-99
  R.applyGuess(t, 80);   // 21-79
  R.applyGuess(t, 45);   // 46-79
  assert.deepStrictEqual([t.low, t.high], [46, 79]);
  assert.strictEqual(R.remaining(t), 34);
});

test("ทายถูกต้องปิดเกมของเลขนั้น", () => {
  const t = R.createTarget(33);
  const out = R.applyGuess(t, 33);
  assert.strictEqual(out.verdict, "hit");
  assert.strictEqual(t.found, true);
  assert.strictEqual(R.remaining(t), 0);
});

// ---------- การกันทายมั่ว ----------

test("ทายนอกช่วงที่เหลือ ต้องถูกปฏิเสธ ไม่กินตา", () => {
  const t = R.createTarget(5);
  R.applyGuess(t, 6);                     // เหลือ 1-5

  const check = R.checkGuess(t, 40);
  assert.strictEqual(check.ok, false);
  assert.match(check.reason, /เหลือแค่ 1-5/);
  assert.strictEqual(t.guesses.length, 1, "ต้องไม่ถูกนับเป็นการทาย");
});

test("ทายเลขซ้ำ ต้องถูกปฏิเสธ", () => {
  const t = R.createTarget(50);
  R.applyGuess(t, 20);
  assert.strictEqual(R.checkGuess(t, 20).ok, false);
});

test("ทายนอก 1-99 หรือไม่ใช่จำนวนเต็ม ต้องถูกปฏิเสธ", () => {
  const t = R.createTarget(50);
  for (const bad of [0, 100, -5, 1.5, NaN]) {
    assert.strictEqual(R.checkGuess(t, bad).ok, false, String(bad));
  }
});

// ---------- คะแนน ----------

test("เจอเร็วได้แต้มเยอะ เจอช้าได้น้อย ไม่เจอได้ศูนย์", () => {
  assert.strictEqual(R.scoreForSingle(true, 1, 5), 5);
  assert.strictEqual(R.scoreForSingle(true, 3, 5), 3);
  assert.strictEqual(R.scoreForSingle(true, 5, 5), 1);
  assert.strictEqual(R.scoreForSingle(false, 5, 5), 0);
});

// ---------- โหมดทายฝ่ายเดียว ----------

test("single: ทายครบเพดานแล้วต้องสลับให้อีกฝ่ายทายบ้าง", () => {
  const m = startMatch({ format: "single", maxGuesses: 3, secretB: 7 });
  assert.strictEqual(m.turn, A);

  R.guess(m, A, 50);
  R.guess(m, A, 20);
  assert.strictEqual(m.turn, A, "ยังไม่ครบเพดาน ต้องยังเป็นตา A");

  R.guess(m, A, 10);
  assert.strictEqual(m.turn, B, "ครบ 3 ครั้งแล้วต้องสลับ");
  assert.strictEqual(m.phase, "playing");
});

test("single: เจอก่อนครบเพดาน ก็สลับทันที", () => {
  const m = startMatch({ format: "single", maxGuesses: 5, secretB: 7 });
  R.guess(m, A, 7);
  assert.strictEqual(m.turn, B);
});

test("single: ทั้งคู่ทายครบแล้วจบเกม ใครใช้ครั้งน้อยกว่าชนะ", () => {
  const m = startMatch({ format: "single", maxGuesses: 5, secretA: 42, secretB: 7 });

  R.guess(m, A, 7);              // A เจอในครั้งเดียว -> 5 แต้ม
  R.guess(m, B, 50);
  R.guess(m, B, 42);             // B เจอในครั้งที่ 2 -> 4 แต้ม

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.winner, A);
  assert.strictEqual(m.result.scores[A], 5);
  assert.strictEqual(m.result.scores[B], 4);
});

test("single: ไม่เจอทั้งคู่ = เสมอ ได้ 0 ทั้งคู่", () => {
  const m = startMatch({ format: "single", maxGuesses: 3, secretA: 42, secretB: 7 });

  // จงใจทายพลาดโดยไม่ให้ช่วงบีบจนเจอ
  R.guess(m, A, 1); R.guess(m, A, 2); R.guess(m, A, 3);
  R.guess(m, B, 99); R.guess(m, B, 98); R.guess(m, B, 97);

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.draw, true);
  assert.strictEqual(m.result.scores[A], 0);
  assert.strictEqual(m.result.scores[B], 0);
});

// ---------- โหมดผลัดกันทาย ----------

test("alternate: สลับตาทุกครั้งที่ทาย", () => {
  const m = startMatch({ format: "alternate", maxGuesses: 5 });
  assert.strictEqual(m.turn, A);
  R.guess(m, A, 50);
  assert.strictEqual(m.turn, B);
  R.guess(m, B, 50);
  assert.strictEqual(m.turn, A);
});

test("alternate: คนทายก่อนเจอ อีกฝ่ายต้องได้ตาแก้ตัว", () => {
  const m = startMatch({ format: "alternate", maxGuesses: 5, secretA: 42, secretB: 7 });

  R.guess(m, A, 7);   // A เจอตั้งแต่ตาแรก แต่ B ยังไม่ได้ทายเลย

  assert.strictEqual(m.phase, "playing", "ยังไม่ควรจบ B ต้องได้แก้ตัว");
  assert.strictEqual(m.equalizerFor, B);
  assert.strictEqual(m.turn, B);
});

test("alternate: ตาแก้ตัวเจอด้วย = เสมอ", () => {
  const m = startMatch({ format: "alternate", maxGuesses: 5, secretA: 42, secretB: 7 });

  R.guess(m, A, 7);    // A เจอ
  R.guess(m, B, 42);   // B แก้ตัวเจอด้วย

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.draw, true);
  assert.strictEqual(m.result.scores[A], R.ALTERNATE_DRAW);
  assert.strictEqual(m.result.scores[B], R.ALTERNATE_DRAW);
});

test("alternate: ตาแก้ตัวพลาด คนเจอก่อนชนะ", () => {
  const m = startMatch({ format: "alternate", maxGuesses: 5, secretA: 42, secretB: 7 });

  R.guess(m, A, 7);    // A เจอ
  R.guess(m, B, 99);   // B แก้ตัวไม่สำเร็จ

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.winner, A);
  assert.strictEqual(m.result.scores[A], R.ALTERNATE_WIN);
  assert.strictEqual(m.result.scores[B], 0);
});

test("alternate: คนทายทีหลังเจอ จบทันทีเพราะทายเท่ากันแล้ว", () => {
  const m = startMatch({ format: "alternate", maxGuesses: 5, secretA: 42, secretB: 7 });

  R.guess(m, A, 50);   // A พลาด
  R.guess(m, B, 42);   // B เจอ ตอนนี้ทายคนละ 1 ครั้งเท่ากัน

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.winner, B);
  assert.strictEqual(m.equalizerFor, null);
});

test("alternate: ครบเพดานทั้งคู่โดยไม่มีใครเจอ = เสมอ", () => {
  const m = startMatch({ format: "alternate", maxGuesses: 3, secretA: 42, secretB: 7 });

  R.guess(m, A, 1); R.guess(m, B, 99);
  R.guess(m, A, 2); R.guess(m, B, 98);
  R.guess(m, A, 3); R.guess(m, B, 97);

  assert.strictEqual(m.phase, "finished");
  assert.strictEqual(m.result.draw, true);
  assert.strictEqual(m.result.scores[A], R.ALTERNATE_DRAW);
});

// ---------- กันเล่นผิดตา ----------

test("ทายผิดตาต้องไม่ผ่าน", () => {
  const m = startMatch({ format: "alternate" });
  assert.throws(() => R.guess(m, B, 50), /ยังไม่ถึงตาของคุณ/);
});

test("ยังไม่ครบสองคน ยังเล่นไม่ได้", () => {
  const m = R.createMatch({ playerIds: [A, B] });
  R.setSecret(m, A, 10);
  assert.strictEqual(m.phase, "picking");
  assert.throws(() => R.guess(m, A, 50), /ยังไม่ถึงตาเล่น/);
});

test("เลขลับต้องอยู่ใน 1-99 เท่านั้น", () => {
  const m = R.createMatch({ playerIds: [A, B] });
  for (const bad of [0, 100, -1, 5.5]) {
    assert.throws(() => R.setSecret(m, A, bad), /1-99/, String(bad));
  }
});

test("เพดานครั้งทายถูกบีบให้อยู่ในช่วงที่ยอมรับได้", () => {
  assert.strictEqual(R.createMatch({ playerIds: [A, B], maxGuesses: 1 }).maxGuesses, R.MIN_GUESSES);
  assert.strictEqual(R.createMatch({ playerIds: [A, B], maxGuesses: 99 }).maxGuesses, R.MAX_GUESSES);
  assert.strictEqual(R.createMatch({ playerIds: [A, B] }).maxGuesses, R.DEFAULT_GUESSES);
});

// ---------- property: binary search ต้องหาเจอเสมอใน 7 ครั้ง ----------

test("property: ทายแบบแบ่งครึ่ง ต้องเจอทุกเลขภายใน 7 ครั้ง", () => {
  for (let secret = R.MIN; secret <= R.MAX; secret++) {
    const t = R.createTarget(secret);
    let used = 0;

    while (!t.found && used < 20) {
      const mid = Math.floor((t.low + t.high) / 2);
      assert.strictEqual(R.checkGuess(t, mid).ok, true, "แบ่งครึ่งต้องอยู่ในช่วงเสมอ");
      R.applyGuess(t, mid);
      used++;
    }

    assert.strictEqual(t.found, true, "ต้องเจอเลข " + secret);
    assert.ok(used <= 7, "เลข " + secret + " ใช้ไป " + used + " ครั้ง");
  }
});
