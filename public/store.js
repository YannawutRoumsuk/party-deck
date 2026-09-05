// public/store.js — ตัวตนผู้เล่นที่อยู่รอดข้ามการรีเฟรช/เน็ตหลุด
//
// เก็บ playerId แยกตามห้อง ใน localStorage
// กลับเข้าลิงก์เดิมแล้วส่ง id นี้ไป เซิร์ฟเวอร์จะคืนคะแนน/สถานะเดิมให้ครบ
(function (global) {
  "use strict";

  var PREFIX = "fw:room:";
  var NAME_KEY = "fw:name";

  // localStorage พังได้จริง (โหมดส่วนตัว / ปิดคุกกี้) อย่าให้ทั้งหน้าล่มเพราะเรื่องนี้
  function safeGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* ไม่เป็นไร เล่นต่อได้ */ }
  }

  function safeRemove(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* เงียบไว้ */ }
  }

  function readSession(roomCode) {
    var raw = safeGet(PREFIX + roomCode);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && parsed.playerId ? parsed : null;
    } catch (e) {
      safeRemove(PREFIX + roomCode);
      return null;
    }
  }

  function writeSession(roomCode, data) {
    safeSet(PREFIX + roomCode, JSON.stringify(data));
    if (data.name) safeSet(NAME_KEY, data.name);
  }

  function clearSession(roomCode) {
    safeRemove(PREFIX + roomCode);
  }

  global.FWStore = {
    readSession: readSession,
    writeSession: writeSession,
    clearSession: clearSession,
    lastName: function () { return safeGet(NAME_KEY) || ""; },
    rememberName: function (name) { safeSet(NAME_KEY, name); }
  };
})(window);
