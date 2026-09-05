// server/rooms.test.js
const test = require("node:test");
const assert = require("node:assert");
const R = require("./rooms");

function room() {
  const rooms = new Map();
  return R.createRoom(rooms, "spyfall");
}

test("หนึ่ง socket ต้องเป็นผู้เล่นได้คนเดียวเท่านั้น", () => {
  const r = room();

  // จำลอง client ยิง join ซ้ำ จน server สร้างผู้เล่นสองคนด้วย socket เดียวกัน
  const a = R.createPlayer("เอ");
  const b = R.createPlayer("บี");
  r.players.set(a.id, a);
  r.players.set(b.id, b);

  R.attachSocket(r, a, "sock-1");
  R.attachSocket(r, b, "sock-1");

  assert.strictEqual(b.socketId, "sock-1", "คนล่าสุดถือ socket");
  assert.strictEqual(a.socketId, null, "คนเก่าต้องถูกถอด socket ออก");
  assert.strictEqual(a.connected, false);

  // และต้องหาเจอคนเดียว ไม่ใช่คนละคนกับที่ pushState ส่ง view ไปให้
  assert.strictEqual(R.findPlayerBySocket(r, "sock-1").id, b.id);

  const holders = [...r.players.values()].filter((p) => p.socketId === "sock-1");
  assert.strictEqual(holders.length, 1, "มี " + holders.length + " คนถือ socket เดียวกัน");
});

test("attach socket เดิมให้คนเดิมซ้ำ ไม่ทำให้ตัวเองหลุด", () => {
  const r = room();
  const a = R.createPlayer("เอ");
  r.players.set(a.id, a);

  R.attachSocket(r, a, "sock-1");
  R.attachSocket(r, a, "sock-1");

  assert.strictEqual(a.socketId, "sock-1");
  assert.strictEqual(a.connected, true);
});

test("คนละ socket อยู่ร่วมกันได้ตามปกติ", () => {
  const r = room();
  const a = R.createPlayer("เอ");
  const b = R.createPlayer("บี");
  r.players.set(a.id, a);
  r.players.set(b.id, b);

  R.attachSocket(r, a, "sock-1");
  R.attachSocket(r, b, "sock-2");

  assert.strictEqual(a.connected, true);
  assert.strictEqual(b.connected, true);
  assert.strictEqual(R.findPlayerBySocket(r, "sock-1").id, a.id);
  assert.strictEqual(R.findPlayerBySocket(r, "sock-2").id, b.id);
});

test("ห้องรู้จักเกมของตัวเอง", () => {
  const rooms = new Map();
  assert.strictEqual(R.createRoom(rooms, "werewolf").gameType, "werewolf");
  assert.strictEqual(R.createRoom(rooms, "spyfall").gameType, "spyfall");
  assert.strictEqual(R.createRoom(rooms, "numbers").gameType, "numbers");
  assert.strictEqual(R.createRoom(rooms, "อะไรไม่รู้").gameType, "forbidden");
});

test("โฮสต์ย้ายไปหาคนที่ยังออนไลน์ ไม่ค้างที่คนหลุด", () => {
  const r = room();
  const a = R.createPlayer("เอ");
  const b = R.createPlayer("บี");
  r.players.set(a.id, a);
  r.players.set(b.id, b);
  R.attachSocket(r, a, "s1");
  R.attachSocket(r, b, "s2");
  r.hostId = a.id;

  R.detachSocket(a);
  R.ensureHost(r);
  assert.strictEqual(r.hostId, b.id);
});
