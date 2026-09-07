// server/ai/providers.test.js — ตัวแปลงรูปแบบของผู้ให้บริการแต่ละเจ้า
//
// ส่วนนี้เทสได้โดยไม่ต้องมี key เพราะเป็นการแปลงข้อมูลล้วนๆ
// สำคัญมากเพราะ OpenRouter ใช้ API แบบ OpenAI ซึ่งคนละรูปแบบกับ Google
const test = require("node:test");
const assert = require("node:assert");
const P = require("./providers");

const SCHEMA = {
  type: "object",
  properties: { linked: { type: "boolean" }, reason: { type: "string" } },
  required: ["linked", "reason"]
};

const REQ = {
  prompt: "ทะเล กับ เกลือ เชื่อมโยงกันไหม",
  schema: SCHEMA,
  model: "gemini-3.5-flash-lite",
  maxOutputTokens: 200,
  temperature: 0.3
};

// ── Google ───────────────────────────────────────────────────────────

test("google: สร้าง URL และ header ถูกต้อง", () => {
  const r = P.google.buildRequest(REQ, "KEY123");
  assert.ok(r.url.includes("gemini-3.5-flash-lite:generateContent"));
  assert.strictEqual(r.headers["x-goog-api-key"], "KEY123");
  // key ต้องไม่ไปโผล่ใน URL เพราะติดไปกับ log/referrer ได้
  assert.ok(!r.url.includes("KEY123"), "key ต้องไม่อยู่ใน URL");
});

test("google: ใช้ responseSchema ตามรูปแบบของ Google", () => {
  const r = P.google.buildRequest(REQ, "K");
  assert.deepStrictEqual(r.body.generationConfig.responseSchema, SCHEMA);
  assert.strictEqual(r.body.generationConfig.responseMimeType, "application/json");
  assert.strictEqual(r.body.generationConfig.maxOutputTokens, 200);
  assert.strictEqual(r.body.generationConfig.temperature, 0.3);
});

test("google: อ่านข้อความจาก candidates", () => {
  const text = P.google.extractText({
    candidates: [{ content: { parts: [{ text: '{"linked":true}' }] } }]
  });
  assert.strictEqual(text, '{"linked":true}');
});

test("google: ไม่มีเนื้อหากลับมา คืน null ไม่ใช่พัง", () => {
  assert.strictEqual(P.google.extractText({}), null);
  assert.strictEqual(P.google.extractText({ candidates: [] }), null);
});

// ── OpenRouter ───────────────────────────────────────────────────────

test("openrouter: ใส่ prefix google/ ให้ชื่อโมเดล", () => {
  const r = P.openrouter.buildRequest(REQ, "K");
  assert.strictEqual(r.body.model, "google/gemini-3.5-flash-lite");
});

test("openrouter: ชื่อโมเดลที่มี prefix อยู่แล้ว ไม่ใส่ซ้ำ", () => {
  const r = P.openrouter.buildRequest({ ...REQ, model: "google/gemini-3.5-flash-lite" }, "K");
  assert.strictEqual(r.body.model, "google/gemini-3.5-flash-lite");
});

test("openrouter: ใช้ Bearer token ไม่ใช่ x-goog-api-key", () => {
  const r = P.openrouter.buildRequest(REQ, "KEY123");
  assert.strictEqual(r.headers.authorization, "Bearer KEY123");
  assert.ok(!r.headers["x-goog-api-key"]);
  assert.ok(!r.url.includes("KEY123"), "key ต้องไม่อยู่ใน URL");
});

test("openrouter: แปลง schema เป็นรูปแบบ json_schema ของ OpenAI", () => {
  const r = P.openrouter.buildRequest(REQ, "K");
  const rf = r.body.response_format;
  assert.strictEqual(rf.type, "json_schema");
  assert.strictEqual(rf.json_schema.strict, true);
  assert.deepStrictEqual(rf.json_schema.schema.properties, SCHEMA.properties);
});

test("openrouter: strict mode ต้องมี additionalProperties:false ทุกชั้น", () => {
  const nested = {
    type: "object",
    properties: {
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"]
        }
      }
    },
    required: ["locations"]
  };
  const r = P.openrouter.buildRequest({ ...REQ, schema: nested }, "K");
  const s = r.body.response_format.json_schema.schema;
  assert.strictEqual(s.additionalProperties, false, "ชั้นนอกต้องมี");
  assert.strictEqual(
    s.properties.locations.items.additionalProperties, false,
    "object ที่ซ้อนใน array ก็ต้องมี ไม่งั้น OpenAI strict mode ปฏิเสธ"
  );
});

test("openrouter: ไม่แก้ schema ต้นฉบับที่ผู้เรียกส่งมา", () => {
  const original = JSON.parse(JSON.stringify(SCHEMA));
  P.openrouter.buildRequest(REQ, "K");
  assert.deepStrictEqual(SCHEMA, original, "ต้องไม่ mutate ของเดิม");
});

test("openrouter: ใช้ max_tokens ไม่ใช่ maxOutputTokens", () => {
  const r = P.openrouter.buildRequest(REQ, "K");
  assert.strictEqual(r.body.max_tokens, 200);
  assert.strictEqual(r.body.generationConfig, undefined);
});

test("openrouter: อ่านข้อความจาก choices", () => {
  const text = P.openrouter.extractText({
    choices: [{ message: { content: '{"linked":true}' } }]
  });
  assert.strictEqual(text, '{"linked":true}');
});

test("openrouter: ไม่มีเนื้อหากลับมา คืน null", () => {
  assert.strictEqual(P.openrouter.extractText({}), null);
  assert.strictEqual(P.openrouter.extractText({ choices: [] }), null);
});

test("openrouter: systemInstruction กลายเป็น message บทบาท system", () => {
  const r = P.openrouter.buildRequest({ ...REQ, systemInstruction: "คุณเป็นกรรมการ" }, "K");
  assert.strictEqual(r.body.messages[0].role, "system");
  assert.strictEqual(r.body.messages[0].content, "คุณเป็นกรรมการ");
  assert.strictEqual(r.body.messages[1].role, "user");
});

// ── ทั้งสองเจ้าต้องมีหน้าตาเหมือนกัน ────────────────────────────────

test("ทุกเจ้าต้องมีครบทุกฟังก์ชันที่ตัวเรียกต้องใช้", () => {
  for (const name of Object.keys(P)) {
    if (name === "ORDER" || name === "toStrictSchema") continue;
    const p = P[name];
    assert.strictEqual(typeof p.buildRequest, "function", `${name}.buildRequest`);
    assert.strictEqual(typeof p.extractText, "function", `${name}.extractText`);
    assert.strictEqual(typeof p.envKey, "string", `${name}.envKey`);
    assert.strictEqual(typeof p.label, "string", `${name}.label`);
  }
});

test("ลำดับการเลือกเจ้า: Google ก่อนเพราะมี free tier", () => {
  assert.deepStrictEqual(P.ORDER, ["google", "openrouter"]);
});
