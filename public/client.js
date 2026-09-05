// public/client.js
const socket = io();
const $ = (id) => document.getElementById(id);

function getRoomFromQuery() {
  const url = new URL(window.location.href);
  return (url.searchParams.get("room") || "").trim().toUpperCase();
}

const roomCode = getRoomFromQuery();
$("roomCode").textContent = roomCode || "-";
const durationInput = $("durationMin");
if (durationInput && durationInput.previousElementSibling) {
  durationInput.previousElementSibling.textContent = "เวลารอบ (นาที)";
}

let yourName = sessionStorage.getItem("twg_name") || "";
let yourId = null;
let hostId = null;
let roundPaused = false;
let yourHasWord = false;

let endsAt = null;
let tickTimer = null;

function setMsg(t) { $("msg").textContent = t || ""; }
function setWordStatus(t) { $("wordStatus").textContent = t || ""; }
function setWordStatusAnimated(t) {
  const el = $("wordStatus");
  el.textContent = t || "";
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (roundPaused) {
      $("timerText").textContent = "หยุดชั่วคราว";
      return;
    }
    if (!endsAt) {
      $("timerText").textContent = "--:--";
      return;
    }
    const left = endsAt - Date.now();
    $("timerText").textContent = fmtTime(left);
    if (left <= 0) {
      endsAt = null;
      $("timerText").textContent = "00:00";
    }
  }, 250);
}

function getUserNameById(state, id) {
  const u = (state.users || []).find((x) => x.id === id);
  return u ? u.name : "-";
}

