// server/games/twenty/rules.js — เกม 24 แต้ม
//
// หัวใจคือตัวคำนวณที่บอกได้ว่าเลข 4 ตัวนี้ทำ 24 ได้กี่วิธี
// ใช้เศษส่วนแท้ (numerator/denominator) ไม่ใช่ทศนิยม
// เพราะเฉลยคลาสสิกอย่าง 8/(3-8/3)=24 จะเพี้ยนทันทีถ้าใช้ float
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TwentyRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TARGET = 24;
  var CARD_MIN = 1;
  var CARD_MAX = 13;   // สำรับไพ่ A ถึง K ตามเกมต้นฉบับ

  // ---------- เศษส่วน ----------

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }

  function frac(n, d) {
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  function add(a, b) { return frac(a.n * b.d + b.n * a.d, a.d * b.d); }
  function sub(a, b) { return frac(a.n * b.d - b.n * a.d, a.d * b.d); }
  function mul(a, b) { return frac(a.n * b.n, a.d * b.d); }
  function div(a, b) { return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n); }

  function isTarget(f) { return f.d === 1 && f.n === TARGET; }
  function fracToString(f) { return f.d === 1 ? String(f.n) : f.n + "/" + f.d; }

  // ---------- หาเฉลยทั้งหมด ----------
  //
  // วิธีคิด: หยิบเลขมา 2 ตัวจากกอง รวมกันด้วย + - * / ได้ผลลัพธ์ใหม่
  // แล้ววนซ้ำจนเหลือตัวเดียว ถ้าเท่ากับ 24 ถือว่าเจอเฉลย

  var OPS = [
    { sym: "+", fn: add, commutative: true },
    { sym: "-", fn: sub, commutative: false },
    { sym: "*", fn: mul, commutative: true },
    { sym: "/", fn: div, commutative: false }
  ];

  function combine(items) {
    var results = [];
    for (var i = 0; i < items.length; i++) {
      for (var j = 0; j < items.length; j++) {
        if (i === j) continue;
        // + และ * สลับที่แล้วได้เหมือนเดิม คิดแค่ทางเดียวพอ ไม่งั้นนับซ้ำ
        for (var k = 0; k < OPS.length; k++) {
          var op = OPS[k];
          if (op.commutative && i > j) continue;

          var value = op.fn(items[i].value, items[j].value);
          if (!value) continue;   // หารด้วยศูนย์

          var rest = [];
          for (var m = 0; m < items.length; m++) {
            if (m !== i && m !== j) rest.push(items[m]);
          }
          rest.push({
            value: value,
            expr: "(" + items[i].expr + " " + op.sym + " " + items[j].expr + ")"
          });
          results.push(rest);
        }
      }
    }
    return results;
  }

  function stripOuter(expr) {
    return expr.charAt(0) === "(" && expr.charAt(expr.length - 1) === ")"
      ? expr.slice(1, -1)
      : expr;
  }

  /**
   * @param {number[]} nums เลข 4 ตัว (หรือกี่ตัวก็ได้)
   * @returns {{count:number, solutions:string[]}} เฉลยที่ไม่ซ้ำกัน
   */
  function solve(nums) {
    var start = nums.map(function (n) {
      return { value: frac(n, 1), expr: String(n) };
    });

    var found = Object.create(null);

    (function walk(items) {
      if (items.length === 1) {
        if (isTarget(items[0].value)) found[stripOuter(items[0].expr)] = true;
        return;
      }
      var next = combine(items);
      for (var i = 0; i < next.length; i++) walk(next[i]);
    })(start);

    var solutions = Object.keys(found).sort();
    return { count: solutions.length, solutions: solutions };
  }

  function hasSolution(nums) {
    // เจอเฉลยแรกก็พอ ไม่ต้องไล่ให้ครบ เร็วกว่ามากตอนสุ่มชุดใหม่
    var start = nums.map(function (n) { return { value: frac(n, 1), expr: String(n) }; });

    function walk(items) {
      if (items.length === 1) return isTarget(items[0].value);
      var next = combine(items);
      for (var i = 0; i < next.length; i++) if (walk(next[i])) return true;
      return false;
    }
    return walk(start);
  }

  // ---------- ตรวจคำตอบที่ผู้เล่นพิมพ์มา ----------

  var TOKEN_RE = /\s*(\d+|[-+*/()×÷])\s*/g;

  function tokenize(text) {
    var s = String(text || "").replace(/×/g, "*").replace(/÷/g, "/");
    var tokens = [];
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (/\s/.test(ch)) { i++; continue; }
      if (/\d/.test(ch)) {
        var num = "";
        while (i < s.length && /\d/.test(s.charAt(i))) { num += s.charAt(i); i++; }
        tokens.push({ type: "num", value: parseInt(num, 10) });
        continue;
      }
      if ("+-*/()".indexOf(ch) >= 0) { tokens.push({ type: "op", value: ch }); i++; continue; }
      return { error: 'มีอักขระที่ใช้ไม่ได้: "' + ch + '"' };
    }
    return { tokens: tokens };
  }

  // แยกวิเคราะห์แบบ recursive descent คืนค่าเป็นเศษส่วน
  function parse(tokens) {
    var pos = 0;

    function peek() { return tokens[pos]; }
    function eat() { return tokens[pos++]; }

    function parseExpr() {
      var left = parseTerm();
      if (left.error) return left;
      while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
        var op = eat().value;
        var right = parseTerm();
        if (right.error) return right;
        var v = op === "+" ? add(left.value, right.value) : sub(left.value, right.value);
        left = { value: v };
      }
      return left;
    }

    function parseTerm() {
      var left = parseFactor();
      if (left.error) return left;
      while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
        var op = eat().value;
        var right = parseFactor();
        if (right.error) return right;
        var v = op === "*" ? mul(left.value, right.value) : div(left.value, right.value);
        if (!v) return { error: "มีการหารด้วยศูนย์" };
        left = { value: v };
      }
      return left;
    }

    function parseFactor() {
      var t = peek();
      if (!t) return { error: "สูตรไม่สมบูรณ์" };

      if (t.type === "op" && t.value === "(") {
        eat();
        var inner = parseExpr();
        if (inner.error) return inner;
        var close = eat();
        if (!close || close.value !== ")") return { error: "วงเล็บไม่ครบ" };
        return inner;
      }
      if (t.type === "num") { eat(); return { value: frac(t.value, 1) }; }
      return { error: 'ไม่เข้าใจตรง "' + t.value + '"' };
    }

    var result = parseExpr();
    if (result.error) return result;
    if (pos !== tokens.length) return { error: "สูตรไม่สมบูรณ์ มีส่วนเกินท้ายสูตร" };
    return result;
  }

  /** ตัวเลขที่ใช้ในสูตร ต้องตรงกับที่แจกมาเป๊ะ ใช้ครบทุกตัว ตัวละครั้ง */
  function usesExactly(tokens, cards) {
    var used = tokens.filter(function (t) { return t.type === "num"; }).map(function (t) { return t.value; });
    if (used.length !== cards.length) {
      return { ok: false, reason: "ต้องใช้เลขทั้ง " + cards.length + " ตัว ตัวละครั้งพอดี (ใช้ไป " + used.length + " ตัว)" };
    }
    var pool = cards.slice();
    for (var i = 0; i < used.length; i++) {
      var at = pool.indexOf(used[i]);
      if (at < 0) return { ok: false, reason: "เลข " + used[i] + " ไม่ได้อยู่ในชุดที่แจกมา" };
      pool.splice(at, 1);
    }
    return { ok: true };
  }

  /**
   * ตรวจสูตรที่ผู้เล่นพิมพ์
   * @returns {{ok:boolean, reason?:string, value?:string}}
   */
  function checkExpression(text, cards) {
    var lexed = tokenize(text);
    if (lexed.error) return { ok: false, reason: lexed.error };
    if (!lexed.tokens.length) return { ok: false, reason: "ยังไม่ได้พิมพ์สูตร" };

    var usage = usesExactly(lexed.tokens, cards);
    if (!usage.ok) return usage;

    var parsed = parse(lexed.tokens);
    if (parsed.error) return { ok: false, reason: parsed.error };

    if (!isTarget(parsed.value)) {
      return { ok: false, reason: "สูตรนี้ได้ " + fracToString(parsed.value) + " ไม่ใช่ 24", value: fracToString(parsed.value) };
    }
    return { ok: true, value: "24" };
  }

  // ---------- สุ่มชุดเลข ----------

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * สุ่มชุดที่ "มีเฉลยแน่นอน" — ไม่งั้นผู้เล่นนั่งคิดฟรีทั้งที่ไม่มีทางออก
   * @param {{min,max,minSolutions}} opts
   */
  function dealCards(opts) {
    var o = opts || {};
    var min = o.min || CARD_MIN;
    var max = o.max || CARD_MAX;
    var minSolutions = o.minSolutions || 1;

    for (var attempt = 0; attempt < 3000; attempt++) {
      var cards = [randInt(min, max), randInt(min, max), randInt(min, max), randInt(min, max)];
      if (minSolutions <= 1) {
        if (hasSolution(cards)) return cards;
      } else {
        if (solve(cards).count >= minSolutions) return cards;
      }
    }
    return [4, 6, 2, 3];   // ชุดสำรองที่รู้ว่าทำได้แน่ๆ
  }

  return {
    TARGET: TARGET,
    CARD_MIN: CARD_MIN,
    CARD_MAX: CARD_MAX,
    frac: frac,
    fracToString: fracToString,
    solve: solve,
    hasSolution: hasSolution,
    checkExpression: checkExpression,
    dealCards: dealCards
  };
});
