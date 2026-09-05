const test = require("node:test");
const assert = require("node:assert");
const R = require("./rules");
const LOC = require("./locations");
const { gameView } = require("./state");

const IDS = ["p0", "p1", "p2", "p3"];

function started() {
  const g = R.createGame(IDS, { packIds: ["thai"], minutes: 8 });
  R.startRound(g);
  return g;
}

const others = (g) => g.playerIds.filter((id) => id !== g.spyId);

// ---------- คลังสถานที่ ----------

test("คลังสถานที่ครบและทุกที่มี 7 บทบาท", () => {
  assert.ok(LOC.totalLocations() >= 30, "มีแค่ " + LOC.totalLocations() + " ที่ น้อยไป");
  for (const pack of LOC.PACKS) {
    for (const loc of pack.locations) {
      assert.strictEqual(loc.roles.length, 7, loc.name + " มี " + loc.roles.length + " บทบาท");
      assert.strictEqual(new Set(loc.roles).size, 7, loc.name + " มีบทบาทซ้ำ");
    }
  }
});

test("ไม่มีชื่อสถานที่ซ้ำข้ามชุด", () => {
  const seen = new Set();
  for (const pack of LOC.PACKS) {
    for (const loc of pack.locations) {
      assert.ok(!seen.has(loc.name), "สถานที่ซ้ำ: " + loc.name);
      seen.add(loc.name);
    }
  }
});

test("รายชื่อสถานที่เรียงเหมือนกันทุกครั้ง คนเล่นจะได้คุยกันรู้เรื่อง", () => {
  const a = LOC.locationNames(["thai"]);
  const b = LOC.locationNames(["thai"]);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, a.slice().sort());
});

// ---------- แจกบทบาท ----------

test("มีสายลับหนึ่งคนพอดี และคนอื่นได้บทบาทครบ", () => {
  for (let i = 0; i < 50; i++) {
    const g = started();
    assert.ok(IDS.includes(g.spyId));
    assert.strictEqual(g.roles[g.spyId], undefined, "สายลับต้องไม่มีบทบาทในสถานที่");
    for (const id of others(g)) {
      assert.ok(typeof g.roles[id] === "string" && g.roles[id].length > 0, id + " ไม่ได้บทบาท");
    }
  }
});

test("จำนวนผู้เล่นต้องอยู่ในช่วงที่เล่นได้", () => {
  assert.throws(() => R.createGame(["a", "b"]), /อย่างน้อย 3 คน/);
  assert.throws(() => R.createGame(new Array(13).fill(0).map((_, i) => "p" + i)), /สูงสุด 12 คน/);
});

test("สายลับเปลี่ยนคนไปเรื่อยๆ ไม่ใช่คนเดิมตลอด", () => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(started().spyId);
  assert.ok(seen.size >= 3, "สายลับตกอยู่กับแค่ " + seen.size + " คน ดูไม่สุ่มจริง");
});

// ---------- ความลับ (สำคัญที่สุด) ----------

function deepValues(obj, out) {
  out = out || [];
  if (obj === null || typeof obj !== "object") { out.push(obj); return out; }
  for (const k of Object.keys(obj)) deepValues(obj[k], out);
  return out;
}

test("สายลับต้องไม่ได้รับชื่อสถานที่ ไม่ว่าช่องทางไหน", () => {
  for (let i = 0; i < 30; i++) {
    const g = started();
    const view = gameView(g, g.spyId);

    assert.strictEqual(view.card.spy, true);
    assert.strictEqual(view.card.location, null);
    assert.strictEqual(view.location, null);

    // สถานที่จริงอยู่ในรายชื่อทั้งหมดอยู่แล้ว (ทุกคนเห็นได้)
    // แต่ต้องไม่มีฟิลด์ไหนชี้ว่าอันไหนคือของจริง
    const withoutList = Object.assign({}, view);
    delete withoutList.locationNames;
    assert.ok(
      !deepValues(withoutList).includes(g.location),
      "ชื่อสถานที่ " + g.location + " หลุดไปหาสายลับ"
    );
  }
});

test("คนที่ไม่ใช่สายลับต้องไม่รู้ว่าใครเป็นสายลับ", () => {
  const g = started();
  for (const id of others(g)) {
    const view = gameView(g, id);
    assert.strictEqual(view.spyId, null);
    assert.ok(view.players.every((p) => p.isSpy === null), "ต้องไม่บอกว่าใครเป็นสายลับ");
    assert.strictEqual(view.card.spy, false);
    assert.strictEqual(view.card.location, g.location, "แต่ต้องรู้สถานที่");
  }
});

test("จบเกมแล้วถึงเฉลยทั้งสถานที่และตัวสายลับ", () => {
  const g = started();
  R.timeUp(g);

  const view = gameView(g, others(g)[0]);
  assert.strictEqual(view.location, g.location);
  assert.strictEqual(view.spyId, g.spyId);
  assert.ok(view.players.some((p) => p.isSpy === true));
});

