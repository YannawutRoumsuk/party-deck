// public/werewolf.js — บอร์ดเกมหมาป่า (ออนไลน์ คนละเครื่อง)
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var RL = window.WerewolfRoles;
  var GAME_TYPE = "werewolf";

  var socket = null;
  var roomCode = null;
  var session = {};
  var state = null;
  var ticker = null;
  var joinSent = false;   // กันยิง join ซ้ำจนกลายเป็นผู้เล่นสองคน
  var comp = null;          // ชุดบทบาทที่โฮสต์กำลังจัด
  var presetId = "starter";

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
      window.history.replaceState({}, "", "/werewolf.html?room=" + roomCode);
    }
    $("screenSetup").hidden = true;
    $("screenPlay").hidden = false;
    $("roomCode").textContent = roomCode;
    $("bigCode").textContent = roomCode;
    var url = window.location.origin + "/werewolf.html?room=" + roomCode;
    if (!$("qrInvite").firstChild) FWQr.render($("qrInvite"), url, { label: "QR เข้าห้อง" });
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
      var g = state && state.game;
      if (!g || !g.deadline || g.phase === "finished") { stopClock(); return; }
      var left = g.deadline - Date.now();
      if (left <= 0) { $("clock").textContent = "หมดเวลา"; $("clock").className = "timer urgent"; return; }
      var secs = Math.ceil(left / 1000);
      $("clock").textContent = secs >= 60
        ? Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0")
        : secs + " วิ";
      $("clock").className = "timer" + (secs <= 10 ? " urgent" : secs <= 30 ? " warn" : "");
    }, 250);
  }

  // ---------- จัดชุดบทบาท ----------

  function playerCount() { return state ? state.playerCount : 0; }

  function compTotal(c) {
    return Object.keys(c || {}).reduce(function (n, k) { return n + (c[k] || 0); }, 0);
  }

  // คนเข้าออกห้องได้ตลอด ชุดที่คิดไว้ตอนคนยังไม่ครบจึงต้องคิดใหม่
  // แต่ถ้าโฮสต์ปรับเองแล้ว (presetId เป็น null) อย่าไปทับของที่เขาจัดไว้
  function ensureComp() {
    var n = playerCount();
    if (presetId && compTotal(comp) !== n) {
      comp = RL.composeFromPreset(presetId, n) || {};
    }
    if (!comp) comp = RL.composeFromPreset("starter", n) || {};
    return comp;
  }

  function renderPresets() {
    var wrap = $("presetPicker");
    clear(wrap);
    RL.PRESETS.forEach(function (p) {
      var b = el("button", "choice");
      b.appendChild(el("b", null, p.name + " · " + p.forPlayers));
      b.appendChild(el("span", "faint", p.description));
      b.setAttribute("aria-pressed", String(p.id === presetId));
      b.addEventListener("click", function () {
        presetId = p.id;
        comp = RL.composeFromPreset(p.id, playerCount());
        pushSettings();
        renderSetup();
      });
      wrap.appendChild(b);
    });
  }

  function renderCompEditor() {
    var wrap = $("compEditor");
    clear(wrap);
    var c = ensureComp();

    RL.ROLES.forEach(function (role) {
      var row = el("div", "comp-row");
      row.appendChild(el("span", null, role.emoji + " "));

      var info = el("div", "grow");
      info.appendChild(el("b", null, role.name));
      info.appendChild(el("div", "faint", role.description));
      row.appendChild(info);

      var stepper = el("div", "stepper");
      var minus = el("button", "mini ghost", "−");
      var count = el("span", "comp-count", c[role.id] || 0);
      var plus = el("button", "mini ghost", "+");

      minus.addEventListener("click", function () {
        c[role.id] = Math.max(0, (c[role.id] || 0) - 1);
        if (!c[role.id]) delete c[role.id];
        presetId = null;
        pushSettings();
        renderSetup();
      });
      plus.addEventListener("click", function () {
        c[role.id] = (c[role.id] || 0) + 1;
        presetId = null;
        pushSettings();
        renderSetup();
      });

      stepper.appendChild(minus);
      stepper.appendChild(count);
      stepper.appendChild(plus);
      row.appendChild(stepper);
      wrap.appendChild(row);
    });
  }

  function renderSetup() {
    var n = playerCount();
    var c = ensureComp();
    var check = RL.validate(c, n);

    $("compSummary").textContent = "ผู้เล่น " + n + " คน · จัดไว้ " + check.total +
      " บทบาท · หมาป่า " + check.wolves + " ตัว (แนะนำ " + RL.suggestedWolves(n) + ")";
    $("compProblems").textContent = check.ok ? "" : check.problems.join(" · ");
    $("btnStart").disabled = !check.ok;

    renderPresets();
    renderCompEditor();
  }

  function pushSettings() {
    socket.emit("werewolf-settings", { roomCode: roomCode, presetId: presetId, comp: comp });
  }

  // ---------- render ----------

  function nameOf(id) {
    var p = (state.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : "?";
  }

  function render() {
    var g = state.game;

    $("setupSection").hidden = !(state.isHost && (!g || g.phase === "finished"));
    $("hostControls").hidden = !(state.isHost && g && g.phase !== "finished");

    if (!g) {
      $("subtitle").textContent = state.playerCount + " คนในห้อง";
      ["roleSection", "phaseSection", "actionSection", "inspectSection", "voteSection", "resultSection"]
        .forEach(function (id) { $(id).hidden = true; });
      renderPlayers(null);
      if (state.isHost) renderSetup();
      stopClock();
      return;
    }

    $("subtitle").textContent = "วันที่ " + g.day + " · " +
      (g.phase === "night" ? "กลางคืน" : g.phase === "day" ? "กลางวัน" : g.phase === "vote" ? "โหวต" : "จบเกม");

    renderRole(g);
    renderPhase(g);
    renderAction(g);
    renderInspection(g);
    renderVote(g);
    renderPlayers(g);
    renderResult(g);
    runClock();
  }

  function renderRole(g) {
    if (!g.myRoleId) { $("roleSection").hidden = true; return; }
    var role = RL.roleById(g.myRoleId);
    var box = $("myRole");
    clear(box);

    box.className = "role-card team-" + role.team;
    box.appendChild(el("div", "role-emoji", role.emoji));
    box.appendChild(el("div", "role-name", role.name));
    box.appendChild(el("div", "faint", role.description));
    if (!g.alive) box.appendChild(el("span", "badge badge-out", "คุณตายแล้ว"));

    var allies = $("allyBox");
    clear(allies);
    var allyIds = Object.keys(g.allies || {}).filter(function (id) { return id !== state.youId; });
    if (allyIds.length) {
      allies.appendChild(el("div", "faint", "คนที่คุณรู้จัก"));
      allyIds.forEach(function (id) {
        var row = el("div", "score-row");
        row.appendChild(el("div", "grow", nameOf(id)));
        row.appendChild(el("span", "badge badge-out", g.allies[id]));
        allies.appendChild(row);
      });
    }
    $("roleSection").hidden = false;
  }

  function renderPhase(g) {
    var banner = $("phaseBanner");
    banner.className = "phase-banner " + (g.phase === "night" ? "night" : "day");

    if (g.phase === "night") {
      var role = g.currentStepRole ? RL.roleById(g.currentStepRole) : null;
      $("phaseTitle").textContent = "🌙 กลางคืน";
      $("phaseSub").textContent = role
        ? role.emoji + " " + role.name + " กำลังตื่น"
        : "ทุกคนหลับ";
    } else if (g.phase === "day" || g.phase === "vote") {
      $("phaseTitle").textContent = "☀️ กลางวัน";
      var ln = g.lastNight;
      $("phaseSub").textContent = !ln ? "คุยกันได้เลย"
        : ln.deaths.length
          ? "คืนที่ผ่านมา " + ln.deaths.map(function (d) { return d.name; }).join(", ") + " เสียชีวิต"
          : "คืนที่ผ่านมาไม่มีใครตาย";
    } else {
      $("phaseTitle").textContent = "จบเกม";
      $("phaseSub").textContent = g.result ? g.result.label : "";
    }
    $("phaseSection").hidden = false;
  }

  function pickButton(p, onPick, opts) {
    var o = opts || {};
    var b = el("button", "pick-btn" + (p.alive ? "" : " dead") + (o.ally ? " ally" : ""));
    b.appendChild(el("b", null, p.name));
    if (!p.alive && p.deathReason) b.appendChild(el("span", "faint", p.deathReason));
    b.disabled = !p.alive || o.disabled;
    if (onPick) b.addEventListener("click", function () { onPick(p); });
    return b;
  }

  function renderAction(g) {
    var section = $("actionSection");
    var grid = $("pickGrid");
    var extra = $("actionExtra");
    var buttons = $("actionButtons");
    clear(grid); clear(extra); clear(buttons);
    $("actionMsg").textContent = "";

    // นักล่าตายแล้วต้องเลือกคนไปด้วยก่อน
    if (g.amHunterPending) {
      $("actionTitle").textContent = "🏹 คุณตายแล้ว เลือกลากใครไปด้วย";
      $("actionHint").textContent = "เลือกหนึ่งคน คนนั้นจะตายทันที";
      g.players.forEach(function (p) {
        if (p.id === state.youId) return;
        grid.appendChild(pickButton(p, function (t) {
          socket.emit("werewolf-hunter", { roomCode: roomCode, targetId: t.id });
        }));
      });
      section.hidden = false;
      return;
    }

    if (!g.myAction) { section.hidden = true; return; }

    var a = g.myAction;
    var role = RL.roleById(a.roleId);
    $("actionTitle").textContent = role.emoji + " " + role.name;

    if (a.action === "kill") {
      $("actionHint").textContent = a.alreadyVoted
        ? "คุณเลือก " + nameOf(a.alreadyVoted) + " แล้ว รอหมาป่าตัวอื่น"
        : "เลือกเหยื่อคืนนี้ ถ้าหมาป่าเลือกไม่ตรงกัน ระบบจะสุ่มจากเสียงข้างมาก";
      g.players.forEach(function (p) {
        if (g.allies[p.id]) return;   // ไม่ให้เลือกพวกเดียวกัน
        grid.appendChild(pickButton(p, function (t) {
          socket.emit("werewolf-night", { roomCode: roomCode, payload: { targetId: t.id } });
        }));
      });

    } else if (a.action === "protect") {
      $("actionHint").textContent = "เลือกคนที่จะปกป้องคืนนี้ ห้ามซ้ำคนเดิมสองคืนติด";
      g.players.forEach(function (p) {
        grid.appendChild(pickButton(p, function (t) {
          socket.emit("werewolf-night", { roomCode: roomCode, payload: { targetId: t.id } });
        }));
      });

    } else if (a.action === "potion") {
      var victimName = a.wolfTargetId ? nameOf(a.wolfTargetId) : null;
      $("actionHint").textContent = victimName
        ? "คืนนี้หมาป่าเลือก " + victimName + " จะช่วยไหม"
        : "คืนนี้หมาป่ายังไม่ได้เลือกใคร";

      var heal = false;
      var poison = null;

      if (a.wolfTargetId && !a.usedHeal) {
        var healBtn = el("button", "volt block", "💚 ใช้ยาชุบชีวิตช่วย " + victimName);
        healBtn.addEventListener("click", function () {
          heal = true;
          healBtn.textContent = "✅ จะใช้ยาชุบชีวิต";
          healBtn.disabled = true;
        });
        extra.appendChild(healBtn);
      } else if (a.usedHeal) {
        extra.appendChild(el("p", "faint", "ยาชุบชีวิตถูกใช้ไปแล้ว"));
      }

      if (!a.usedPoison) {
        extra.appendChild(el("div", "faint", "เลือกคนที่จะวางยา (ไม่บังคับ)"));
        g.players.forEach(function (p) {
          grid.appendChild(pickButton(p, function (t) {
            poison = poison === t.id ? null : t.id;
            $("actionMsg").textContent = poison ? "จะวางยา " + t.name : "ไม่วางยา";
          }));
        });
      } else {
        extra.appendChild(el("p", "faint", "ยาพิษถูกใช้ไปแล้ว"));
      }

      var done = el("button", "primary block", "จบตาของแม่มด");
      done.addEventListener("click", function () {
        socket.emit("werewolf-night", {
          roomCode: roomCode, payload: { heal: heal, poisonTarget: poison }
        });
      });
      buttons.appendChild(done);

    } else if (a.action === "link") {
      $("actionHint").textContent = "เลือกสองคนให้เป็นคู่รัก ถ้าคนหนึ่งตาย อีกคนตายตาม";
      var picked = [];
      g.players.forEach(function (p) {
        var b = pickButton(p, function (t) {
          var at = picked.indexOf(t.id);
          if (at >= 0) picked.splice(at, 1);
          else if (picked.length < 2) picked.push(t.id);
          b.classList.toggle("ally", picked.indexOf(t.id) >= 0);
          $("actionMsg").textContent = picked.map(nameOf).join(" ❤ ");
          if (picked.length === 2) {
            socket.emit("werewolf-night", {
              roomCode: roomCode, payload: { firstId: picked[0], secondId: picked[1] }
            });
          }
        });
        grid.appendChild(b);
      });

    } else {
      // inspect / aura / findSeer
      $("actionHint").textContent = a.action === "inspect" ? "เลือกคนที่จะตรวจว่าเป็นหมาป่าไหม"
        : a.action === "findSeer" ? "เลือกคนที่จะตรวจว่าเป็นผู้พยากรณ์ไหม"
        : "เลือกคนที่จะตรวจว่ามีบทบาทพิเศษไหม";
      g.players.forEach(function (p) {
        if (p.id === state.youId) return;
        grid.appendChild(pickButton(p, function (t) {
          socket.emit("werewolf-night", { roomCode: roomCode, payload: { targetId: t.id } });
        }));
      });
    }

    section.hidden = false;
  }

  function renderInspection(g) {
    var section = $("inspectSection");
    if (!g.myInspection) { section.hidden = true; return; }

    var box = $("inspectResult");
    clear(box);
    var role = RL.roleById(g.myRoleId);
    var yes = g.myInspection.result;

    box.className = "spy-card" + (yes ? " is-spy" : "");
    box.appendChild(el("div", "spy-label", "คุณตรวจ"));
    box.appendChild(el("div", "spy-role", nameOf(g.myInspection.targetId)));
    box.appendChild(el("div", "spy-place", yes ? "ใช่" : "ไม่ใช่"));
    box.appendChild(el("div", "faint",
      role.id === "seer" ? (yes ? "คนนี้คือหมาป่า" : "คนนี้ไม่ใช่หมาป่า")
      : role.id === "sorceress" ? (yes ? "คนนี้คือผู้พยากรณ์" : "คนนี้ไม่ใช่ผู้พยากรณ์")
      : (yes ? "คนนี้มีบทบาทพิเศษ" : "คนนี้เป็นชาวบ้านธรรมดา")));
    section.hidden = false;
  }

  function renderVote(g) {
    var section = $("voteSection");
    if (g.phase !== "vote") { section.hidden = true; return; }

    var grid = $("voteGrid");
    clear(grid);
    g.players.forEach(function (p) {
      var b = pickButton(p, function (t) {
        socket.emit("werewolf-vote", { roomCode: roomCode, targetId: t.id });
      }, { disabled: !g.alive });
      if (g.vote && g.vote.myVote === p.id) b.classList.add("ally");
      grid.appendChild(b);
    });

    var counts = (g.vote && g.vote.tally) || {};
    var parts = Object.keys(counts).map(function (id) { return nameOf(id) + " " + counts[id]; });
    $("voteTally").textContent = parts.length ? "คะแนน: " + parts.join(" · ") : "ยังไม่มีใครโหวต";
    $("btnResolveVote").hidden = !state.isHost;
    section.hidden = false;
  }

  function renderPlayers(g) {
    var wrap = $("playerList");
    clear(wrap);

    var list = g ? g.players : state.players;
    if (g) {
      var aliveN = g.players.filter(function (p) { return p.alive; }).length;
      $("aliveCount").textContent = aliveN + " คนยังอยู่ จาก " + g.players.length;
    } else {
      $("aliveCount").textContent = state.playerCount + " คนในห้อง";
    }

    list.forEach(function (p) {
      var row = el("div", "score-row" + (g && !p.alive ? " lost" : ""));
      row.appendChild(el("div", "grow", p.name + (p.id === state.youId ? " (คุณ)" : "")));

      if (g && !p.alive) row.appendChild(el("span", "badge badge-out", "ตายแล้ว"));
      // บทบาทโชว์เฉพาะที่ server ยอมส่งมาให้ (ตัวเอง พวกเดียวกัน หรือตอนเฉลย)
      if (g && p.roleId) {
        var r = RL.roleById(p.roleId);
        if (r) row.appendChild(el("span", "badge", r.emoji + " " + r.name));
      }
      row.appendChild(el("div", "score-value", p.score));
      wrap.appendChild(row);
    });
  }

  function renderResult(g) {
    var section = $("resultSection");
    if (g.phase !== "finished" || !g.result) { section.hidden = true; return; }

    $("resultTitle").textContent = g.result.label;
    var box = $("resultReveal");
    clear(box);

    g.players.forEach(function (p) {
      var r = RL.roleById(p.roleId);
      var row = el("div", "reveal-row" + (p.alive ? "" : " is-out"));
      row.appendChild(el("span", "grow", p.name));
      row.appendChild(el("span", "reveal-row-word", r ? r.emoji + " " + r.name : "?"));
      if (g.result.winnerIds.indexOf(p.id) >= 0) {
        row.appendChild(el("span", "badge badge-ready", "ชนะ"));
      }
      box.appendChild(row);
    });
    section.hidden = false;
  }

  // ---------- ปุ่ม ----------

  $("btnStart").addEventListener("click", function () {
    socket.emit("werewolf-start", { roomCode: roomCode });
  });
  $("btnRestart").addEventListener("click", function () {
    if (window.confirm("เริ่มเกมใหม่ทั้งหมด?")) socket.emit("werewolf-start", { roomCode: roomCode });
  });
  $("btnSkip").addEventListener("click", function () {
    socket.emit("werewolf-skip", { roomCode: roomCode });
  });
  $("btnStartVote").addEventListener("click", function () {
    socket.emit("werewolf-start-vote", { roomCode: roomCode });
  });
  $("btnResolveVote").addEventListener("click", function () {
    socket.emit("werewolf-resolve-vote", { roomCode: roomCode });
  });
  $("btnQuit").addEventListener("click", function () {
    socket.emit("leave-room", { roomCode: roomCode });
    FWStore.clearSession(roomCode);
    window.location.href = "/werewolf.html";
  });

  $("btnShowQr").addEventListener("click", function () {
    if (!$("qrBig").firstChild) {
      FWQr.render($("qrBig"), window.location.origin + "/werewolf.html?room=" + roomCode, {});
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
      var wasNoGame = !state || !state.game;
      state = s;
      if (s.settings) {
        if (s.settings.presetId) presetId = s.settings.presetId;
        if (s.settings.comp) comp = s.settings.comp;
      }
      if (wasNoGame && s.game) FWUI.toast("เกมเริ่มแล้ว ดูบทบาทของคุณ", "hot", 6000);
      render();
    });

    socket.on("werewolf-started", function () {
      comp = null;
      FWUI.toast("แจกบทบาทแล้ว กลางคืนเริ่มขึ้น", "hot", 6000);
    });
    socket.on("werewolf-ended", function (d) {
      FWUI.toast(d.result.label, "good", 8000);
    });

    socket.on("error-msg", function (d) {
      FWUI.toast(d.message, "bad", 4500);
      $("actionMsg").textContent = d.message;
      $("createMsg").textContent = d.message;
      $("joinMsg").textContent = d.message;
    });
    socket.on("kicked", function () { window.location.href = "/werewolf.html"; });
    socket.on("session-taken", function () {
      socket.disconnect();
      window.alert("มีการเข้าห้องนี้จากอุปกรณ์อื่น หน้านี้หยุดอัปเดตแล้ว");
      window.location.href = "/werewolf.html";
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
