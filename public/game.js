// public/game.js — หน้าเล่นเกม
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;

  var roomCode = (new URL(window.location.href).searchParams.get("room") || "")
    .trim().toUpperCase().slice(0, 5);

  if (!roomCode) {
    window.location.href = "/";
    return;
  }

  var session = FWStore.readSession(roomCode) || {};
  var socket = io();
  var state = null;
  var spectatorKey = session.spectatorKey || null;

  $("roomCode").textContent = roomCode;

  // ---------- นาฬิกา ----------

  var clock = FWUI.createClock(function (ms, mode) {
    var node = $("timer");
    if (mode === "idle") {
      node.textContent = "--:--";
      node.className = "timer idle";
      return;
    }
    if (mode === "paused") {
      node.textContent = FWUI.fmtTime(ms);
      node.className = "timer warn";
      return;
    }
    node.textContent = FWUI.fmtTime(ms);
    node.className = "timer" + (ms <= 10000 ? " urgent" : ms <= 30000 ? " warn" : "");
  });

  // ---------- เข้าห้อง ----------

  function askName() {
    var stored = FWStore.lastName();
    var name = window.prompt("ใส่ชื่อของคุณ", stored || "");
    return name ? name.trim().slice(0, 24) : "";
  }

  function join() {
    var name = session.name || FWStore.lastName();
    if (!name) {
      name = askName();
      if (!name) {
        FWUI.toast("ต้องมีชื่อถึงจะเข้าห้องได้", "bad", 6000);
        return;
      }
      FWStore.rememberName(name);
    }
    session.name = name;
    socket.emit("join-room", {
      roomCode: roomCode,
      name: name,
      playerId: session.playerId || null,
      gameType: "forbidden"
    });
  }

  socket.on("connect", join);           // reconnect อัตโนมัติเมื่อเน็ตกลับมา
  socket.on("joined", function (data) {
    session.playerId = data.playerId;
    if (data.spectatorKey) spectatorKey = data.spectatorKey;
    FWStore.writeSession(roomCode, {
      playerId: data.playerId,
      name: session.name,
      spectatorKey: spectatorKey
    });
    if (data.reconnected) FWUI.toast("กลับเข้าห้องแล้ว คะแนนอยู่ครบ", "good");
    renderLinks();
  });

  socket.on("host-granted", function (data) {
    spectatorKey = data.spectatorKey;
    FWStore.writeSession(roomCode, {
      playerId: session.playerId,
      name: session.name,
      spectatorKey: spectatorKey
    });
    FWUI.toast("คุณเป็นโฮสต์แล้ว", "good");
    renderLinks();
  });

  // ---------- ลิงก์ ----------

  var inviteUrl = "";

  function renderLinks() {
    var origin = window.location.origin;
    inviteUrl = origin + "/?room=" + roomCode;
    $("inviteLink").textContent = inviteUrl;
    $("bigCode").textContent = roomCode;

    // วาดครั้งเดียวพอ ลิงก์ห้องไม่เปลี่ยนตลอดอายุห้อง
    if (!$("qrInvite").firstChild) {
      FWQr.render($("qrInvite"), inviteUrl, { label: "QR เข้าห้อง " + roomCode });
    }

    if (spectatorKey) {
      var stream = origin + "/stream.html?room=" + roomCode + "&key=" + encodeURIComponent(spectatorKey);
      $("streamLink").textContent = stream;
      $("openStream").href = stream;
    }
  }

  // ---------- QR เต็มจอ ----------

  function openQr() {
    if (!$("qrBig").firstChild) {
      FWQr.render($("qrBig"), inviteUrl, { label: "QR เข้าห้อง " + roomCode });
    }
    $("qrModalCode").textContent = roomCode;
    $("qrModal").hidden = false;
    $("btnCloseQr").focus();
  }

  function closeQr() {
    $("qrModal").hidden = true;
    $("btnShowQr").focus();
  }

  $("btnShowQr").addEventListener("click", openQr);
  $("btnCloseQr").addEventListener("click", closeQr);

  // แตะที่พื้นหลังก็ปิดได้ แต่แตะที่ตัว QR ต้องไม่ปิด (คนมักจิ้มดูใกล้ๆ)
  $("qrModal").addEventListener("click", function (e) {
    if (e.target === $("qrModal")) closeQr();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("qrModal").hidden) closeQr();
  });

  $("btnCopyInvite").addEventListener("click", function () {
    FWUI.copy($("inviteLink").textContent, "ก๊อปลิงก์ชวนเพื่อนแล้ว");
  });

  $("btnCopyStream").addEventListener("click", function () {
    FWUI.copy($("streamLink").textContent, "ก๊อปลิงก์จอฉายแล้ว");
  });

  // ---------- วาดผู้เล่น ----------

  function playerBadges(p) {
    var wrap = el("div", "badges");

    if (p.id === state.youId) wrap.appendChild(el("span", "badge badge-you", "คุณ"));
    if (p.id === state.hostId) wrap.appendChild(el("span", "badge badge-host", "โฮสต์"));
    if (!p.connected) wrap.appendChild(el("span", "badge badge-off", "หลุด"));

    if (state.round.running || state.round.revealed) {
      if (p.out) {
        var by = state.players.filter(function (x) { return x.id === p.outBy; })[0];
        wrap.appendChild(el("span", "badge badge-out", by ? "โดน " + by.name + " จับ" : "ออก"));
      } else if (p.playing) {
        wrap.appendChild(el("span", "badge badge-ready", "ยังอยู่"));
      }
    } else {
      wrap.appendChild(el("span", "badge" + (p.hasWord ? " badge-ready" : ""), p.hasWord ? "ส่งคำแล้ว" : "ยังไม่ส่งคำ"));
    }

    return wrap;
  }

  function playerWord(p) {
    var isSelf = p.id === state.youId;
    var revealed = state.round.revealed;
    var live = state.round.running || revealed;

    if (!live) return null;
    if (!p.playing) return el("div", "player-word hidden-self", "ไม่ได้เล่นรอบนี้");

    // ระหว่างรอบยังซ่อน แต่พอเฉลยแล้วเจ้าตัวต้องได้เห็น
    if (isSelf && !revealed) {
      return el("div", "player-word hidden-self", "คำของคุณ ซ่อนไว้ตามกติกา");
    }
    return el("div", "player-word" + (revealed ? " revealed" : ""), p.assigned || "-");
  }

  // ---------- การ์ดเฉลย ----------

  function renderReveal() {
    var card = $("revealCard");
    var me = state.players.filter(function (p) { return p.id === state.youId; })[0];

    if (!state.round.revealed || !me || !me.playing) {
      card.hidden = true;
      return;
    }

    $("revealRound").textContent = state.round.number;
    $("revealMyWord").textContent = me.assigned || "-";

    var fate = $("revealMyFate");
    if (me.out) {
      var by = state.players.filter(function (x) { return x.id === me.outBy; })[0];
      fate.className = "badge badge-out";
      fate.textContent = by ? "โดน " + by.name + " จับ" : "โดนจับ";
    } else {
      fate.className = "badge badge-ready";
      fate.textContent = "รอดจนจบรอบ";
    }

    var list = $("revealOthers");
    clear(list);
    state.players.forEach(function (p) {
      if (p.id === state.youId || !p.playing) return;

      var row = el("div", "reveal-row" + (p.out ? " is-out" : ""));
      row.appendChild(el("span", "grow", p.name));
      row.appendChild(el("span", "reveal-row-word", p.assigned || "-"));
      list.appendChild(row);
    });

    card.hidden = false;
  }

  function hostControlsFor(p) {
    var row = el("div", "row");

    var kick = el("button", "mini ghost", "เตะ");
    kick.addEventListener("click", function () {
      if (window.confirm("เตะ " + p.name + " ออกจากห้อง?")) {
        socket.emit("kick-player", { roomCode: roomCode, targetId: p.id });
      }
    });

    var pass = el("button", "mini ghost", "ให้เป็นโฮสต์");
    pass.disabled = !p.connected;
    pass.addEventListener("click", function () {
      if (window.confirm("ยกโฮสต์ให้ " + p.name + "?")) {
        socket.emit("transfer-host", { roomCode: roomCode, targetId: p.id });
      }
    });

    row.appendChild(kick);
    row.appendChild(pass);
    return row;
  }

  function renderPlayers() {
    var wrap = $("players");
    clear(wrap);

    state.players.forEach(function (p) {
      var card = el("div", "player");
      if (p.id === state.youId) card.classList.add("is-you");
      if (p.out) card.classList.add("is-out");
      if (!p.connected) card.classList.add("offline");

      var top = el("div", "player-top");
      top.appendChild(el("div", "player-name", p.name));
      top.appendChild(el("div", "faint", p.score + " แต้ม"));
      card.appendChild(top);

      card.appendChild(playerBadges(p));

      var word = playerWord(p);
      if (word) card.appendChild(word);

      if (state.isHost && p.id !== state.youId) card.appendChild(hostControlsFor(p));

      wrap.appendChild(card);
    });

    $("playerCount").textContent = state.players.length + " คน";
  }

  // ---------- ปุ่มจับผิด ----------

  function renderCallButtons() {
    var bar = $("actionbar");
    var wrap = $("callButtons");
    clear(wrap);

    var me = state.players.filter(function (p) { return p.id === state.youId; })[0];
    var canCall = state.round.running && !state.round.paused && me && me.playing && !me.out;

    if (!canCall) {
      bar.hidden = true;
      return;
    }

    var targets = state.players.filter(function (p) {
      return p.id !== state.youId && p.playing && !p.out;
    });

    if (!targets.length) {
      bar.hidden = true;
      return;
    }

    targets.forEach(function (p) {
      var btn = el("button", "danger grow", "จับ " + p.name);
      btn.addEventListener("click", function () {
        socket.emit("call-out", { roomCode: roomCode, targetId: p.id });
      });
      wrap.appendChild(btn);
    });

    bar.hidden = false;
  }

  // ---------- คะแนน ----------

  function renderScores() {
    var wrap = $("scoreboard");
    clear(wrap);

    var sorted = state.players.slice().sort(function (a, b) {
      return b.score - a.score || a.name.localeCompare(b.name);
    });

    sorted.forEach(function (p, i) {
      var row = el("div", "score-row" + (i < 3 ? " rank-" + (i + 1) : ""));
      row.appendChild(el("div", "score-rank", "#" + (i + 1)));
      row.appendChild(el("div", "grow", p.name + (p.id === state.youId ? " (คุณ)" : "")));

      if (state.round.running && p.roundScore > 0) {
        row.appendChild(el("span", "badge badge-ready", "+" + p.roundScore));
      }
      row.appendChild(el("div", "score-value", p.score));
      wrap.appendChild(row);
    });
  }

  // ---------- โซนโฮสต์ / ส่งคำ ----------

  function renderHostZone() {
    $("hostCard").hidden = !state.isHost;
    if (!state.isHost) return;

    var running = state.round.running;
    $("btnStart").disabled = running;
    $("btnPause").disabled = !running;
    $("btnPause").textContent = state.round.paused ? "เล่นต่อ" : "พัก";
    $("btnEnd").disabled = !running;
    $("btnUndo").disabled = !(state.lastCallout && state.lastCallout.canUndo);
  }

  function renderWordZone() {
    var running = state.round.running;
    $("wordCard").hidden = running;

    var me = state.players.filter(function (p) { return p.id === state.youId; })[0];
    if (!running && me) {
      $("wordStatus").textContent = me.hasWord ? "ส่งแล้ว เปลี่ยนได้จนกว่าจะเริ่มรอบ" : "";
    }

    $("roundLabel").textContent = state.round.number ? "· รอบ " + state.round.number : "";
    $("playerHint").textContent = running
      ? "กดชื่อคนที่เผลอพูดคำตัวเองที่แถบด้านล่าง"
      : "ทุกคนส่งคำแล้ว โฮสต์ถึงจะเริ่มรอบได้";
  }

  function render() {
    if (!state) return;

    var me = state.players.filter(function (p) { return p.id === state.youId; })[0];
    if (me) {
      $("yourName").textContent = me.name;
      if (me.name !== session.name) {
        session.name = me.name;   // ชื่อซ้ำแล้วโดนเติมเลข ให้จำชื่อจริงไว้
        FWStore.writeSession(roomCode, {
          playerId: session.playerId,
          name: me.name,
          spectatorKey: spectatorKey
        });
      }
    }

    renderReveal();
    renderPlayers();
    renderScores();
    renderCallButtons();
    renderHostZone();
    renderWordZone();
  }

  // ---------- socket ----------

  socket.on("state", function (next) {
    state = next;
    clock.set(next.round);
    render();
  });

  socket.on("round-started", function (data) {
    FWUI.toast("เริ่มรอบ " + data.number + " แล้ว!", "hot");
    $("wordInput").value = "";
  });

  socket.on("called-out", function (data) {
    FWUI.toast(data.callerName + " จับ " + data.targetName + " ได้! คำคือ “" + data.word + "”", "hot", 5000);
  });

  socket.on("callout-undone", function (data) {
    FWUI.toast("ยกเลิกการจับ " + data.targetName + " แล้ว", "good");
  });

  socket.on("round-paused", function () { FWUI.toast("พักรอบชั่วคราว"); });
  socket.on("round-resumed", function () { FWUI.toast("เล่นต่อ!", "good"); });

  socket.on("round-ended", function (data) {
    clock.stop();
    var reason = {
      timeup: "หมดเวลา!",
      "last-standing": "เหลือคนสุดท้ายแล้ว!",
      host: "โฮสต์จบรอบ"
    }[data.reason] || "จบรอบ";

    var survivors = data.results.filter(function (r) { return !r.out; });
    var tail = survivors.length
      ? " รอด: " + survivors.map(function (r) { return r.name; }).join(", ")
      : "";

    FWUI.toast(reason + tail + " — เลื่อนขึ้นไปดูเฉลย", "good", 8000);
  });

  socket.on("scores-reset", function () { FWUI.toast("ล้างคะแนนแล้ว"); });

  socket.on("word-accepted", function () {
    var node = $("wordStatus");
    node.textContent = "ส่งคำแล้ว";
    node.classList.remove("flash");
    void node.offsetWidth;
    node.classList.add("flash");
  });

  socket.on("wrong-game", function (data) {
    FWUI.toast(data.message, "bad", 5000);
    setTimeout(function () {
      window.location.href = "/numbers.html?room=" + data.roomCode;
    }, 1200);
  });

  socket.on("session-taken", function () {
    socket.disconnect();
    window.alert("มีการเข้าห้องนี้จากอุปกรณ์อื่นด้วยชื่อเดียวกัน หน้านี้จึงหยุดอัปเดตแล้ว");
    window.location.href = "/";
  });

  socket.on("kicked", function () {
    FWStore.clearSession(roomCode);
    window.alert("คุณถูกเตะออกจากห้อง");
    window.location.href = "/";
  });

  socket.on("error-msg", function (data) { FWUI.toast(data.message, "bad", 4500); });
  socket.on("disconnect", function () { FWUI.toast("เน็ตหลุด กำลังต่อใหม่...", "bad"); });

  // ---------- ปุ่ม ----------

  $("btnSubmitWord").addEventListener("click", function () {
    var word = $("wordInput").value.trim();
    if (!word) {
      FWUI.toast("ยังไม่ได้พิมพ์คำ", "bad");
      return;
    }
    socket.emit("submit-word", { roomCode: roomCode, word: word });
  });

  $("wordInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSubmitWord").click();
  });

  $("btnStart").addEventListener("click", function () {
    var min = Number($("durationMin").value) || 3;
    socket.emit("start-round", {
      roomCode: roomCode,
      durationMs: Math.max(1, Math.min(min, 15)) * 60000
    });
  });

  $("btnPause").addEventListener("click", function () {
    socket.emit("toggle-pause", { roomCode: roomCode });
  });

  $("btnEnd").addEventListener("click", function () {
    socket.emit("end-round", { roomCode: roomCode });
  });

  $("btnUndo").addEventListener("click", function () {
    socket.emit("undo-callout", { roomCode: roomCode });
  });

  $("btnReset").addEventListener("click", function () {
    if (window.confirm("ล้างคะแนนทุกคนกลับเป็นศูนย์?")) {
      socket.emit("reset-scores", { roomCode: roomCode });
    }
  });

  $("btnLeave").addEventListener("click", function () {
    socket.emit("leave-room", { roomCode: roomCode });
    FWStore.clearSession(roomCode);
    window.location.href = "/";
  });
})();
