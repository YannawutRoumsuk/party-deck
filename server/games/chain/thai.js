// server/games/chain/thai.js — ตัวตรวจคำซ้ำภาษาไทย
//
// โจทย์: ใบไม้ ออกไปแล้ว ต่อมามีคนพูด ต้นไม้ -> "ไม้" ซ้ำ ถือว่าแพ้
// ภาษาไทยเขียนติดกันไม่มีช่องว่าง จึงต้องตัดคำเองก่อนถึงจะเทียบได้
//
// วิธีที่ใช้: ตัดคำด้วยพจนานุกรมแบบ longest-match แล้วเทียบพยางค์ที่ normalize แล้ว
// normalize คือลอกวรรณยุกต์และเครื่องหมายออก เพื่อกันคนเลี่ยงด้วยการเปลี่ยนวรรณยุกต์
// (ไม้ / ไม่ / ไม ถือเป็นรากเดียวกันในเกมนี้)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./lexicon"));
  else root.ThaiWords = factory(root.ChainLexicon);
})(typeof self !== "undefined" ? self : this, function (EXTRA) {
  "use strict";

  // วรรณยุกต์ ไม้ไต่คู้ ทัณฑฆาต นิคหิต — ตัวที่ทำให้คำหน้าตาต่างแต่รากเดียวกัน
  var TONE_MARKS = /[่-๋์ํ๎็]/g;
  var THAI_CHAR = /[฀-๿]/;

  /**
   * ทำให้คำอยู่ในรูปมาตรฐานก่อนเทียบ
   * ตัดวรรณยุกต์ออก ตัดช่องว่าง ตัดอักขระที่ไม่ใช่ตัวอักษร
   */
  function normalize(text) {
    return String(text || "")
      .normalize("NFC")
      .replace(TONE_MARKS, "")
      .replace(/[\s​-‍﻿]/g, "")
      .replace(/[^฀-๿a-zA-Z0-9]/g, "")
      .toLowerCase();
  }

  // พจนานุกรมพยางค์/คำมูลที่ใช้ตัดคำ
  // ไม่ได้ครบทั้งภาษา แต่ครอบคำที่คนเล่นเกมนี้ใช้จริงเป็นส่วนใหญ่
  // เรียงยาวก่อนสั้นตอนใช้งาน เพื่อให้ตัดคำยาวได้ก่อน
  // พจนานุกรม "คำมูล" เท่านั้น ห้ามใส่คำประสม
  // เพราะถ้าใส่ ต้นไม้ ไว้ longest-match จะกลืนทั้งคำ
  // แล้วไม่มีวันเห็นว่ามันแชร์ ไม้ กับ ใบไม้ ซึ่งคือหัวใจของเกมนี้
  // มีตัวกรองอัตโนมัติคอยคัดคำประสมออกอีกชั้น แต่ต้องมีคำมูลครบก่อนถึงจะคัดได้
  var LEXICON = [
    // ธรรมชาติ
    "ไม้", "ต้น", "ใบ", "ดอก", "ผล", "ราก", "กิ่ง", "ป่า", "เขา", "ภู", "ดอย",
    "น้ำ", "ฟ้า", "ดิน", "ลม", "ไฟ", "ฝน", "เมฆ", "ดาว", "แดด", "หิน", "ทราย",
    "โคลน", "หมอก", "ฟอง", "คลื่น", "ทะเล", "สาบ", "ธาร", "ลำ", "ตก", "สาย",
    "ดวง", "อาทิตย์", "จันทร์", "ก้อน", "มหา", "สมุทร", "ชาย", "หาด", "พายุ",
    "แม่", "ท้อง", "ฤดู", "หนาว", "ร้อน", "ฝุ่น", "ควัน", "เงา", "แสง",

    // สัตว์
    "ช้าง", "เสือ", "สิงโต", "หมี", "ลิง", "แมว", "หมา", "สุนัข", "วัว", "ควาย",
    "หมู", "ไก่", "เป็ด", "ห่าน", "นก", "ปลา", "กุ้ง", "ปู", "หอย", "งู", "กบ",
    "เต่า", "ผี", "เสื้อ", "แมลง", "มด", "ผึ้ง", "ยุง", "แมง", "มุม", "จิ้งจก",
    "หนู", "กระต่าย", "ม้า", "แกะ", "แพะ", "ยีราฟ", "ปีก", "หาง", "เขี้ยว",

    // ร่างกาย
    "หัว", "ตา", "หู", "จมูก", "ปาก", "ฟัน", "ลิ้น", "คอ", "แขน", "ขา", "มือ",
    "เท้า", "นิ้ว", "ผม", "หน้า", "หลัง", "อก", "เล็บ", "ผิว", "เลือด", "กระดูก",
    "ฝ่า", "เส้น", "ใจ", "จิต", "สมอง", "ท้อง",

    // บ้าน เมือง ของใช้
    "โรง", "เรียน", "พยาบาล", "แรม", "หนัง", "งาน", "ร้าน", "ค้า", "ตลาด", "สด",
    "วัด", "เมือง", "บ้าน", "เรือน", "ห้อง", "ครัว", "ประตู", "ต่าง", "โต๊ะ",
    "เก้าอี้", "เตียง", "ตู้", "ถ้วย", "ชาม", "จาน", "ช้อน", "แก้ว", "หม้อ",
    "กระทะ", "มีด", "เข็ม", "ถัง", "กล่อง", "ขวด", "ถุง", "ผ้า", "พัด", "โคม",

    // ยานพาหนะ
    "รถ", "ยนต์", "เมล์", "จักร", "ยาน", "บิน", "เรือ", "สะพาน", "ถนน", "ล้อ",
    "เครื่อง", "ราง", "ท่า",

    // อาหาร
    "ข้าว", "สวย", "เหนียว", "ขนม", "ปัง", "แกง", "ต้ม", "ผัด", "ทอด", "ย่าง",
    "นึ่ง", "ยำ", "พริก", "เนื้อ", "นม", "ไข่", "เกลือ", "ตาล", "กระเทียม",
    "หอม", "ผัก", "ก๋วยเตี๋ยว", "ส้ม", "กล้วย", "มะม่วง", "ทุเรียน", "แตง",

    // นามธรรม
    "ความ", "รัก", "สุข", "ทุกข์", "ฝัน", "คิด", "หวัง", "กลัว", "โกรธ", "เศร้า",
    "จริง", "วิญญาณ", "ชีวิต", "เวลา", "อดีต", "อนาคต", "ปัจจุบัน", "บุญ", "กรรม",

    // คน
    "ครอบ", "เพื่อน", "ครู", "หมอ", "ตำรวจ", "ทหาร", "ชาว", "นา", "พ่อ", "ลูก",
    "พี่", "น้อง", "ปู่", "ย่า", "ยาย", "คน", "เด็ก", "นัก", "ผู้", "การ",

    // สี ลักษณะ
    "สี", "แดง", "เขียว", "เหลือง", "ขาว", "ดำ", "เงิน", "ทอง", "ใหญ่", "เล็ก",
    "สูง", "ต่ำ", "ยาว", "สั้น", "หนัก", "เบา", "เย็น", "หวาน", "เปรี้ยว", "เค็ม",
    "เผ็ด", "อ่อน", "แข็ง", "กลม", "แบน",

    // คำประกอบที่พบบ่อย
    "ที่", "ของ", "ตัว", "ชุด", "อัน", "ใบ้", "ช่อง", "หลุม", "รู"
  ];

  /**
   * คำนี้ประกอบขึ้นจากคำอื่นในพจนานุกรมได้ไหม (อย่างน้อย 2 ชิ้น)
   * ใช้ตัดคำประสมออกจากพจนานุกรม เพราะถ้าเก็บ "ต้นไม้" ไว้
   * longest-match จะกลืนทั้งคำ แล้วไม่มีวันเห็นว่ามันแชร์ "ไม้" กับ "ใบไม้"
   */
  function composableFrom(word, dictSet) {
    var n = word.length;
    // reach[i] = ตัดคำถึงตำแหน่ง i ได้ด้วยกี่ชิ้นน้อยสุด (Infinity = ตัดไม่ได้)
    var reach = new Array(n + 1).fill(Infinity);
    reach[0] = 0;

    for (var i = 0; i < n; i++) {
      if (reach[i] === Infinity) continue;
      for (var j = i + 1; j <= n; j++) {
        var piece = word.slice(i, j);
        if (piece === word) continue;          // ห้ามใช้ตัวมันเอง
        if (!dictSet[piece]) continue;
        if (reach[i] + 1 < reach[j]) reach[j] = reach[i] + 1;
      }
    }
    return reach[n] >= 2 && reach[n] !== Infinity;
  }

  // พจนานุกรมต้องมีแต่ "คำมูล" เท่านั้น คำประสมถูกคัดออกอัตโนมัติ
  // จะได้ไม่ต้องมานั่งไล่ดูเองว่าคำไหนประสม แล้วพลาดตอนเพิ่มคำใหม่
  // ชุดที่คัดเองมาก่อนเสมอ ของที่ generate มาต่อท้าย
  // ถ้าโหลด lexicon.js ไม่ได้ (เช่นลืมใส่ script tag) เกมยังเล่นได้ด้วยชุดคัดเอง
  var ALL_WORDS = LEXICON.concat((EXTRA && EXTRA.WORDS) || []);

  var DICT = (function () {
    var seen = Object.create(null);
    var all = [];
    ALL_WORDS.forEach(function (w) {
      var n = normalize(w);
      if (n && !seen[n]) { seen[n] = true; all.push(n); }
    });

    var atomic = all.filter(function (w) { return !composableFrom(w, seen); });
    return atomic.sort(function (a, b) { return b.length - a.length; });
  })();

  var DICT_SET = (function () {
    var s = Object.create(null);
    DICT.forEach(function (w) { s[w] = true; });
    return s;
  })();

  /**
   * ตัดคำแบบ longest-match จากซ้ายไปขวา
   * ส่วนที่ตัดไม่ออกจะคืนกลับมาเป็นก้อนเดียว ไม่ทิ้ง
   * @returns {string[]} พยางค์ที่ normalize แล้ว
   */
  function segment(text) {
    var s = normalize(text);
    if (!s) return [];

    var parts = [];
    var i = 0;
    var unknown = "";

    while (i < s.length) {
      var matched = null;
      for (var d = 0; d < DICT.length; d++) {
        var w = DICT[d];
        if (w.length <= s.length - i && s.substr(i, w.length) === w) { matched = w; break; }
      }

      if (matched) {
        if (unknown) { parts.push(unknown); unknown = ""; }
        parts.push(matched);
        i += matched.length;
      } else {
        unknown += s.charAt(i);
        i += 1;
      }
    }
    if (unknown) parts.push(unknown);
    return parts;
  }

  /**
   * ส่วนย่อยทั้งหมดของคำที่ถือว่า "ถูกใช้ไปแล้ว"
   * รวมทั้งตัวคำเต็มและพยางค์ที่ตัดได้
   */
  function morphemesOf(text) {
    var full = normalize(text);
    if (!full) return [];

    var parts = segment(text);
    var out = Object.create(null);
    out[full] = true;

    // พยางค์เดี่ยวตัวเดียวไม่นับ สั้นเกินจนชนกันมั่วไปหมด
    parts.forEach(function (p) { if (p.length >= 2) out[p] = true; });
    return Object.keys(out);
  }

  /**
   * เทียบคำใหม่กับคำที่ใช้ไปแล้วทั้งหมด
   * @param {string} candidate คำที่เพิ่งพิมพ์มา
   * @param {string[]} usedWords คำที่ออกไปแล้วทั้งหมดในรอบนี้
   * @returns {{repeat:boolean, part?:string, matchedWord?:string, reason?:string}}
   */
  function checkRepeat(candidate, usedWords) {
    var mine = morphemesOf(candidate);
    var myFull = normalize(candidate);
    if (!myFull) return { repeat: false };

    for (var i = 0; i < usedWords.length; i++) {
      var used = usedWords[i];
      var usedFull = normalize(used);
      if (!usedFull) continue;

      // ซ้ำทั้งคำ
      if (usedFull === myFull) {
        return {
          repeat: true, part: usedFull, matchedWord: used,
          reason: 'คำว่า "' + used + '" ออกไปแล้ว'
        };
      }

      var theirs = morphemesOf(used);

      // ซ้ำที่ระดับพยางค์ เช่น ใบไม้ กับ ต้นไม้ ชนกันที่ "ไม้"
      for (var m = 0; m < mine.length; m++) {
        for (var t = 0; t < theirs.length; t++) {
          if (mine[m].length >= 2 && mine[m] === theirs[t]) {
            return {
              repeat: true, part: mine[m], matchedWord: used,
              reason: 'พยางค์ "' + mine[m] + '" เคยใช้ในคำว่า "' + used + '" ไปแล้ว'
            };
          }
        }
      }

      // เผื่อกรณีที่ตัดคำไม่ออกเพราะไม่มีในพจนานุกรม
      // ถ้าคำหนึ่งฝังอยู่ในอีกคำตรงๆ ก็ถือว่าซ้ำ
      var shorter = myFull.length <= usedFull.length ? myFull : usedFull;
      var longer = myFull.length <= usedFull.length ? usedFull : myFull;
      if (shorter.length >= 2 && longer.indexOf(shorter) >= 0) {
        return {
          repeat: true, part: shorter, matchedWord: used,
          reason: '"' + shorter + '" ซ้ำกับคำว่า "' + used + '" ที่ออกไปแล้ว'
        };
      }
    }
    return { repeat: false };
  }

  function isThai(text) {
    return THAI_CHAR.test(String(text || ""));
  }

  return {
    normalize: normalize,
    segment: segment,
    morphemesOf: morphemesOf,
    checkRepeat: checkRepeat,
    isThai: isThai,
    DICT_SIZE: DICT.length,
    inDict: function (w) { return !!DICT_SET[normalize(w)]; }
  };
});
