// server/config.js — ค่าคงที่ทั้งระบบ รวมไว้ที่เดียวกันแก้ง่าย
module.exports = {
  ROOM_CODE_LEN: 5,
  // ตัด O/0/I/1 ออก กันอ่านผิดตอนบอกรหัสห้องกันปากเปล่า
  CODE_CHARS: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",

  MAX_PLAYERS: 12,
  MAX_NAME_LEN: 24,
  MAX_WORD_LEN: 40,
  MIN_PLAYERS_TO_START: 2,

  // เน็ตหลุดแล้วกลับมาได้ภายในเวลานี้ โดยคะแนน/คำ/สถานะยังอยู่ครบ
  RECONNECT_GRACE_MS: 90_000,
  // ห้องที่ไม่เหลือใครเลย จะถูกลบทิ้งหลังจากนี้
  ROOM_EMPTY_TTL_MS: 5 * 60_000,

  ROUND_MIN_MS: 30_000,
  ROUND_MAX_MS: 900_000,
  ROUND_DEFAULT_MS: 180_000,

  // ช่วงเวลาที่โฮสต์กดยกเลิกการจับผิดได้ (กันกดพลาด/กดมั่ว)
  CALLOUT_UNDO_MS: 20_000
};