function renderResultsList(list) {
  const wrap = $("results");
  if (!wrap) return;
  wrap.innerHTML = "";
  (list || []).forEach((x) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-name">${escapeHtml(x.name)} ได้คำว่า</div>
      <div class="result-word">${escapeHtml(x.word)}</div>
    `;
    wrap.appendChild(card);
  });
}

function renderScoreboard(state) {
  const wrap = $("scoreboard");
  if (!wrap) return;
  wrap.innerHTML = "";
  (state.users || []).forEach((u) => {
    const row = document.createElement("div");
    row.className = `score-row${u.roundLost ? " lost" : ""}`;
    const left = document.createElement("div");
    left.textContent = u.name + (u.id === yourId ? " (คุณ)" : "");
    const right = document.createElement("div");
    right.className = "score-right";

    const total = document.createElement("span");
    total.className = "badge";
    total.textContent = `รวม ${u.score || 0}`;

    const round = document.createElement("span");
    round.className = "badge";
    round.textContent = `รอบนี้ +${u.roundScore || 0}`;

    right.appendChild(total);
    right.appendChild(round);

    if (u.roundLost) {
      const lostBadge = document.createElement("span");
      lostBadge.className = "badge badge-danger";
      lostBadge.textContent = "แพ้";
      right.appendChild(lostBadge);
    }

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });
}

function renderPlayers(state) {
  hostId = state.hostId;

  const isHost = yourId && hostId === yourId;
  $("hostBadge").textContent = isHost ? "โฮสต์" : "";
  roundPaused = !!state.round?.paused;

  const wrap = $("players");
  wrap.innerHTML = "";
  state.users.forEach((u) => {
    const div = document.createElement("div");
    div.className = `player${u.roundLost ? " lost" : ""}`;

    const left = document.createElement("div");
    left.textContent = u.name + (u.id === yourId ? " (คุณ)" : "");

    const right = document.createElement("div");
    right.className = "player-right";

    const badges = document.createElement("div");
    badges.className = "player-badges";

    const wordBadge = document.createElement("span");
    wordBadge.className = "badge";
    wordBadge.textContent = u.hasWord ? "พร้อม" : "ยังไม่ส่งคำ";
    badges.appendChild(wordBadge);

    if (u.id === state.hostId) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "badge";
      hostBadge.textContent = "โฮสต์";
      badges.appendChild(hostBadge);
    }

    if (u.roundLost) {
      const lostBadge = document.createElement("span");
      lostBadge.className = "badge badge-danger";
      const winnerName = u.lostBy ? getUserNameById(state, u.lostBy) : "";
      lostBadge.textContent = winnerName ? `แพ้โดย ${winnerName}` : "แพ้";
      badges.appendChild(lostBadge);
    }

    right.appendChild(badges);

    if (isHost) {
      const actions = document.createElement("div");
      actions.className = "player-actions";

      const kickBtn = document.createElement("button");
      kickBtn.className = "ghost mini";
      kickBtn.textContent = "นำออก";
      kickBtn.disabled = u.id === yourId;
      kickBtn.addEventListener("click", () => {
        if (u.id === yourId) return;
        if (confirm(`นำ ${u.name} ออกจากห้อง?`)) {
          socket.emit("kick-player", { roomCode, targetId: u.id });
        }
      });

      actions.appendChild(kickBtn);

      const canMarkLoss = !!state.round?.running && !u.roundLost;
      const winnerSelect = document.createElement("select");
      winnerSelect.className = "mini-select";
      (state.users || []).forEach((p) => {
        if (p.id === u.id) return;
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name + (p.id === yourId ? " (คุณ)" : "");
        winnerSelect.appendChild(opt);
      });

      const hasWinnerOptions = winnerSelect.options.length > 0;
      if (hasWinnerOptions) {
        const defaultWinner = state.hostId !== u.id ? state.hostId : winnerSelect.options[0].value;
        winnerSelect.value = defaultWinner;
      }

      winnerSelect.disabled = !canMarkLoss || !hasWinnerOptions;

      const lossBtn = document.createElement("button");
      lossBtn.className = "danger mini";
      lossBtn.textContent = u.roundLost ? "แพ้แล้ว" : "ให้แพ้";
      lossBtn.disabled = !canMarkLoss || !hasWinnerOptions;
      lossBtn.addEventListener("click", () => {
        const winnerId = winnerSelect.value;
        if (!winnerId) return;
        socket.emit("mark-loss", { roomCode, loserId: u.id, winnerId });
      });

      if (hasWinnerOptions) {
        actions.appendChild(winnerSelect);
        actions.appendChild(lossBtn);
      }

      right.appendChild(actions);
    }

    div.appendChild(left);
    div.appendChild(right);
    wrap.appendChild(div);
  });

  const me = state.users.find((u) => u.id === yourId);
  yourHasWord = !!me?.hasWord;

  // ปุ่ม host enable/disable
  const btnStart = $("btnStart");
  const btnReset = $("btnReset");
  const btnPause = $("btnPause");
  const btnEndGame = $("btnEndGame");

  if (btnStart) btnStart.disabled = !!state.round?.running;
  if (btnReset) btnReset.disabled = !isHost;
  if (btnPause) btnPause.disabled = !isHost || !state.round?.running;
  if (btnPause) btnPause.textContent = roundPaused ? "เล่นต่อ (โฮสต์)" : "หยุดชั่วคราว (โฮสต์)";
  if (btnEndGame) btnEndGame.disabled = !isHost || !state.round?.running;
}

function renderResults(payload) {
  renderResultsList(payload.others || []);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureJoin() {
  if (!roomCode) {
    setMsg("ไม่พบรหัสห้อง กรุณากลับหน้าแรกก่อน");
    return;
  }
  if (!yourName) {
    yourName = prompt("กรุณาใส่ชื่อของคุณ") || "";
    yourName = yourName.trim();
    if (!yourName) {
      setMsg("หากไม่ใส่ชื่อจะไม่สามารถเล่นได้");
      return;
    }
    sessionStorage.setItem("twg_name", yourName);
  }
  $("yourName").textContent = yourName;

  socket.emit("join-room", { roomCode, name: yourName });
}

socket.on("joined", ({ yourId: id }) => {
  yourId = id;
});

socket.on("room-state", (state) => {
  renderPlayers(state);
  renderScoreboard(state);

  roundPaused = !!state.round?.paused;
  if (state.round?.running && state.round?.endsAt) {
    endsAt = state.round.endsAt;
  } else {
    endsAt = null;
  }
  startTick();
});

socket.on("round-paused", () => {
  roundPaused = true;
  endsAt = null;
  setMsg("พักรอบชั่วคราวแล้ว");
  startTick();
});

socket.on("round-resumed", ({ endsAt: e }) => {
  roundPaused = false;
  endsAt = e;
  setMsg("เล่นต่อแล้ว");
  startTick();
});

socket.on("round-started", ({ endsAt: e }) => {
  roundPaused = false;
  endsAt = e;
  setMsg("เริ่มรอบแล้ว! 🤝");
  startTick();
});

socket.on("result", (payload) => {
  // payload.others: list ของคนอื่นกับคำ assigned ของเขา
  renderResults(payload);
});

socket.on("results-reveal", ({ results }) => {
  renderResultsList(results || []);
});

socket.on("round-ended", ({ reason }) => {
  roundPaused = false;
  endsAt = null;
  startTick();
  const keepResults = reason === "timeup" || reason === "endgame";
  if (!keepResults) $("results").innerHTML = "";
  setWordStatus("");
  setMsg(
    reason === "timeup" ? "หมดเวลา กรุณาใส่คำใหม่แล้วเริ่มรอบถัดไป" :
    reason === "reset" ? "รีเซ็ตแล้ว กรุณาใส่คำใหม่" :
    reason === "endgame" ? "จบเกมแล้ว สามารถใส่คำใหม่เพื่อเริ่มรอบถัดไปได้" :
    "จบรอบเนื่องจากมีผู้เล่นออกจากห้อง"
  );
});

socket.on("kicked", () => {
  alert("คุณถูกนำออกจากห้อง");
  window.location.href = "/";
});

socket.on("error-msg", ({ message }) => {
  setMsg(message);
});

$("btnSubmit").addEventListener("click", () => {
  const word = $("wordInput").value.trim();
  if (!word) return setWordStatus("กรุณาส่งคำก่อน");
  socket.emit("submit-word", { roomCode, word });
  setWordStatusAnimated(yourHasWord ? "เปลี่ยนคำแล้ว" : "ส่งคำแล้ว");
  yourHasWord = true;
});

$("btnStart").addEventListener("click", () => {
  if (!yourId || hostId !== yourId) {
    setMsg("เฉพาะโฮสต์เท่านั้นที่เริ่มรอบได้");
    return;
  }
  const min = Number($("durationMin").value);
  const durationMs = Math.max(1, Math.min(min || 1, 5)) * 60 * 1000;
  socket.emit("start-round", { roomCode, durationMs });
});

$("btnPause").addEventListener("click", () => {
  if (!yourId || hostId !== yourId) {
    setMsg("เฉพาะโฮสต์เท่านั้นที่หยุดหรือเล่นต่อได้");
    return;
  }
  socket.emit("toggle-pause", { roomCode });
});

$("btnReset").addEventListener("click", () => {
  socket.emit("reset-round", { roomCode });
});

const endGameBtn = $("btnEndGame");
if (endGameBtn) {
  endGameBtn.addEventListener("click", () => {
    socket.emit("end-game", { roomCode });
  });
}

$("btnLeave").addEventListener("click", () => {
  socket.emit("leave-room", { roomCode });
  window.location.href = "/";
});

ensureJoin();
startTick();
