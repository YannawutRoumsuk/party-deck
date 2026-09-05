// public/numbers.js — เกมทายเลข ทั้งโหมดต่อหน้ากันและออนไลน์
//
// สองโหมดใช้ NumbersRules ตัวเดียวกับ server (โหลดจาก /numbers-rules.js)
// ต่างกันแค่ "ใครถือ state" — ต่อหน้ากันถือไว้ในเบราว์เซอร์ ออนไลน์ให้ server ถือ
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var NR = window.NumbersRules;

  var GAME_TYPE = "numbers";

  // ---------- โหมดและการตั้งค่า ----------

  var place = "local";        // local | online
  var format = "single";      // single | alternate
  var maxGuesses = 5;

  function syncChoices() {
    document.querySelectorAll("[data-place]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.place === place));
    });
    document.querySelectorAll("[data-format]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.format === format));
    });
    $("localSetup").hidden = place !== "local";
    $("onlineSetup").hidden = place !== "online";
  }

  function syncGuessHint() {
    var n = maxGuesses;
    // 2^n ต้องครอบ 99 ตัวถึงจะการันตีหาเจอด้วยการแบ่งครึ่ง
    var covered = Math.pow(2, n);
    $("guessHint").textContent = covered >= 99
      ? "ทาย " + n + " ครั้ง เล่นดีๆ หาเจอได้ทุกเลข"
      : "ทาย " + n + " ครั้ง ครอบได้แค่ " + covered + " จาก 99 เลข ต้องมีดวงช่วย (ใช้ 7 ครั้งถึงจะเจอชัวร์)";
  }

  document.querySelectorAll("[data-place]").forEach(function (b) {
    b.addEventListener("click", function () { place = b.dataset.place; syncChoices(); });
  });
  document.querySelectorAll("[data-format]").forEach(function (b) {
    b.addEventListener("click", function () { format = b.dataset.format; syncChoices(); });
  });
  $("maxGuesses").addEventListener("input", function () {
    var n = Number(this.value);
    maxGuesses = Number.isFinite(n)
      ? Math.max(NR.MIN_GUESSES, Math.min(Math.round(n), NR.MAX_GUESSES))
      : NR.DEFAULT_GUESSES;
    syncGuessHint();
  });

  syncChoices();
  syncGuessHint();

  // ---------- สลับหน้าจอ ----------

  function show(screen) {
    $("screenSetup").hidden = screen !== "setup";
    $("screenPlay").hidden = screen !== "play";
    if (screen !== "pass") $("screenPass").hidden = true;
  }

  // ---------- engine: ต่อหน้ากัน (state อยู่ในเบราว์เซอร์) ----------

  var local = null;   // { match, names:{id:name}, totals:{id:n} }

  function localStart(nameA, nameB) {
    var ids = ["p1", "p2"];
    var prevTotals = local ? local.totals : { p1: 0, p2: 0 };
    var gameNo = local ? local.gameNo + 1 : 0;

    local = {
      names: { p1: nameA, p2: nameB },
      totals: prevTotals,
      gameNo: gameNo,
      match: NR.createMatch({
        playerIds: ids,
        format: format,
        maxGuesses: maxGuesses,
        firstGuesser: ids[gameNo % 2]   // สลับคนเริ่มก่อนทุกเกม
      })
    };
    show("play");
    localStep();
  }

  // ขั้นต่อไปของโหมดต่อหน้ากัน — ต้องมีหน้าคั่น "ส่งเครื่อง" ทุกครั้งที่เปลี่ยนมือ
  var localHolder = null;   // ใครถือเครื่องอยู่ตอนนี้

  function localStep() {
    var m = local.match;

    if (m.phase === "picking") {
      var next = !NR.hasSecret(m, "p1") ? "p1" : "p2";
      handTo(next, "ถึงตาเลือกเลขลับ", function () { renderLocal(); });
      return;
    }
    if (m.phase === "playing") {
      handTo(m.turn, "ถึงตาทาย", function () { renderLocal(); });
      return;
    }
    renderLocal();
  }

  function handTo(playerId, why, then) {
    if (localHolder === playerId) return then();

    localHolder = playerId;
    $("passName").textContent = local.names[playerId];
    $("passWhy").textContent = why + " — อย่าให้อีกฝ่ายเห็นจอ";
    $("screenPass").hidden = false;

    $("btnPassReady").onclick = function () {
      $("screenPass").hidden = true;
      then();
    };
  }

  // ---------- engine: ออนไลน์ ----------

  var socket = null;
  var roomCode = null;
  var session = {};
  var remote = null;   // state ล่าสุดจาก server

  function connectOnline() {
    if (socket) return socket;
    socket = io();
    wireOnline();
    return socket;
  }

  function isOnline() { return place === "online"; }

  // ---------- ตัวช่วยอ่าน state (รวมสองโหมดให้ render ใช้ร่วมกัน) ----------

  function view() {
    if (isOnline()) {
      if (!remote || !remote.match) return null;
      return {
        me: remote.youId,
        match: remote.match,
        nameOf: function (id) {
          var p = remote.players.filter(function (x) { return x.id === id; })[0];
          return p ? p.name : "?";
        },
        totals: remote.players.reduce(function (acc, p) { acc[p.id] = p.score; return acc; }, {}),
        order: remote.players.map(function (p) { return p.id; })
      };
    }
    if (!local) return null;
    return {
      me: localHolder,
      match: localMatchView(),
      nameOf: function (id) { return local.names[id]; },
      totals: local.totals,
      order: ["p1", "p2"]
    };
  }

  // โหมดต่อหน้ากันมี match ดิบอยู่ในมือ แปลงให้หน้าตาเหมือนที่ server ส่งมา
  function localMatchView() {
    var m = local.match;
    var reveal = m.phase === "finished";
    var targets = {};

    m.playerIds.forEach(function (id) {
      var t = m.targets[id];
      targets[id] = t ? {
        low: t.low, high: t.high, remaining: NR.remaining(t),
        found: t.found, guessCount: t.guesses.length,
        guesses: t.guesses.slice(),
        // เครื่องเดียวกัน จึงต้องซ่อนตามคนที่ถืออยู่ ณ ตอนนั้น
        secret: (reveal || id === localHolder) ? t.secret : null
      } : null;
    });

    return {
      format: m.format, maxGuesses: m.maxGuesses, phase: m.phase,
      playerIds: m.playerIds, turn: m.turn,
      yourTurn: m.turn === localHolder,
      opponentId: localHolder ? NR.opponentOf(m, localHolder) : null,
      equalizerFor: m.equalizerFor, targets: targets, result: m.result,
      guessesLeft: m.turn ? NR.guessesLeft(m, m.turn) : null
    };
  }

  // ---------- render ----------

  function verdictText(v) {
    return v === "hit" ? "ถูกต้อง!" : v === "high" ? "สูงไป" : "ต่ำไป";
  }

  function renderHistory(v) {
    var wrap = $("historyWrap");
    clear(wrap);

    v.match.playerIds.forEach(function (ownerId) {
      var t = v.match.targets[ownerId];
      if (!t) return;

      var guesserId = ownerId === v.match.playerIds[0] ? v.match.playerIds[1] : v.match.playerIds[0];
      var box = el("div", "history-block");

      var head = el("div", "spread");
      head.appendChild(el("b", null, v.nameOf(guesserId) + " ทายเลขของ " + v.nameOf(ownerId)));
      head.appendChild(el("span", "badge", t.guessCount + "/" + v.match.maxGuesses + " ครั้ง"));
      box.appendChild(head);

      if (t.secret != null) {
        box.appendChild(el("div", "history-secret", "เลขลับคือ " + t.secret));
      }

      if (!t.guesses.length) {
        box.appendChild(el("p", "faint", "ยังไม่มีการทาย"));
      } else {
        var list = el("div", "guess-list");
        t.guesses.forEach(function (g) {
          var chip = el("span", "guess-chip " + g.verdict);
          chip.appendChild(el("b", null, g.value));
          chip.appendChild(el("span", null, verdictText(g.verdict)));
          list.appendChild(chip);
        });
        box.appendChild(list);
      }
      wrap.appendChild(box);
    });
  }

  function renderScores(v) {
    var wrap = $("totalScores");
    clear(wrap);

    v.order.slice().sort(function (a, b) {
      return (v.totals[b] || 0) - (v.totals[a] || 0);
    }).forEach(function (id, i) {
      var row = el("div", "score-row" + (i === 0 ? " rank-1" : ""));
      row.appendChild(el("div", "score-rank", "#" + (i + 1)));
      row.appendChild(el("div", "grow", v.nameOf(id) + (id === v.me ? " (คุณ)" : "")));
      row.appendChild(el("div", "score-value", v.totals[id] || 0));
      wrap.appendChild(row);
    });
  }

  function renderResult(v) {
    var card = $("resultCard");
    if (v.match.phase !== "finished") { card.hidden = true; return; }

    var r = v.match.result;
    $("resultTitle").textContent = r.draw
      ? "เสมอ!"
      : (r.winner === v.me ? "คุณชนะ!" : v.nameOf(r.winner) + " ชนะ");

    var reveal = $("resultReveal");
    clear(reveal);
    v.match.playerIds.forEach(function (ownerId) {
      var t = v.match.targets[ownerId];
      var row = el("div", "reveal-row");
      row.appendChild(el("span", "grow", "เลขลับของ " + v.nameOf(ownerId)));
      row.appendChild(el("span", "reveal-row-word", t.secret));
      reveal.appendChild(row);
    });

    var scores = $("resultScores");
    clear(scores);
    v.match.playerIds.forEach(function (id) {
      var got = r.scores[id] || 0;
      var t = v.match.targets[NR.opponentOf(v.match, id)];
      var detail = t.found
        ? "เจอในครั้งที่ " + t.guessCount
        : "หาไม่เจอ";
      var row = el("div", "score-row");
      row.appendChild(el("div", "grow", v.nameOf(id) + " — " + detail));
      row.appendChild(el("div", "score-value", "+" + got));
      scores.appendChild(row);
    });

    // ออนไลน์ให้เฉพาะโฮสต์กดเริ่มเกมใหม่ กันกดชนกัน
    $("btnAgain").hidden = isOnline() && !(remote && remote.isHost);
    card.hidden = false;
  }

  function render() {
    var v = view();
    if (!v) return;

    var m = v.match;
    var meIsPlayer = m.playerIds.indexOf(v.me) >= 0;

    $("playTitle").textContent = isOnline() ? "ห้อง " + roomCode : "ทายเลข";
    $("playSubtitle").textContent =
      (m.format === "single" ? "ทายฝ่ายเดียวก่อน" : "ผลัดกันทาย") +
      " · ฝั่งละ " + m.maxGuesses + " ครั้ง";

    $("guessesLeft").textContent = m.phase === "playing" && m.guessesLeft != null
      ? "เหลือ " + m.guessesLeft
      : "-";
    $("guessesLeft").className = "timer" + (m.phase === "playing" ? "" : " idle");

    // --- เลือกเลขลับ ---
    var needSecret = m.phase === "picking" && meIsPlayer && !m.targets[v.me];
    $("pickCard").hidden = !needSecret;
    if (needSecret) $("pickWho").textContent = v.nameOf(v.me);

    // --- รอ ---
    var waiting = m.phase === "picking" && !needSecret;
    $("waitCard").hidden = !waiting;
    if (waiting) {
      $("waitTitle").textContent = "รออีกฝ่ายเลือกเลข";
      $("waitMsg").textContent = "คุณเลือกเลขแล้ว รอให้อีกฝ่ายเลือกบ้าง";
    }

    // --- ทาย ---
    var canGuess = m.phase === "playing" && m.yourTurn;
    $("guessCard").hidden = !canGuess;
    if (canGuess) {
      var target = m.targets[NR.opponentOf(m, v.me)];
      $("guessTitle").textContent = m.equalizerFor === v.me ? "ตาแก้ตัว!" : "ตาของคุณ";
      $("guessWhose").textContent = m.equalizerFor === v.me
        ? "อีกฝ่ายทายเจอแล้ว ตานี้คือโอกาสสุดท้าย ถ้าเจอด้วยถือว่าเสมอ"
        : "ทายเลขลับของ " + v.nameOf(NR.opponentOf(m, v.me));
      $("rangeLow").textContent = target.low;
      $("rangeHigh").textContent = target.high;
      $("rangeCount").textContent = "เหลือ " + target.remaining + " เลข";
      $("guessInput").min = target.low;
      $("guessInput").max = target.high;
      $("guessInputLabel").textContent = isOnline()
        ? "พิมพ์เลขที่ทาย"
        : "กดเลขที่ " + v.nameOf(v.me === m.playerIds[0] ? m.playerIds[1] : m.playerIds[0]) + " ทายออกมา";
    }

    // ตาอีกฝ่าย (เฉพาะออนไลน์ — ต่อหน้ากันจะมีหน้าส่งเครื่องคั่นแทน)
    if (isOnline() && m.phase === "playing" && !m.yourTurn) {
      $("waitCard").hidden = false;
      $("waitTitle").textContent = "ตาของ " + v.nameOf(m.turn);
      $("waitMsg").textContent = "รออีกฝ่ายทาย เลขที่เขาทายจะขึ้นให้เห็นด้านล่าง";
    }

    renderHistory(v);
    renderScores(v);
    renderResult(v);
  }

  function flashVerdict(value, verdict) {
    $("verdictGuess").textContent = value;
    var word = $("verdictWord");
    word.textContent = verdictText(verdict);
    word.className = "verdict-word " + verdict;
    $("verdictCard").hidden = false;
  }

  // ---------- ปุ่มในเกม ----------

  $("btnStartLocal").addEventListener("click", function () {
    var a = $("nameA").value.trim() || "ผู้เล่น 1";
    var b = $("nameB").value.trim() || "ผู้เล่น 2";
    if (a === b) b = b + " 2";
    local = null;
    localHolder = null;
    localStart(a, b);
  });

  $("btnSetSecret").addEventListener("click", function () {
    var value = Math.round(Number($("secretInput").value));
    if (!NR.isValidSecret(value)) {
      $("pickMsg").textContent = "เลขลับต้องเป็นจำนวนเต็ม 1-99";
      return;
    }
    $("pickMsg").textContent = "";
    $("secretInput").value = "";

    if (isOnline()) {
      socket.emit("numbers-secret", { roomCode: roomCode, value: value });
      return;
    }
    try {
      NR.setSecret(local.match, localHolder, value);
    } catch (e) {
      $("pickMsg").textContent = e.message;
      return;
    }
    localStep();
  });

  $("btnGuess").addEventListener("click", function () {
    var value = Math.round(Number($("guessInput").value));
    if (!Number.isInteger(value)) {
      $("guessMsg").textContent = "ใส่เลขก่อน";
      return;
    }
    $("guessMsg").textContent = "";

    if (isOnline()) {
      socket.emit("numbers-guess", { roomCode: roomCode, value: value });
      $("guessInput").value = "";
      return;
    }

    var m = local.match;
    var target = m.targets[NR.opponentOf(m, localHolder)];
    var check = NR.checkGuess(target, value);
    if (!check.ok) {
      $("guessMsg").textContent = check.reason;
      FWUI.toast(check.reason, "bad");
      return;
    }

    var out;
    try {
      out = NR.guess(m, localHolder, value);
    } catch (e) {
      $("guessMsg").textContent = e.message;
      return;
    }

    $("guessInput").value = "";
    flashVerdict(out.value, out.verdict);

    if (m.phase === "finished") {
      m.playerIds.forEach(function (id) {
        local.totals[id] = (local.totals[id] || 0) + (m.result.scores[id] || 0);
      });
      renderLocal();
      return;
    }
    localStep();
  });

  function renderLocal() { render(); }

  $("guessInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnGuess").click();
  });
  $("secretInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSetSecret").click();
  });

  $("btnAgain").addEventListener("click", function () {
    $("verdictCard").hidden = true;
    if (isOnline()) {
      socket.emit("numbers-start", { roomCode: roomCode });
      return;
    }
    localHolder = null;
    localStart(local.names.p1, local.names.p2);
  });

  $("btnQuit").addEventListener("click", function () {
    if (isOnline() && socket) {
      socket.emit("leave-room", { roomCode: roomCode });
      FWStore.clearSession(roomCode);
    }
    window.location.href = "/numbers.html";
  });

  // ---------- ออนไลน์: socket ----------

  function wireOnline() {
    socket.on("connect", function () {
      if (!roomCode) return;
      var prev = FWStore.readSession(roomCode) || {};
      socket.emit("join-room", {
        roomCode: roomCode,
        name: session.name || prev.name,
        playerId: prev.playerId || null,
        gameType: GAME_TYPE
      });
    });

    socket.on("room-created", function (d) {
      roomCode = d.roomCode;
      FWStore.writeSession(d.roomCode, { playerId: d.playerId, name: session.name });
      enterOnlineRoom();
      socket.emit("numbers-settings", { roomCode: roomCode, format: format, maxGuesses: maxGuesses });
    });

    socket.on("joined", function (d) {
      roomCode = d.roomCode;
      var prev = FWStore.readSession(d.roomCode) || {};
      FWStore.writeSession(d.roomCode, { playerId: d.playerId, name: session.name || prev.name });
      enterOnlineRoom();
      if (d.reconnected) FWUI.toast("กลับเข้าห้องแล้ว คะแนนอยู่ครบ", "good");
    });

    socket.on("wrong-game", function (d) {
      FWUI.toast(d.message, "bad", 5000);
      setTimeout(function () {
        window.location.href = d.gameType === "numbers"
          ? "/numbers.html?room=" + d.roomCode
          : "/?room=" + d.roomCode;
      }, 1200);
    });

    socket.on("state", function (s) {
      remote = s;
      if (s.match) render();
      else renderLobbyOnline(s);
    });

    socket.on("numbers-guessed", function (d) {
      flashVerdict(d.value, d.verdict);
      if (remote && d.byId !== remote.youId) {
        FWUI.toast(d.byName + " ทาย " + d.value + " → " + verdictText(d.verdict), "hot");
      }
    });

    socket.on("numbers-finished", function () { FWUI.toast("จบเกม!", "good", 6000); });
    socket.on("numbers-started", function () {
      $("verdictCard").hidden = true;
      FWUI.toast("เริ่มเกมใหม่ เลือกเลขลับได้เลย", "good");
    });

    socket.on("error-msg", function (d) {
      FWUI.toast(d.message, "bad", 4500);
      $("guessMsg").textContent = d.message;
      $("createMsg").textContent = d.message;
      $("joinMsg").textContent = d.message;
    });

    socket.on("kicked", function () { window.location.href = "/numbers.html"; });
    socket.on("session-taken", function () {
      socket.disconnect();
      window.alert("มีการเข้าห้องนี้จากอุปกรณ์อื่นด้วยชื่อเดียวกัน หน้านี้จึงหยุดอัปเดตแล้ว");
      window.location.href = "/numbers.html";
    });
  }

  function enterOnlineRoom() {
    show("play");
    $("inviteCard").hidden = false;
    var url = window.location.origin + "/numbers.html?room=" + roomCode;
    $("inviteLink").textContent = url;
    $("bigCode").textContent = roomCode;
    if (!$("qrInvite").firstChild) {
      FWQr.render($("qrInvite"), url, { label: "QR เข้าห้อง " + roomCode });
    }
  }

  // ยังไม่ครบ 2 คน หรือโฮสต์ยังไม่กดเริ่ม
  function renderLobbyOnline(s) {
    $("playTitle").textContent = "ห้อง " + s.code;
    $("playSubtitle").textContent = s.playerCount + "/2 คน";
    $("pickCard").hidden = true;
    $("guessCard").hidden = true;
    $("resultCard").hidden = true;
    $("waitCard").hidden = false;

    var ready = s.playerCount === 2;
    $("waitTitle").textContent = ready ? "พร้อมเริ่มแล้ว" : "รออีกคนเข้าห้อง";
    $("waitMsg").textContent = ready
      ? (s.isHost ? "กดปุ่มด้านล่างเพื่อเริ่มเกม" : "รอโฮสต์กดเริ่ม")
      : "แชร์ QR หรือรหัสห้องให้เพื่อน";

    clear($("totalScores"));
    s.players.forEach(function (p, i) {
      var row = el("div", "score-row");
      row.appendChild(el("div", "score-rank", "#" + (i + 1)));
      row.appendChild(el("div", "grow", p.name + (p.id === s.youId ? " (คุณ)" : "")));
      row.appendChild(el("div", "score-value", p.score || 0));
      $("totalScores").appendChild(row);
    });

    $("btnAgain").hidden = !(ready && s.isHost);
    $("btnAgain").textContent = "เริ่มเกม";
    $("resultCard").hidden = !(ready && s.isHost);
    if (ready && s.isHost) {
      $("resultTitle").textContent = "พร้อมแล้ว";
      clear($("resultReveal"));
      clear($("resultScores"));
    }
  }

  // ---------- ปุ่มออนไลน์ ----------

  $("btnCreate").addEventListener("click", function () {
    var name = $("createName").value.trim();
    if (!name) { $("createMsg").textContent = "ใส่ชื่อก่อน"; return; }
    session.name = name;
    FWStore.rememberName(name);
    connectOnline().emit("create-room", { name: name, gameType: GAME_TYPE });
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
    connectOnline().emit("join-room", {
      roomCode: code, name: name, playerId: prev.playerId || null, gameType: GAME_TYPE
    });
  });

  // ---------- QR ----------

  $("btnShowQr").addEventListener("click", function () {
    if (!$("qrBig").firstChild) {
      FWQr.render($("qrBig"), $("inviteLink").textContent, { label: "QR เข้าห้อง " + roomCode });
    }
    $("qrModalCode").textContent = roomCode;
    $("qrModal").hidden = false;
    $("btnCloseQr").focus();
  });
  $("btnCloseQr").addEventListener("click", function () {
    $("qrModal").hidden = true;
    $("btnShowQr").focus();
  });
  $("qrModal").addEventListener("click", function (e) {
    if (e.target === $("qrModal")) $("btnCloseQr").click();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("qrModal").hidden) $("btnCloseQr").click();
  });
  $("btnCopyInvite").addEventListener("click", function () {
    FWUI.copy($("inviteLink").textContent, "ก๊อปลิงก์แล้ว");
  });

  // ---------- เข้าจากลิงก์เชิญ ----------

  var invited = new URL(window.location.href).searchParams.get("room");
  if (invited) {
    place = "online";
    syncChoices();
    $("joinCode").value = invited.trim().toUpperCase().slice(0, 5);
    var remembered = FWStore.lastName();
    if (remembered) $("joinName").value = remembered;
    $("joinName").focus();
  } else {
    var last = FWStore.lastName();
    if (last) { $("nameA").value = last; $("createName").value = last; }
  }
})();
