// public/client.js
const socket = io();
const $ = (id) => document.getElementById(id);

function getRoomFromQuery() {
  const url = new URL(window.location.href);
  return (url.searchParams.get("room") || "").trim().toUpperCase();
}

const roomCode = getRoomFromQuery();
$("roomCode").textContent = roomCode || "-";

let yourName = sessionStorage.getItem("twg_name") || "";
let yourId = null;
let hostId = null;

let endsAt = null;
let tickTimer = null;

function setMsg(t) { $("msg").textContent = t || ""; }
function setWordStatus(t) { $("wordStatus").textContent = t || ""; }

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
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
  $("hostBadge").textContent = isHost ? "HOST" : "";

  const wrap = $("players");
  wrap.innerHTML = "";
  state.users.forEach((u) => {
    const div = document.createElement("div");
    div.className = "player";
    const left = document.createElement("div");
    left.textContent = u.name + (u.id === yourId ? " (มึง)" : "");
    const right = document.createElement("div");
    right.innerHTML = `
      <span class="badge">${u.hasWord ? "พร้อม" : "ยังไม่ส่งคำ"}</span>
      ${u.id === state.hostId ? `<span class="badge">host</span>` : ""}
    `;
    div.appendChild(left);
    div.appendChild(right);
    wrap.appendChild(div);
  });

  // ปุ่ม host enable/disable
  $("btnStart").disabled = !isHost;
  $("btnReset").disabled = !isHost;
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
    setMsg("ไม่มี room code ว่ะ กลับไปหน้าแรกก่อน");
    return;
  }
  if (!yourName) {
    yourName = prompt("ใส่ชื่อของมึงหน่อย") || "";
    yourName = yourName.trim();
    if (!yourName) {
      setMsg("ไม่ใส่ชื่อก็เล่นไม่ได้ไอ้เหี้ย");
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

  if (state.round?.running && state.round?.endsAt) {
    endsAt = state.round.endsAt;
  } else {
    endsAt = null;
  }
});

socket.on("round-started", ({ endsAt: e }) => {
  endsAt = e;
  setMsg("เริ่มแล้วไอ้สัส! 🤝");
  startTick();
});

socket.on("result", (payload) => {
  // payload.others: list ของคนอื่นกับคำ assigned ของเขา
  renderResults(payload);
});

socket.on("round-ended", ({ reason }) => {
  endsAt = null;
  startTick();
  $("results").innerHTML = "";
  setWordStatus("");
  setMsg(
    reason === "timeup" ? "หมดเวลา! ใส่คำใหม่แล้วเริ่มรอบต่อไป" :
    reason === "reset" ? "รีเซ็ตแล้ว ใส่คำใหม่เลย" :
    "จบรอบเพราะมีคนหลุด/ออกห้อง"
  );
});

socket.on("error-msg", ({ message }) => {
  setMsg(message);
});

$("btnSubmit").addEventListener("click", () => {
  const word = $("wordInput").value.trim();
  if (!word) return setWordStatus("ส่งคำก่อนดิ");
  socket.emit("submit-word", { roomCode, word });
  setWordStatus("ส่งแล้ว ✅");
});

$("btnStart").addEventListener("click", () => {
  const sec = Number($("durationSec").value);
  const durationMs = Math.max(10, Math.min(sec || 60, 300)) * 1000;
  socket.emit("start-round", { roomCode, durationMs });
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
