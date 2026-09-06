// server/games/chain/lexicon.js — คำมูลเพิ่มเติมสำหรับตัวตัดคำ (สร้างด้วยสคริปต์)
//
// ไฟล์นี้ generate มาจาก scripts/gen-lexicon.js ไม่ต้องแก้ด้วยมือ
// แยกจาก LEXICON ใน thai.js เพราะอันนั้นเป็นชุดที่คัดเองและอ่านรู้เรื่อง
// ส่วนอันนี้เป็นของเยอะที่เอาไว้เพิ่มความแม่นของการตัดคำ
//
// กติกาของไฟล์นี้: ต้องเป็น "คำมูล" เท่านั้น คำประสมจะถูก composableFrom() คัดออกอยู่แล้ว
// แต่ใส่มาเยอะๆ ก็เปลืองเปล่า จึงกรองตั้งแต่ตอน generate
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChainLexicon = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WORDS = [];

  return { WORDS: WORDS };
});
