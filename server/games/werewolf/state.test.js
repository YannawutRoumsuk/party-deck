// เทสต์ชุดนี้คุมเรื่องเดียว: บทบาทต้องไม่หลุดไปหาคนที่ไม่ควรรู้
const test = require("node:test");
const assert = require("node:assert");
const W = require("./rules");
const { gameView } = require("./state");

function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "คน" + i, score: 0 }));
}

function fixed(assignments, comp) {
  const ids = Object.keys(assignments);
  const g = W.createGame(players(ids.length), comp);
  g.players.forEach((p, i) => { p.roleId = assignments["p" + i]; });
  g.day = 0;
  W.beginNight(g);
  return g;
}

function deepValues(obj, out) {
  out = out || [];
  if (obj === null || typeof obj !== "object") { out.push(obj); return out; }
  for (const k of Object.keys(obj)) deepValues(obj[k], out);
  return out;
}

const BASE = { p0: "werewolf", p1: "seer", p2: "doctor", p3: "villager", p4: "villager" };
const COMP = { werewolf: 1, seer: 1, doctor: 1, villager: 2 };

test("ชาวบ้านเห็นแค่บทบาทตัวเอง ไม่เห็นของใครเลย", () => {
  const g = fixed(BASE, COMP);
  const view = gameView(g, "p3");

  assert.strictEqual(view.myRoleId, "villager");
  for (const p of view.players) {
    if (p.id === "p3") assert.strictEqual(p.roleId, "villager");
    else assert.strictEqual(p.roleId, null, p.id + " หลุดบทบาท");
  }
  assert.deepStrictEqual(view.allies, {});
});

test("ผู้พยากรณ์ก็เห็นแค่ของตัวเอง ไม่รู้ว่าใครเป็นหมาป่าจนกว่าจะตรวจ", () => {
  const g = fixed(BASE, COMP);
  const view = gameView(g, "p1");
  assert.strictEqual(view.players.find((p) => p.id === "p0").roleId, null);
});

test("หมาป่าเห็นหน้ากันเอง", () => {
  const g = fixed(
    { p0: "werewolf", p1: "werewolf", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 2, seer: 1, villager: 2 }
  );
  const view = gameView(g, "p0");

  assert.deepStrictEqual(Object.keys(view.allies).sort(), ["p0", "p1"]);
  assert.strictEqual(view.players.find((p) => p.id === "p1").roleId, "werewolf");
  assert.strictEqual(view.players.find((p) => p.id === "p2").roleId, null, "ห้ามเห็นฝ่ายชาวบ้าน");
});

test("ลูกสมุนเห็นหมาป่า แต่หมาป่าไม่เห็นลูกสมุน", () => {
  const g = fixed(
    { p0: "werewolf", p1: "minion", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, minion: 1, seer: 1, villager: 2 }
  );

  const minionView = gameView(g, "p1");
  assert.strictEqual(minionView.players.find((p) => p.id === "p0").roleId, "werewolf");

  const wolfView = gameView(g, "p0");
  assert.strictEqual(
    wolfView.players.find((p) => p.id === "p1").roleId, null,
    "หมาป่าต้องไม่รู้ว่าใครเป็นลูกสมุน"
  );
});

test("พี่น้องร่วมสาบานรู้จักกันเอง แต่ไม่รู้จักคนอื่น", () => {
  const g = fixed(
    { p0: "werewolf", p1: "mason", p2: "mason", p3: "seer", p4: "villager" },
    { werewolf: 1, mason: 2, seer: 1, villager: 1 }
  );
  const view = gameView(g, "p1");

  assert.strictEqual(view.players.find((p) => p.id === "p2").roleId, "mason");
  assert.strictEqual(view.players.find((p) => p.id === "p3").roleId, null);
});

test("ตายแล้วยังไม่เฉลยบทบาท ตามกติกาที่ตกลงไว้", () => {
  const g = fixed(BASE, COMP);
  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p2", { targetId: "p2" });
  W.nightAction(g, "p1", { targetId: "p3" });

  const dead = W.byId(g, "p4");
  assert.strictEqual(dead.alive, false);

  const view = gameView(g, "p3");
  const deadView = view.players.find((p) => p.id === "p4");
  assert.strictEqual(deadView.alive, false);
  assert.strictEqual(deadView.roleId, null, "คนตายต้องยังไม่เฉลยบทบาท");
  assert.ok(deadView.deathReason, "แต่บอกสาเหตุการตายได้");
});

