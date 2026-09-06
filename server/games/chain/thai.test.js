// server/games/chain/thai.test.js — ตัวตรวจคำซ้ำภาษาไทย
const test = require("node:test");
const assert = require("node:assert");
const TH = require("./thai");

// ---------- normalize ----------

test("ลอกวรรณยุกต์ออกก่อนเทียบ กันคนเลี่ยงด้วยการเปลี่ยนวรรณยุกต์", () => {
  const base = TH.normalize("ไม้");
  assert.strictEqual(TH.normalize("ไม่"), base, "ไม่ ต้องชนกับ ไม้");
  assert.strictEqual(TH.normalize("ไม"), base, "ไม ต้องชนกับ ไม้");
  assert.strictEqual(TH.normalize("ไม๊"), base);
  assert.strictEqual(TH.normalize("ไม๋"), base);
});

test("ตัดช่องว่างและอักขระล่องหนออก", () => {
  assert.strictEqual(TH.normalize(" ต้น ไม้ "), TH.normalize("ต้นไม้"));
  assert.strictEqual(TH.normalize("ต้น​ไม้"), TH.normalize("ต้นไม้"));
});

test("ทัณฑฆาตและไม้ไต่คู้ก็ถูกลอกออก", () => {
  assert.strictEqual(TH.normalize("สิงห์"), TH.normalize("สิงห"));
  assert.strictEqual(TH.normalize("เล็ก"), TH.normalize("เลก"));
});

// ---------- ตัดคำ ----------

test("ตัดคำประสมออกเป็นพยางค์ได้", () => {
  assert.deepStrictEqual(TH.segment("ต้นไม้"), [TH.normalize("ต้น"), TH.normalize("ไม้")]);
  assert.deepStrictEqual(TH.segment("ใบไม้"), [TH.normalize("ใบ"), TH.normalize("ไม้")]);
});

test("คำที่ไม่มีในพจนานุกรมก็ไม่หาย", () => {
  const parts = TH.segment("ซาลาเปา");
  assert.ok(parts.length >= 1);
  assert.strictEqual(parts.join(""), TH.normalize("ซาลาเปา"), "ต่อกลับต้องได้คำเดิม");
});

// ---------- โจทย์หลักจากสเปก ----------

test("โจทย์ต้นแบบ: ใบไม้ ออกแล้ว พูด ต้นไม้ ต้องโดนจับ", () => {
  const r = TH.checkRepeat("ต้นไม้", ["ใบไม้"]);
  assert.strictEqual(r.repeat, true);
  assert.strictEqual(r.part, TH.normalize("ไม้"));
  assert.strictEqual(r.matchedWord, "ใบไม้");
  assert.match(r.reason, /ไม้/);
});

test("คำเดียวกันเป๊ะ ต้องโดนจับ", () => {
  const r = TH.checkRepeat("ต้นไม้", ["ต้นไม้"]);
  assert.strictEqual(r.repeat, true);
  assert.match(r.reason, /ออกไปแล้ว/);
});

test("เลี่ยงด้วยการเปลี่ยนวรรณยุกต์ ก็ยังโดนจับ", () => {
  assert.strictEqual(TH.checkRepeat("ต้นไม", ["ใบไม้"]).repeat, true);
  assert.strictEqual(TH.checkRepeat("ตนไม้", ["ใบไม้"]).repeat, true);
});

test("เลี่ยงด้วยการเว้นวรรค ก็ยังโดนจับ", () => {
  assert.strictEqual(TH.checkRepeat("ต้น ไม้", ["ใบไม้"]).repeat, true);
});

test("คำที่ไม่เกี่ยวกันเลย ต้องผ่าน", () => {
  const r = TH.checkRepeat("ทะเล", ["ใบไม้", "ภูเขา"]);
  assert.strictEqual(r.repeat, false);
});

test("ชนกันหลายพยางค์ จับได้ทุกตำแหน่ง", () => {
  assert.strictEqual(TH.checkRepeat("น้ำตก", ["น้ำแข็ง"]).repeat, true, "ชนที่ น้ำ");
  assert.strictEqual(TH.checkRepeat("ดอกไม้", ["ดอกบัว"]).repeat, true, "ชนที่ ดอก");
  assert.strictEqual(TH.checkRepeat("หัวใจ", ["หัวหอม"]).repeat, true, "ชนที่ หัว");
});

test("คำที่ฝังอยู่ในอีกคำ ก็ถือว่าซ้ำ แม้ตัดคำไม่ออก", () => {
  // ซาลาเปา ไม่มีในพจนานุกรม แต่ถ้ามีคนพูด เปา ไปแล้วก็ควรจับได้
  assert.strictEqual(TH.checkRepeat("ซาลาเปา", ["ลาเปา"]).repeat, true);
});

test("พยางค์ตัวเดียวไม่นับว่าซ้ำ ไม่งั้นชนกันมั่วไปหมด", () => {
  // "ก" ตัวเดียวไม่ควรทำให้ทุกคำที่มี ก ตกรอบ
  const r = TH.checkRepeat("กบ", ["กา"]);
  assert.strictEqual(r.repeat, false, "ชนกันแค่ตัวอักษรเดียวต้องไม่นับ");
});

