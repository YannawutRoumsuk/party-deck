const test = require("node:test");
const assert = require("node:assert");
const W = require("./rules");
const RL = require("./roles");

function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "คน" + i, score: 0 }));
}

/** สร้างเกมโดยบังคับบทบาทให้แน่นอน จะได้เทสต์ได้ตรงๆ ไม่ต้องลุ้นการสุ่ม */
function fixed(assignments, comp) {
  const ids = Object.keys(assignments);
  const g = W.createGame(players(ids.length), comp);
  g.players.forEach((p, i) => { p.roleId = assignments["p" + i]; });
  g.day = 0;
  W.beginNight(g);   // สร้างคิวกลางคืนใหม่ตามบทบาทที่เพิ่งกำหนด
  return g;
}

const wolfStep = (g) => W.currentStep(g) && W.currentStep(g).key === "wolves";

// ---------- คลังบทบาทและการจัดชุด ----------

test("ทุกบทบาทมีข้อมูลครบ", () => {
  assert.ok(RL.ROLES.length >= 13, "มีแค่ " + RL.ROLES.length + " บทบาท");
  for (const r of RL.ROLES) {
    assert.ok(r.id && r.name && r.description, r.id + " ข้อมูลไม่ครบ");
    assert.ok(["wolf", "village", "solo"].includes(r.team), r.id + " ฝ่ายผิด");
  }
});

test("จำนวนหมาป่าที่แนะนำเป็นไปตามสัดส่วนมาตรฐาน", () => {
  assert.strictEqual(RL.suggestedWolves(6), 1);
  assert.strictEqual(RL.suggestedWolves(8), 2);
  assert.strictEqual(RL.suggestedWolves(12), 3);
  assert.strictEqual(RL.suggestedWolves(16), 4);
});

test("เซ็ตแนะนำทุกชุดจัดได้ลงตัวทุกจำนวนคน", () => {
  for (const preset of RL.PRESETS) {
    for (let n = 5; n <= 14; n++) {
      const comp = RL.composeFromPreset(preset.id, n);
      const check = RL.validate(comp, n);
      assert.strictEqual(
        check.ok, true,
        preset.name + " ที่ " + n + " คน: " + check.problems.join(", ")
      );
    }
  }
});

test("ชุดที่จัดผิดต้องถูกปฏิเสธพร้อมบอกเหตุผล", () => {
  assert.match(RL.validate({ villager: 5 }, 5).problems.join(), /หมาป่าอย่างน้อย 1/);
  assert.match(RL.validate({ werewolf: 3, villager: 3 }, 6).problems.join(), /เยอะเกินไป/);
  assert.match(RL.validate({ werewolf: 1, villager: 2 }, 5).problems.join(), /รวมได้ 3/);
  assert.match(RL.validate({ werewolf: 1, minion: 1, villager: 3 }, 5).problems.join(), /^$|.*/);
});

test("บทบาทที่ต้องพึ่งหมาป่า ถ้าไม่มีหมาป่าต้องเตือน", () => {
  const r = RL.validate({ minion: 1, seer: 1, villager: 3 }, 5);
  assert.strictEqual(r.ok, false);
  assert.match(r.problems.join(), /ต้องมีหมาป่า/);
});

test("พี่น้องร่วมสาบานต้องมีอย่างน้อย 2 คน", () => {
  const r = RL.validate({ werewolf: 1, mason: 1, villager: 4 }, 6);
  assert.match(r.problems.join(), /อย่างน้อย 2 คน/);
});

// ---------- แจกบทบาท ----------

test("แจกบทบาทครบตามชุดที่จัดไว้", () => {
  const comp = { werewolf: 2, seer: 1, doctor: 1, villager: 4 };
  const g = W.createGame(players(8), comp);

  const counts = {};
  g.players.forEach((p) => { counts[p.roleId] = (counts[p.roleId] || 0) + 1; });
  assert.deepStrictEqual(counts, comp);
  assert.ok(g.players.every((p) => p.alive));
});

// ---------- กลางคืน ----------

