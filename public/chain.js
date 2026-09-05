// public/chain.js — คำต้องเชื่อม (เครื่องเดียววางกลางวง ทุกคนเห็นจอพร้อมกัน)
//
// เกมนี้ไม่มีความลับ ทุกคนเห็นทุกคำอยู่แล้ว จึงไม่ต้องมีหน้าส่งเครื่อง
// คนที่ถึงตาก็แค่คว้าเครื่องมาพิมพ์
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var C = window.ChainRules;

  var names = ["", "", ""];
  var game = null;
  var ticker = null;

  // ---------- ตั้งค่า ----------

  function renderPlayerInputs() {
    var wrap = $("playerInputs");
    clear(wrap);
    names.forEach(function (name, i) {
      var row = el("div");
      var lab = el("label", null, "ผู้เล่น " + (i + 1));
      lab.setAttribute("for", "pn" + i);
      var input = el("input");
      input.id = "pn" + i;
      input.maxLength = 20;
      input.value = name;
      input.placeholder = "ชื่อผู้เล่น " + (i + 1);
      input.addEventListener("input", function () { names[i] = this.value; });
      row.appendChild(lab); row.appendChild(input);
      wrap.appendChild(row);
    });
    $("btnRemovePlayer").disabled = names.length <= 3;
    $("btnAddPlayer").disabled = names.length >= 10;
  }

  $("btnAddPlayer").addEventListener("click", function () {
    if (names.length < 10) { names.push(""); renderPlayerInputs(); }
  });
  $("btnRemovePlayer").addEventListener("click", function () {
    if (names.length > 3) { names.pop(); renderPlayerInputs(); }
  });
  renderPlayerInputs();

  $("btnStart").addEventListener("click", function () {
    var finals = names.map(function (n, i) { return n.trim() || "ผู้เล่น " + (i + 1); });
    try {
      game = C.createGame(finals);
    } catch (e) {
      FWUI.toast(e.message, "bad");
      return;
    }
    game.deadline = Date.now() + C.TURN_MS;
    $("screenSetup").hidden = true;
    $("screenPlay").hidden = false;
    render();
    runClock();
  });

  // ---------- นาฬิกา ----------

  function stopClock() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    $("clock").textContent = "--";
    $("clock").className = "timer idle";
  }

  function runClock() {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      if (!game.deadline || game.phase === "finished") { stopClock(); return; }

      var left = game.deadline - Date.now();
      if (left <= 0) {
        clearInterval(ticker); ticker = null;
        if (game.phase === "playing") {
          C.timeout(game);
          render();
          if (game.phase !== "finished") runClock();
        } else if (game.phase === "challenge") {
          FWUI.toast("หมดเวลาเถียง ปิดโหวตได้แล้ว", "bad");
        }
        return;
      }

      var secs = Math.ceil(left / 1000);
      $("clock").textContent = game.phase === "challenge"
        ? Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0")
        : secs + " วิ";
      $("clock").className = "timer" + (game.phase === "playing" && secs <= 3 ? " urgent" : secs <= 5 ? " warn" : "");
    }, 200);
  }

  // ---------- render ----------

  function render() {
    $("roundNo").textContent = game.round;
    $("aliveCount").textContent = C.alivePlayers(game).length + " คนยังอยู่ จาก " + game.players.length;

    var last = C.lastWord(game);
    $("lastWord").textContent = last ? last.word : "-";
    $("lastBy").textContent = last ? "โดย " + last.byName : "";

    $("turnCard").hidden = game.phase !== "playing";
    $("challengeCard").hidden = game.phase !== "challenge";
    $("challengeLaunch").hidden = !(game.phase === "playing" && last && last.byId);
    $("btnNextRound").hidden = game.phase !== "finished";

    if (game.phase === "playing") {
      var cur = C.currentPlayer(game);
      $("turnWho").textContent = cur ? cur.name : "-";
      $("turnMsg").textContent = "";
      $("wordInput").value = "";
      renderChallengers();
    }

    if (game.phase === "challenge") renderChallenge();

    renderEvent();
    renderChain();
    renderScores();
  }

  function renderChallengers() {
    var wrap = $("challengers");
    clear(wrap);
    var last = C.lastWord(game);

    C.alivePlayers(game).forEach(function (p) {
      if (p.id === last.byId) return;          // เจ้าของคำชาเลนจ์ตัวเองไม่ได้
      var btn = el("button", "buzz-btn", p.name);
      btn.disabled = !p.canChallenge;
      if (!p.canChallenge) btn.textContent = p.name + " (หมดสิทธิ์)";
      btn.addEventListener("click", function () {
        try { C.startChallenge(game, p.id); } catch (e) { return FWUI.toast(e.message, "bad"); }
        render();
        runClock();
      });
      wrap.appendChild(btn);
    });
  }

  function renderChallenge() {
    var c = game.challenge;
    $("challengeSub").textContent = c.challengerName + " ค้านคำของ " + c.defenderName;
    $("challengeWord").textContent = c.word;

    var wrap = $("voterList");
    clear(wrap);

    C.eligibleVoters(game).forEach(function (p) {
      var row = el("div", "vote-row");
      row.appendChild(el("span", "grow", p.name));

      var voted = c.votes[p.id];
      var yes = el("button", "mini " + (voted === true ? "volt" : "ghost"), "เชื่อมโยง");
      var no = el("button", "mini " + (voted === false ? "danger" : "ghost"), "ไม่เชื่อมโยง");

      yes.addEventListener("click", function () { C.vote(game, p.id, true); render(); });
      no.addEventListener("click", function () { C.vote(game, p.id, false); render(); });

      row.appendChild(yes);
      row.appendChild(no);
      wrap.appendChild(row);
    });

    var t = C.voteTally(game);
    var need = C.eligibleVoters(game).length;
    $("tally").textContent = "เชื่อมโยง " + t.linked + " · ไม่เชื่อมโยง " + t.notLinked + " (โหวตแล้ว " + t.total + "/" + need + ")";
  }

  function renderEvent() {
    var e = game.lastEvent;
    if (!e) { $("eventCard").hidden = true; return; }

    var word = $("eventWord");
    var detail = "";

    if (e.type === "repeat") {
      word.textContent = e.byName + " ตกรอบ";
      word.className = "verdict-word high";
      detail = 'พิมพ์ "' + e.word + '" — ' + e.reason;
    } else if (e.type === "timeout") {
      word.textContent = e.byName + " ตกรอบ";
      word.className = "verdict-word high";
      detail = "หมดเวลา พิมพ์ไม่ทัน";
    } else if (e.type === "challenge") {
      word.textContent = e.challengerWins ? "ชาเลนจ์สำเร็จ" : "ชาเลนจ์ไม่สำเร็จ";
      word.className = "verdict-word " + (e.challengerWins ? "hit" : "high");
      detail = e.message + " (เชื่อมโยง " + e.linked + " : ไม่เชื่อมโยง " + e.notLinked + ")";
    } else if (e.type === "accepted") {
      word.textContent = "ผ่าน";
      word.className = "verdict-word hit";
      detail = e.byName + " ส่งคำว่า " + e.word;
    }

    if (game.phase === "finished") {
      var w = C.playerById(game, game.winnerId);
      word.textContent = w ? w.name + " ชนะรอบนี้!" : "จบรอบ";
      word.className = "verdict-word hit";
      detail = "เหลือคนสุดท้าย ได้โบนัส " + C.POINT_WINNER + " แต้ม";
    }

    $("eventDetail").textContent = detail;
    $("eventCard").hidden = false;
  }

  function renderChain() {
    var wrap = $("chainList");
    clear(wrap);
    game.chain.forEach(function (item, i) {
      var chip = el("span", "chain-chip" + (i === game.chain.length - 1 ? " current" : ""));
      chip.appendChild(el("b", null, item.word));
      chip.appendChild(el("span", "faint", item.byName));
      wrap.appendChild(chip);
    });
  }

  function renderScores() {
    var wrap = $("scoreboard");
    clear(wrap);
    C.standings(game).forEach(function (p, i) {
      var row = el("div", "score-row" + (p.alive ? (i === 0 ? " rank-1" : "") : " lost"));
      row.appendChild(el("div", "score-rank", "#" + (i + 1)));
      row.appendChild(el("div", "grow", p.name));

      if (!p.alive) row.appendChild(el("span", "badge badge-out", "ตกรอบ"));
      else if (!p.canChallenge) row.appendChild(el("span", "badge", "ชาเลนจ์หมด"));

      row.appendChild(el("div", "score-value", p.score));
      wrap.appendChild(row);
    });
  }

  // ---------- ปุ่ม ----------

  $("btnSend").addEventListener("click", function () {
    var cur = C.currentPlayer(game);
    if (!cur) return;

    var text = $("wordInput").value.trim();
    if (!text) { $("turnMsg").textContent = "ยังไม่ได้พิมพ์คำ"; return; }

    var r;
    try {
      r = C.submitWord(game, cur.id, text);
    } catch (e) {
      $("turnMsg").textContent = e.message;
      return;
    }

    if (!r.ok) FWUI.toast(cur.name + " ตกรอบ: " + r.reason, "bad", 6000);
    render();
    if (game.phase !== "finished") runClock();
  });

  $("wordInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btnSend").click();
  });

  $("btnResolve").addEventListener("click", function () {
    var t = C.voteTally(game);
    if (t.total === 0 && !window.confirm("ยังไม่มีใครโหวตเลย ปิดโหวตเลยไหม?")) return;

    C.resolveChallenge(game);
    render();
    if (game.phase !== "finished") runClock();
  });

  $("btnNextRound").addEventListener("click", function () {
    C.nextRound(game);
    render();
    runClock();
  });

  $("btnQuit").addEventListener("click", function () {
    if (window.confirm("จบเกมและกลับไปหน้าตั้งค่า?")) window.location.reload();
  });
})();
