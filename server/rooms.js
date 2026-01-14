// server/rooms.js
const ROOM_CODE_LEN = 5;

function randomRoomCode(existingSet) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ตัด O/0/I/1 กันงง
  while (true) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingSet.has(code)) return code;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Assign words so that no user gets their own word.
 * users: Map socketId -> { name, word, assigned }
 */
function assignWordsNoSelf(usersMap) {
  const ids = [...usersMap.keys()];
  if (ids.length < 2) throw new Error("Need at least 2 players.");

  const words = ids.map((id) => usersMap.get(id).word);

  if (words.some((w) => !w || !String(w).trim())) {
    throw new Error("All players must submit a word.");
  }

  // ถ้ามีแค่ 2 คน แล้วดันส่งคำเหมือนกัน = มันจะเท่ากับได้คำตัวเอง (เพราะคำตัวเอง == คำอีกคน)
  // ซึ่งเราถือว่า "ห้ามได้คำที่ตัวเองส่ง" -> ต้องตรวจโดยเปรียบเทียบ string
  // วิธีแก้: ถ้า 2 คน คำเหมือนกัน 100% ก็แก้ไม่ได้ ต้องให้เปลี่ยนคำ
  if (ids.length === 2) {
    const a = usersMap.get(ids[0]).word.trim();
    const b = usersMap.get(ids[1]).word.trim();
    if (a === b) throw new Error("With 2 players, words must be different.");
  }

  // สุ่มคำให้เป็น permutation ที่ไม่มี fixed point (derangement แบบง่าย)
  // ทำหลายรอบจนกว่าจะไม่ชนตัวเอง (สำหรับคนไม่เยอะๆ โคตรพอ)
  const maxTry = 200;
  for (let attempt = 0; attempt < maxTry; attempt++) {
    const perm = shuffle([...words]);
    let ok = true;

    for (let i = 0; i < ids.length; i++) {
      const myWord = String(usersMap.get(ids[i]).word).trim();
      const gotWord = String(perm[i]).trim();
      if (myWord === gotWord) {
        ok = false;
        break;
      }
    }

    if (ok) {
      for (let i = 0; i < ids.length; i++) {
        usersMap.get(ids[i]).assigned = perm[i];
      }
      return;
    }
  }

  throw new Error("Cannot assign words without self-match. Try different words.");
}

module.exports = {
  randomRoomCode,
  assignWordsNoSelf
};
