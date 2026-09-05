// public/spyfall.js — เกมสายลับ (ออนไลน์ คนละเครื่อง)
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var LOC = window.SpyfallLocations;
  var GAME_TYPE = "spyfall";

  var socket = null;
  var roomCode = null;
  var session = {};
  var state = null;
  var ticker = null;
  var joinSent = false;   // กันยิง join ซ้ำจนกลายเป็นผู้เล่นสองคน
  var packIds = ["thai"];

  // ---------- เข้าห้อง ----------

  function connect() {
    if (socket) return socket;
    socket = io();
    wire();
    return socket;
  }

  $("btnCreate").addEventListener("click", function () {
    var name = $("createName").value.trim();
    if (!name) { $("createMsg").textContent = "ใส่ชื่อก่อน"; return; }
    session.name = name;
    FWStore.rememberName(name);
    connect().emit("create-room", { name: name, gameType: GAME_TYPE });
  });

  $("btnJoin").addEventListener("click", function () {
    var code = $("joinCode").value.trim().toUpperCase();
    var name = $("joinName").value.trim();
    if (!code) { $("joinMsg").textContent = "ใส่รหัสห้องก่อน"; return; }
    if (!name) { $("joinMsg").textContent = "ใส่ชื่อด้วย"; return; }

    session.name = name;
    FWStore.rememberName(name);
    roomCode = code;
    var prev = FWStore.readSession(code) || {};
    joinSent = true;
    connect().emit("join-room", {
      roomCode: code, name: name, playerId: prev.playerId || null, gameType: GAME_TYPE
    });
  });

  function enterRoom() {
    // ใส่รหัสห้องลง URL เพื่อให้รีเฟรชแล้วยังกลับเข้าห้องเดิมได้
    if (window.location.search.indexOf("room=") < 0) {
      window.history.replaceState({}, "", "/spyfall.html?room=" + roomCode);
    }
    $("screenSetup").hidden = true;
    $("screenPlay").hidden = false;
    $("roomCode").textContent = roomCode;
    $("bigCode").textContent = roomCode;

    var url = window.location.origin + "/spyfall.html?room=" + roomCode;
    if (!$("qrInvite").firstChild) FWQr.render($("qrInvite"), url, { label: "QR เข้าห้อง" });

    renderPacks();
    renderLocations();
  }

  // ---------- นาฬิกา ----------

  function stopClock() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    $("clock").textContent = "--:--";
    $("clock").className = "timer idle";
  }

  function runClock() {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      var g = state && state.game;
      if (!g || g.phase !== "playing" || !g.endsAt) { stopClock(); return; }

      var left = g.endsAt - Date.now();
      if (left <= 0) {
        clearInterval(ticker); ticker = null;
        if (state.isHost) socket.emit("spyfall-timeup", { roomCode: roomCode });
        return;
      }
      var secs = Math.ceil(left / 1000);
      $("clock").textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
      $("clock").className = "timer" + (secs <= 30 ? " urgent" : secs <= 60 ? " warn" : "");
    }, 250);
  }

  // ---------- ตั้งค่า ----------

  function renderPacks() {
    var wrap = $("packPicker");
    clear(wrap);
    LOC.PACKS.forEach(function (p) {
      var b = el("button", "choice");
      b.appendChild(el("b", null, p.name));
      b.appendChild(el("span", "faint", p.description));
      b.setAttribute("aria-pressed", String(packIds.indexOf(p.id) >= 0));
      b.addEventListener("click", function () {
        var at = packIds.indexOf(p.id);
        if (at >= 0) { if (packIds.length > 1) packIds.splice(at, 1); }
        else packIds.push(p.id);
        renderPacks();
        renderLocations();
        socket.emit("spyfall-settings", {
          roomCode: roomCode, packIds: packIds, minutes: Number($("minutes").value) || 8
        });
      });
      wrap.appendChild(b);
    });
  }

  $("minutes").addEventListener("change", function () {
    socket.emit("spyfall-settings", {
      roomCode: roomCode, packIds: packIds, minutes: Number(this.value) || 8
    });
  });

  function renderLocations() {
    var wrap = $("locList");
    clear(wrap);
    var names = (state && state.game && state.game.locationNames) || LOC.locationNames(packIds);
    names.forEach(function (n) {
      var chip = el("span", "loc-chip", n);
      // ขีดฆ่าเพื่อช่วยจำว่าตัดอะไรออกไปแล้ว เก็บไว้ในเครื่องตัวเอง
      chip.addEventListener("click", function () { chip.classList.toggle("crossed"); });
      wrap.appendChild(chip);
    });
  }

  // ---------- render ----------

  function nameOf(id) {
    var p = (state.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : "?";
  }

  function render() {
    var g = state.game;

    $("settingsCard").hidden = !state.isHost;
    $("btnStart").hidden = !(state.isHost && (!g || g.phase === "finished" || g.phase === "idle"));
    $("btnStart").textContent = g && g.round ? "เริ่มรอบใหม่" : "เริ่มรอบ";

    renderPlayers();

    if (!g || g.phase === "idle") {
      $("subtitle").textContent = state.playerCount + " คนในห้อง (ต้องการอย่างน้อย 3)";
      $("cardSection").hidden = true;
      $("actionCard").hidden = true;
      $("voteCard").hidden = true;
      $("resultCard").hidden = true;
      stopClock();
      return;
    }

    $("subtitle").textContent = "รอบ " + g.round +
      (g.phase === "playing" ? " · กำลังเล่น" : g.phase === "voting" ? " · กำลังโหวต" : " · จบรอบ");

    renderCard(g);
    $("actionCard").hidden = g.phase !== "playing";
    if (g.phase === "playing") {
      $("btnSpyGuess").hidden = !g.card || !g.card.spy;
      $("actionHint").textContent = g.card && g.card.spy
        ? "คุณคือสายลับ ฟังให้ออกว่าที่นี่คือที่ไหน แล้วกดทายตอนมั่นใจ"
        : "ถามคำถามให้สายลับตอบไม่ได้ แต่อย่าเปิดเผยสถานที่จนเกินไป";
    }

    renderVote(g);
    renderResult(g);
    runClock();
  }

  function renderCard(g) {
    var box = $("myCard");
    clear(box);
    if (!g.card) { $("cardSection").hidden = true; return; }

    if (g.card.spy) {
      box.className = "spy-card is-spy";
      box.appendChild(el("div", "spy-label", "คุณคือ"));
      box.appendChild(el("div", "spy-role", "สายลับ 🕵️"));
      box.appendChild(el("div", "faint", "คุณไม่รู้ว่าที่นี่คือที่ไหน ต้องฟังเอาเอง"));
    } else {
      box.className = "spy-card";
      box.appendChild(el("div", "spy-label", "สถานที่"));
      box.appendChild(el("div", "spy-place", g.card.location));
      box.appendChild(el("div", "spy-label", "บทบาทของคุณ"));
      box.appendChild(el("div", "spy-role", g.card.role));
    }
    $("cardSection").hidden = false;
  }

  function renderPlayers() {
    var wrap = $("playerList");
    clear(wrap);
    var g = state.game;

    state.players.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (p, i) {
      var row = el("div", "score-row" + (i === 0 ? " rank-1" : ""));
      row.appendChild(el("div", "score-rank", "#" + (i + 1)));
      row.appendChild(el("div", "grow", p.name + (p.id === state.youId ? " (คุณ)" : "")));
      if (!p.connected) row.appendChild(el("span", "badge badge-off", "หลุด"));

      // เฉลยว่าใครเป็นสายลับตอนจบรอบเท่านั้น
      if (g && g.phase === "finished" && g.spyId === p.id) {
        row.appendChild(el("span", "badge badge-out", "สายลับ"));
      }
      row.appendChild(el("div", "score-value", p.score));
      wrap.appendChild(row);
    });
  }

  function renderVote(g) {
    var card = $("voteCard");
    if (g.phase !== "voting" || !g.vote) { card.hidden = true; return; }

    var v = g.vote;
    $("voteTitle").textContent = nameOf(v.accuserId) + " กล่าวหา " + nameOf(v.targetId);
    $("voteSub").textContent = v.targetId === state.youId
      ? "คุณถูกกล่าวหา รอผลโหวต"
      : "โหวตว่าเขาคือสายลับหรือไม่";

    var canVote = v.targetId !== state.youId && v.myVote === null;
    $("btnVoteYes").disabled = !canVote;
    $("btnVoteNo").disabled = !canVote;
    $("voteTally").textContent = "โหวตแล้ว " + v.tally.total + "/" + v.tally.needed +
      " · ใช่ " + v.tally.yes + " ไม่ใช่ " + v.tally.no;
    card.hidden = false;
  }

  function renderResult(g) {
    var card = $("resultCard");
    if (g.phase !== "finished" || !g.result) { card.hidden = true; return; }

    var r = g.result;
    $("resultTitle").textContent = r.spyWins ? "สายลับชนะ!" : "จับสายลับได้!";
    $("resultDetail").textContent = r.message + " · สายลับคือ " + nameOf(r.spyId);

    var box = $("resultScores");
    clear(box);
    Object.keys(r.scores).forEach(function (id) {
      var row = el("div", "score-row");
      row.appendChild(el("div", "grow", nameOf(id)));
      row.appendChild(el("div", "score-value", "+" + r.scores[id]));
      box.appendChild(row);
    });
    card.hidden = false;
  }

  // ---------- ปุ่ม ----------

  $("btnStart").addEventListener("click", function () {
    socket.emit("spyfall-start", { roomCode: roomCode });
  });

  $("btnAccuse").addEventListener("click", function () {
    var picker = $("accusePicker");
    if (!picker.hidden) { picker.hidden = true; return; }

    clear(picker);
    state.players.forEach(function (p) {
      if (p.id === state.youId) return;
      var b = el("button", "buzz-btn", p.name);
      b.addEventListener("click", function () {
        socket.emit("spyfall-accuse", { roomCode: roomCode, targetId: p.id });
        picker.hidden = true;
      });
      picker.appendChild(b);
    });
    $("guessPicker").hidden = true;
    picker.hidden = false;
  });

  $("btnSpyGuess").addEventListener("click", function () {
    var picker = $("guessPicker");
    if (!picker.hidden) { picker.hidden = true; return; }

    clear(picker);
    state.game.locationNames.forEach(function (n) {
      var b = el("button", "loc-chip pick", n);
      b.addEventListener("click", function () {
        if (!window.confirm("ทายว่าที่นี่คือ " + n + " ใช่ไหม? ทายผิดแพ้ทันที")) return;
        socket.emit("spyfall-guess", { roomCode: roomCode, location: n });
        picker.hidden = true;
      });
      picker.appendChild(b);
    });
    $("accusePicker").hidden = true;
    picker.hidden = false;
  });

  $("btnVoteYes").addEventListener("click", function () {
    socket.emit("spyfall-vote", { roomCode: roomCode, agree: true });
  });
  $("btnVoteNo").addEventListener("click", function () {
    socket.emit("spyfall-vote", { roomCode: roomCode, agree: false });
  });

  $("btnQuit").addEventListener("click", function () {
    socket.emit("leave-room", { roomCode: roomCode });
    FWStore.clearSession(roomCode);
    window.location.href = "/spyfall.html";
  });

  $("btnShowQr").addEventListener("click", function () {
    if (!$("qrBig").firstChild) {
      FWQr.render($("qrBig"), window.location.origin + "/spyfall.html?room=" + roomCode, {});
    }
    $("qrModalCode").textContent = roomCode;
    $("qrModal").hidden = false;
    $("btnCloseQr").focus();
  });
  $("btnCloseQr").addEventListener("click", function () { $("qrModal").hidden = true; });
  $("qrModal").addEventListener("click", function (e) {
    if (e.target === $("qrModal")) $("qrModal").hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("qrModal").hidden) $("qrModal").hidden = true;
  });

  // ---------- socket ----------

  function wire() {
    socket.on("connect", function () {
      if (!roomCode || joinSent) return;
      joinSent = true;
      var prev = FWStore.readSession(roomCode) || {};
      socket.emit("join-room", {
        roomCode: roomCode, name: session.name || prev.name,
        playerId: prev.playerId || null, gameType: GAME_TYPE
      });
    });

    socket.on("room-created", function (d) {
      roomCode = d.roomCode;
      FWStore.writeSession(d.roomCode, { playerId: d.playerId, name: session.name });
      enterRoom();
      socket.emit("spyfall-settings", { roomCode: roomCode, packIds: packIds, minutes: 8 });
    });

    socket.on("joined", function (d) {
      roomCode = d.roomCode;
      var prev = FWStore.readSession(d.roomCode) || {};
      FWStore.writeSession(d.roomCode, { playerId: d.playerId, name: session.name || prev.name });
      enterRoom();
      if (d.reconnected) FWUI.toast("กลับเข้าห้องแล้ว", "good");
    });

    socket.on("wrong-game", function (d) {
      FWUI.toast(d.message, "bad", 5000);
      setTimeout(function () { window.location.href = "/?room=" + d.roomCode; }, 1200);
    });

    socket.on("state", function (s) {
      state = s;
      if (s.settings && s.settings.packIds) packIds = s.settings.packIds;
      render();
    });

    socket.on("spyfall-started", function () {
      FWUI.toast("เริ่มรอบใหม่ ดูการ์ดของคุณ", "hot");
      $("accusePicker").hidden = true;
      $("guessPicker").hidden = true;
    });
    socket.on("spyfall-vote-open", function (d) {
      FWUI.toast("มีการกล่าวหา " + nameOf(d.targetId), "hot", 5000);
    });
    socket.on("spyfall-vote-failed", function () {
      FWUI.toast("เสียงไม่พอ กล่าวหาตก เล่นต่อ", "bad", 5000);
    });
    socket.on("spyfall-ended", function (d) {
      FWUI.toast(d.result.message, d.result.spyWins ? "bad" : "good", 8000);
    });

    socket.on("error-msg", function (d) {
      FWUI.toast(d.message, "bad", 4500);
      $("createMsg").textContent = d.message;
      $("joinMsg").textContent = d.message;
    });
    socket.on("kicked", function () { window.location.href = "/spyfall.html"; });
    socket.on("session-taken", function () {
      socket.disconnect();
      window.alert("มีการเข้าห้องนี้จากอุปกรณ์อื่น หน้านี้หยุดอัปเดตแล้ว");
      window.location.href = "/spyfall.html";
    });
  }

  // ---------- ลิงก์เชิญ ----------

  var invited = new URL(window.location.href).searchParams.get("room");
  if (invited) {
    var code = invited.trim().toUpperCase().slice(0, 5);
    var saved = FWStore.readSession(code);

    // เคยอยู่ห้องนี้แล้ว (เช่นเพิ่งรีเฟรช) กลับเข้าไปเลยไม่ต้องกรอกอะไรใหม่
    if (saved && saved.playerId) {
      session.name = saved.name;
      roomCode = code;
      joinSent = true;
      connect().emit("join-room", {
        roomCode: code, name: saved.name, playerId: saved.playerId, gameType: GAME_TYPE
      });
    }

    $("joinCode").value = code;
    var last = FWStore.lastName();
    if (last) $("joinName").value = last;
    $("joinName").focus();
  } else {
    var n = FWStore.lastName();
    if (n) $("createName").value = n;
  }
})();
