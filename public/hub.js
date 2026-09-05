// public/hub.js — หน้าเลือกเกม
(function () {
  "use strict";

  var $ = FWUI.$;
  var el = FWUI.el;
  var clear = FWUI.clear;
  var CAT = window.GameCatalog;

  var people = 0;   // 0 = ไม่กรอง

  // "6+ คน" หมายถึง 6 ขึ้นไป ส่วนตัวเลขอื่นคือจำนวนคนเป๊ะๆ
  function fits(game, n) {
    if (!n) return true;
    if (n >= 6) return game.players.max >= 6;
    return n >= game.players.min && n <= game.players.max;
  }

  function card(game) {
    var wrap = el("article", "game-card accent-" + game.accent);

    var top = el("div", "game-top");
    top.appendChild(el("span", "game-emoji", game.emoji));

    var titles = el("div", "grow");
    titles.appendChild(el("h2", "game-name", game.name));
    titles.appendChild(el("p", "game-tagline", game.tagline));
    top.appendChild(titles);
    wrap.appendChild(top);

    var meta = el("div", "game-meta");
    meta.appendChild(el("span", "badge badge-people", "👥 " + game.players.sweet));
    meta.appendChild(el("span", "badge", "⏱ " + game.minutes));
    wrap.appendChild(meta);

    wrap.appendChild(el("p", "muted", game.description));

    var tags = el("ul", "game-highlights");
    game.highlights.forEach(function (h) { tags.appendChild(el("li", null, h)); });
    wrap.appendChild(tags);

    var cta = el("a", "btn " + (game.accent === "volt" ? "volt" : game.accent === "gold" ? "gold-btn" : "primary") + " block", "เล่น" + game.name);
    cta.href = game.href;
    wrap.appendChild(cta);

    return wrap;
  }

  function render() {
    var grid = $("gameGrid");
    clear(grid);

    var list = CAT.GAMES.filter(function (g) { return fits(g, people); });
    list.forEach(function (g) { grid.appendChild(card(g)); });

    $("noMatch").hidden = list.length > 0;

    document.querySelectorAll("[data-people]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.people) === people));
    });
  }

  document.querySelectorAll("[data-people]").forEach(function (b) {
    b.addEventListener("click", function () {
      people = Number(b.dataset.people);
      render();
    });
  });

  render();

  // ---------- เข้าห้องด้วยรหัส ----------
  //
  // หน้านี้ไม่รู้ว่ารหัสนั้นเป็นเกมอะไร จึงส่งไปหน้าคำต้องห้ามก่อน
  // ถ้าเป็นห้องเกมอื่น server จะตอบ wrong-game แล้วหน้านั้นพาต่อไปเอง
  function quickJoin() {
    var code = $("quickCode").value.trim().toUpperCase();
    if (code.length < 5) {
      $("quickMsg").textContent = "รหัสห้องมี 5 ตัว";
      return;
    }
    window.location.href = "/forbidden.html?room=" + encodeURIComponent(code);
  }

  $("btnQuickJoin").addEventListener("click", quickJoin);
  $("quickCode").addEventListener("keydown", function (e) {
    if (e.key === "Enter") quickJoin();
  });

  // ลิงก์เชิญเก่า /?room=XXXXX ที่แชร์กันไปแล้ว ต้องยังใช้ได้
  var invited = new URL(window.location.href).searchParams.get("room");
  if (invited) {
    window.location.replace("/forbidden.html?room=" + encodeURIComponent(invited));
  }
})();
