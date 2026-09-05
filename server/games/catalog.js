// server/games/catalog.js — ทะเบียนเกมทั้งหมดในเว็บ
//
// ที่เดียวที่รู้ว่ามีเกมอะไรบ้าง หน้า hub อ่านจากที่นี่
// เพิ่มเกมใหม่ = เพิ่มรายการที่นี่ที่เดียว ไม่ต้องไปแก้ HTML
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameCatalog = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var GAMES = [
    {
      id: "forbidden",
      emoji: "🤐",
      name: "คำต้องห้าม",
      tagline: "หลอกให้เพื่อนพูดคำของตัวเอง",
      players: { min: 3, max: 12, sweet: "4–8 คน" },
      minutes: "10–30 นาที",
      href: "/forbidden.html",
      description:
        "ทุกคนถือคำลับติดตัวคนละคำ แต่มองไม่เห็นของตัวเอง " +
        "หน้าที่คุณคือคุยหลอกให้คนอื่นเผลอพูดคำของเขาออกมา ใครได้ยินก่อนกดจับได้เลย",
      highlights: ["มีจอฉายสำหรับสตรีม", "เน็ตหลุดคะแนนไม่หาย", "QR ชวนเพื่อน"],
      accent: "hot"
    },
    {
      id: "numbers",
      emoji: "🔢",
      name: "ทายเลข",
      tagline: "บีบช่วงให้แคบจนเจอเลขลับ",
      players: { min: 2, max: 2, sweet: "2 คนเท่านั้น" },
      minutes: "5–10 นาที",
      href: "/numbers.html",
      description:
        "ต่างคนต่างเลือกเลขลับ 1–99 แล้วทายเลขของอีกฝ่าย " +
        "ทายผิดระบบบอกสูงไปหรือต่ำไป พร้อมบีบช่วงที่เหลือให้ดู",
      highlights: ["เล่นต่อหน้ากันเครื่องเดียวได้", "ผลัดกันทายหรือทายฝ่ายเดียว"],
      accent: "volt"
    },
    {
      id: "twenty",
      emoji: "➗",
      name: "24 แต้ม",
      tagline: "เอาเลข 4 ตัวมาบวกลบคูณหารให้ได้ 24",
      players: { min: 2, max: 8, sweet: "2–4 คน" },
      minutes: "5–15 นาที",
      href: "/twenty.html",
      description:
        "สุ่มเลขมา 4 ตัว ใครคิดออกก่อนกดปุ่มแล้วพูดออกมาเลย " +
        "ระบบคำนวณไว้ล่วงหน้าแล้วว่าชุดนี้มีกี่วิธี จึงตัดสินได้เองว่าใครถูกใครมั่ว",
      highlights: ["ระบบนับวิธีทั้งหมดให้", "มีระบบกันโกงตอนเถียงกัน"],
      accent: "gold"
    },
    {
      id: "guess-thing",
      emoji: "🐘",
      name: "ทายของ 20 คำถาม",
      tagline: "ถามใช่ไม่ใช่ ให้เดาออกว่าคืออะไร",
      players: { min: 2, max: 8, sweet: "2–4 คน" },
      minutes: "10–20 นาที",
      href: "/guess-thing.html",
      description:
        "ฝ่ายหนึ่งคิดสิ่งของหรือสิ่งมีชีวิตไว้ในใจ อีกฝ่ายผลัดกันถามคำถามที่ตอบได้แค่ใช่หรือไม่ใช่ " +
        "ทายชื่อได้แค่ 3 ครั้ง ใครทายถูกก่อนชนะ",
      highlights: ["มีชุดคำสำเร็จรูปให้เลือก", "มีคำถามแนะนำตอนคิดไม่ออก", "จับเวลาทั้งสองฝั่ง"],
      accent: "hot"
    },
    {
      id: "chain",
      emoji: "🔗",
      name: "คำต้องเชื่อม",
      tagline: "ต่อคำให้เชื่อมกัน ห้ามใช้คำซ้ำ",
      players: { min: 3, max: 10, sweet: "4–8 คน" },
      minutes: "10–25 นาที",
      href: "/chain.html",
      description:
        "ระบบสุ่มคำตั้งต้นมาให้ แล้วผลัดกันพิมพ์คำที่เชื่อมโยงกับคำก่อนหน้าภายใน 10 วินาที " +
        "ใช้คำที่มีพยางค์ซ้ำกับที่เคยออกไปแล้วถือว่าตกรอบ ใครไม่เห็นด้วยกดชาเลนจ์ให้โหวตได้",
      highlights: ["ตรวจคำซ้ำภาษาไทยให้อัตโนมัติ", "ระบบชาเลนจ์และโหวต", "เล่นจนเหลือคนสุดท้าย"],
      accent: "volt"
    }
  ];

  function byId(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  function playersLabel(g) {
    return g.players.min === g.players.max
      ? g.players.min + " คน"
      : g.players.min + "–" + g.players.max + " คน";
  }

  return { GAMES: GAMES, byId: byId, playersLabel: playersLabel };
});
