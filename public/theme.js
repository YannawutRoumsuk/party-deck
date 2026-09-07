// public/theme.js — สลับโหมดสว่าง/มืด
//
// 3 สถานะ: ตามระบบ (ค่าตั้งต้น) / สว่าง / มืด
// เลือกเองแล้วจำไว้ใน localStorage ไม่งั้นเปิดหน้าใหม่ก็กลับไปตามระบบทุกที
//
// ไฟล์นี้ต้องโหลดแบบ blocking ใน <head> ไม่ใช่ท้าย <body>
// ไม่งั้นหน้าจะแวบเป็นสีผิดก่อนแล้วค่อยเปลี่ยน (flash of wrong theme)
(function (global) {
  "use strict";

  var KEY = "pd:theme";
  var MODES = ["system", "light", "dark"];

  function safeGet() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function safeSet(v) {
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
  }

  function current() {
    var v = safeGet();
    return MODES.indexOf(v) >= 0 ? v : "system";
  }

  /** โหมดที่เห็นจริงบนจอตอนนี้ (แปลง system เป็น light/dark) */
  function effective() {
    var m = current();
    if (m !== "system") return m;
    return global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }

  function apply() {
    var m = current();
    var root = document.documentElement;
    // ตามระบบ = ไม่ต้องมี attribute ปล่อยให้ @media จัดการ
    if (m === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", m);
    return m;
  }

  function set(mode) {
    safeSet(MODES.indexOf(mode) >= 0 && mode !== "system" ? mode : null);
    var m = apply();
    document.dispatchEvent(new CustomEvent("themechange", { detail: { mode: m, effective: effective() } }));
    return m;
  }

  /** วนสว่าง -> มืด -> ตามระบบ */
  function cycle() {
    var order = ["light", "dark", "system"];
    var i = order.indexOf(current());
    return set(order[(i + 1) % order.length]);
  }

  apply();   // ต้องทำทันทีตอนโหลด ก่อนเบราว์เซอร์วาดหน้า

  global.FWTheme = { current: current, effective: effective, set: set, cycle: cycle, apply: apply, MODES: MODES };
})(typeof self !== "undefined" ? self : this);

// ---------- ปุ่มสลับ ----------
//
// mount เองอัตโนมัติ ทุกหน้าจึงได้ปุ่มโดยไม่ต้องแก้ markup ทีละไฟล์
// ถ้าหน้าไหนอยากวางเอง ใส่ <div id="themeSlot"></div> ไว้ตรงที่ต้องการ
(function (global) {
  "use strict";

  var LABEL = { light: "สว่าง", dark: "มืด", system: "ตามระบบ" };
  var ICON  = { light: "☀", dark: "☾", system: "◐" };

  function build() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.id = "themeToggle";

    var icon = document.createElement("span");
    icon.className = "theme-toggle-icon";
    var text = document.createElement("span");
    text.className = "theme-toggle-text";

    btn.appendChild(icon);
    btn.appendChild(text);

    function paint() {
      var m = global.FWTheme.current();
      icon.textContent = ICON[m];
      text.textContent = LABEL[m];
      // อ่านออกด้วยเสียง ไม่ใช่แค่ไอคอนลอยๆ
      btn.setAttribute("aria-label", "ธีมตอนนี้: " + LABEL[m] + " (กดเพื่อเปลี่ยน)");
      btn.setAttribute("title", "ธีม: " + LABEL[m]);
    }

    btn.addEventListener("click", function () {
      global.FWTheme.cycle();
      paint();
    });

    paint();
    return btn;
  }

  function mount() {
    if (document.getElementById("themeToggle")) return;
    var btn = build();
    var slot = document.getElementById("themeSlot");
    if (slot) slot.appendChild(btn);
    else { btn.classList.add("theme-toggle-floating"); document.body.appendChild(btn); }
  }

  // เลื่อนไปหลัง tick ปัจจุบัน เพื่อให้ nav.js ได้สร้าง #themeSlot ก่อน
  // ไม่งั้นปุ่มจะไปลอยมุมจอทั้งที่มีแถบนำทางรออยู่แล้ว
  function mountSoon() { setTimeout(mount, 0); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSoon);
  } else {
    mountSoon();
  }

  global.FWTheme.mountToggle = mount;
})(typeof self !== "undefined" ? self : this);
