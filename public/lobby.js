// public/lobby.js — หน้าแรก: สร้างห้อง / เข้าห้อง
(function () {
  "use strict";

  var $ = FWUI.$;
  var socket = io();

  var createName = $("createName");
  var joinName = $("joinName");
  var joinCode = $("joinCode");

  var remembered = FWStore.lastName();
  if (remembered) {
    createName.value = remembered;
    joinName.value = remembered;
  }

  // เข้ามาจากลิงก์เชิญ /?room=ABCDE ให้เติมรหัสให้เลย
  var invited = new URL(window.location.href).searchParams.get("room");
  if (invited) {
    joinCode.value = invited.trim().toUpperCase().slice(0, 5);
    joinName.focus();
  }

  function goGame(roomCode) {
    window.location.href = "/game.html?room=" + encodeURIComponent(roomCode);
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = busy ? "กำลังเชื่อมต่อ..." : label;
  }

  // ---- สร้างห้อง ----
  $("btnCreate").addEventListener("click", function () {
    var name = createName.value.trim();
    if (!name) {
      $("createMsg").textContent = "ใส่ชื่อก่อนนะ";
      createName.focus();
      return;
    }
    $("createMsg").textContent = "";
    FWStore.rememberName(name);
    setBusy(this, true, "สร้างห้องเลย");
    socket.emit("create-room", { name: name });
  });

  socket.on("room-created", function (data) {
    FWStore.writeSession(data.roomCode, {
      playerId: data.playerId,
      name: createName.value.trim(),
      spectatorKey: data.spectatorKey
    });
    goGame(data.roomCode);
  });

  // ---- เข้าห้อง ----
  $("btnJoin").addEventListener("click", function () {
    var code = joinCode.value.trim().toUpperCase();
    var name = joinName.value.trim();

    if (!code) { $("joinMsg").textContent = "ใส่รหัสห้องก่อน"; joinCode.focus(); return; }
    if (!name) { $("joinMsg").textContent = "ใส่ชื่อด้วย"; joinName.focus(); return; }

    $("joinMsg").textContent = "";
    FWStore.rememberName(name);
    setBusy(this, true, "เข้าห้อง");

    // ถ้าเคยอยู่ห้องนี้มาก่อน ส่ง playerId เดิมไปด้วยเพื่อขอสถานะคืน
    var prev = FWStore.readSession(code);
    socket.emit("join-room", {
      roomCode: code,
      name: name,
      playerId: prev ? prev.playerId : null,
      gameType: "forbidden"
    });
  });

  socket.on("joined", function (data) {
    var prev = FWStore.readSession(data.roomCode) || {};
    FWStore.writeSession(data.roomCode, {
      playerId: data.playerId,
      name: joinName.value.trim() || prev.name,
      spectatorKey: data.spectatorKey || prev.spectatorKey || null
    });
    goGame(data.roomCode);
  });

  // เอารหัสห้องเกมทายเลขมาใส่ที่นี่ ให้พาไปหน้าที่ถูกแทนที่จะขึ้น error เฉยๆ
  socket.on("wrong-game", function (data) {
    FWUI.toast(data.message, "bad", 5000);
    setTimeout(function () {
      window.location.href = "/numbers.html?room=" + data.roomCode;
    }, 1200);
  });

  socket.on("error-msg", function (data) {
    setBusy($("btnCreate"), false, "สร้างห้องเลย");
    setBusy($("btnJoin"), false, "เข้าห้อง");
    $("createMsg").textContent = data.message;
    $("joinMsg").textContent = data.message;
    FWUI.toast(data.message, "bad");
  });

  socket.on("connect_error", function () {
    FWUI.toast("ต่อเซิร์ฟเวอร์ไม่ได้ ลองรีเฟรชหน้าดู", "bad");
  });

  // กด Enter ในช่องไหนก็ยิงปุ่มของฟอร์มนั้น
  [createName].forEach(function (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("btnCreate").click();
    });
  });

  [joinCode, joinName].forEach(function (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("btnJoin").click();
    });
  });
})();
