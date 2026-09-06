// server/ai/gemini.js — ตัวเรียก Gemini API ตัวเดียวของทั้งโปรเจค
//
// ใช้ร่วมกันทั้งฝั่ง runtime (กรรมการ AI, คู่ต่อสู้ AI) และสคริปต์ตอน build
// คุมค่าใช้จ่ายด้วย 3 อย่าง: บังคับ JSON schema, จำกัด maxOutputTokens, ตั้ง timeout
//
// key อยู่ใน process.env เท่านั้น ห้ามหลุดไปฝั่ง public/ เด็ดขาด
"use strict";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// flash-lite ถูกสุดและเร็วพอสำหรับงานตัดสิน/ตอบสั้น
// งาน generate เนื้อหาเยอะๆ ค่อยสั่ง model อื่นตอนเรียก
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

/** มี key ให้ใช้ไหม — ไม่มีก็ต้องปิดฟีเจอร์ AI ทิ้ง ไม่ใช่ปล่อยพัง */
function hasKey() {
  return !!process.env.GEMINI_API_KEY;
}

class GeminiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GeminiError";
    this.code = code;   // no_key | http | timeout | bad_json | blocked
  }
}

/**
 * ยิง Gemini แล้วคืนค่าเป็น object ตาม schema ที่กำหนด
 * บังคับ responseSchema เสมอ เพื่อไม่ให้โมเดลร่ายยาว เปลือง output token
 */
async function generateJson(options) {
  const opts = options || {};
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("ยังไม่ได้ตั้ง GEMINI_API_KEY", "no_key");
  if (!opts.prompt) throw new GeminiError("ต้องมี prompt", "bad_request");
  if (!opts.schema) throw new GeminiError("ต้องมี schema", "bad_request");

  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs || 12000;

  const body = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: opts.schema,
      maxOutputTokens: opts.maxOutputTokens || 256,
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2
    }
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // key ไปทาง header ไม่ใช่ query string จะได้ไม่ติดไปกับ log/referrer
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ac.signal
    });
  } catch (err) {
    throw new GeminiError(
      err.name === "AbortError" ? "Gemini ตอบช้าเกินไป" : "ต่อ Gemini ไม่ได้",
      err.name === "AbortError" ? "timeout" : "http"
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // ไม่เอา body ของ error มาโชว์ต่อ กันข้อมูลฝั่งผู้ให้บริการหลุดถึงผู้เล่น
    throw new GeminiError(`Gemini ตอบกลับ ${res.status}`, "http");
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Gemini ไม่ได้ส่งเนื้อหากลับมา", "blocked");

  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini ส่ง JSON ที่อ่านไม่ออก", "bad_json");
  }
}

module.exports = { generateJson, hasKey, GeminiError, DEFAULT_MODEL };
