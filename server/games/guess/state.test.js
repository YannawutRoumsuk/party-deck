// server/games/guess/state.test.js
//
// ข้อสำคัญที่สุดของเกมนี้: ของที่เราต้องทาย ต้องไม่หลุดมาถึงเบราว์เซอร์เรา
// ถ้าหลุดคือเปิด devtools แล้วชนะได้เลย เกมจบ
const test = require("node:test");
const assert = require("node:assert");
const G = require("./rules");
const S = require("./state");

const A = "player-a";
const B = "player-b";

function ready() {
  const m = G.createMatch([A, B], { packId: "mammal", level: "common" });
  G.setSecret(m, A, "ช้าง");    // ของที่ A ตั้ง -> B ต้องทาย
  G.setSecret(m, B, "แมว");     // ของที่ B ตั้ง -> A ต้องทาย
  return m;
}

test("ของที่เราต้องทาย ต้องไม่อยู่ใน state ของเราเลย", () => {
  const m = ready();
  const viewA = S.matchView(m, A);
  assert.ok(!JSON.stringify(viewA).includes("แมว"), "A ต้องไม่เห็นของที่ B ตั้ง");

  const viewB = S.matchView(m, B);
  assert.ok(!JSON.stringify(viewB).includes("ช้าง"), "B ต้องไม่เห็นของที่ A ตั้ง");
});

test("ของที่เราตั้งเอง เราเห็นได้ เพราะเราเป็นคนพิมพ์มาเอง", () => {
  const m = ready();
  assert.strictEqual(S.matchView(m, A).mySeat.secret, "ช้าง");
  assert.strictEqual(S.matchView(m, B).mySeat.secret, "แมว");
});

test("ที่นั่งของอีกฝ่ายบอกได้แค่ว่าตั้งของแล้วหรือยัง", () => {
  const m = ready();
  const v = S.matchView(m, A);
  assert.strictEqual(v.theirSeat.secret, null);
  assert.strictEqual(v.theirSeat.hasSecret, true);
});

test("ยังไม่ตั้งของ ก็ต้องไม่หลุดว่าตั้งแล้ว", () => {
  const m = G.createMatch([A, B], {});
  G.setSecret(m, A, "ช้าง");
  const v = S.matchView(m, B);
  assert.strictEqual(v.theirSeat.hasSecret, true, "B รู้ได้ว่า A ตั้งแล้ว");
  assert.strictEqual(v.theirSeat.secret, null, "แต่ห้ามรู้ว่าคืออะไร");
});

test("จบเกมแล้วเปิดเฉลยทั้งคู่", () => {
  const m = ready();
  const guesser = m.turn;                     // ใครได้เล่นก่อนขึ้นกับกติกา
  const target = G.opponentOf(m, guesser);
  const answer = m.seats[target].secret;      // ของที่ฝั่งตรงข้ามตั้งไว้

  G.guess(m, guesser, answer);
  G.respond(m, target, true);
  assert.strictEqual(m.phase, "finished");

  const v = S.matchView(m, guesser);
  assert.strictEqual(v.theirSeat.secret, answer, "จบแล้วต้องเห็นเฉลย");
});

test("บอกได้ว่าถึงตาใคร และใครมีสิทธิ์ตอบ", () => {
  const m = ready();
  G.ask(m, m.turn, "เป็นสัตว์ไหม");

  const asker = m.pending.byId;
  const other = G.opponentOf(m, asker);

  assert.strictEqual(S.matchView(m, other).canRespond, true, "คนที่ถูกถามต้องตอบได้");
  assert.strictEqual(S.matchView(m, asker).canRespond, false, "คนถามตอบเองไม่ได้");
});

test("คนนอกเกมไม่ได้ที่นั่งและไม่เห็นอะไรเลย", () => {
  const m = ready();
  const v = S.matchView(m, "someone-else");
  assert.strictEqual(v.mySeat, null);
  assert.strictEqual(v.theirSeat, null);
  assert.ok(!JSON.stringify(v).includes("ช้าง"));
  assert.ok(!JSON.stringify(v).includes("แมว"));
});

test("roomView ห่อ matchView ไว้ และไม่ทำคำลับหลุด", () => {
  const room = {
    code: "ABCD2",
    gameType: "guess",
    hostId: A,
    players: new Map([
      [A, { id: A, name: "เอ", connected: true, score: 0 }],
      [B, { id: B, name: "บี", connected: true, score: 0 }]
    ]),
    guessSettings: { packId: "mammal", level: "common" },
    guessMatch: ready()
  };

  const v = S.roomView(room, A);
  assert.strictEqual(v.isHost, true);
  assert.strictEqual(v.playerCount, 2);
  assert.ok(!JSON.stringify(v).includes("แมว"), "คำลับของอีกฝ่ายต้องไม่ติดมาใน roomView");
});
