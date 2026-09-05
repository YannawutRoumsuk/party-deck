// server/games/numbers/state.test.js
// เทสต์ชุดนี้คุมเรื่องเดียว: เลขลับของอีกฝ่ายต้องไม่หลุดออกจาก server
const test = require("node:test");
const assert = require("node:assert");

const R = require("./rules");
const { matchView, roomView } = require("./state");

const A = "pa";
const B = "pb";

function playing(opts) {
  const m = R.createMatch(Object.assign({ playerIds: [A, B], maxGuesses: 5 }, opts || {}));
  R.setSecret(m, A, 42);
  R.setSecret(m, B, 7);
  return m;
}

/** ไล่ดูทุก value ใน object ว่ามีเลขต้องห้ามโผล่ไหม — กันหลุดผ่านฟิลด์ที่ลืมคิดถึง */
function deepValues(obj, out) {
  out = out || [];
  if (obj === null || typeof obj !== "object") { out.push(obj); return out; }
  for (const key of Object.keys(obj)) deepValues(obj[key], out);
  return out;
}

test("ระหว่างเล่น เลขลับของอีกฝ่ายต้องเป็น null", () => {
  const m = playing();

  const viewA = matchView(m, A);
  assert.strictEqual(viewA.targets[A].secret, 42, "ตัวเองต้องเห็นเลขตัวเอง");
  assert.strictEqual(viewA.targets[B].secret, null, "ห้ามเห็นเลขอีกฝ่าย");

  const viewB = matchView(m, B);
  assert.strictEqual(viewB.targets[B].secret, 7);
  assert.strictEqual(viewB.targets[A].secret, null);
});

test("เลขอีกฝ่ายต้องไม่โผล่ที่ไหนเลยใน payload ทั้งก้อน", () => {
  const m = playing();
  R.guess(m, A, 50);   // ให้มีประวัติปนอยู่ด้วย

  const values = deepValues(matchView(m, A));
  assert.ok(values.includes(42), "ต้องมีเลขของตัวเอง");
  assert.ok(!values.includes(7), "เลข 7 ของอีกฝ่ายต้องไม่โผล่ที่ไหนเลย");
});

test("จบเกมแล้วถึงเฉลยทั้งคู่", () => {
  const m = playing();
  R.guess(m, A, 7);    // A เจอ -> สลับ
  R.guess(m, B, 42);   // B เจอ -> จบ

  assert.strictEqual(m.phase, "finished");

  const viewA = matchView(m, A);
  assert.strictEqual(viewA.targets[A].secret, 42);
  assert.strictEqual(viewA.targets[B].secret, 7, "จบเกมแล้วต้องเห็นของอีกฝ่าย");
});

test("A ตั้งเลขแล้วแต่ B ยังไม่ตั้ง เลขของ A ก็ยังไม่หลุดไปหา B", () => {
  const m = R.createMatch({ playerIds: [A, B] });
  R.setSecret(m, A, 42);

  const viewB = matchView(m, B);
  // B เห็นได้ว่า A ตั้งเลขแล้วและช่วงยังเต็ม แต่ต้องไม่เห็นตัวเลข
  assert.strictEqual(viewB.targets[A].secret, null, "B ต้องไม่เห็นเลขของ A");
  assert.deepStrictEqual([viewB.targets[A].low, viewB.targets[A].high], [1, 99]);
  assert.strictEqual(viewB.targets[B], null, "B ยังไม่ได้ตั้งเลข จึงยังไม่มี target");
  assert.ok(!deepValues(viewB).includes(42), "เลข 42 ต้องไม่โผล่ที่ไหนเลย");
});

test("view บอกชัดว่าตาใคร และเหลือกี่ครั้ง", () => {
  const m = playing({ maxGuesses: 5 });

  const viewA = matchView(m, A);
  assert.strictEqual(viewA.yourTurn, true);
  assert.strictEqual(viewA.opponentId, B);
  assert.strictEqual(viewA.guessesLeft, 5);

  R.guess(m, A, 50);
  assert.strictEqual(matchView(m, A).guessesLeft, 4);
});

test("ประวัติการทายเห็นได้ทั้งคู่ ทั้งคนทายและเจ้าของเลข", () => {
  const m = playing();
  R.guess(m, A, 50);

  for (const viewer of [A, B]) {
    const v = matchView(m, viewer);
    assert.strictEqual(v.targets[B].guesses.length, 1, "ผู้ชม " + viewer);
    assert.strictEqual(v.targets[B].guesses[0].value, 50);
    assert.strictEqual(v.targets[B].guesses[0].verdict, "high");
  }
});

test("ช่วงที่เหลือส่งไปให้ทั้งคู่เห็นตรงกัน", () => {
  const m = playing();
  R.guess(m, A, 50);   // 50 > 7 -> เหลือ 1-49

  const fromA = matchView(m, A).targets[B];
  const fromB = matchView(m, B).targets[B];
  assert.deepStrictEqual([fromA.low, fromA.high], [1, 49]);
  assert.deepStrictEqual([fromB.low, fromB.high], [1, 49]);
});

test("roomView ห่อ match พร้อมคะแนนสะสมของห้อง", () => {
  const room = {
    code: "ABC12",
    gameType: "numbers",
    hostId: A,
    players: new Map([
      [A, { id: A, name: "ต้น", connected: true, score: 5 }],
      [B, { id: B, name: "เจได", connected: true, score: 4 }]
    ]),
    numbersSettings: { format: "single", maxGuesses: 5 },
    numbersMatch: playing()
  };

  const v = roomView(room, A);
  assert.strictEqual(v.gameType, "numbers");
  assert.strictEqual(v.isHost, true);
  assert.strictEqual(v.playerCount, 2);
  assert.strictEqual(v.players[0].score, 5);
  assert.strictEqual(v.match.targets[B].secret, null, "roomView ก็ต้องไม่ปล่อยเลขหลุด");
});

test("ยังไม่เริ่มเกม match เป็น null ไม่ใช่พัง", () => {
  const room = {
    code: "ABC12",
    gameType: "numbers",
    hostId: A,
    players: new Map([[A, { id: A, name: "ต้น", connected: true, score: 0 }]]),
    numbersSettings: { format: "single", maxGuesses: 5 },
    numbersMatch: null
  };
  assert.strictEqual(roomView(room, A).match, null);
});
