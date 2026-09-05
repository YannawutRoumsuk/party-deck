// public/twenty.js — เกม 24 แต้ม (เครื่องเดียววางกลางวง)
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var T = window.TwentyRules;
  var M = window.TwentyMatch;

  var names = ["", ""];
  var minSolutions = 1;
  var game = null;
  var ticker = null;
  var wasRejected = false;   // อีกฝ่ายกดปัดตกไว้หรือเปล่า มีผลต่อการหักแต้ม

  // ---------- ตั้งค่า ----------

  function renderPlayerInputs() {
    var wrap = $("playerInputs");
    clear(wrap);

    names.forEach(function (name, i) {
      var row = el("div");
      var label = el("label", null, "ผู้เล่น " + (i + 1));
      label.setAttribute("for", "pname" + i);
      var input = el("input");
      input.id = "pname" + i;
      input.maxLength = 20;
      input.value = name;
      input.placeholder = "ชื่อผู้เล่น " + (i + 1);
      input.addEventListener("input", function () { names[i] = this.value; });
      row.appendChild(label);
      row.appendChild(input);
      wrap.appendChild(row);
    });

    $("btnRemovePlayer").disabled = names.length <= 2;
    $("btnAddPlayer").disabled = names.length >= 8;
  }

  $("btnAddPlayer").addEventListener("click", function () {
    if (names.length < 8) { names.push(""); renderPlayerInputs(); }
  });
  $("btnRemovePlayer").addEventListener("click", function () {
    if (names.length > 2) { names.pop(); renderPlayerInputs(); }
  });

  document.querySelectorAll("[data-diff]").forEach(function (b) {
    b.addEventListener("click", function () {
      minSolutions = Number(b.dataset.diff);
      document.querySelectorAll("[data-diff]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(Number(x.dataset.diff) === minSolutions));
      });
    });
  });

  renderPlayerInputs();

  $("btnStart").addEventListener("click", function () {
    var finalNames = names.map(function (n, i) { return n.trim() || "ผู้เล่น " + (i + 1); });
    game = M.createGame(finalNames, { minSolutions: minSolutions });
    $("screenSetup").hidden = true;
    $("screenPlay").hidden = false;
    startRound();
  });

  // ---------- นาฬิกา ----------

  function stopClock() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    $("clock").textContent = "--";
    $("clock").className = "timer idle";
  }

  function runClock(onExpire) {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      if (!game.deadline) return;
      var left = game.deadline - Date.now();
      if (left <= 0) {
        clearInterval(ticker); ticker = null;
        onExpire();
        return;
      }
      var secs = Math.ceil(left / 1000);
      $("clock").textContent = secs + " วิ";
      $("clock").className = "timer" + (secs <= 3 ? " urgent" : secs <= 5 ? " warn" : "");
    }, 200);
  }

  // ---------- รอบ ----------

  function startRound() {
    M.nextRound(game);
    wasRejected = false;
    $("allSolutions").hidden = true;
    $("exprInput").value = "";
    $("exprMsg").textContent = "";
    stopClock();
    render();
  }

  function render() {
    $("roundNo").textContent = game.round;
    $("solutionHint").textContent = "ชุดนี้ทำได้ " + game.solutionCount + " วิธี";

    var wrap = $("cards");
    clear(wrap);
    game.cards.forEach(function (n) {
      wrap.appendChild(el("div", "num-card", n));
    });

    $("buzzCard").hidden = game.phase !== "showing";
    $("judgeCard").hidden = game.phase !== "claimed";
    $("typeCard").hidden = game.phase !== "typing";
    $("outcomeCard").hidden = game.phase !== "roundEnd";

    if (game.phase === "showing") renderBuzzers();

    if (game.phase === "claimed") {
      $("claimerName").textContent = M.playerById(game, game.claimerId).name;
    }

    if (game.phase === "typing") {
      $("typeWho").textContent = M.playerById(game, game.claimerId).name;
      $("typeWhy").textContent = wasRejected
        ? "มีคนกดว่าไม่ถูก ให้พิมพ์สูตรออกมาแล้วระบบจะตัดสิน ถ้าสูตรถูกจริงคนที่ปัดตกจะโดนหักแต้ม"
        : "ไม่มีใครกดตัดสินจนหมดเวลา ให้พิมพ์สูตรแล้วระบบจะตัดสินเอง";
      $("exprInput").focus();
    }

    if (game.phase === "roundEnd") renderOutcome();

    renderScores();
  }

  function renderBuzzers() {
    var wrap = $("buzzers");
    clear(wrap);
    game.players.forEach(function (p) {
      var btn = el("button", "buzz-btn", p.name);
      btn.addEventListener("click", function () {
        M.claim(game, p.id);
        render();
        runClock(function () {
          M.judgeTimeout(game);
          startTypingClock();
          render();
        });
      });
      wrap.appendChild(btn);
    });
  }

  function renderOutcome() {
    var o = game.lastOutcome;
    var word = $("outcomeWord");

    var good = o.type === "accepted" || o.type === "verified";
    word.textContent = good ? "ถูกต้อง!" : o.type === "skipped" ? "ข้ามชุดนี้" : "ฟาวล์";
    word.className = "verdict-word " + (good ? "hit" : o.type === "skipped" ? "" : "high");

    var detail = o.message;
    if (o.points) detail += "  (" + (o.points > 0 ? "+" : "") + o.points + " แต้ม)";
    $("outcomeDetail").textContent = detail;

    // เฉลยให้ดูเสมอตอนจบตา จะได้เรียนรู้ว่าชุดนี้ทำยังไงได้บ้าง
    var box = $("revealBox");
    clear(box);
    var all = T.solve(game.cards);
    if (all.count) {
      box.appendChild(el("div", "faint", "ตัวอย่างเฉลย (มีทั้งหมด " + all.count + " วิธี)"));
      all.solutions.slice(0, 3).forEach(function (s) {
        box.appendChild(el("div", "solution-line", s + " = 24"));
      });
    }
  }

  function renderScores() {
    var wrap = $("scoreboard");
    clear(wrap);
    M.standings(game).forEach(function (p, i) {
      var row = el("div", "score-row" + (i < 3 ? " rank-" + (i + 1) : ""));
      row.appendChild(el("div", "score-rank", "#" + (i + 1)));
      row.appendChild(el("div", "grow", p.name));
      if (p.fouls) row.appendChild(el("span", "badge badge-out", "ฟาวล์ " + p.fouls));
      row.appendChild(el("div", "score-value", p.score));
      wrap.appendChild(row);
    });
  }

  // พิมพ์สูตรไม่ทันเวลา ถือว่าฟาวล์ไปเลย จะได้ไม่ค้างทั้งวง
  function startTypingClock() {
    runClock(function () {
      if (game.phase !== "typing") return;
      M.submitExpression(game, "", wasRejected);
      render();
    });
  }

  // ---------- ตัดสิน ----------

  $("btnAccept").addEventListener("click", function () {
    stopClock();
    M.judge(game, true);
    render();
  });

  $("btnReject").addEventListener("click", function () {
    stopClock();
    wasRejected = true;
    M.judge(game, false);
    startTypingClock();
    render();
  });

  $("btnSubmitExpr").addEventListener("click", function () {
    var text = $("exprInput").value.trim();
    if (!text) { $("exprMsg").textContent = "ยังไม่ได้พิมพ์สูตร"; return; }

    M.submitExpression(game, text, wasRejected);
    stopClock();
    render();
  });

  $("exprInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSubmitExpr").click();
  });

  $("btnSkip").addEventListener("click", function () {
    M.skipRound(game);
    stopClock();
    render();
  });

  $("btnNext").addEventListener("click", startRound);

  $("btnShowAll").addEventListener("click", function () {
    var box = $("allSolutions");
    if (!box.hidden) { box.hidden = true; return; }

    clear(box);
    var all = T.solve(game.cards);
    box.appendChild(el("div", "faint", "ทั้งหมด " + all.count + " วิธี"));
    all.solutions.forEach(function (s) {
      box.appendChild(el("div", "solution-line", s + " = 24"));
    });
    box.hidden = false;
  });

  $("btnQuit").addEventListener("click", function () {
    if (window.confirm("จบเกมและกลับไปหน้าตั้งค่า?")) window.location.reload();
  });

})();
