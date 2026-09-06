// public/guess-thing.js — เกมทายของ 20 คำถาม (เครื่องเดียว ส่งกันดู)
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var G = window.GuessRules;
  var W = window.GuessWords;

  var A = "pa", B = "pb";
  var names = {};
  var totals = {};
  var source = "free";
  var level = "common";
  var packId = W.PACKS[0].id;
  var mode = "ask";
  var match = null;
  var holder = null;      // ใครถือเครื่องอยู่
  var ticker = null;
  var usedHints = [];

  // ---------- ตั้งค่า ----------

  var sel = $("packSelect");
  W.PACKS.forEach(function (p) {
    var opt = el("option", null, p.group + " · " + p.name);
    opt.value = p.id;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", function () { packId = this.value; });

  document.querySelectorAll("[data-source]").forEach(function (b) {
    b.addEventListener("click", function () {
      source = b.dataset.source;
      document.querySelectorAll("[data-source]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x.dataset.source === source));
      });
      $("packPicker").hidden = source !== "pack";
    });
  });

  document.querySelectorAll("[data-level]").forEach(function (b) {
    b.addEventListener("click", function () {
      level = b.dataset.level;
      document.querySelectorAll("[data-level]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x.dataset.level === level));
      });
    });
  });

  $("btnStart").addEventListener("click", function () {
    names[A] = $("nameA").value.trim() || "ผู้เล่น 1";
    names[B] = $("nameB").value.trim() || "ผู้เล่น 2";
    if (names[A] === names[B]) names[B] += " 2";
    totals[A] = totals[A] || 0;
    totals[B] = totals[B] || 0;

    startMatch();
  });

  function startMatch() {
    match = G.createMatch([A, B], { packId: packId, level: level });
    holder = null;
    usedHints = [];
    $("screenSetup").hidden = true;
    $("screenPlay").hidden = false;
    step();
  }

  // ---------- ส่งเครื่อง ----------

  function handTo(playerId, why, then) {
    if (holder === playerId) return then();
    holder = playerId;
    $("passName").textContent = names[playerId];
    $("passWhy").textContent = why;
    $("screenPass").hidden = false;
    $("btnPassReady").onclick = function () {
      $("screenPass").hidden = true;
      then();
    };
  }

  function step() {
    if (match.phase === "picking") {
      var next = !match.seats[A].secret ? A : B;
      handTo(next, "ตั้งคำให้อีกฝ่ายทาย อย่าให้เขาเห็นจอ", render);
      return;
    }
    if (match.phase === "asking") {
      handTo(match.turn, "ถึงตาคุณแล้ว จะถามหรือจะทายก็ได้", render);
      return;
    }
    if (match.phase === "answering") {
      var answerer = G.opponentOf(match, match.pending.byId);
      handTo(answerer, "มีคำถามมาถึงคุณ กดตอบได้เลย", render);
      return;
    }
    render();
  }

  // ---------- นาฬิกา ----------

  function stopClock() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    $("clock").textContent = "--";
    $("clock").className = "timer idle";
  }

  function runClock() {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      if (!match.deadline || match.phase === "finished") { stopClock(); return; }
      var left = match.deadline - Date.now();
      if (left <= 0) {
        clearInterval(ticker); ticker = null;
        G.timeout(match);
        FWUI.toast("หมดเวลา เสียตานี้", "bad");
        step();
        return;
      }
      var secs = Math.ceil(left / 1000);
      $("clock").textContent = secs + " วิ";
      $("clock").className = "timer" + (secs <= 10 ? " urgent" : secs <= 20 ? " warn" : "");
    }, 250);
  }

  // ---------- render ----------

  function render() {
    $("playTitle").textContent = "ทายของ";
    $("playSubtitle").textContent = match.phase === "finished"
      ? "จบเกมแล้ว"
      : "ผู้ถืออุปกรณ์: " + (names[holder] || "-");

    $("pickCard").hidden = true;
    $("turnCard").hidden = true;
    $("answerCard").hidden = true;
    $("resultCard").hidden = true;

    if (match.phase === "picking") return renderPick();
    if (match.phase === "asking") return renderTurn();
    if (match.phase === "answering") return renderAnswer();
    return renderResult();
  }

  function renderPick() {
    stopClock();
    $("pickCard").hidden = false;
    $("pickFor").textContent = names[G.opponentOf(match, holder)];
    $("btnRandom").hidden = source !== "pack";
    $("secretInput").value = "";
    $("pickMsg").textContent = "";
    renderHistory();
    renderScores();
  }

  function renderTurn() {
    $("turnCard").hidden = false;
    $("turnWho").textContent = names[match.turn];
    $("guessLeft").textContent = G.guessesLeft(match, match.turn);

    var canGuess = G.guessesLeft(match, match.turn) > 0;
    var guessBtn = document.querySelector('[data-mode="guess"]');
    guessBtn.disabled = !canGuess;
    if (!canGuess && mode === "guess") mode = "ask";

    document.querySelectorAll("[data-mode]").forEach(function (x) {
      x.setAttribute("aria-pressed", String(x.dataset.mode === mode));
    });

    $("turnLabel").textContent = mode === "ask" ? "คำถามที่ตอบได้แค่ใช่/ไม่ใช่" : "ชื่อสิ่งที่คิดว่าใช่";
    $("turnInput").placeholder = mode === "ask" ? "เช่น มีอยู่ในประเทศไทยไหม" : "เช่น ช้าง";
    $("turnHint").textContent = mode === "ask"
      ? "ถามได้ไม่จำกัด ยิ่งถามเยอะยิ่งรู้เยอะ"
      : "ทายผิดเสียสิทธิ์ 1 ครั้ง เหลือ " + G.guessesLeft(match, match.turn) + " ครั้ง";

    renderHints();
    renderHistory();
    renderScores();
    runClock();
  }

  // คำถามแนะนำ สำหรับคนที่คิดไม่ออก
  function renderHints() {
    var row = $("hintRow");
    clear(row);
    if (mode !== "ask") return;

    var pack = match.packId || packId;
    for (var i = 0; i < 3; i++) {
      var h = W.randomHint(pack, usedHints);
      if (!h || usedHints.indexOf(h) >= 0) continue;
      usedHints.push(h);
      (function (text) {
        var b = el("button", "mini ghost", text);
        b.addEventListener("click", function () { $("turnInput").value = text; });
        row.appendChild(b);
      })(h);
    }
    if (usedHints.length > 8) usedHints = usedHints.slice(-4);
  }

  function renderAnswer() {
    $("answerCard").hidden = false;
    var p = match.pending;
    var isGuess = p.kind === "guess";

    $("answerTitle").textContent = isGuess
      ? names[p.byId] + " ขอทายว่า..."
      : names[p.byId] + " ถามว่า...";
    $("answerSub").textContent = isGuess
      ? "ถ้าตรงกับคำที่คุณตั้งไว้ กดถูกต้อง"
      : "ตอบตามความจริงของคำที่คุณตั้งไว้";
    $("pendingText").textContent = p.text;

    $("btnYes").textContent = isGuess ? "✅ ถูกต้อง" : "✅ ใช่";
    $("btnNo").textContent = isGuess ? "❌ ไม่ถูก" : "❌ ไม่ใช่";

    renderHistory();
    renderScores();
    runClock();
  }

  function renderResult() {
    stopClock();
    $("resultCard").hidden = false;

    var r = match.result;
    $("resultTitle").textContent = r.draw ? "เสมอ!" : names[r.winner] + " ชนะ!";

    var box = $("resultReveal");
    clear(box);
    match.playerIds.forEach(function (id) {
      var row = el("div", "reveal-row");
      row.appendChild(el("span", "grow", "คำของ " + names[id]));
      row.appendChild(el("span", "reveal-row-word", match.seats[id].secret));
      box.appendChild(row);
    });

    renderHistory();
    renderScores();
  }

  function renderHistory() {
    var wrap = $("history");
    clear(wrap);

    match.playerIds.forEach(function (guesserId) {
      var target = G.targetOf(match, guesserId);
      var box = el("div", "history-block");

      var head = el("div", "spread");
      head.appendChild(el("b", null, names[guesserId] + " กำลังทายของ " + names[G.opponentOf(match, guesserId)]));
      head.appendChild(el("span", "badge", "ทายเหลือ " + G.guessesLeft(match, guesserId)));
      box.appendChild(head);

      // เจ้าของคำเห็นคำตัวเองได้ คนทายไม่เห็น จนกว่าจะจบเกม
      var ownerId = G.opponentOf(match, guesserId);
      if (match.phase === "finished" || holder === ownerId) {
        box.appendChild(el("div", "history-secret", "คำคือ " + target.secret));
      }

      if (!target.asked.length && !target.guesses.length) {
        box.appendChild(el("p", "faint", "ยังไม่มีอะไร"));
      }

      target.asked.forEach(function (q) {
        var row = el("div", "qa-row");
        row.appendChild(el("span", "grow", q.question));
        row.appendChild(el("span", "badge " + (q.answer ? "badge-ready" : "badge-out"), q.answer ? "ใช่" : "ไม่ใช่"));
        box.appendChild(row);
      });

      target.guesses.forEach(function (g) {
        var row = el("div", "qa-row");
        row.appendChild(el("span", "grow", "ทายว่า " + g.value));
        row.appendChild(el("span", "badge " + (g.correct ? "badge-ready" : "badge-out"), g.correct ? "ถูก" : "ผิด"));
        box.appendChild(row);
      });

      wrap.appendChild(box);
    });
  }

  function renderScores() {
    var wrap = $("scoreboard");
    clear(wrap);
    [A, B].slice().sort(function (a, b) { return (totals[b] || 0) - (totals[a] || 0); })
      .forEach(function (id, i) {
        var row = el("div", "score-row" + (i === 0 ? " rank-1" : ""));
        row.appendChild(el("div", "score-rank", "#" + (i + 1)));
        row.appendChild(el("div", "grow", names[id]));
        if (match.fouls[id]) row.appendChild(el("span", "badge badge-out", "ฟาวล์ " + match.fouls[id]));
        row.appendChild(el("div", "score-value", totals[id] || 0));
        wrap.appendChild(row);
      });
  }

  // ---------- ปุ่ม ----------

  $("btnRandom").addEventListener("click", function () {
    var w = W.pickWord(packId, level);
    if (w) $("secretInput").value = w;
  });

  $("btnSetSecret").addEventListener("click", function () {
    try {
      G.setSecret(match, holder, $("secretInput").value);
    } catch (e) {
      $("pickMsg").textContent = e.message;
      return;
    }
    step();
  });

  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.disabled) return;
      mode = b.dataset.mode;
      $("turnInput").value = "";
      renderTurn();
    });
  });

  $("btnSend").addEventListener("click", function () {
    var text = $("turnInput").value.trim();
    if (!text) { $("turnMsg").textContent = "ยังไม่ได้พิมพ์อะไร"; return; }

    try {
      if (mode === "ask") G.ask(match, match.turn, text);
      else G.guess(match, match.turn, text);
    } catch (e) {
      $("turnMsg").textContent = e.message;
      return;
    }
    $("turnInput").value = "";
    $("turnMsg").textContent = "";
    step();
  });

  $("turnInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSend").click();
  });

  function respond(yes) {
    var answerer = G.opponentOf(match, match.pending.byId);
    try {
      G.respond(match, answerer, yes);
    } catch (e) {
      FWUI.toast(e.message, "bad");
      return;
    }
    if (match.phase === "finished") {
      match.playerIds.forEach(function (id) {
        totals[id] = (totals[id] || 0) + (match.result.scores[id] || 0);
      });
    }
    mode = "ask";
    step();
  }

  $("btnYes").addEventListener("click", function () { respond(true); });
  $("btnNo").addEventListener("click", function () { respond(false); });

  $("btnAgain").addEventListener("click", startMatch);
  $("btnQuit").addEventListener("click", function () {
    if (window.confirm("จบเกมและกลับไปหน้าตั้งค่า?")) window.location.reload();
  });

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