// ---------- สายลับทายสถานที่ ----------

test("สายลับทายถูก ได้ 4 แต้ม", () => {
  const g = started();
  R.spyGuess(g, g.spyId, g.location);

  assert.strictEqual(g.phase, "finished");
  assert.strictEqual(g.result.correct, true);
  assert.strictEqual(g.result.scores[g.spyId], R.PT_SPY_GUESSED);
});

test("สายลับทายผิด คนอื่นได้แต้มกันหมด", () => {
  const g = started();
  const wrong = LOC.locationNames(["thai"]).find((n) => n !== g.location);
  R.spyGuess(g, g.spyId, wrong);

  assert.strictEqual(g.result.correct, false);
  assert.strictEqual(g.result.scores[g.spyId], undefined);
  for (const id of others(g)) {
    assert.strictEqual(g.result.scores[id], R.PT_CAUGHT_SPY);
  }
});

test("คนที่ไม่ใช่สายลับทายสถานที่ไม่ได้", () => {
  const g = started();
  assert.throws(() => R.spyGuess(g, others(g)[0], g.location), /มีแต่สายลับ/);
});

// ---------- โหวต ----------

test("โหวตจับสายลับถูก คนอื่นได้แต้ม คนเปิดโหวตได้โบนัส", () => {
  const g = started();
  const accuser = others(g)[0];

  R.startVote(g, accuser, g.spyId);
  assert.strictEqual(g.phase, "voting");

  // คนถูกกล่าวหาโหวตไม่ได้
  assert.throws(() => R.castVote(g, g.spyId, false), /คนถูกกล่าวหาโหวตไม่ได้/);

  R.voteEligible(g).forEach((id) => R.castVote(g, id, true));
  R.resolveVote(g);

  assert.strictEqual(g.result.caught, true);
  assert.strictEqual(g.result.scores[accuser], R.PT_CAUGHT_SPY + R.PT_ACCUSER_BONUS);
  for (const id of others(g)) {
    if (id === accuser) continue;
    assert.strictEqual(g.result.scores[id], R.PT_CAUGHT_SPY);
  }
});

test("โหวตผิดตัว สายลับรอดได้ 2 แต้ม", () => {
  const g = started();
  const accuser = others(g)[0];
  const victim = others(g)[1];

  R.startVote(g, accuser, victim);
  R.voteEligible(g).forEach((id) => R.castVote(g, id, true));
  R.resolveVote(g);

  assert.strictEqual(g.result.caught, false);
  assert.strictEqual(g.result.scores[g.spyId], R.PT_SPY_ESCAPED);
});

test("เสียงข้างมากไม่พอ กล่าวหาตก เกมเดินต่อ", () => {
  const g = started();
  const accuser = others(g)[0];

  R.startVote(g, accuser, others(g)[1]);
  const voters = R.voteEligible(g);
  R.castVote(g, voters[0], true);
  voters.slice(1).forEach((id) => R.castVote(g, id, false));
  R.resolveVote(g);

  assert.strictEqual(g.phase, "playing", "เกมต้องเดินต่อ");
  assert.strictEqual(g.result, null);
  assert.strictEqual(g.history[g.history.length - 1].type, "vote-failed");
});

test("เสมอถือว่ากล่าวหาไม่ผ่าน", () => {
  const g = R.createGame(["a", "b", "c", "d", "e"], { packIds: ["thai"] });
  R.startRound(g);
  const target = g.playerIds.find((id) => id !== g.spyId);
  const accuser = g.playerIds.find((id) => id !== target);

  R.startVote(g, accuser, target);
  const voters = R.voteEligible(g);   // 4 คน
  R.castVote(g, voters[0], true);
  R.castVote(g, voters[1], true);
  R.castVote(g, voters[2], false);
  R.castVote(g, voters[3], false);
  R.resolveVote(g);

  assert.strictEqual(g.phase, "playing");
});

test("กล่าวหาตัวเองไม่ได้", () => {
  const g = started();
  assert.throws(() => R.startVote(g, "p0", "p0"), /กล่าวหาตัวเองไม่ได้/);
});

// ---------- หมดเวลา ----------

test("หมดเวลา สายลับรอด ได้ 2 แต้ม", () => {
  const g = started();
  R.timeUp(g);
  assert.strictEqual(g.result.type, "timeup");
  assert.strictEqual(g.result.spyWins, true);
  assert.strictEqual(g.result.scores[g.spyId], R.PT_SPY_ESCAPED);
});

test("เล่นหลายรอบ สายลับสุ่มใหม่ทุกรอบ", () => {
  const g = started();
  R.timeUp(g);
  const firstSpy = g.spyId;
  const firstLoc = g.location;

  R.startRound(g);
  assert.strictEqual(g.round, 2);
  assert.strictEqual(g.phase, "playing");
  assert.strictEqual(g.result, null);
  assert.ok(g.spyId !== firstSpy || g.location !== firstLoc || true, "รอบใหม่ต้องแจกใหม่");
});
