// public/stream.js — จอฉายสำหรับขึ้นทีวี/สตรีม (อ่านอย่างเดียว เห็นคำของทุกคน)
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;

  var params = new URL(window.location.href).searchParams;
  var roomCode = (params.get("room") || "").trim().toUpperCase().slice(0, 5);
  var key = params.get("key") || "";

  $("roomCode").textContent = roomCode || "-----";

  if (!roomCode || !key) {
    $("subtitle").textContent = "ลิงก์ไม่ครบ ขอลิงก์จอฉายจากโฮสต์อีกครั้ง";
    return;
  }

  var socket = io();
  var state = null;

  var clock = FWUI.createClock(function (ms, mode) {
    var node = $("timer");
    if (mode === "idle") {
      node.textContent = "--:--";
      node.className = "stream-timer";
      return;
    }
    node.textContent = FWUI.fmtTime(ms);
    node.className = "stream-timer" + (mode === "running" && ms <= 15000 ? " urgent" : "");
  });

  socket.on("connect", function () {
    socket.emit("watch-room", { roomCode: roomCode, key: key });
  });

  socket.on("watching", function () {
    $("subtitle").textContent = "จอฉาย · คนดูเห็นคำของทุกคน";
  });

  function subtitleFor(s) {
    if (s.round.paused) return "พักรอบชั่วคราว";
    if (s.round.running) return "รอบ " + s.round.number + " กำลังเล่น";
    if (s.round.revealed) return "จบรอบ " + s.round.number + " แล้ว";
    return "รอโฮสต์เริ่มรอบ · " + s.players.length + " คนในห้อง";
  }

  function render() {
    var grid = $("grid");
    clear(grid);

    $("subtitle").textContent = subtitleFor(state);
    $("empty").hidden = state.players.length > 0;

    // เรียงคนที่ยังอยู่ในเกมขึ้นก่อน คนที่ออกแล้วไปท้าย
    var ordered = state.players.slice().sort(function (a, b) {
      if (a.out !== b.out) return a.out ? 1 : -1;
      return b.score - a.score || a.name.localeCompare(b.name);
    });

    ordered.forEach(function (p) {
      var card = el("div", "stream-card" + (p.out ? " is-out" : ""));

      var head = el("div", "spread");
      head.appendChild(el("div", "stream-name", p.name));
      head.appendChild(el("div", "badge", p.score + " แต้ม"));
      card.appendChild(head);

      var live = state.round.running || state.round.revealed;
      if (live && p.playing) {
        card.appendChild(el("div", "stream-word", p.assigned || "-"));
      } else if (live) {
        card.appendChild(el("div", "stream-name", "ไม่ได้เล่นรอบนี้"));
      } else {
        card.appendChild(el("div", "stream-name", p.hasWord ? "ส่งคำแล้ว" : "ยังไม่ส่งคำ"));
      }

      if (p.out && p.outBy) {
        var by = state.players.filter(function (x) { return x.id === p.outBy; })[0];
        if (by) card.appendChild(el("div", "badge badge-out", "โดน " + by.name + " จับ"));
      }

      grid.appendChild(card);
    });
  }

  socket.on("state", function (next) {
    state = next;
    clock.set(next.round);
    render();
  });

  socket.on("called-out", function (data) {
    FWUI.toast(data.callerName + " จับ " + data.targetName + " ได้! “" + data.word + "”", "hot", 6000);
  });

  socket.on("round-started", function (data) {
    FWUI.toast("เริ่มรอบ " + data.number, "hot");
  });

  socket.on("round-ended", function () {
    clock.stop();
    FWUI.toast("จบรอบ", "good", 6000);
  });

  socket.on("error-msg", function (data) {
    $("subtitle").textContent = data.message;
    FWUI.toast(data.message, "bad", 8000);
  });

  socket.on("disconnect", function () {
    $("subtitle").textContent = "เน็ตหลุด กำลังต่อใหม่...";
  });
})();
