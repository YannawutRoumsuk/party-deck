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

function renderPlayers(state) {
  hostId = state.hostId;

  const isHost = yourId && hostId === yourId;
  $("hostBadge").textContent = isHost ? "โฮสต์" : "";
  roundPaused = !!state.round?.paused;

  const wrap = $("players");
  wrap.innerHTML = "";
  state.users.forEach((u) => {
    const div = document.createElement("div");
    div.className = "player";
    const left = document.createElement("div");
    left.textContent = u.name + (u.id === yourId ? " (คุณ)" : "");
    const right = document.createElement("div");
    right.innerHTML = `
      <span class="badge">${u.hasWord ? "พร้อม" : "ยังไม่ส่งคำ"}</span>
      ${u.id === state.hostId ? `<span class="badge">โฮสต์</span>` : ""}
    `;
    div.appendChild(left);
    div.appendChild(right);
    wrap.appendChild(div);
  });

  const me = state.users.find((u) => u.id === yourId);
  yourHasWord = !!me?.hasWord;

  // ปุ่ม host enable/disable
  $("btnStart").disabled = !!state.round?.running;
  $("btnReset").disabled = !isHost;
  $("btnPause").disabled = !isHost || !state.round?.running;
  $("btnPause").textContent = roundPaused ? "เล่นต่อ (โฮสต์)" : "หยุดชั่วคราว (โฮสต์)";
}

function renderResults(payload) {
  const wrap = $("results");
  wrap.innerHTML = "";
  (payload.others || []).forEach((x) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-name">${x.name} ได้คำว่า</div>
      <div class="result-word">${escapeHtml(x.word)}</div>
    `;
    wrap.appendChild(card);
  });
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

socket.on("round-ended", ({ reason }) => {
  roundPaused = false;
  endsAt = null;
  startTick();
  $("results").innerHTML = "";
  setWordStatus("");
  setMsg(
    reason === "timeup" ? "หมดเวลา กรุณาใส่คำใหม่แล้วเริ่มรอบถัดไป" :
    reason === "reset" ? "รีเซ็ตแล้ว กรุณาใส่คำใหม่" :
    "จบรอบเนื่องจากมีผู้เล่นออกจากห้อง"
  );
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
  return;
  setWordStatus("ส่งแล้ว ✅");
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

$("btnLeave").addEventListener("click", () => {
  socket.emit("leave-room", { roomCode });
  window.location.href = "/";
});

ensureJoin();
startTick();