test("หมาป่ากัดพวกเดียวกันไม่ได้", () => {
  const g = fixed({ p0: "werewolf", p1: "werewolf", p2: "seer", p3: "doctor", p4: "villager" },
    { werewolf: 2, seer: 1, doctor: 1, villager: 1 });

  assert.ok(wolfStep(g));
  assert.throws(() => W.nightAction(g, "p0", { targetId: "p1" }), /กัดพวกเดียวกันไม่ได้/);
});

test("หมาป่าโหวตครบแล้วถึงไปขั้นถัดไป", () => {
  const g = fixed({ p0: "werewolf", p1: "werewolf", p2: "seer", p3: "doctor", p4: "villager" },
    { werewolf: 2, seer: 1, doctor: 1, villager: 1 });

  W.nightAction(g, "p0", { targetId: "p4" });
  assert.ok(wolfStep(g), "ยังไม่ครบ ต้องยังเป็นตาหมาป่า");

  W.nightAction(g, "p1", { targetId: "p4" });
  assert.ok(!wolfStep(g), "ครบแล้วต้องไปขั้นถัดไป");
  assert.strictEqual(g.night.wolfTargetId, "p4");
});

test("หมอปกป้องได้ เหยื่อรอด", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p3" });     // หมาป่าเลือก p3
  W.nightAction(g, "p1", { targetId: "p3" });     // หมอปกป้อง p3
  W.nightAction(g, "p2", { targetId: "p0" });     // ผู้พยากรณ์ตรวจ

  assert.strictEqual(W.byId(g, "p3").alive, true, "ต้องรอด");
  assert.strictEqual(g.lastNight.saved, true);
  assert.strictEqual(g.lastNight.deaths.length, 0);
});

test("หมอปกป้องคนเดิมสองคืนติดไม่ได้", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p1", { targetId: "p3" });
  W.nightAction(g, "p2", { targetId: "p0" });

  // คืนถัดไป — p4 ตายไปแล้ว หมาป่าต้องเลือกคนที่ยังอยู่
  W.startVote(g); W.resolveVote(g);
  assert.strictEqual(g.phase, "night");
  W.nightAction(g, "p0", { targetId: "p2" });
  assert.throws(() => W.nightAction(g, "p1", { targetId: "p3" }), /คนเดิมสองคืนติด/);
});

test("ผู้พยากรณ์ตรวจแล้วรู้ผลทันที และผลถูกต้อง", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p3" });
  W.nightAction(g, "p1", { targetId: "p4" });
  W.nightAction(g, "p2", { targetId: "p0" });

  assert.deepStrictEqual(g.night.inspections.p2, { targetId: "p0", result: true });
});

