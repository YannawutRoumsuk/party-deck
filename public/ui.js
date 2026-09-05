// public/ui.js — helper เล็กๆ ที่ทั้งหน้าเกมและจอฉายใช้ร่วมกัน
(function (global) {
  "use strict";

  function $(id) { return document.getElementById(id); }

  // ใช้ textContent ทุกที่ที่เป็นข้อมูลจากผู้เล่น ห้ามต่อสตริงเข้า innerHTML
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtTime(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var m = String(Math.floor(total / 60)).padStart(2, "0");
    var s = String(total % 60).padStart(2, "0");
    return m + ":" + s;
  }

  // นาฬิกาเดินฝั่ง client โดยอิงเวลาสิ้นสุดที่เซิร์ฟเวอร์ส่งมา
  // ทุกคนจึงเห็นเลขตรงกัน แม้เข้าห้องคนละจังหวะ
  function createClock(onTick) {
    var endsAt = null;
    var paused = false;
    var frozenMs = 0;
    var timer = null;

    function emit() {
      if (paused) return onTick(frozenMs, "paused");
      if (endsAt == null) return onTick(null, "idle");
      onTick(Math.max(0, endsAt - Date.now()), "running");
    }

    function start() {
      if (timer) clearInterval(timer);
      timer = setInterval(emit, 200);
      emit();
    }

    return {
      set: function (state) {
        endsAt = state.endsAt || null;
        paused = !!state.paused;
        frozenMs = state.remainingMs || 0;
        start();
      },
      stop: function () {
        endsAt = null;
        paused = false;
        emit();
      }
    };
  }

  function toast(message, kind, ms) {
    var wrap = $("toasts");
    if (!wrap) return;

    var node = el("div", "toast" + (kind ? " " + kind : ""), message);
    wrap.appendChild(node);
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, ms || 3600);
  }

  function copy(text, okMessage) {
    function done() { toast(okMessage || "คัดลอกแล้ว", "good"); }

    if (navigator.clipboard && global.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        toast("คัดลอกไม่สำเร็จ กดค้างที่ลิงก์แล้วก๊อปเองได้เลย", "bad");
      });
      return;
    }
    toast("กดค้างที่ลิงก์แล้วก๊อปได้เลย", "bad");
  }

  global.FWUI = {
    $: $,
    el: el,
    clear: clear,
    fmtTime: fmtTime,
    createClock: createClock,
    toast: toast,
    copy: copy
  };
})(window);
