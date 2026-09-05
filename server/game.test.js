// server/game.test.js — รันด้วย: npm test
const test = require("node:test");
const assert = require("node:assert");

const G = require("./game");
const R = require("./rooms");
const { stateFor } = require("./state");

function makeRoom(names, words) {
  const rooms = new Map();
  const room = R.createRoom(rooms);
  names.forEach((name, i) => {
    const p = R.createPlayer(name);
    p.connected = true;
    p.socketId = `sock-${i}`;
    p.word = words[i];
    room.players.set(p.id, p);
  });
  room.hostId = [...room.players.keys()][0];
  return room;
}

const ids = (room) => [...room.players.keys()];
const P = (room, i) => room.players.get(ids(room)[i]);

test("แจกคำแล้วต้องไม่มีใครได้คำที่ตัวเองส่ง", () => {
  for (let trial = 0; trial < 200; trial++) {
    const room = makeRoom(["a", "b", "c", "d"], ["กิน", "รถ", "ไก่", "น้ำ"]);
    G.startRound(room, 60000);
    for (const p of room.players.values()) {
      assert.ok(p.assigned, "ต้องได้รับคำ");
      assert.notStrictEqual(p.assigned, p.word, "ห้ามได้คำตัวเอง");
    }
  }
});

test("คำซ้ำกันบางส่วน (ไม่เกินครึ่งวง) ต้องแจกได้ทุกครั้ง", () => {
  for (let trial = 0; trial < 300; trial++) {
    const room = makeRoom(["a", "b", "c", "d"], ["กิน", "กิน", "รถ", "ไก่"]);
    G.startRound(room, 60000);
    for (const p of room.players.values()) {
      assert.notStrictEqual(p.assigned, p.word);
    }
  }
});

test("คำซ้ำเกินครึ่งวง แจกไม่ได้จริง ต้องบอกให้ชัดว่าต้องเปลี่ยนกี่คน", () => {
  // กิน 2 คน จาก 3 คน -> ทั้งคู่ต้องได้ "รถ" แต่มีใบเดียว จึงเป็นไปไม่ได้
  const room = makeRoom(["a", "b", "c"], ["กิน", "กิน", "รถ"]);
  assert.throws(() => G.startRound(room, 60000), (err) => {
    assert.match(err.message, /ซ้ำเกินครึ่งวง/);
    assert.match(err.message, /เปลี่ยนคำอย่างน้อย 1 คน/);
    return true;
  });
});

test("ทุกคนส่งคำเดียวกันหมด ต้องขึ้น error ไม่ใช่แจกมั่ว", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "กิน", "กิน"]);
  assert.throws(() => G.startRound(room, 60000), /อย่างน้อย 2 คำที่ต่างกัน/);
});

test("คนที่ยังไม่ส่งคำ หรือเน็ตหลุด จะไม่ถูกนับเข้ารอบ", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", null]);
  P(room, 2).word = null;
  const players = G.startRound(room, 60000);

  assert.strictEqual(players.length, 2);
  assert.strictEqual(P(room, 2).playing, false);
  assert.strictEqual(P(room, 2).assigned, null);
});

test("จับผิด: คนจับได้แต้ม คนโดนจับออกจากรอบ", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);

  G.callOut(room, P(room, 0).id, P(room, 1).id);

  assert.strictEqual(P(room, 1).out, true);
  assert.strictEqual(P(room, 1).outBy, P(room, 0).id);
  assert.strictEqual(P(room, 0).roundScore, 1);
});

test("จับผิดตัวเอง / จับคนที่ออกไปแล้ว ต้องไม่ผ่าน", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);
  const [a, b] = ids(room);

  assert.throws(() => G.callOut(room, a, a), /จับผิดตัวเองไม่ได้/);
  G.callOut(room, a, b);
  assert.throws(() => G.callOut(room, a, b), /ออกไปแล้ว/);
});

test("คนที่ออกจากรอบแล้ว จับผิดคนอื่นต่อไม่ได้", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);
  const [a, b, c] = ids(room);

  G.callOut(room, a, b);
  assert.throws(() => G.callOut(room, b, c), /ออกจากรอบนี้แล้ว/);
});

