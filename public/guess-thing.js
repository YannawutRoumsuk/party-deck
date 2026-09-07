// public/guess-thing.js — ทายของ 20 คำถาม
//
// 2 โหมด:
//   ออนไลน์   คนละเครื่อง สร้างห้อง กติกาอยู่ที่ server
//   คนเดียว   สู้ AI ทั้งหมดอยู่ในเครื่องนี้ ยิง API เฉพาะตอนถาม/ทาย
//
// ของที่อีกฝ่ายตั้งไว้ไม่เคยถูกส่งมาถึงเบราว์เซอร์เรา จนกว่าเกมจะจบ
// การกรองทำที่ server/games/guess/state.js และมีเทสไล่ทุกฟิลด์
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var W = window.GuessWords;

  var socket = null;
  var roomCode = null;
  var state = null;
  var joinSent = false;
  var ticker = null;

  var packId = W.PACKS[0].id;
  var level = "common";

  // ---------- ตั้งค่าคลังคำ ----------

  (function initPackPicker() {
    var sel = $("packSelect");
    if (sel) {
      W.PACKS.forEach(function (p) {
        var o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.group + " · " + p.name;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        packId = this.value;
        if (socket && roomCode && state && state.isHost) {
          socket.emit("guess-settings", { roomCode: roomCode, packId: packId, level: level });
        }
      });
    }
    document.querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () {
        level = b.dataset.level;
        document.querySelectorAll("[data-level]").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x.dataset.level === level));
        });
        if (socket && roomCode && state && state.isHost) {
          socket.emit("guess-settings", { roomCode: roomCode, packId: packId, level: level });
        }
      });
    });
  })();

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
    var url = location.origin + "/guess-thing.html?room=" + encodeURIComponent(code);
    if (window.FWQr) FWQr.render($("qrInvite"), url, { size: 148 });
  }

  function nameOf(id) {
    if (!state) return "";
    var p = state.players.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : "";
  }

  // ---------- วาดหน้าจอ ----------

  function render() {
    if (!state) return;
    var m = state.match;

    $("lobbyCard").hidden = !!m;
    $("pickCard").hidden = !m || m.phase !== "picking";
    $("turnCard").hidden = !m || m.phase !== "asking";
    $("answerCard").hidden = !m || m.phase !== "answering";
    $("resultCard").hidden = !m || m.phase !== "finished";

    $("playTitle").textContent = "ห้อง " + state.code;

    if (!m) { renderLobby(); return; }

    $("playSubtitle").textContent =
      m.phase === "picking" ? "ตั้งของให้อีกฝ่ายทาย"
      : m.phase === "finished" ? "จบเกม"
      : "ตาของ " + nameOf(m.turn);

    if (m.phase === "picking") renderPick(m);
    if (m.phase === "asking") renderTurn(m);
    if (m.phase === "answering") renderAnswer(m);
    if (m.phase === "finished") renderResult(m);

    renderHistory(m);
    renderScores();
    runClock(m);
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
    $("btnStart").disabled = state.playerCount !== 2;
    $("btnStart").textContent = state.playerCount !== 2 ? "ต้องมี 2 คนพอดี" : "เริ่มเล่น";
  }

  function renderPick(m) {
    var done = m.mySeat && m.mySeat.hasSecret;
    $("pickFor").textContent = nameOf(m.opponentId);
    $("secretInput").disabled = done;
    $("btnSetSecret").disabled = done;
    $("btnRandom").hidden = done;
    $("pickMsg").textContent = done
      ? "ตั้งแล้ว รออีกฝ่ายตั้งของ"
      : "พิมพ์สิ่งที่อยากให้อีกฝ่ายทาย อีกฝ่ายจะไม่เห็นคำนี้";
  }

  function renderTurn(m) {
    $("turnWho").textContent = nameOf(m.turn);
    var mine = m.isMyTurn;
    $("turnHint").textContent = mine
      ? "ถามคำถามที่ตอบได้แค่ใช่/ไม่ใช่ หรือจะทายชื่อเลยก็ได้"
      : "รออีกฝ่ายถาม";
    $("turnInput").disabled = !mine;
    $("btnSend").disabled = !mine;
    $("guessLeft").textContent = m.theirSeat ? m.theirSeat.guessesLeft : "-";

    var wrap = $("hintRow");
    clear(wrap);
    if (mine && W.randomHint) {
      var b = el("button", "ghost mini", "ขอคำถามแนะนำ");
      b.addEventListener("click", function () {
        $("turnInput").value = W.randomHint(m.packId || packId, []);
      });
      wrap.appendChild(b);
    }
  }

  function renderAnswer(m) {
    var p = m.pending;
    if (!p) return;
    var asker = nameOf(p.byId);
    $("answerTitle").textContent = m.canRespond
      ? (p.kind === "guess" ? asker + " ทายว่า" : asker + " ถามว่า")
      : "รออีกฝ่ายตอบ";
    $("answerSub").textContent = m.canRespond
      ? "ตอบตามความจริงของสิ่งที่คุณตั้งไว้"
      : "";
    $("pendingText").textContent = p.text;
    $("btnYes").disabled = !m.canRespond;
    $("btnNo").disabled = !m.canRespond;
  }

  function renderResult(m) {
    var r = m.result || {};
    $("resultTitle").textContent = r.draw ? "เสมอ" : (r.winner === state.youId ? "คุณชนะ!" : nameOf(r.winner) + " ชนะ");
    var box = $("resultReveal");
    clear(box);
    if (m.mySeat) box.appendChild(el("p", null, "ของที่คุณตั้ง: " + (m.mySeat.secret || "-")));
    if (m.theirSeat) box.appendChild(el("p", null, "ของที่คุณต้องทาย: " + (m.theirSeat.secret || "-")));
    $("btnAgain").hidden = !state.isHost;
  }

  function renderHistory(m) {
    var wrap = $("history");
    clear(wrap);
    if (!m.theirSeat || !m.theirSeat.asked.length) {
      wrap.appendChild(el("p", "faint", "ยังไม่มีคำถาม"));
      return;
    }
    m.theirSeat.asked.forEach(function (a, i) {
      var row = el("div", "qa-row");
      row.appendChild(el("span", "qa-num", String(i + 1)));
      row.appendChild(el("span", "grow", a.question));
      row.appendChild(el("span", "badge " + (a.answer ? "ok" : "no"), a.answer ? "ใช่" : "ไม่ใช่"));
      wrap.appendChild(row);
    });
    m.theirSeat.guesses.forEach(function (g) {
      var row = el("div", "qa-row");
      row.appendChild(el("span", "qa-num", "ทาย"));
      row.appendChild(el("span", "grow", g.value));
      row.appendChild(el("span", "badge " + (g.correct ? "ok" : "no"), g.correct ? "ถูก!" : "ผิด"));
      wrap.appendChild(row);
    });
  }

  function renderScores() {
    var wrap = $("scoreboard");
    clear(wrap);
    state.players.forEach(function (p) {
      var row = el("div", "score-row" + (p.id === state.youId ? " me" : ""));
      row.appendChild(el("span", "grow", p.name));
      row.appendChild(el("b", null, String(p.score)));
      wrap.appendChild(row);
    });
  }

  function runClock(m) {
    clearInterval(ticker);
    var box = $("clock");
    if (!m.deadline || m.phase === "finished" || m.phase === "picking") {
      box.textContent = "--";
      box.className = "timer idle";
      return;
    }
    var fired = false;
    function tick() {
      var left = m.deadline - Date.now();
      if (left <= 0) {
        box.textContent = "0:00";
        box.className = "timer danger";
        clearInterval(ticker);
        if (!fired && state.isHost) {
          fired = true;
          socket.emit("guess-timeout", { roomCode: roomCode });
        }
        return;
      }
      box.textContent = FWUI.fmtTime(left);
      box.className = "timer" + (left < 10000 ? " danger" : "");
    }
    tick();
    ticker = setInterval(tick, 250);
  }

  // ---------- ปุ่มโหมดออนไลน์ ----------

  $("btnCreate").addEventListener("click", function () {
    var name = $("createName").value.trim();
    if (!name) return FWUI.toast("ใส่ชื่อก่อน", "bad");
    FWStore.rememberName(name);
    connect().emit("create-room", { name: name, gameType: "guess" });
  });

  $("btnJoin").addEventListener("click", function () {
    var code = $("joinCode").value.trim().toUpperCase();
    var name = $("joinName").value.trim();
    if (!code || !name) return FWUI.toast("ใส่รหัสห้องและชื่อก่อน", "bad");
    FWStore.rememberName(name);
    var prev = FWStore.readSession(code);
    connect().emit("join-room", {
      roomCode: code, name: name,
      playerId: prev ? prev.playerId : null, gameType: "guess"
    });
  });

  $("btnStart").addEventListener("click", function () {
    socket.emit("guess-settings", { roomCode: roomCode, packId: packId, level: level });
    socket.emit("guess-start", { roomCode: roomCode });
  });

  $("btnRandom").addEventListener("click", function () {
    var w = W.pickWord(packId, level);
    if (w) $("secretInput").value = w;
  });

  $("btnSetSecret").addEventListener("click", function () {
    var v = $("secretInput").value.trim();
    if (!v) return FWUI.toast("พิมพ์ของที่จะให้ทายก่อน", "bad");
    socket.emit("guess-secret", { roomCode: roomCode, value: v });
    $("secretInput").value = "";
  });

  $("btnSend").addEventListener("click", function () {
    var v = $("turnInput").value.trim();
    if (!v) return FWUI.toast("พิมพ์ก่อน", "bad");
    var mode = document.querySelector("[data-mode][aria-pressed=true]");
    var isGuess = mode && mode.dataset.mode === "guess";
    socket.emit(isGuess ? "guess-guess" : "guess-ask",
      isGuess ? { roomCode: roomCode, value: v } : { roomCode: roomCode, question: v });
    $("turnInput").value = "";
  });
  $("turnInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSend").click();
  });

  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-mode]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      $("turnLabel").textContent = b.dataset.mode === "guess" ? "ชื่อที่ทาย" : "คำถาม";
    });
  });

  $("btnYes").addEventListener("click", function () {
    socket.emit("guess-respond", { roomCode: roomCode, yes: true });
  });
  $("btnNo").addEventListener("click", function () {
    socket.emit("guess-respond", { roomCode: roomCode, yes: false });
  });

  $("btnAgain").addEventListener("click", function () {
    socket.emit("guess-again", { roomCode: roomCode });
  });

  $("btnCopyCode").addEventListener("click", function () {
    FWUI.copy(location.origin + "/guess-thing.html?room=" + roomCode, "คัดลอกลิงก์แล้ว");
  });

  $("btnQuit").addEventListener("click", function () {
    if (window.confirm("ออกจากห้อง?")) {
      socket.emit("leave-room", { roomCode: roomCode });
      FWStore.clearSession(roomCode);
      location.href = "/guess-thing.html";
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
        playerId: prev.playerId, gameType: "guess"
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
    socket.on("state", function (s) { state = s; joinSent = false; render(); });
    socket.on("guess-finished", function () { FWUI.toast("จบเกม!", "good"); });
    socket.on("error-msg", function (d) { FWUI.toast(d.message, "bad"); });
    socket.on("kicked", function () {
      FWUI.toast("คุณถูกเชิญออกจากห้อง", "bad");
      setTimeout(function () { location.href = "/guess-thing.html"; }, 1200);
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
        playerId: prev.playerId, gameType: "guess"
      });
    }
  })();

