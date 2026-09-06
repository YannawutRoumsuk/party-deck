#!/usr/bin/env node
// scripts/gen-lexicon.js — ขยายพจนานุกรมคำมูลของเกมคำต้องเชื่อมด้วย Gemini
//
// รันครั้งเดียวแล้ว commit ผลลัพธ์ ตอนเล่นจริงไม่ยิง API เลย
//   node --env-file=.env scripts/gen-lexicon.js
//   node --env-file=.env scripts/gen-lexicon.js --per-batch 120
//
// ทำไมต้องเป็น "คำมูล" เท่านั้น: ตัวตัดคำใช้ longest-match
// ถ้าใส่ "ต้นไม้" เข้าไป มันจะกลืนทั้งคำ แล้วไม่มีวันเห็นว่าแชร์ "ไม้" กับ "ใบไม้"
// ซึ่งคือหัวใจของเกม — thai.js มีตัวกรองคำประสมอยู่แล้ว แต่กรองตั้งแต่ต้นทางประหยัดกว่า
"use strict";

const fs = require("fs");
const path = require("path");
const { generateJson, hasKey } = require("../server/ai/gemini");

const OUT = path.join(__dirname, "..", "server", "games", "chain", "lexicon.js");

// แบ่งเป็นหมวดเพราะขอรวดเดียวโมเดลจะวนซ้ำอยู่ไม่กี่คำ
// หมวดละ 1 ครั้ง = คุมจำนวน call ได้แน่นอน ไม่บานปลาย
const TOPICS = [
  "ธรรมชาติ ภูมิประเทศ ดินฟ้าอากาศ",
  "สัตว์บก สัตว์น้ำ แมลง",
  "พืช ต้นไม้ ผัก ผลไม้",
  "ร่างกายคนและสัตว์",
  "อาหาร เครื่องปรุง ของกิน",
  "ของใช้ในบ้าน เครื่องครัว เฟอร์นิเจอร์",
  "เสื้อผ้า เครื่องแต่งกาย เครื่องประดับ",
  "อาคาร สถานที่ ในเมืองและชนบท",
  "ยานพาหนะ การเดินทาง",
  "เครื่องมือ ช่าง อุปกรณ์",
  "อาชีพ ตำแหน่ง บทบาทของคน",
  "เครือญาติ ความสัมพันธ์",
  "อารมณ์ ความรู้สึก นามธรรม",
  "สี รูปทรง ขนาด ลักษณะ",
  "กริยาที่ใช้บ่อยในชีวิตประจำวัน",
  "เวลา ฤดู ทิศทาง จำนวน",
  "ศาสนา ประเพณี วัฒนธรรมไทย",
  "กีฬา การละเล่น ดนตรี",
  "เรียน หนังสือ เครื่องเขียน",
  "เงิน การค้า ตลาด"
];

const SCHEMA = {
  type: "object",
  properties: { words: { type: "array", items: { type: "string" } } },
  required: ["words"]
};

// คำมูลไทยแทบทั้งหมดสั้น ยาวเกิน 8 ตัวมักเป็นคำประสมหรือคำทับศัพท์
const THAI_ONLY = /^[ก-๎]+$/;

function isUsableWord(w) {
  if (typeof w !== "string") return false;
  const s = w.trim();
  return s.length >= 1 && s.length <= 8 && THAI_ONLY.test(s);
}

function buildPrompt(topic, n) {
  return [
    `ให้คำมูลภาษาไทยหมวด "${topic}" จำนวน ${n} คำ`,
    "",
    "คำมูล = คำที่แยกย่อยเป็นคำที่มีความหมายไม่ได้อีกแล้ว",
    "เอา: หมา แมว ต้น ไม้ น้ำ ตา มือ แดง กิน",
    "ไม่เอา: ต้นไม้ น้ำตา รถไฟ โรงเรียน (คำประสม แยกเป็นคำย่อยได้)",
    "ไม่เอา: คำทับศัพท์ ชื่อเฉพาะ คำหยาบ คำที่มีตัวเลขหรือช่องว่าง",
    "",
    "ตอบเป็นรายการคำล้วน ไม่ต้องอธิบาย ไม่ต้องใส่เลขข้อ"
  ].join("\n");
}

