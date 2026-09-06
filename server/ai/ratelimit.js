// server/ai/ratelimit.js — กันคนยิง endpoint ที่ใช้เงินรัวๆ
//
// ทุก request ที่ผ่านไปถึง Gemini คือเงิน endpoint นี้เปิดสาธารณะไม่มีล็อกอิน
// จึงต้องมีเพดานทั้งรายคนและรายวัน ไม่งั้นคืนเดียวโดนยิงจนโควตาหมด
"use strict";

/** ถังโทเคนง่ายๆ เก็บใน memory — พอสำหรับ single instance */
function createLimiter(options) {
  const opts = options || {};
  const max = opts.max || 5;              // กี่ครั้ง
  const windowMs = opts.windowMs || 60000; // ต่อกี่มิลลิวินาที
  const dailyMax = opts.dailyMax || 500;   // เพดานรวมทั้งระบบต่อวัน

  const hits = new Map();   // key -> [timestamp,...]
  let dayCount = 0;
  let dayStart = Date.now();

  function sweep(now) {
    // รีเซ็ตโควตาวันทุก 24 ชม.
    if (now - dayStart > 86400000) { dayCount = 0; dayStart = now; }
    // ทิ้ง key ที่ไม่มี hit ในหน้าต่างแล้ว กัน memory โต
    for (const [k, list] of hits) {
      const live = list.filter((t) => now - t < windowMs);
      if (live.length === 0) hits.delete(k); else hits.set(k, live);
    }
  }

  /** @returns {{ok:boolean, reason?:string, retryAfterMs?:number}} */
  function take(key) {
    const now = Date.now();
    sweep(now);

    if (dayCount >= dailyMax) {
      return { ok: false, reason: "daily", retryAfterMs: 86400000 - (now - dayStart) };
    }

    const list = hits.get(key) || [];
    if (list.length >= max) {
      return { ok: false, reason: "burst", retryAfterMs: windowMs - (now - list[0]) };
    }

    list.push(now);
    hits.set(key, list);
    dayCount++;
    return { ok: true };
  }

  return { take, stats: () => ({ keys: hits.size, dayCount, dailyMax }) };
}

module.exports = { createLimiter };