// ---------- โหมดเล่นคนเดียว (สู้ AI) ----------
  //
  // คำลับสุ่มจากคลังคำเดิม ไม่ต้องยิง API — ยิงเฉพาะตอนถามและตอนทาย
  // ข้อจำกัดที่ยอมรับ: คำลับอยู่ในเบราว์เซอร์ คนตั้งใจแอบดูก็ดูได้
  // แต่โหมด 2 คนต่อหน้ากันก็เก็บคำลับทั้งสองฝั่งไว้ในเครื่องเดียวอยู่แล้ว
  // เกมนี้เล่นด้วยความซื่อสัตย์เป็นหลัก จึงไม่คุ้มที่จะทำ state ฝั่ง server

  var SOLO = window.GuessSolo;
  var solo = null;
  var soloBusy = false;

  function startSolo() {
    var w = W.pickWord(packId, level);
    if (!w) { FWUI.toast("คลังคำหมด ลองเปลี่ยนหมวด", "bad"); return; }

    solo = SOLO.createSolo(w, { packId: packId, level: level });
    $("screenSetup").hidden = true;
    $("screenSolo").hidden = false;
    $("soloQuestion").value = "";
    $("soloGuess").value = "";
    renderSolo();
  }

  function renderSolo() {
    var over = SOLO.isOver(solo);
    var pack = W.packById(solo.packId);

    $("soloMeta").textContent = pack ? "หมวด " + pack.name : "สุ่มจากทุกหมวด";
    $("soloQLeft").textContent = "ถามได้อีก " + SOLO.questionsLeft(solo) + " คำถาม";
    $("soloGLeft").textContent = "ทายได้อีก " + solo.guessesLeft + " ครั้ง";

    $("soloAskCard").hidden = over;
    $("btnSoloAsk").disabled = soloBusy || !SOLO.canAsk(solo);
    $("btnSoloGuess").disabled = soloBusy;
    $("btnSoloAsk").textContent = soloBusy ? "รอ..." : (SOLO.canAsk(solo) ? "ถาม" : "ถามครบแล้ว");

    var log = $("soloLog");
    clear(log);
    if (solo.asked.length === 0 && solo.guesses.length === 0) {
      log.appendChild(el("p", "faint", "ยังไม่ได้ถามอะไรเลย"));
    }
    solo.asked.forEach(function (a, i) {
      var row = el("div", "qa-row");
      row.appendChild(el("span", "qa-num", String(i + 1)));
      row.appendChild(el("span", "grow", a.question));
      row.appendChild(el("span", "badge " + answerClass(a.answer), a.answer));
      log.appendChild(row);
    });
    solo.guesses.forEach(function (g) {
      var row = el("div", "qa-row");
      row.appendChild(el("span", "qa-num", "ทาย"));
      row.appendChild(el("span", "grow", g.value));
      row.appendChild(el("span", "badge " + (g.correct ? "ok" : "no"), g.correct ? "ถูก!" : "ผิด"));
      log.appendChild(row);
    });

    $("soloResult").hidden = !over;
    if (over) {
      var won = solo.phase === "won";
      $("soloVerdict").textContent = won ? "ทายถูก!" : "หมดสิทธิ์แล้ว";
      $("soloVerdict").className = "verdict-word " + (won ? "hit" : "high");
      $("soloResultMsg").textContent = won
        ? 'คำตอบคือ "' + solo.secret + '" ใช้ไป ' + solo.asked.length + " คำถาม ได้ " + SOLO.score(solo) + " แต้ม"
        : 'คำตอบคือ "' + solo.secret + '"';
    }
  }

  function answerClass(a) {
    if (a === "ใช่") return "ok";
    if (a === "ไม่ใช่") return "no";
    return "";
  }

  /** ยิงไปถามคู่ต่อสู้ — ล้มเมื่อไหร่ต้องไม่กินโควตาคำถามของคนเล่น */
  function callOracle(payload) {
    soloBusy = true;
    renderSolo();
    return fetch("/api/guess/oracle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d && d.error ? d.error : "คู่ต่อสู้ไม่ตอบ");
          return d;
        });
      })
      .catch(function (err) {
        FWUI.toast(err.message || "คู่ต่อสู้ไม่ตอบ", "bad");
        return null;
      })
      .then(function (d) {
        soloBusy = false;
        return d;
      });
  }

  $("btnSolo").addEventListener("click", startSolo);

  $("btnSoloAsk").addEventListener("click", function () {
    var q = $("soloQuestion").value.trim();
    if (!q) { FWUI.toast("พิมพ์คำถามก่อน", "bad"); return; }
    if (!SOLO.canAsk(solo)) { FWUI.toast("ถามครบ 20 คำถามแล้ว ทายได้อย่างเดียว", "bad"); return; }

    callOracle({
      kind: "question",
      secret: solo.secret,
      question: q,
      history: SOLO.historyForModel(solo)
    }).then(function (d) {
      // ถามไม่สำเร็จ ไม่นับเป็นคำถามที่ใช้ไป เพราะคนเล่นไม่ได้อะไรกลับมา
      if (d) {
        SOLO.recordAnswer(solo, q, d.answer);
        $("soloQuestion").value = "";
      }
      renderSolo();
    });
  });

  $("btnSoloGuess").addEventListener("click", function () {
    var g = $("soloGuess").value.trim();
    if (!g) { FWUI.toast("พิมพ์คำที่จะทายก่อน", "bad"); return; }

    callOracle({ kind: "guess", secret: solo.secret, guess: g }).then(function (d) {
      if (d) {
        SOLO.recordGuess(solo, g, d.correct);
        $("soloGuess").value = "";
      }
      renderSolo();
    });
  });

  $("soloQuestion").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSoloAsk").click();
  });
  $("soloGuess").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSoloGuess").click();
  });

  $("btnSoloAgain").addEventListener("click", startSolo);
  $("btnSoloQuit").addEventListener("click", function () { window.location.reload(); });

  // โชว์ปุ่มเล่นคนเดียวก็ต่อเมื่อ server มี key จริง
  fetch("/api/ai/status")
    .then(function (r) { return r.ok ? r.json() : { available: false }; })
    .then(function (d) { $("soloCard").hidden = !(d && d.available); })
    .catch(function () { /* ไม่มีก็ไม่เป็นไร โหมด 2 คนยังเล่นได้ */ });

})();
