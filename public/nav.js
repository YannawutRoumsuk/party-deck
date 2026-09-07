// public/nav.js — แถบนำทางด้านบน (mount เองทุกหน้า)
//
// เป็น pill ลอยอยู่บนสุด ตามภาพอ้างอิงที่ผู้ใช้ส่งมา
// สร้างด้วย JS เพื่อไม่ต้องไปแก้ markup ซ้ำใน 8 ไฟล์ และแก้ที่เดียวได้ทั้งเว็บ
//
// ต้องสร้าง #themeSlot ให้เสร็จก่อนที่ theme.js จะ mount ปุ่ม
// theme.js จึงเลื่อนการ mount ไปหลัง tick ปัจจุบัน (setTimeout 0)
(function (global) {
  "use strict";

  // หน้าไหนไม่ควรมีแถบนำทาง — จอฉายต้องเต็มจอไม่มีอะไรบัง
  var SKIP = ["/stream.html"];

  function build() {
    var nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.id = "siteNav";
    nav.setAttribute("aria-label", "แถบนำทางหลัก");

    var inner = document.createElement("div");
    inner.className = "site-nav-inner";

    var home = document.createElement("a");
    home.className = "site-nav-brand";
    home.href = "/";
    var dot = document.createElement("span");
    dot.className = "site-nav-dot";
    dot.setAttribute("aria-hidden", "true");
    home.appendChild(dot);
    home.appendChild(document.createTextNode("Party Deck"));

    var spacer = document.createElement("span");
    spacer.className = "grow";

    var slot = document.createElement("div");
    slot.id = "themeSlot";

    inner.appendChild(home);
    inner.appendChild(spacer);

    // หน้าแรกไม่ต้องมีลิงก์ "เกมอื่น" เพราะตัวเองคือหน้ารวมเกมอยู่แล้ว
    if (location.pathname !== "/" && location.pathname !== "/index.html") {
      var back = document.createElement("a");
      back.className = "site-nav-link";
      back.href = "/";
      back.textContent = "เกมอื่น";
      inner.appendChild(back);
    }

    inner.appendChild(slot);
    nav.appendChild(inner);
    return nav;
  }

  function mount() {
    if (SKIP.indexOf(location.pathname) >= 0) return;
    if (document.getElementById("siteNav")) return;
    document.body.insertBefore(build(), document.body.firstChild);
    document.body.classList.add("has-site-nav");
    if (global.FWTheme && global.FWTheme.mountToggle) global.FWTheme.mountToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})(typeof self !== "undefined" ? self : this);
