// server/ai/gemini.js — ตัวเรียกโมเดลตัวเดียวของทั้งโปรเจค
//
// ใช้ร่วมกันทั้งฝั่ง runtime (กรรมการ AI, คู่ต่อสู้ AI) และสคริปต์ตอน build
// คุมค่าใช้จ่ายด้วย 3 อย่าง: บังคับ JSON schema, จำกัด maxOutputTokens, ตั้ง timeout
//
// เข้าถึงโมเดลได้ 2 ทาง ใส่ key ไว้ทั้งคู่ได้:
//   GEMINI_API_KEY      Google AI Studio — มี free tier จึงใช้เป็นตัวหลัก
//   OPENROUTER_API_KEY  OpenRouter — สำรองไว้ตอน Google หมดโควตา
// Google ตอบ 429 เมื่อไหร่ ระบบเด้งไป OpenRouter ให้เองทันที เกมไม่สะดุด
//
// key อยู่ใน process.env เท่านั้น ห้ามหลุดไปฝั่ง public/ เด็ดขาด
"use strict";

const providers = require("./providers");

// flash-lite ถูกสุด เร็วสุด และไม่เผา thinking token
// วัดจริงกับงานในโปรเจคนี้: flash-lite 284 token vs 3.6-flash 1,938 token
// ได้คุณภาพเท่ากันทั้งงานตัดสินและงาน generate เนื้อหา จึงใช้ตัวเดียวทั้งโปรเจค
//
// รุ่น 2.5 ถูกปิดสำหรับ key ใหม่แล้ว (404) ถ้าเจอ 404 อีกให้เช็คว่ารุ่นนี้ยังอยู่ไหม:
//   curl -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Google ตอบ 429 แล้วพักไว้เท่านี้ก่อนลองใหม่ ระหว่างนี้ใช้ OpenRouter แทน
// ถ้าโควตาหมดทั้งวันจริง ก็เสียแค่ 1 ครั้งต่อ 10 นาทีในการลองใหม่ ยอมรับได้
const COOLDOWN_MS = 10 * 60 * 1000;
const cooldownUntil = Object.create(null);

class GeminiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GeminiError";
    this.code = code;   // no_key | http | timeout | bad_json | blocked | bad_request
  }
}

/** เจ้าไหนมี key พร้อมใช้บ้าง เรียงตามลำดับที่ควรลอง */
function availableProviders() {
  const now = Date.now();
  return providers.ORDER
    .filter((name) => !!process.env[providers[name].envKey])
    .filter((name) => !(cooldownUntil[name] > now));
}

/** มี key ให้ใช้ไหม — ไม่มีก็ต้องปิดฟีเจอร์ AI ทิ้ง ไม่ใช่ปล่อยพัง */
function hasKey() {
  return providers.ORDER.some((name) => !!process.env[providers[name].envKey]);
}

/** เจ้าไหนพร้อมใช้บ้าง (ไว้เช็คสถานะ/ดีบัก) */
function status() {
  const now = Date.now();
  return providers.ORDER.map((name) => ({
    name,
    label: providers[name].label,
    hasKey: !!process.env[providers[name].envKey],
    cooldownMs: Math.max(0, (cooldownUntil[name] || 0) - now)
  }));
}

/** ยิงเจ้าเดียว ไม่มี fallback — คืน text ดิบ */
async function callProvider(name, opts) {
  const provider = providers[name];
  const key = process.env[provider.envKey];
  const req = provider.buildRequest(opts, key);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);

  let res;
  try {
    res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: ac.signal
    });
  } catch (err) {
    throw new GeminiError(
      err.name === "AbortError" ? `${provider.label} ตอบช้าเกินไป` : `ต่อ ${provider.label} ไม่ได้`,
      err.name === "AbortError" ? "timeout" : "http"
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 429 = หมดโควตา/ยิงถี่ไป เป็นเคสเดียวที่ควรไปลองเจ้าอื่นต่อ
    // ส่วน 4xx อื่นคือคำขอเราผิดเอง ไปเจ้าไหนก็ผิดเหมือนกัน อย่าเสียเงินซ้ำ
    if (res.status === 429) {
      cooldownUntil[name] = Date.now() + COOLDOWN_MS;
      const e = new GeminiError(`${provider.label} หมดโควตา`, "http");
      e.retryable = true;
      throw e;
    }
    // ไม่เอา body ของ error มาโชว์ต่อ กันข้อมูลฝั่งผู้ให้บริการหลุดถึงผู้เล่น
    throw new GeminiError(`${provider.label} ตอบกลับ ${res.status}`, "http");
  }

  const text = provider.extractText(await res.json());
  if (!text) throw new GeminiError(`${provider.label} ไม่ได้ส่งเนื้อหากลับมา`, "blocked");
  return text;
}

/**
 * ยิงโมเดลแล้วคืนค่าเป็น object ตาม schema ที่กำหนด
 * บังคับ schema เสมอ เพื่อไม่ให้โมเดลร่ายยาว เปลือง output token
 */
async function generateJson(options) {
  const opts = {
    model: DEFAULT_MODEL,
    maxOutputTokens: 256,
    temperature: 0.2,
    timeoutMs: 12000,
    ...(options || {})
  };

  if (!opts.prompt) throw new GeminiError("ต้องมี prompt", "bad_request");
  if (!opts.schema) throw new GeminiError("ต้องมี schema", "bad_request");

  const list = availableProviders();
  if (!list.length) {
    // ทุกเจ้าติด cooldown ก็ยังดีกว่าไม่มี key เลย — ลองเจ้าที่มี key ไปตามเดิม
    const withKey = providers.ORDER.filter((n) => !!process.env[providers[n].envKey]);
    if (!withKey.length) {
      throw new GeminiError("ยังไม่ได้ตั้ง GEMINI_API_KEY หรือ OPENROUTER_API_KEY", "no_key");
    }
    list.push(withKey[0]);
  }

  let lastErr;
  for (const name of list) {
    try {
      const text = await callProvider(name, opts);
      try {
        return JSON.parse(stripFence(text));
      } catch {
        throw new GeminiError("โมเดลส่ง JSON ที่อ่านไม่ออก", "bad_json");
      }
    } catch (err) {
      lastErr = err;
      // ไปเจ้าถัดไปเฉพาะตอนหมดโควตาเท่านั้น เคสอื่นล้มก็คือล้ม
      if (!err.retryable) throw err;
    }
  }
  throw lastErr;
}

/**
 * ลอกคำนำหน้าและ markdown fence ออกก่อน parse
 *
 * ถึงจะสั่งให้ตอบเป็น JSON แล้ว บางครั้งโมเดลก็ยังตอบ
 * "Here is the JSON requested:```json {...}```" มาอยู่ดี (เจอจริงตอนเทส)
 * ถ้าไม่ลอกออกจะ parse ไม่ผ่านทั้งที่ข้อมูลมาครบ
 */
function stripFence(text) {
  const s = String(text).trim();
  // ตัดเอาเฉพาะช่วงตั้งแต่ { หรือ [ ตัวแรก ถึง } หรือ ] ตัวสุดท้าย
  const start = s.search(/[{[]/);
  if (start < 0) return s;
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  return end > start ? s.slice(start, end + 1) : s.slice(start);
}

module.exports = { generateJson, hasKey, status, GeminiError, DEFAULT_MODEL };
