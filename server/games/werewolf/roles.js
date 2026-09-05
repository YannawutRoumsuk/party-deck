// server/games/werewolf/roles.js — คลังบทบาทและการจัดชุด
//
// team: "wolf" | "village" | "solo"
// night: ลำดับการตื่นตอนกลางคืน (ไม่มี = ไม่ตื่น) เลขน้อยตื่นก่อน
// knows: เห็นหน้าใครบ้างตั้งแต่เริ่มเกม
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WerewolfRoles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ROLES = [
    // ---------- ฝ่ายหมาป่า ----------
    {
      id: "werewolf", name: "หมาป่า", team: "wolf", emoji: "🐺",
      night: 20, action: "kill", knows: "wolves",
      description: "ทุกคืนหมาป่าตื่นมาเลือกเหยื่อร่วมกัน กลางวันต้องกลืนไปกับชาวบ้านให้เนียนที่สุด",
      min: 1
    },
    {
      id: "wolfcub", name: "ลูกหมาป่า", team: "wolf", emoji: "🐾",
      night: 20, action: "kill", knows: "wolves",
      description: "เป็นหมาป่าตัวหนึ่ง แต่ถ้าตายเมื่อไหร่ คืนถัดไปฝ่ายหมาป่าจะฆ่าได้ 2 คน",
      requires: "werewolf"
    },
    {
      id: "minion", name: "ลูกสมุน", team: "wolf", emoji: "😈",
      knows: "wolves",
      description: "รู้ว่าใครเป็นหมาป่า แต่หมาป่าไม่รู้จักคุณ ไม่ได้ออกล่า ชนะพร้อมฝ่ายหมาป่า",
      requires: "werewolf"
    },
    {
      id: "sorceress", name: "แม่มดดำ", team: "wolf", emoji: "🔮",
      night: 40, action: "findSeer",
      description: "ทุกคืนเลือกตรวจหนึ่งคนว่าเป็นผู้พยากรณ์หรือไม่ ฝ่ายหมาป่าแต่หมาป่าไม่รู้จักคุณ",
      requires: "werewolf"
    },

    // ---------- ฝ่ายชาวบ้าน ----------
    {
      id: "villager", name: "ชาวบ้าน", team: "village", emoji: "🧑‍🌾",
      description: "ไม่มีความสามารถพิเศษ มีแค่ปากกับสมอง ใช้ให้คุ้ม"
    },
    {
      id: "seer", name: "ผู้พยากรณ์", team: "village", emoji: "👁️",
      night: 50, action: "inspect",
      description: "ทุกคืนเลือกตรวจหนึ่งคน จะรู้ทันทีว่าเป็นหมาป่าหรือไม่"
    },
    {
      id: "aura", name: "นักดูออร่า", team: "village", emoji: "✨",
      night: 55, action: "aura",
      description: "ทุกคืนเลือกตรวจหนึ่งคน จะรู้ว่ามีบทบาทพิเศษหรือเป็นชาวบ้านธรรมดา"
    },
    {
      id: "doctor", name: "หมอ", team: "village", emoji: "💉",
      night: 30, action: "protect",
      description: "ทุกคืนเลือกปกป้องหนึ่งคนจากหมาป่า ห้ามปกป้องคนเดิมสองคืนติด"
    },
    {
      id: "witch", name: "แม่มด", team: "village", emoji: "🧪",
      night: 35, action: "potion",
      description: "มียาชุบชีวิต 1 ครั้งและยาพิษ 1 ครั้ง ใช้ได้อย่างละหนเดียวทั้งเกม"
    },
    {
      id: "hunter", name: "นักล่า", team: "village", emoji: "🏹",
      description: "ตายเมื่อไหร่ ไม่ว่าจะถูกหมาป่ากัดหรือถูกประหาร ลากใครไปด้วยได้อีกหนึ่งคน"
    },
    {
      id: "elder", name: "ผู้เฒ่า", team: "village", emoji: "🧓",
      description: "รอดจากการถูกหมาป่ากัดครั้งแรกได้ แต่ครั้งที่สองไม่รอด และถูกประหารก็ตายปกติ"
    },
    {
      id: "mason", name: "พี่น้องร่วมสาบาน", team: "village", emoji: "🤝",
      knows: "masons",
      description: "รู้จักกันเองตั้งแต่เริ่มเกม จึงไว้ใจกันได้แน่นอน ต้องมีอย่างน้อย 2 คน",
      minCount: 2
    },
    {
      id: "cupid", name: "คิวปิด", team: "village", emoji: "💘",
      night: 10, action: "link", firstNightOnly: true,
      description: "คืนแรกจับคู่รักสองคน ถ้าคนหนึ่งตาย อีกคนตายตาม และถ้าเหลือแค่คู่รัก คู่นั้นชนะ"
    },

    // ---------- ฝ่ายตัวเอง ----------
    {
      id: "tanner", name: "คนฟอกหนัง", team: "solo", emoji: "🎭",
      description: "ชนะคนเดียวถ้าถูกโหวตประหาร ต้องทำตัวให้น่าสงสัยโดยไม่ให้ใครจับได้ว่าตั้งใจ"
    }
  ];

  // เซ็ตแนะนำ เลือกแล้วเล่นได้เลยไม่ต้องคิดเอง
  var PRESETS = [
    {
      id: "starter", name: "มือใหม่", forPlayers: "5–7 คน",
      description: "กติกาพื้นฐาน เข้าใจง่าย เหมาะกับวงที่เพิ่งเคยเล่น",
      compose: function (n) {
        return {
          werewolf: n >= 8 ? 2 : 1,
          seer: 1,
          doctor: 1,
          villager: Math.max(0, n - (n >= 8 ? 2 : 1) - 2)
        };
      }
    },
    {
      id: "classic", name: "คลาสสิก", forPlayers: "7–12 คน",
      description: "เพิ่มนักล่าเข้ามา ตายแล้วยังลากคนไปด้วยได้ เกมพลิกได้ตลอด",
      compose: function (n) {
        var wolves = n >= 12 ? 3 : n >= 8 ? 2 : 1;
        return {
          werewolf: wolves,
          seer: 1,
          doctor: 1,
          hunter: 1,
          villager: Math.max(0, n - wolves - 3)
        };
      }
    },
    {
      id: "chaos", name: "ป่วนหนัก", forPlayers: "8–14 คน",
      description: "ใส่แม่มด คิวปิด และคนฟอกหนัง เกมยาวขึ้นและเดาทางยากมาก",
      compose: function (n) {
        var wolves = n >= 12 ? 3 : 2;
        var specials = { werewolf: wolves, seer: 1, doctor: 1, hunter: 1, witch: 1, cupid: 1, tanner: 1 };
        var used = wolves + 6;
        specials.villager = Math.max(0, n - used);
        return specials;
      }
    },
    {
      id: "deception", name: "สายหลอก", forPlayers: "9–14 คน",
      description: "ฝ่ายหมาป่ามีลูกสมุนกับแม่มดดำ ฝ่ายชาวบ้านมีพี่น้องไว้ยืนยันกันเอง",
      compose: function (n) {
        var wolves = n >= 12 ? 2 : 1;
        var comp = {
          werewolf: wolves, minion: 1, sorceress: 1,
          seer: 1, doctor: 1, mason: 2
        };
        comp.villager = Math.max(0, n - (wolves + 6));
        return comp;
      }
    }
  ];

  function roleById(id) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i];
    return null;
  }

  /** จำนวนหมาป่าที่แนะนำตามจำนวนคน — 1 ตัวต่อผู้เล่นราว 3–4 คน */
  function suggestedWolves(n) {
    if (n < 8) return 1;
    if (n < 12) return 2;
    if (n < 16) return 3;
    return 4;
  }

  /**
   * ตรวจว่าชุดบทบาทที่จัดมาเล่นได้จริงไหม
   * @param {object} comp { roleId: count }
   * @param {number} playerCount
   */
  function validate(comp, playerCount) {
    var total = 0;
    var wolfCount = 0;
    var problems = [];

    Object.keys(comp).forEach(function (id) {
      var count = comp[id] || 0;
      if (!count) return;

      var role = roleById(id);
      if (!role) { problems.push("ไม่รู้จักบทบาท " + id); return; }

      total += count;
      if (role.team === "wolf" && role.night === 20) wolfCount += count;

      if (role.minCount && count > 0 && count < role.minCount) {
        problems.push(role.name + " ต้องมีอย่างน้อย " + role.minCount + " คน");
      }
      // บทบาทที่ไม่ระบุ min ให้มีได้คนเดียว กันชุดพัง
      if (!role.min && !role.minCount && count > 1 && role.id !== "villager") {
        problems.push(role.name + " ควรมีแค่คนเดียว");
      }
      if (role.requires && !(comp[role.requires] > 0)) {
        var need = roleById(role.requires);
        problems.push(role.name + " ต้องมี" + (need ? need.name : role.requires) + "ในเกมด้วย");
      }
    });

    if (total !== playerCount) {
      problems.push("รวมได้ " + total + " บทบาท แต่มีผู้เล่น " + playerCount + " คน");
    }
    if (wolfCount < 1) {
      problems.push("ต้องมีหมาป่าอย่างน้อย 1 ตัว");
    }
    if (wolfCount * 2 >= playerCount) {
      problems.push("หมาป่าเยอะเกินไป (" + wolfCount + " จาก " + playerCount + ") ฝ่ายชาวบ้านชนะไม่ได้เลย");
    }

    return { ok: problems.length === 0, problems: problems, total: total, wolves: wolfCount };
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  /** สร้างชุดจากเซ็ตแนะนำ แล้วตัดส่วนที่เกินออกให้พอดีจำนวนคน */
  function composeFromPreset(presetId, playerCount) {
    var preset = presetById(presetId);
    if (!preset) return null;

    var comp = preset.compose(playerCount);
    Object.keys(comp).forEach(function (k) { if (!comp[k]) delete comp[k]; });

    // ถ้าคนน้อยกว่าที่เซ็ตต้องการ ตัดบทบาทพิเศษออกทีละอย่างจากท้ายรายการ
    var order = ["tanner", "cupid", "witch", "sorceress", "minion", "mason", "hunter", "doctor"];
    var guard = 0;
    while (validate(comp, playerCount).total > playerCount && guard++ < 20) {
      var dropped = false;
      for (var i = 0; i < order.length; i++) {
        if (comp[order[i]]) {
          if (order[i] === "mason") delete comp.mason;
          else delete comp[order[i]];
          dropped = true;
          break;
        }
      }
      if (!dropped) break;
    }

    var t = 0;
    Object.keys(comp).forEach(function (k) { t += comp[k]; });
    comp.villager = Math.max(0, (comp.villager || 0) + (playerCount - t));
    if (!comp.villager) delete comp.villager;

    return comp;
  }

  return {
    ROLES: ROLES,
    PRESETS: PRESETS,
    roleById: roleById,
    presetById: presetById,
    suggestedWolves: suggestedWolves,
    validate: validate,
    composeFromPreset: composeFromPreset
  };
});
