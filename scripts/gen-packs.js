#!/usr/bin/env node
// scripts/gen-packs.js — ขยายคลังเนื้อหาของ Spyfall และเกมทายของด้วย Gemini
//
// รันครั้งเดียวแล้ว commit ผลลัพธ์ ตอนเล่นจริงไม่ยิง API เลย
//   node --env-file=.env scripts/gen-packs.js spyfall
//   node --env-file=.env scripts/gen-packs.js guess
//   node --env-file=.env scripts/gen-packs.js all
//
// รันซ้ำได้เรื่อยๆ ของเดิมไม่หาย ระบบเช็คซ้ำให้ทั้งกับของที่คัดเองและของที่เคย generate
"use strict";

const fs = require("fs");
const path = require("path");
const { generateJson, hasKey } = require("../server/ai/gemini");

const ROOT = path.join(__dirname, "..");
const SPYFALL_OUT = path.join(ROOT, "server", "games", "spyfall", "locations-extra.js");
const GUESS_OUT = path.join(ROOT, "server", "games", "guess", "words-extra.js");

const ROLES_PER_LOCATION = 7;   // ต้นฉบับ Spyfall ใช้ 7 บทบาทต่อสถานที่

// ---------- Spyfall ----------

const SPYFALL_THEMES = [
  "ที่ที่คนไทยไปกันบ่อยในชีวิตประจำวัน",
  "ร้านอาหารและร้านค้าแบบไทย",
  "สถานที่ราชการและบริการสาธารณะ",
  "ที่เที่ยวและสถานที่พักผ่อนในไทย",
  "ที่ทำงานและโรงงาน",
  "สถานที่เกี่ยวกับการเดินทางและขนส่ง",
  "โรงเรียน มหาวิทยาลัย สถานที่เรียน",
  "งานเทศกาลและงานประเพณีไทย"
];

const SPYFALL_SCHEMA = {
  type: "object",
  properties: {
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          roles: { type: "array", items: { type: "string" } }
        },
        required: ["name", "roles"]
      }
    }
  },
  required: ["locations"]
};

function spyfallPrompt(theme, n, avoid) {
  return [
    "ออกแบบสถานที่สำหรับบอร์ดเกม Spyfall ธีม \"" + theme + "\" จำนวน " + n + " แห่ง",
    "แต่ละแห่งต้องมีบทบาทคนที่อยู่ที่นั่น " + ROLES_PER_LOCATION + " บทบาทพอดี",
    "",
    "เงื่อนไขสำคัญ:",
    "- คนไทยทั่วไปต้องนึกภาพออกทันที ไม่งั้นถามตอบไม่ได้ เกมตาย",
    "- บทบาทต้องต่างกันชัดเจน และเป็นคนที่อยู่ที่นั่นได้จริง",
    "- ชื่อสถานที่สั้น กระชับ ไม่ต้องมีคำอธิบาย",
    "- ห้ามใช้ชื่อยี่ห้อหรือชื่อเฉพาะ",
    "",
    "ห้ามซ้ำกับสถานที่เหล่านี้:",
    avoid.join(", ")
  ].join("\n");
}

// ---------- เกมทายของ ----------

const GUESS_SCHEMA = {
  type: "object",
  properties: {
    common: { type: "array", items: { type: "string" } },
    rare: { type: "array", items: { type: "string" } }
  },
  required: ["common", "rare"]
};

function guessPrompt(pack, n, avoid) {
  return [
    "ให้คำสำหรับเกมทายของ 20 คำถาม หมวด \"" + pack.name + "\" (กลุ่ม" + pack.group + ")",
    "",
    "common: สิ่งที่คนไทยทั่วไปรู้จักแน่ๆ " + n + " คำ",
    "rare: สิ่งที่มีอยู่จริงแต่คนรู้จักน้อยกว่า " + Math.ceil(n / 2) + " คำ",
    "",
    "เงื่อนไขสำคัญ:",
    "- ทั้งวงต้องรู้จักพอกัน ไม่งั้นคนตอบก็ตอบไม่ได้ เกมค้าง",
    "- เป็นสิ่งที่ถามด้วยคำถามใช่/ไม่ใช่แล้วแยกออกได้",
    "- ห้ามชื่อยี่ห้อ ชื่อคน ชื่อเฉพาะ",
    "- คำเดียวหรือสองคำสั้นๆ",
    "",
    "ห้ามซ้ำกับคำเหล่านี้:",
    avoid.join(", ")
  ].join("\n");
}

// ---------- ตัวช่วยเขียนไฟล์ ----------

function writeSpyfall(locations) {
  const body = locations
    .map((l) => "    { name: " + JSON.stringify(l.name) + ", roles: " + JSON.stringify(l.roles) + " }")
    .join(",\n");

  const src = [
    "// server/games/spyfall/locations-extra.js — สถานที่เพิ่มเติม (สร้างด้วยสคริปต์)",
    "// generate จาก scripts/gen-packs.js ไม่ต้องแก้ด้วยมือ",
    "//",
    "// จำนวนสถานที่: " + locations.length,
    "(function (root, factory) {",
    "  if (typeof module === \"object\" && module.exports) module.exports = factory();",
    "  else root.SpyfallExtra = factory();",
    "})(typeof self !== \"undefined\" ? self : this, function () {",
    "  \"use strict\";",
    "",
    "  var LOCATIONS = [",
    body,
    "  ];",
    "",
    "  return { LOCATIONS: LOCATIONS };",
    "});",
    ""
  ].join("\n");

  fs.writeFileSync(SPYFALL_OUT, src);
}