test("ยกเลิกการจับผิด คืนทั้งสถานะและแต้ม", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);
  const [a, b] = ids(room);

  G.callOut(room, a, b);
  G.undoCallout(room);

  assert.strictEqual(P(room, 1).out, false);
  assert.strictEqual(P(room, 1).outBy, null);
  assert.strictEqual(P(room, 0).roundScore, 0);
  assert.throws(() => G.undoCallout(room), /ไม่มีรายการจับผิด/);
});

test("เหลือคนรอดคนเดียว ต้องจบรอบอัตโนมัติ", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);
  const [a, b, c] = ids(room);

  G.callOut(room, a, b);
  assert.strictEqual(G.shouldAutoEnd(room), false);
  G.callOut(room, a, c);
  assert.strictEqual(G.shouldAutoEnd(room), true);
});

test("คิดคะแนน: จับผิดได้ครั้งละ 1 รอดจนจบ +2", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);
  const [a, b] = ids(room);

  G.callOut(room, a, b);       // a ได้ 1
  G.finishRound(room);          // a และ c รอด ได้อีกคนละ 2

  assert.strictEqual(P(room, 0).score, 3); // 1 + 2
  assert.strictEqual(P(room, 1).score, 0); // โดนจับ ไม่ได้อะไร
  assert.strictEqual(P(room, 2).score, 2); // รอด
});

test("จบรอบแล้วล้างคำ แต่คะแนนสะสมต้องอยู่", () => {
  const room = makeRoom(["a", "b"], ["กิน", "รถ"]);
  G.startRound(room, 60000);
  G.finishRound(room);

  for (const p of room.players.values()) {
    assert.strictEqual(p.word, null, "คำที่ส่งต้องถูกล้าง");
    assert.strictEqual(p.score, 2, "คะแนนต้องอยู่");
  }
  assert.strictEqual(room.round.running, false);
  assert.strictEqual(room.round.revealed, true);
});

test("state: ห้ามส่งคำของตัวเองกลับไปให้เจ้าตัวเด็ดขาด", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);
  const me = P(room, 0);

  const view = stateFor(room, me.id);
  const self = view.players.find((p) => p.id === me.id);
  const others = view.players.filter((p) => p.id !== me.id);

  assert.strictEqual(self.assigned, null, "ตัวเองต้องมองไม่เห็นคำตัวเอง");
  assert.ok(others.every((o) => typeof o.assigned === "string"), "ต้องเห็นคำของคนอื่น");
});

test("state: ก่อนเริ่มรอบ ห้ามหลุดคำของใครทั้งนั้น", () => {
  const room = makeRoom(["a", "b"], ["กิน", "รถ"]);
  const view = stateFor(room, P(room, 0).id);
  assert.ok(view.players.every((p) => p.assigned === null));
});

test("state: จอฉายเห็นคำของทุกคน", () => {
  const room = makeRoom(["a", "b", "c"], ["กิน", "รถ", "ไก่"]);
  G.startRound(room, 60000);

  const view = stateFor(room, null);
  assert.strictEqual(view.spectator, true);
  assert.strictEqual(view.youId, null);
  assert.ok(view.players.every((p) => typeof p.assigned === "string"));
});

test("รีเซ็ตคะแนน ล้างทุกอย่างกลับศูนย์", () => {
  const room = makeRoom(["a", "b"], ["กิน", "รถ"]);
  G.startRound(room, 60000);
  G.finishRound(room);
  G.resetScores(room);

  for (const p of room.players.values()) {
    assert.strictEqual(p.score, 0);
    assert.strictEqual(p.playing, false);
    assert.strictEqual(p.out, false);
  }
  assert.strictEqual(room.round.number, 0);
});

test("โฮสต์ต้องเด้งไปหาคนที่ยังออนไลน์เสมอ", () => {
  const room = makeRoom(["a", "b"], ["กิน", "รถ"]);
  const [a, b] = ids(room);
  room.hostId = a;

  P(room, 0).connected = false;
  R.ensureHost(room);

  assert.strictEqual(room.hostId, b);
});

test("รหัสห้องไม่มีตัวอักษรที่อ่านสับสน (O 0 I 1)", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(R.randomRoomCode(new Set()));
  for (const code of seen) {
    assert.strictEqual(code.length, 5);
    assert.ok(!/[O0I1]/.test(code), `รหัส ${code} มีตัวที่อ่านสับสน`);
  }
});