test("เทียบกับคำที่ออกไปแล้วทั้งกอง ไม่ใช่แค่คำล่าสุด", () => {
  const used = ["ทะเล", "ภูเขา", "ใบไม้", "ดวงดาว"];
  assert.strictEqual(TH.checkRepeat("ต้นไม้", used).repeat, true);
  assert.strictEqual(TH.checkRepeat("รถยนต์", used).repeat, false);
});

test("คำว่างไม่ทำให้พัง", () => {
  assert.strictEqual(TH.checkRepeat("", ["ทะเล"]).repeat, false);
  assert.strictEqual(TH.checkRepeat("ทะเล", []).repeat, false);
  assert.strictEqual(TH.checkRepeat("ทะเล", [""]).repeat, false);
});

test("รู้ว่าเป็นภาษาไทยหรือไม่", () => {
  assert.strictEqual(TH.isThai("ต้นไม้"), true);
  assert.strictEqual(TH.isThai("tree"), false);
});

test("พจนานุกรมมีขนาดพอใช้งาน", () => {
  assert.ok(TH.DICT_SIZE >= 200, "มีแค่ " + TH.DICT_SIZE + " คำ น้อยไป");
  assert.strictEqual(TH.inDict("ไม้"), true);
  assert.strictEqual(TH.inDict("ทะเล"), true);
});

// ---------- ทดสอบเป็นชุดยาวเหมือนเล่นจริง ----------

test("จำลองเล่นจริง: คำที่ผ่านต้องผ่าน คำที่ชนต้องโดนจับ", () => {
  const used = [];
  const shouldPass = ["ทะเล", "ปลา", "ตลาด", "เงิน"];
  for (const w of shouldPass) {
    const r = TH.checkRepeat(w, used);
    assert.strictEqual(r.repeat, false, w + " ควรผ่าน แต่โดนจับว่า " + r.reason);
    used.push(w);
  }

  // ทะเล ออกไปแล้ว ทะเลสาบ ต้องโดน
  assert.strictEqual(TH.checkRepeat("ทะเลสาบ", used).repeat, true);
  // ปลา ออกไปแล้ว ปลาดุก ต้องโดน
  assert.strictEqual(TH.checkRepeat("ปลาดุก", used).repeat, true);
});

test("พจนานุกรมต้องเป็นคำมูลล้วน ไม่มีคำประสมหลงเหลือ", () => {
  // ถ้าวันหลังมีคนเผลอใส่คำประสมลงไป เทสต์นี้จะจับได้
  // (คำประสมที่ตัดออกเป็นชิ้นย่อยได้ ต้องถูกกรองออกจากพจนานุกรมแล้ว)
  const compounds = [
    ["ต้นไม้", 2], ["ใบไม้", 2], ["ดอกไม้", 2], ["หัวใจ", 2],
    ["โรงเรียน", 2], ["ความรัก", 2], ["น้ำตก", 2], ["ทะเลสาบ", 2]
  ];
  for (const [word, minParts] of compounds) {
    const parts = TH.segment(word);
    assert.ok(
      parts.length >= minParts,
      'คำว่า "' + word + '" ควรแตกได้ ' + minParts + " ชิ้น แต่ได้ " + JSON.stringify(parts) +
      " — แปลว่ามีคำประสมหลงอยู่ในพจนานุกรม หรือคำมูลบางตัวหายไป"
    );
  }
});

test("ชุดคำที่ควรผ่านทั้งหมด ต้องไม่จับผิดกันเอง (กัน false positive)", () => {
  const distinct = ["ทะเล", "ภูเขา", "รถ", "หมา", "ข้าว", "ครู", "เงิน", "ฝัน"];
  for (let i = 0; i < distinct.length; i++) {
    const others = distinct.filter((_, j) => j !== i);
    const r = TH.checkRepeat(distinct[i], others);
    assert.strictEqual(r.repeat, false, distinct[i] + " ไม่ควรชนกับใคร แต่ได้ " + r.reason);
  }
});

// ── พจนานุกรมที่ generate มา ──────────────────────────────────────────
// ไฟล์นี้สร้างด้วยสคริปต์ จึงต้องมีเทสคุมคุณภาพไว้
// ไม่งั้นวันหลังใครรัน gen-lexicon.js แล้วได้ของเสียมา จะไม่มีใครรู้
const LEX = require("./lexicon");

test("คำที่ generate มาต้องเป็นอักษรไทยล้วน ไม่มีช่องว่างหรือตัวเลข", () => {
  const bad = LEX.WORDS.filter((w) => !/^[ก-๎]+$/.test(w));
  assert.deepStrictEqual(bad, [], "เจอคำที่ไม่ใช่อักษรไทยล้วน");
});

test("คำที่ generate มาต้องสั้นพอที่จะเป็นคำมูล", () => {
  const tooLong = LEX.WORDS.filter((w) => w.length > 8);
  assert.deepStrictEqual(tooLong, [], "คำยาวเกิน 8 ตัวมักเป็นคำประสม");
});

test("ต้องไม่มีคำซ้ำในไฟล์ที่ generate มา", () => {
  assert.strictEqual(new Set(LEX.WORDS).size, LEX.WORDS.length);
});

test("โหลด lexicon ไม่ได้ ตัวตัดคำต้องยังทำงานด้วยชุดที่คัดเอง", () => {
  const T = require("./thai");
  assert.ok(T.DICT_SIZE >= 200, "ชุดคัดเองต้องยังอยู่ครบ");
  assert.deepStrictEqual(T.segment("ใบไม้"), ["ใบ", "ไม"]);
});