function writeGuess(byPack) {
  const body = Object.keys(byPack).sort().map((id) => {
    const p = byPack[id];
    return "    " + JSON.stringify(id) + ": {\n" +
           "      common: " + JSON.stringify(p.common) + ",\n" +
           "      rare: " + JSON.stringify(p.rare) + "\n" +
           "    }";
  }).join(",\n");

  const total = Object.keys(byPack)
    .reduce((n, id) => n + byPack[id].common.length + byPack[id].rare.length, 0);

  const src = [
    "// server/games/guess/words-extra.js — คำเพิ่มเติมของเกมทายของ (สร้างด้วยสคริปต์)",
    "// generate จาก scripts/gen-packs.js ไม่ต้องแก้ด้วยมือ",
    "// รูปแบบ: { packId: { common: [...], rare: [...] } }",
    "//",
    "// จำนวนคำ: " + total,
    "(function (root, factory) {",
    "  if (typeof module === \"object\" && module.exports) module.exports = factory();",
    "  else root.GuessWordsExtra = factory();",
    "})(typeof self !== \"undefined\" ? self : this, function () {",
    "  \"use strict\";",
    "",
    "  var BY_PACK = {",
    body,
    "  };",
    "",
    "  return { BY_PACK: BY_PACK };",
    "});",
    ""
  ].join("\n");

  fs.writeFileSync(GUESS_OUT, src);
}

function fresh(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

// ---------- งานหลัก ----------

async function genSpyfall(perTheme) {
  // อ่านของที่มีอยู่ทั้งหมด (ทั้งที่คัดเองและที่เคย generate) เพื่อกันซ้ำ
  const existing = fresh("../server/games/spyfall/locations");
  const known = new Set(existing.allLocations().map((l) => l.name));
  const out = fresh(SPYFALL_OUT).LOCATIONS.slice();
  const startCount = out.length;

  console.log("Spyfall — มีอยู่แล้ว " + known.size + " แห่ง · " + SPYFALL_THEMES.length + " ธีม\n");

  for (const theme of SPYFALL_THEMES) {
    process.stdout.write("  " + theme + " ... ");
    try {
      const res = await generateJson({
        prompt: spyfallPrompt(theme, perTheme, [...known].slice(-60)),
        schema: SPYFALL_SCHEMA,
        maxOutputTokens: 4096,
        temperature: 1.0
      });

      let added = 0;
      for (const loc of res.locations || []) {
        const name = String(loc.name || "").trim();
        const roles = (loc.roles || []).map((r) => String(r).trim()).filter(Boolean);
        // ต้องครบ 7 บทบาทพอดี ไม่งั้นเกมเสียสมดุล
        if (!name || roles.length !== ROLES_PER_LOCATION) continue;
        if (known.has(name)) continue;
        known.add(name);
        out.push({ name: name, roles: roles });
        added++;
      }
      console.log("+" + added);
    } catch (err) {
      console.log("ข้าม (" + (err.code || err.message) + ")");
    }
  }

  writeSpyfall(out);
  const after = fresh("../server/games/spyfall/locations");
  console.log("\nไฟล์ generate: " + out.length + " แห่ง (เพิ่ม " + (out.length - startCount) + ")");
  console.log("รวมในเกมจริง: " + after.totalLocations() + " แห่ง\n");
}

async function genGuess(perPack) {
  const words = fresh("../server/games/guess/words");
  const out = fresh(GUESS_OUT).BY_PACK;
  const startTotal = words.totalWords();

  console.log("เกมทายของ — มีอยู่แล้ว " + startTotal + " คำ · " + words.PACKS.length + " หมวด\n");

  for (const pack of words.PACKS) {
    process.stdout.write("  " + pack.name + " ... ");
    const known = new Set(pack.common.concat(pack.rare));
    try {
      const res = await generateJson({
        prompt: guessPrompt(pack, perPack, [...known].slice(-50)),
        schema: GUESS_SCHEMA,
        maxOutputTokens: 2048,
        temperature: 1.0
      });

      const slot = out[pack.id] || (out[pack.id] = { common: [], rare: [] });
      let added = 0;
      for (const lv of ["common", "rare"]) {
        for (const w of res[lv] || []) {
          const s = String(w).trim();
          if (!s || s.length > 25 || known.has(s)) continue;
          known.add(s);
          slot[lv].push(s);
          added++;
        }
      }
      console.log("+" + added);
    } catch (err) {
      console.log("ข้าม (" + (err.code || err.message) + ")");
    }
  }

  writeGuess(out);
  const after = fresh("../server/games/guess/words");
  console.log("\nรวมในเกมจริง: " + after.totalWords() + " คำ (เพิ่ม " + (after.totalWords() - startTotal) + ")\n");
}

async function main() {
  if (!hasKey()) {
    console.error("ไม่พบ GEMINI_API_KEY");
    console.error("  cp .env.example .env  แล้วใส่ key ลงไป");
    console.error("  node --env-file=.env scripts/gen-packs.js all");
    process.exit(1);
  }

  const what = process.argv[2] || "all";
  if (what === "spyfall" || what === "all") await genSpyfall(8);
  if (what === "guess" || what === "all") await genGuess(20);

  console.log("รัน npm test แล้ว commit ไฟล์ *-extra.js ได้เลย");
}

main().catch((err) => { console.error(err); process.exit(1); });
