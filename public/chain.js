// public/chain.js — คำต้องเชื่อม (ออนไลน์ คนละเครื่อง)
//
// กติกาและนาฬิกาอยู่ที่ server ทั้งหมด เครื่องนี้เก็บแค่ snapshot ล่าสุด
// เดิมเป็นโหมดเครื่องเดียววางกลางวง จึงนับเวลาเองได้
// พอเป็นออนไลน์ ถ้าต่างคนต่างนับ เครื่องที่ช้ากว่าจะเห็นว่าตัวเองยังทัน
// แต่เครื่องอื่นเห็นว่าตกรอบไปแล้ว — เวลาจึงต้องมาจากที่เดียว
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;

  var socket = null;
  var roomCode = null;
  var state = null;
  var joinSent = false;
  var ticker = null;
  var aiAvailable = false;

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
    var url = location.origin + "/chain.html?room=" + encodeURIComponent(code);
    if (window.FWQr) FWQr.render($("qrInvite"), url, { size: 148 });
  }

  // ---------- วาดหน้าจอ ----------

  function render() {
    if (!state) return;
    var g = state.game;

    $("lobbyCard").hidden = !!g;
    $("wordCard").hidden = !g;
    $("turnCard").hidden = !g || g.phase !== "playing";
    $("challengeCard").hidden = !g || g.phase !== "challenge";
    $("challengeLaunch").hidden = !g || g.phase !== "playing" || !g.canChallenge;
    $("btnNextRound").hidden = !g || g.phase !== "finished" || !state.isHost;

    if (!g) { renderLobby(); return; }

    $("roundNo").textContent = g.round;
    $("aliveCount").textContent =
      g.players.filter(function (p) { return p.alive; }).length + " คนยังอยู่ จาก " + g.players.length;
    $("lastWord").textContent = g.lastWord || "-";
    $("lastBy").textContent = g.lastByName ? "โดย " + g.lastByName : "";

    if (g.phase === "playing") renderTurn(g);
    if (g.phase === "challenge") renderChallenge(g);

    renderEvent(g);
    renderChain(g);
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
    $("aiRow").hidden = !aiAvailable;
    $("aiToggle").checked = !!(state.settings && state.settings.aiReferee);
    $("btnStart").disabled = state.playerCount < 3;
    $("btnStart").textContent = state.playerCount < 3
      ? "ต้องมีอย่างน้อย 3 คน" : "เริ่มเล่น";
  }

  function renderTurn(g) {
    $("turnWho").textContent = g.currentName || "-";
    // ปุ่มส่งคำเปิดเฉพาะเจ้าของตา คนอื่นเห็นแต่รอ
    $("wordInput").disabled = !g.isMyTurn;
    $("btnSend").disabled = !g.isMyTurn;
    $("turnMsg").textContent = g.isMyTurn ? "ตาคุณ! พิมพ์คำที่เชื่อมกับคำก่อนหน้า" : "รอ " + (g.currentName || "") + " พิมพ์";
    if (!g.isMyTurn) $("wordInput").value = "";
  }

  function renderChallenge(g) {
    var c = g.challenge;
    if (!c) return;
    $("challengeSub").textContent = c.challengerName + " ค้านคำของ " + c.defenderName;
    $("challengeWord").textContent = c.word;

    var wrap = $("voterList");
    clear(wrap);
    if (c.canVote) {
      var row = el("div", "vote-row");
      row.appendChild(el("span", "grow", "คุณโหวตว่า"));
      var yes = el("button", "mini " + (c.myVote === true ? "volt" : "ghost"), "เชื่อมโยง");
      var no = el("button", "mini " + (c.myVote === false ? "danger" : "ghost"), "ไม่เชื่อมโยง");
      yes.addEventListener("click", function () { socket.emit("chain-vote", { roomCode: roomCode, linked: true }); });
      no.addEventListener("click", function () { socket.emit("chain-vote", { roomCode: roomCode, linked: false }); });
      row.appendChild(yes);
      row.appendChild(no);
      wrap.appendChild(row);
    } else {
      wrap.appendChild(el("p", "faint", "คู่กรณีโหวตไม่ได้ รอผลจากคนที่เหลือ"));
    }

    $("tally").textContent = "โหวตแล้ว " + c.tally.total + "/" + c.needed;

    var box = $("refereeBox");
    if (c.aiOpinion) {
      box.hidden = false;
      $("refereeVerdict").textContent = c.aiOpinion.linked ? "น่าจะเชื่อมโยง" : "น่าจะไม่เชื่อมโยง";
      $("refereeVerdict").className = "referee-verdict " + (c.aiOpinion.linked ? "ok" : "no");
      $("refereeReason").textContent = c.aiOpinion.reason || "(ไม่ได้ให้เหตุผล)";
    } else {
      box.hidden = true;
    }

    $("btnReferee").hidden = !g.canAskReferee;
    $("btnResolve").hidden = !state.isHost;
  }

  function renderEvent(g) {
    var e = g.lastEvent;
    if (!e) { $("eventCard").hidden = true; return; }
    $("eventCard").hidden = false;

    var word = $("eventWord");
    if (e.type === "challenge") {
      word.textContent = e.challengerWins ? "ชาเลนจ์สำเร็จ" : "ชาเลนจ์ไม่สำเร็จ";
      word.className = "verdict-word " + (e.challengerWins ? "hit" : "high");
    } else if (e.type === "winner") {
      word.textContent = e.name + " ชนะรอบนี้!";
      word.className = "verdict-word hit";
    } else {
      word.textContent = "ตกรอบ";
      word.className = "verdict-word high";
    }
    $("eventDetail").textContent = e.message || "";
  }

  function renderChain(g) {
    var wrap = $("chainList");
    clear(wrap);
    g.chain.forEach(function (item) {
      var box = el("div", "chain-item");
      box.appendChild(el("b", null, item.word));
      box.appendChild(el("span", "faint", item.byName || "ระบบ"));
      wrap.appendChild(box);
    });
  }

  function renderScores(g) {
    var wrap = $("scoreboard");
    clear(wrap);
    g.standings.forEach(function (p, i) {
      var row = el("div", "score-row" + (p.id === state.youId ? " me" : ""));
      row.appendChild(el("span", "rank", "#" + (i + 1)));
      row.appendChild(el("span", "grow", p.name));
      if (!p.alive) row.appendChild(el("span", "badge", "ตกรอบ"));
      row.appendChild(el("b", null, String(p.score)));
      wrap.appendChild(row);
    });
  }

  // นาฬิกาเดินตาม deadline ของ server โฮสต์คนเดียวเป็นคนแจ้งว่าหมดเวลา
  function runClock(g) {
    clearInterval(ticker);
    var box = $("clock");
    if (!g.deadline || g.phase === "finished") {
      box.textContent = "--";
      box.className = "timer idle";
      return;
    }

    var fired = false;
    function tick() {
      var left = g.deadline - Date.now();
      if (left <= 0) {
        box.textContent = "0.0";
        box.className = "timer danger";
        clearInterval(ticker);
        if (!fired && state.isHost && g.phase === "playing") {
          fired = true;
          socket.emit("chain-timeout", { roomCode: roomCode });
        }
        return;
      }
      box.textContent = g.phase === "playing" ? (left / 1000).toFixed(1) : FWUI.fmtTime(left);
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
    connect().emit("create-room", { name: name, gameType: "chain" });
  });

  $("btnJoin").addEventListener("click", function () {
    var code = $("joinCode").value.trim().toUpperCase();
    var name = $("joinName").value.trim();
    if (!code || !name) return FWUI.toast("ใส่รหัสห้องและชื่อก่อน", "bad");
    FWStore.rememberName(name);
    var prev = FWStore.readSession(code);
    connect().emit("join-room", {
      roomCode: code, name: name,
      playerId: prev ? prev.playerId : null, gameType: "chain"
    });
  });

  $("aiToggle").addEventListener("change", function () {
    socket.emit("chain-settings", { roomCode: roomCode, aiReferee: this.checked });
  });

  $("btnStart").addEventListener("click", function () {
    socket.emit("chain-start", { roomCode: roomCode });
  });

  $("btnSend").addEventListener("click", function () {
    var w = $("wordInput").value.trim();
    if (!w) return FWUI.toast("พิมพ์คำก่อน", "bad");
    socket.emit("chain-word", { roomCode: roomCode, word: w });
    $("wordInput").value = "";
  });
  $("wordInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSend").click();
  });

  $("btnReferee").addEventListener("click", function () {
    $("btnReferee").disabled = true;
    socket.emit("chain-referee", { roomCode: roomCode });
  });

  $("btnResolve").addEventListener("click", function () {
    socket.emit("chain-resolve", { roomCode: roomCode });
  });

  $("btnNextRound").addEventListener("click", function () {
    socket.emit("chain-next-round", { roomCode: roomCode });
  });

  $("btnCopyCode").addEventListener("click", function () {
    FWUI.copy(location.origin + "/chain.html?room=" + roomCode, "คัดลอกลิงก์แล้ว");
  });

  $("btnQuit").addEventListener("click", function () {
    if (window.confirm("ออกจากห้อง?")) {
      socket.emit("leave-room", { roomCode: roomCode });
      FWStore.clearSession(roomCode);
      location.href = "/chain.html";
    }
  });

  // ---------- socket ----------

  function wire() {
    socket.on("connect", function () {
      if (!roomCode || joinSent) return;
      var prev = FWStore.readSession(roomCode);
      if (!prev) return;
      joinSent = true;
      socket.emit("join-room", {
        roomCode: roomCode, name: prev.name,
        playerId: prev.playerId, gameType: "chain"
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
      $("btnReferee").disabled = false;
      render();
    });

    socket.on("chain-challenged", function (d) { FWUI.toast(d.name + " กดชาเลนจ์!", "hot"); });
    socket.on("chain-referee-said", function () { FWUI.toast("กรรมการให้ความเห็นแล้ว โหวตกันใหม่", "good"); });

    socket.on("error-msg", function (d) {
      FWUI.toast(d.message, "bad");
      $("btnReferee").disabled = false;
    });
    socket.on("kicked", function () {
      FWUI.toast("คุณถูกเชิญออกจากห้อง", "bad");
      setTimeout(function () { location.href = "/chain.html"; }, 1200);
    });
    socket.on("session-taken", function () {
      socket.disconnect();
      FWUI.toast("เปิดห้องนี้ที่อื่นอยู่", "bad");
    });
    socket.on("connect_error", function () { FWUI.toast("ต่อเซิร์ฟเวอร์ไม่ได้", "bad"); });
  }

  // ---------- ชาเลนจ์ (ปุ่มลอย) ----------

  $("challengers").addEventListener("click", function (e) {
    if (e.target && e.target.dataset && e.target.dataset.act === "challenge") {
      socket.emit("chain-challenge", { roomCode: roomCode });
    }
  });

  // ปุ่มชาเลนจ์มีปุ่มเดียว ไม่ต้องเลือกว่าใครชาเลนจ์แล้ว เพราะแต่ละคนมีเครื่องของตัวเอง
  (function initChallengeButton() {
    var wrap = $("challengers");
    clear(wrap);
    var b = el("button", "danger block", "ชาเลนจ์คำล่าสุด");
    b.dataset.act = "challenge";
    wrap.appendChild(b);
  })();

  // ---------- เข้าจากลิงก์ชวน ----------

  (function boot() {
    fetch("/api/ai/status")
      .then(function (r) { return r.ok ? r.json() : { available: false }; })
      .then(function (d) {
        aiAvailable = !!(d && d.available);
        if (state) render();
      })
      .catch(function () { /* ไม่มีก็เล่นได้ปกติ */ });

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
        playerId: prev.playerId, gameType: "chain"
      });
    }
  })();
})();