test("ผู้เฒ่ารอดจากการถูกกัดครั้งแรก แต่ครั้งที่สองตาย", () => {
  const g = fixed({ p0: "werewolf", p1: "elder", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, elder: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p3" });
  assert.strictEqual(W.byId(g, "p1").alive, true, "ครั้งแรกต้องรอด");

  W.startVote(g); W.resolveVote(g);
  W.nightAction(g, "p0", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p3" });
  assert.strictEqual(W.byId(g, "p1").alive, false, "ครั้งที่สองต้องตาย");
});

test("แม่มดใช้ยาชุบชีวิตและยาพิษได้อย่างละครั้งเดียว", () => {
  const g = fixed({ p0: "werewolf", p1: "witch", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, witch: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p3" });
  W.nightAction(g, "p1", { heal: true, poisonTarget: "p4" });
  W.nightAction(g, "p2", { targetId: "p0" });

  assert.strictEqual(W.byId(g, "p3").alive, true, "ถูกชุบชีวิต");
  assert.strictEqual(W.byId(g, "p4").alive, false, "ถูกวางยา");

  W.startVote(g); W.resolveVote(g);
  W.nightAction(g, "p0", { targetId: "p3" });
  assert.throws(() => W.nightAction(g, "p1", { poisonTarget: "p2" }), /ใช้ยาพิษไปแล้ว/);
});

// ---------- นักล่า ----------

test("นักล่าตายแล้วลากคนไปด้วยได้", () => {
  const g = fixed({ p0: "werewolf", p1: "hunter", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, hunter: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p0" });

  assert.strictEqual(W.byId(g, "p1").alive, false);
  assert.strictEqual(g.pendingHunter, "p1", "ต้องรอให้นักล่าเลือก");
  assert.throws(() => W.startVote(g), /รอให้นักล่าเลือก/);

  W.hunterShoot(g, "p1", "p0");
  assert.strictEqual(W.byId(g, "p0").alive, false);
  assert.strictEqual(g.pendingHunter, null);
});

// ---------- คิวปิดและคู่รัก ----------

test("คู่รักตายตามกัน", () => {
  const g = fixed({ p0: "werewolf", p1: "cupid", p2: "seer", p3: "villager", p4: "villager", p5: "villager" },
    { werewolf: 1, cupid: 1, seer: 1, villager: 3 });

  W.nightAction(g, "p1", { firstId: "p3", secondId: "p4" });
  W.nightAction(g, "p0", { targetId: "p3" });
  W.nightAction(g, "p2", { targetId: "p0" });

  assert.strictEqual(W.byId(g, "p3").alive, false);
  assert.strictEqual(W.byId(g, "p4").alive, false, "คู่รักต้องตายตาม");
});

// ---------- โหวตประหาร ----------

test("เสียงข้างมากถูกประหาร", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p1", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p0" });

  W.startVote(g);
  W.castVote(g, "p1", "p0");
  W.castVote(g, "p2", "p0");
  W.castVote(g, "p3", "p1");
  W.resolveVote(g);

  assert.strictEqual(W.byId(g, "p0").alive, false);
});

test("คะแนนเสมอ ไม่ประหารใคร แล้วเข้ากลางคืนต่อ", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager", p5: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 3 });

  W.nightAction(g, "p0", { targetId: "p5" });
  W.nightAction(g, "p1", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p0" });

  W.startVote(g);
  W.castVote(g, "p1", "p0");
  W.castVote(g, "p2", "p3");
  W.resolveVote(g);

  assert.ok(g.players.filter((p) => !p.alive).length === 1, "ต้องไม่มีใครถูกประหารเพิ่ม");
  assert.strictEqual(g.phase, "night");
});

test("คนตายแล้วโหวตไม่ได้", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p1", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p0" });

  W.startVote(g);
  assert.throws(() => W.castVote(g, "p4", "p0"), /ตายแล้วโหวตไม่ได้/);
});

// ---------- เงื่อนไขชนะ ----------

test("ฆ่าหมาป่าหมด ฝ่ายชาวบ้านชนะ", () => {
  const g = fixed({ p0: "werewolf", p1: "doctor", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, doctor: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p1", { targetId: "p1" });
  W.nightAction(g, "p2", { targetId: "p0" });

  W.startVote(g);
  ["p1", "p2", "p3"].forEach((id) => W.castVote(g, id, "p0"));
  W.resolveVote(g);

  assert.strictEqual(g.phase, "finished");
  assert.strictEqual(g.result.winner, "village");
});

test("หมาป่าเท่ากับชาวบ้าน ฝ่ายหมาป่าชนะ", () => {
  const g = fixed({ p0: "werewolf", p1: "villager", p2: "villager" },
    { werewolf: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p1" });

  assert.strictEqual(g.phase, "finished");
  assert.strictEqual(g.result.winner, "wolf");
});

test("คนฟอกหนังถูกประหาร ชนะคนเดียวทันที", () => {
  const g = fixed({ p0: "werewolf", p1: "tanner", p2: "seer", p3: "villager", p4: "villager" },
    { werewolf: 1, tanner: 1, seer: 1, villager: 2 });

  W.nightAction(g, "p0", { targetId: "p4" });
  W.nightAction(g, "p2", { targetId: "p0" });

  W.startVote(g);
  ["p2", "p3"].forEach((id) => W.castVote(g, id, "p1"));
  W.resolveVote(g);

  assert.strictEqual(g.result.winner, "tanner");
  assert.deepStrictEqual(g.result.winnerIds, ["p1"]);
});

test("ลูกสมุนอยู่ฝ่ายหมาป่า นับรวมตอนตัดสินผล", () => {
  const g = fixed({ p0: "werewolf", p1: "minion", p2: "villager", p3: "villager" },
    { werewolf: 1, minion: 1, villager: 2 });

  assert.strictEqual(W.isWolfTeam(g, "p1"), true);
  assert.strictEqual(W.killingWolves(g).length, 1, "ลูกสมุนไม่ได้ออกล่า");
});
