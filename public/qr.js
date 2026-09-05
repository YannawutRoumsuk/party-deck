// public/qr.js — วาด QR เป็น SVG
//
// ทำไมเป็น SVG ไม่ใช่ canvas: QR ต้องถูกสแกนข้ามโต๊ะ บางทีขึ้นทีวี 55 นิ้ว
// SVG ขยายเท่าไหร่ก็คม ไม่แตกเป็นบล็อกเบลอเหมือน canvas ที่ถูกยืด
//
// พื้นต้องขาว โมดูลต้องดำ ถึงจะสแกนติดชัวร์
// ธีมเว็บมืดก็จริง แต่ QR สีกลับด้าน (ขาวบนดำ) กล้องมือถือหลายรุ่นอ่านไม่ออก
(function (global) {
  "use strict";

  var QUIET_ZONE = 4; // ขอบเงียบ 4 โมดูล ตามสเปก QR ขาดไม่ได้ ไม่งั้นสแกนไม่ติด
  var SVG_NS = "http://www.w3.org/2000/svg";

  function build(text, errorCorrection) {
    // typeNumber 0 = ให้ไลบรารีเลือกขนาดเล็กสุดที่ใส่ข้อความนี้ได้เอง
    var qr = global.qrcode(0, errorCorrection || "M");
    qr.addData(String(text));
    qr.make();
    return qr;
  }

  /**
   * รวมโมดูลที่ติดกันในแนวนอนเป็น path เดียว
   * ถ้าวาดทีละ <rect> จะได้ 800+ element ทำให้ DOM อืดตอนขึ้นจอใหญ่
   */
  function toPathData(qr) {
    var count = qr.getModuleCount();
    var parts = [];

    for (var row = 0; row < count; row++) {
      var runStart = -1;

      for (var col = 0; col <= count; col++) {
        var dark = col < count && qr.isDark(row, col);

        if (dark && runStart < 0) {
          runStart = col;
        } else if (!dark && runStart >= 0) {
          parts.push(
            "M" + (runStart + QUIET_ZONE) + " " + (row + QUIET_ZONE) +
            "h" + (col - runStart) + "v1h-" + (col - runStart) + "z"
          );
          runStart = -1;
        }
      }
    }
    return parts.join("");
  }

  /**
   * วาด QR ลงใน container (ล้างของเดิมทิ้งก่อน)
   * @returns {number} จำนวนโมดูลด้านหนึ่ง หรือ 0 ถ้าวาดไม่ได้
   */
  function render(container, text, options) {
    if (!container) return 0;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!global.qrcode) {
      container.textContent = "โหลดตัวสร้าง QR ไม่สำเร็จ";
      return 0;
    }

    var opts = options || {};
    var qr;
    try {
      qr = build(text, opts.errorCorrection);
    } catch (e) {
      // ข้อความยาวเกินความจุ QR
      container.textContent = "สร้าง QR ไม่ได้";
      return 0;
    }

    var count = qr.getModuleCount();
    var size = count + QUIET_ZONE * 2;

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label || "QR code สำหรับเข้าห้อง");

    var bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("width", size);
    bg.setAttribute("height", size);
    bg.setAttribute("fill", "#ffffff");
    svg.appendChild(bg);

    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", toPathData(qr));
    path.setAttribute("fill", "#000000");
    svg.appendChild(path);

    container.appendChild(svg);
    return count;
  }

  global.FWQr = { render: render };
})(window);
