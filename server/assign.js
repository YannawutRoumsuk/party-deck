// server/assign.js — แจกคำแบบ "ห้ามใครได้คำที่ตัวเองส่ง"
//
// ทำไมไม่สุ่มมั่วแล้วลองใหม่ไปเรื่อยๆ:
// ถ้ามีคนส่งคำซ้ำกันเยอะ การสุ่มจะหลุดยากมากจนดูเหมือนแฮงก์ แล้วสุดท้ายก็ต้องยอมแพ้
// ทั้งที่จริงๆ อาจมีคำตอบอยู่ จึงใช้วิธีสร้างคำตอบตรงๆ แทน แล้วค่อยใส่ความสุ่มเข้าไป
const crypto = require("crypto");

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function groupByWord(words) {
  const groups = new Map(); // word -> [index, ...]
  words.forEach((w, i) => {
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(i);
  });
  return groups;
}

/**
 * เงื่อนไขที่จะแจกได้จริง: คำใดคำหนึ่งต้องไม่ถูกส่งมาเกินครึ่งวง
 * เพราะทุกคนในกลุ่มนั้นต้องไปรับคำจาก "คนนอกกลุ่ม" ซึ่งมีไม่พอ
 */
function checkFeasible(words) {
  const n = words.length;
  const groups = groupByWord(words);

  let worstWord = null;
  let worstCount = 0;
  for (const [word, idx] of groups) {
    if (idx.length > worstCount) {
      worstCount = idx.length;
      worstWord = word;
    }
  }

  if (groups.size === 1) {
    return { ok: false, reason: "ทุกคนส่งคำเดียวกันหมด ต้องมีอย่างน้อย 2 คำที่ต่างกัน" };
  }
  if (worstCount * 2 > n) {
    return {
      ok: false,
      reason:
        `มีคนส่งคำว่า "${worstWord}" ถึง ${worstCount} คน จาก ${n} คน ` +
        `ซ้ำเกินครึ่งวงแบบนี้แจกยังไงก็ต้องมีคนได้คำตัวเอง ` +
        `ให้เปลี่ยนคำอย่างน้อย ${worstCount * 2 - n} คน`
    };
  }
  return { ok: true };
}

/**
 * เรียงคนให้คนที่ส่งคำเดียวกันอยู่ติดกัน (กลุ่มใหญ่ขึ้นก่อน)
 * แล้วหมุนไป maxCount ช่อง — ระยะหมุนกว้างกว่าความยาวของทุกกลุ่ม
 * จึงการันตีว่าไม่มีใครวนกลับมาเจอคำของกลุ่มตัวเอง
 */
function buildAssignment(words) {
  const groups = [...groupByWord(words).values()];

  // สุ่มลำดับภายในกลุ่มและลำดับของกลุ่มที่ขนาดเท่ากัน เพื่อไม่ให้ผลซ้ำเดิมทุกรอบ
  const shuffled = shuffle(groups).map((g) => shuffle(g));
  shuffled.sort((a, b) => b.length - a.length);

  const order = shuffled.flat();
  const shift = shuffled[0].length;
  const n = order.length;

  const assigned = new Array(n);
  for (let k = 0; k < n; k++) {
    const receiver = order[k];
    const donor = order[(k + shift) % n];
    assigned[receiver] = words[donor];
  }
  return assigned;
}

/**
 * @param {string[]} words คำที่แต่ละคนส่งมา เรียงตามผู้เล่น
 * @returns {string[]} คำที่แต่ละคนได้รับ เรียงตามผู้เล่น
 * @throws {Error} ถ้าแจกไม่ได้จริงๆ พร้อมบอกว่าต้องแก้อะไร
 */
function derange(words) {
  const feasible = checkFeasible(words);
  if (!feasible.ok) throw new Error(feasible.reason);

  const assigned = buildAssignment(words);

  // กันพลาด: ถ้าโครงสร้างเพี้ยนเมื่อไหร่ ให้ดังตรงนี้ ดีกว่าปล่อยให้คนเห็นคำตัวเอง
  for (let i = 0; i < words.length; i++) {
    if (assigned[i] === words[i]) {
      throw new Error("แจกคำผิดพลาดภายในระบบ กรุณาเริ่มรอบใหม่อีกครั้ง");
    }
  }
  return assigned;
}

module.exports = { derange, checkFeasible, shuffle };