test("จบเกมแล้วเฉลยบทบาททุกคน", () => {
  const g = fixed({ p0: "werewolf", p1: "villager", p2: "villager" },
    { werewolf: 1, villager: 2 });
  W.nightAction(g, "p0", { targetId: "p1" });

  assert.strictEqual(g.phase, "finished");
  const view = gameView(g, "p2");
  assert.ok(view.players.every((p) => typeof p.roleId === "string"), "ต้องเฉลยครบทุกคน");
});

test("ผลการตรวจของผู้พยากรณ์ถึงเจ้าตัวคนเดียว", () => {
  const g = fixed(BASE, COMP);
  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p2", { targetId: "p2" });
  W.nightAction(g, "p1", { targetId: "p0" });

  const seerView = gameView(g, "p1");
  assert.deepStrictEqual(seerView.myInspection, { targetId: "p0", result: true });

  for (const other of ["p2", "p3"]) {
    assert.strictEqual(gameView(g, other).myInspection, null, other + " ไม่ควรเห็นผลตรวจ");
  }
});

test("ไล่ทุกฟิลด์ใน payload ของชาวบ้าน ต้องไม่มีบทบาทของใครโผล่", () => {
  const g = fixed(
    { p0: "werewolf", p1: "seer", p2: "doctor", p3: "villager", p4: "hunter" },
    { werewolf: 1, seer: 1, doctor: 1, villager: 1, hunter: 1 }
  );

  const view = gameView(g, "p3");

  // currentStepRole เปิดเผยโดยตั้งใจ เหมือนคนคุมเกมประกาศว่า "หมาป่าตื่น"
  // มันบอกแค่ว่าตอนนี้ถึงคิวบทบาทไหน ไม่ได้บอกว่าใครเป็นคนนั้น
  const scrubbed = Object.assign({}, view);
  delete scrubbed.currentStepRole;

  const values = deepValues(scrubbed);
  for (const secret of ["werewolf", "seer", "doctor", "hunter"]) {
    assert.ok(!values.includes(secret), 'บทบาท "' + secret + '" หลุดไปหาชาวบ้าน');
  }

  // และต้องไม่มีทางโยงบทบาทเข้ากับตัวคนได้
  assert.ok(
    view.players.every((p) => p.id === "p3" || p.roleId === null),
    "ต้องไม่มีใครถูกระบุบทบาท"
  );
});

test("กลางคืนบอกแค่ว่าถึงคิวบทบาทไหน ไม่บอกว่าใครเป็นคนนั้น", () => {
  const g = fixed(BASE, COMP);
  const view = gameView(g, "p3");

  assert.strictEqual(view.currentStepRole, "werewolf", "บอกได้ว่าตอนนี้หมาป่าตื่น");
  assert.strictEqual(view.myAction, null, "แต่ชาวบ้านไม่มีอะไรให้ทำ");
  assert.strictEqual(view.players.find((p) => p.id === "p0").roleId, null);
});

test("คนที่ถึงตาทำ ได้รับข้อมูลที่จำเป็นครบ", () => {
  const g = fixed(BASE, COMP);
  const wolfView = gameView(g, "p0");

  assert.ok(wolfView.myAction);
  assert.strictEqual(wolfView.myAction.action, "kill");
});

test("แม่มดต้องเห็นเหยื่อของหมาป่าก่อนตัดสินใจใช้ยา", () => {
  const g = fixed(
    { p0: "werewolf", p1: "witch", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, witch: 1, seer: 1, villager: 2 }
  );
  W.nightAction(g, "p0", { targetId: "p3" });

  const witchView = gameView(g, "p1");
  assert.strictEqual(witchView.myAction.action, "potion");
  assert.strictEqual(witchView.myAction.wolfTargetId, "p3", "แม่มดต้องรู้ว่าใครกำลังจะตาย");

  // แต่คนอื่นต้องไม่รู้
  assert.ok(!deepValues(gameView(g, "p4")).includes("p3") ||
    gameView(g, "p4").myAction === null, "ชาวบ้านไม่ควรรู้เหยื่อล่วงหน้า");
});

test("คู่รักรู้ว่าตัวเองเป็นคู่รัก แต่คนอื่นไม่รู้", () => {
  const g = fixed(
    { p0: "werewolf", p1: "cupid", p2: "seer", p3: "villager", p4: "villager", p5: "villager" },
    { werewolf: 1, cupid: 1, seer: 1, villager: 3 }
  );
  W.nightAction(g, "p1", { firstId: "p3", secondId: "p4" });

  const loverView = gameView(g, "p3");
  assert.strictEqual(loverView.players.find((p) => p.id === "p4").isLover, true);

  const outsiderView = gameView(g, "p5");
  assert.ok(outsiderView.players.every((p) => p.isLover === false), "คนนอกต้องไม่รู้ว่าใครเป็นคู่รัก");
});
