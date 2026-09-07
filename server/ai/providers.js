// server/ai/providers.js — ตัวแปลงรูปแบบของผู้ให้บริการแต่ละเจ้า
//
// ใช้โมเดลเดียวกัน (gemini-3.5-flash-lite) แต่เข้าถึงได้ 2 ทาง:
//   google      ยิงตรงที่ Google AI Studio — มี free tier จึงเป็นตัวเลือกแรก
//   openrouter  ยิงผ่าน OpenRouter — จ่ายทุก token แต่ไม่มีโควตารายวันแบบ free tier
//
// สองเจ้านี้ API คนละรูปแบบกันคนละเรื่อง (Google native vs OpenAI-compatible)
// ไฟล์นี้จึงทำหน้าที่เดียวคือแปลง request/response ให้ตัวเรียกเห็นเป็นแบบเดียวกัน
//
// เป็นฟังก์ชันแปลงข้อมูลล้วนๆ ไม่ยิงเน็ตเอง จึงเทสได้ครบโดยไม่ต้องมี key
"use strict";

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenAI strict mode บังคับว่า object ทุกชั้นต้องมี additionalProperties:false
 * และต้องระบุ required ครบทุก property ไม่งั้นปฏิเสธคำขอทั้งอัน
 *
 * Google ไม่ต้องการสิ่งนี้ เราจึงเขียน schema แบบ Google เป็นหลัก
 * แล้วเติมให้ตอนจะส่งไป OpenRouter — คืนของใหม่เสมอ ไม่แตะต้นฉบับ
 */
function toStrictSchema(node) {
  if (!node || typeof node !== "object") return node;

  if (Array.isArray(node)) return node.map(toStrictSchema);

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = toStrictSchema(v);
  }

  if (out.type === "object" && out.properties) {
    out.additionalProperties = false;
    // strict mode ต้องการ required ครบทุก key ที่ประกาศไว้
    out.required = Object.keys(out.properties);
  }
  return out;
}

const google = {
  label: "Google AI Studio",
  envKey: "GEMINI_API_KEY",

  buildRequest(opts, key) {
    const body = {
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: opts.schema,
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature
      }
    };
    if (opts.systemInstruction) {
      body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
    }

    return {
      url: `${GOOGLE_BASE}/${encodeURIComponent(opts.model)}:generateContent`,
      // key ไปทาง header ไม่ใช่ query string จะได้ไม่ติดไปกับ log/referrer
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body
    };
  },

  extractText(data) {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }
};

const openrouter = {
  label: "OpenRouter",
  envKey: "OPENROUTER_API_KEY",

  buildRequest(opts, key) {
    // OpenRouter ตั้งชื่อโมเดลเป็น "ผู้ผลิต/ชื่อรุ่น"
    const model = opts.model.includes("/") ? opts.model : `google/${opts.model}`;

    const messages = [];
    if (opts.systemInstruction) {
      messages.push({ role: "system", content: opts.systemInstruction });
    }
    messages.push({ role: "user", content: opts.prompt });

    return {
      url: OPENROUTER_URL,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        // OpenRouter ใช้สองอันนี้แสดงที่มาของทราฟฟิกในหน้าสถิติ ไม่บังคับ
        "http-referer": "https://github.com/YannawutRoumsuk/party-deck",
        "x-title": "Party Deck"
      },
      body: {
        model,
        messages,
        max_tokens: opts.maxOutputTokens,
        temperature: opts.temperature,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            strict: true,
            schema: toStrictSchema(opts.schema)
          }
        }
      }
    };
  },

  extractText(data) {
    return data?.choices?.[0]?.message?.content ?? null;
  }
};

// Google มาก่อนเพราะมี free tier — หมดโควตาแล้วค่อยเด้งไป OpenRouter ที่เสียเงิน
const ORDER = ["google", "openrouter"];

module.exports = { google, openrouter, ORDER, toStrictSchema };