/** อ่านคำที่เคย generate ไว้ เพื่อให้รันซ้ำแล้วสะสมเพิ่ม ไม่ใช่เริ่มใหม่ */
function loadExisting() {
  try {
    delete require.cache[require.resolve(OUT)];
    return require(OUT).WORDS || [];
  } catch {
    return [];
  }
}

function writeLexicon(words) {
  const sorted = words.slice().sort((a, b) => a.localeCompare(b, "th"));
  // ห่อบรรทัดละหลายคำ ไม่งั้นไฟล์ยาวเป็นพันบรรทัด diff อ่านไม่ไหว
  const lines = [];
  for (let i = 0; i < sorted.length; i += 10) {
    lines.push("    " + sorted.slice(i, i + 10).map((w) => JSON.stringify(w)).join(", "));
  }

  const src = `// server/games/chain/lexicon.js — คำมูลเพิ่มเติมสำหรับตัวตัดคำ (สร้างด้วยสคริปต์)
//
// ไฟล์นี้ generate มาจาก scripts/gen-lexicon.js ไม่ต้องแก้ด้วยมือ
// แยกจาก LEXICON ใน thai.js เพราะอันนั้นเป็นชุดที่คัดเองและอ่านรู้เรื่อง
// ส่วนอันนี้เป็นของเยอะที่เอาไว้เพิ่มความแม่นของการตัดคำ
//
// กติกาของไฟล์นี้: ต้องเป็น "คำมูล" เท่านั้น คำประสมจะถูก composableFrom() คัดออกอยู่แล้ว
// แต่ใส่มาเยอะๆ ก็เปลืองเปล่า จึงกรองตั้งแต่ตอน generate
//
// จำนวนคำ: ${sorted.length}
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChainLexicon = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WORDS = [
${lines.join(",\n")}
  ];

  return { WORDS: WORDS };
});
`;
  fs.writeFileSync(OUT, src);
}

async function main() {
  if (!hasKey()) {
    console.error("ไม่พบ GEMINI_API_KEY");
    console.error("  cp .env.example .env  แล้วใส่ key ลงไป");
    console.error("  node --env-file=.env scripts/gen-lexicon.js");
    process.exit(1);
  }

  const perBatch = Number(process.argv[process.argv.indexOf("--per-batch") + 1]) || 100;

  const before = loadExisting();
  const seen = new Set(before);
  const startCount = seen.size;
  let calls = 0, rejected = 0;

  console.log(`เริ่มจาก ${startCount} คำ · ${TOPICS.length} หมวด · หมวดละ ~${perBatch} คำ\n`);

  for (const topic of TOPICS) {
    process.stdout.write(`  ${topic} ... `);
    try {
      const res = await generateJson({
        prompt: buildPrompt(topic, perBatch),
        schema: SCHEMA,
        model: "gemini-2.5-flash",   // งาน generate ใช้ตัวใหญ่กว่า คำหลากหลายกว่าเยอะ
        maxOutputTokens: 4096,
        temperature: 1.0             // ต้องการความหลากหลาย ไม่ใช่คำตอบเดิมทุกครั้ง
      });
      calls++;

      let added = 0;
      for (const w of res.words || []) {
        const s = String(w).trim();
        if (!isUsableWord(s)) { rejected++; continue; }
        if (seen.has(s)) continue;
        seen.add(s);
        added++;
      }
      console.log(`+${added} (รวม ${seen.size})`);
    } catch (err) {
      console.log(`ข้าม (${err.code || err.message})`);
    }
  }

  writeLexicon([...seen]);

  // เช็คผลจริงกับตัวตัดคำ เพราะคำประสมที่หลุดมาจะถูกคัดออกตรงนี้
  delete require.cache[require.resolve("../server/games/chain/thai")];
  delete require.cache[require.resolve(OUT)];
  const TH = require("../server/games/chain/thai");

  console.log(`\nเรียก API ${calls} ครั้ง · ตกเกณฑ์ ${rejected} คำ`);
  console.log(`ไฟล์ผลลัพธ์ ${seen.size} คำ (เพิ่มขึ้น ${seen.size - startCount})`);
  console.log(`พจนานุกรมที่ใช้ตัดคำจริง: ${TH.DICT_SIZE} คำ (คำประสมถูกคัดออกแล้ว)`);
  console.log(`\nรัน npm test แล้ว commit ไฟล์ ${path.relative(process.cwd(), OUT)} ได้เลย`);
}

main().catch((err) => { console.error(err); process.exit(1); });
