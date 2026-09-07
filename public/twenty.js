// public/twenty.js — 24 แต้ม (ออนไลน์ คนละเครื่อง)
//
// กติกาทั้งหมดอยู่ที่ server เครื่องนี้เก็บแค่ snapshot ล่าสุดที่ server ส่งมา
// ทุกการกดคือการยิง event แล้วรอ state ก้อนใหม่ ไม่มีการคำนวณผลเองฝั่งนี้
// จะได้ไม่มีทางที่สองเครื่องเห็นคะแนนไม่ตรงกัน
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var T = window.TwentyRules;

  var socket = null;
  var roomCode = null;
  var state = null;
  var joinSent = false;
  var ticker = null;
  var pendingDiff = 1;

  // ---------- เชื่อมต่อ ----------

  function connect() {
    if (socket) return socket;
    socket = io();
    wire();
    return socket;
  }

  function enterRoom(code) {
    roomCode = code;
    history.replaceState(null, "", "?room=" + encodeURIComponent(code));
    $("screenSetup").hidden = true;
    $("screenPlay").hidden = false;
    $("roomCode").textContent = code;
    renderInvite();
  }

  function renderInvite() {
    var url = location.origin + "/twenty.html?room=" + encodeURIComponent(roomCode);
    if (window.FWQr) FWQr.render($("qrInvite"), url, { size: 148 });
  }

  // ---------- วาดหน้าจอ ----------

  function render() {
    if (!state) return;
    var g = state.game;

    $("lobbyCard").hidden = !!g;
    $("cardsCard").hidden = !g;
    $("buzzCard").hidden = !g || g.phase !== "showing";
    $("judgeCard").hidden = !g || g.phase !== "claimed";
    $("typeCard").hidden = !g || g.phase !== "typing";
    $("outcomeCard").hidden = !g || g.phase !== "roundEnd";

    if (!g) { renderLobby(); return; }

    $("roundNo").textContent = g.round;
    $("solutionHint").textContent = g.solutionCount + " วิธีที่ทำได้";

    renderCards(g);
    renderPhase(g);
    renderScores(g);
    runClock(g);
  }

  function renderLobby() {
    var wrap = $("lobbyPlayers");
    clear(wrap);
    state.players.forEach(function (p) {
      var row = el("div", "vote-row");
      row.appendChild(el("span", "grow", p.name));
      if (p.id === state.hostId) row.appendChild(el("span", "badge", "โฮสต์"));
      if (!p.connected) row.appendChild(el("span", "badge", "หลุด"));
      wrap.appendChild(row);
    });

    $("hostSetup").hidden = !state.isHost;
    $("waitHostMsg").hidden = state.isHost;
    $("btnStart").disabled = state.playerCount < 2;
    $("btnStart").textContent = state.playerCount < 2
      ? "รออีกอย่างน้อย 1 คน" : "เริ่มเล่น";
  }

  function renderCards(g) {
    var wrap = $("cards");
    clear(wrap);
    g.cards.forEach(function (n) {
      wrap.appendChild(el("div", "num-card", String(n)));
    });
  }

  function renderPhase(g) {
    // กดตอบ
    $("btnBuzz").disabled = !g.canClaim;
    $("btnSkip").hidden = !(state.isHost && g.phase === "showing");

    // ตัดสิน
    if (g.phase === "claimed") {
      $("claimerName").textContent = g.claimerName || "-";
      var mine = g.claimerId === state.youId;
      $("btnAccept").disabled = !g.canJudge;
      $("btnReject").disabled = !g.canJudge;
      $("judgeCard").querySelector("h2").textContent =
        mine ? "คุณกดตอบ! พูดสูตรออกมาเลย" : (g.claimerName + " กดตอบ!");
    }

    // พิมพ์สูตร
    if (g.phase === "typing") {
      $("typeWho").textContent = g.claimerName || "-";
      $("typeWhy").textContent = g.wasRejected
        ? "ถูกปัดตก — พิมพ์สูตรให้ระบบตัดสิน ถ้าถูกจริงคนปัดตกโดนหักแต้ม"
        : "ไม่มีใครกดตัดสิน — พิมพ์สูตรให้ระบบตัดสิน";
      $("exprInput").disabled = !g.canType;
      $("btnSubmitExpr").disabled = !g.canType;
      $("exprMsg").textContent = g.canType ? "" : "รอ " + (g.claimerName || "") + " พิมพ์สูตร";
    }

    // ผลของตา
    if (g.phase === "roundEnd" && g.lastOutcome) {
      var o = g.lastOutcome;
      var win = o.type === "accepted" || o.type === "verified";
      $("outcomeWord").textContent = win ? "ได้แต้ม" : (o.type === "skipped" ? "ข้ามชุด" : "ฟาวล์");
      $("outcomeWord").className = "verdict-word " + (win ? "hit" : "high");
      $("outcomeDetail").textContent = o.message || "";

      var box = $("revealBox");
      clear(box);
      if (o.expression) box.appendChild(el("p", "faint", "สูตรที่ส่ง: " + o.expression));
      if (o.reason) box.appendChild(el("p", "faint", "เหตุผล: " + o.reason));
      $("btnNext").hidden = !state.isHost;
    }
  }

  function renderScores(g) {
    var wrap = $("scoreboard");
    clear(wrap);
    g.standings.forEach(function (p, i) {
      var row = el("div", "score-row" + (p.id === state.youId ? " me" : ""));
      row.appendChild(el("span", "rank", "#" + (i + 1)));
      row.appendChild(el("span", "grow", p.name));
      row.appendChild(el("span", "badge", p.correct + " ถูก"));
      row.appendChild(el("b", null, String(p.score)));
      wrap.appendChild(row);
    });
  }

  // นาฬิกาเดินตาม deadline ที่ server กำหนด ไม่ใช่นับเองในเครื่อง
  // โฮสต์คนเดียวเป็นคนยิงบอกว่าหมดเวลา กันยิงซ้ำหลายเครื่อง
  function runClock(g) {
    clearInterval(ticker);
    var box = $("clock");
    if (!g.deadline) { box.textContent = "--"; box.className = "timer idle"; return; }

    var fired = false;
    function tick() {
      var left = g.deadline - Date.now();
      if (left <= 0) {
        box.textContent = "0.0";
        box.className = "timer danger";
        clearInterval(ticker);
        if (!fired && state.isHost) {
          fired = true;
          socket.emit(g.phase === "claimed" ? "twenty-speak-timeout" : "twenty-judge-timeout", { roomCode: roomCode });
        }
        return;
      }
      box.textContent = (left / 1000).toFixed(1);
      box.className = "timer" + (left < 4000 ? " danger" : "");
    }
    tick();
    ticker = setInterval(tick, 100);
  }

  // ---------- ปุ่ม ----------

  $("btnCreate").addEventListener("click", function () {
    var name = $("createName").value.trim();
    if (!name) return FWUI.toast("ใส่ชื่อก่อน", "bad");
    FWStore.rememberName(name);
    connect().emit("create-room", { name: name, gameType: "twenty" });
  });

  $("btnJoin").addEventListener("click", function () {
    var code = $("joinCode").value.trim().toUpperCase();
    var name = $("joinName").value.trim();
    if (!code || !name) return FWUI.toast("ใส่รหัสห้องและชื่อก่อน", "bad");
    FWStore.rememberName(name);
    var prev = FWStore.readSession(code);
    connect().emit("join-room", {
      roomCode: code, name: name,
      playerId: prev ? prev.playerId : null,
      gameType: "twenty"
    });
  });

  $("btnStart").addEventListener("click", function () {
    socket.emit("twenty-settings", { roomCode: roomCode, minSolutions: pendingDiff });
    socket.emit("twenty-start", { roomCode: roomCode });
  });

  document.querySelectorAll("[data-diff]").forEach(function (b) {
    b.addEventListener("click", function () {
      pendingDiff = Number(b.dataset.diff);
      document.querySelectorAll("[data-diff]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
    });
  });

  $("btnBuzz").addEventListener("click", function () {
    socket.emit("twenty-claim", { roomCode: roomCode });
  });
  $("btnAccept").addEventListener("click", function () {
    socket.emit("twenty-judge", { roomCode: roomCode, accepted: true });
  });
  $("btnReject").addEventListener("click", function () {
    socket.emit("twenty-judge", { roomCode: roomCode, accepted: false });
  });
  $("btnSubmitExpr").addEventListener("click", function () {
    var v = $("exprInput").value.trim();
    if (!v) return FWUI.toast("พิมพ์สูตรก่อน", "bad");
    socket.emit("twenty-submit", { roomCode: roomCode, expression: v });
    $("exprInput").value = "";
  });
  $("exprInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSubmitExpr").click();
  });
  $("btnSkip").addEventListener("click", function () {
    socket.emit("twenty-skip", { roomCode: roomCode });
  });
  $("btnNext").addEventListener("click", function () {
    socket.emit("twenty-next", { roomCode: roomCode });
  });
  $("btnCopyCode").addEventListener("click", function () {
    FWUI.copy(location.origin + "/twenty.html?room=" + roomCode, "คัดลอกลิงก์แล้ว");
  });
  $("btnQuit").addEventListener("click", function () {
    if (window.confirm("ออกจากห้อง?")) {
      socket.emit("leave-room", { roomCode: roomCode });
      FWStore.clearSession(roomCode);
      location.href = "/twenty.html";
    }
  });

  $("btnShowAll").addEventListener("click", function () {
    var box = $("allSolutions");
    box.hidden = !box.hidden;
    if (box.hidden || !state || !state.game) return;
    clear(box);
    var found = T.solve(state.game.cards);
    (found.solutions || []).slice(0, 12).forEach(function (s) {
      box.appendChild(el("div", "faint", s));
    });
    if (!found.count) box.appendChild(el("div", "faint", "ชุดนี้ไม่มีทางออก"));
  });

  // ---------- socket ----------

  function wire() {
    socket.on("connect", function () {
      // กลับมาหลังเน็ตหลุด — เข้าห้องเดิมด้วย playerId เดิม คะแนนไม่หาย
      if (!roomCode || joinSent) return;
      var prev = FWStore.readSession(roomCode);
      if (!prev) return;
      joinSent = true;
      socket.emit("join-room", {
        roomCode: roomCode, name: prev.name,
        playerId: prev.playerId, gameType: "twenty"
      });
    });

    socket.on("room-created", function (d) {
      FWStore.writeSession(d.roomCode, { playerId: d.playerId, name: d.name });
      enterRoom(d.roomCode);
    });

    socket.on("joined", function (d) {
      FWStore.writeSession(d.roomCode, { playerId: d.playerId, name: d.name });
      enterRoom(d.roomCode);
      if (d.reconnected) FWUI.toast("กลับเข้าห้องแล้ว", "good");
    });

    socket.on("wrong-game", function (d) {
      location.replace("/?room=" + encodeURIComponent(d.roomCode));
    });

    socket.on("state", function (s) {
      state = s;
      joinSent = false;
      render();
    });

    socket.on("twenty-claimed", function (d) {
      FWUI.toast(d.name + " กดตอบ!", "hot");
    });

    socket.on("error-msg", function (d) { FWUI.toast(d.message, "bad"); });
    socket.on("kicked", function () {
      FWUI.toast("คุณถูกเชิญออกจากห้อง", "bad");
      setTimeout(function () { location.href = "/twenty.html"; }, 1200);
    });
    socket.on("session-taken", function () {
      socket.disconnect();
      FWUI.toast("เปิดห้องนี้ที่อื่นอยู่", "bad");
    });
    socket.on("connect_error", function () { FWUI.toast("ต่อเซิร์ฟเวอร์ไม่ได้", "bad"); });
  }

  // ---------- เข้าจากลิงก์ชวน ----------

  (function boot() {
    var name = FWStore.lastName();
    if (name) { $("createName").value = name; $("joinName").value = name; }

    var code = new URLSearchParams(location.search).get("room");
    if (!code) return;
    code = code.toUpperCase();
    $("joinCode").value = code;

    var prev = FWStore.readSession(code);
    if (prev && prev.playerId) {
      roomCode = code;
      joinSent = true;
      connect().emit("join-room", {
        roomCode: code, name: prev.name,
        playerId: prev.playerId, gameType: "twenty"
      });
    }
  })();
})();
