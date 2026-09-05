// server/games/chain/rules.js — เกมคำต้องเชื่อม
//
// วนตามผู้เล่น พิมพ์คำที่เชื่อมกับคำก่อนหน้าภายใน 10 วินาที
// ใช้พยางค์ที่เคยออกไปแล้ว = ตกรอบทันที (ระบบตรวจให้)
// ส่วน "เชื่อมโยงกันจริงไหม" ระบบตัดสินแทนคนไม่ได้ จึงใช้การชาเลนจ์แล้วโหวต
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(
    typeof require === "function" ? require("./thai") : root.ThaiWords
  );
  else root.ChainRules = factory(root.ThaiWords);
})(typeof self !== "undefined" ? self : this, function (TH) {
  "use strict";

  var TURN_MS = 10000;        // เวลาพิมพ์คำ
  var DEBATE_MS = 180000;     // เถียงกันตอนชาเลนจ์ 3 นาที

  var POINT_SURVIVE = 1;      // รอดหนึ่งรอบการวน
  var POINT_CHALLENGE_WIN = 2;
  var POINT_WINNER = 5;

  var SEED_WORDS = [
    "ทะเล", "ภูเขา", "โรงเรียน", "ตลาด", "รถไฟ", "ดวงจันทร์", "ข้าว", "ฝน",
    "ความรัก", "เพื่อน", "กาแฟ", "โทรศัพท์", "หมา", "ฟุตบอล", "โรงพยาบาล",
    "ดนตรี", "หนังสือ", "กระเป๋า", "นาฬิกา", "เงิน"
  ];

  function randomSeed() {
    return SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  }

  function createGame(playerNames, options) {
    var opts = options || {};
    if (playerNames.length < 3) throw new Error("เกมนี้ต้องมีอย่างน้อย 3 คน");

    var players = playerNames.map(function (name, i) {
      return {
        id: "p" + i,
        name: name,
        alive: true,
        score: 0,
        canChallenge: true,   // ชาเลนจ์แพ้แล้วหมดสิทธิ์ทั้งรอบ
        outReason: null
      };
    });

    var seed = opts.seed || randomSeed();

    return {
      players: players,
      // ทุกคำที่ออกไปแล้วในรอบนี้ รวมคำตั้งต้น ใช้ตรวจซ้ำ
      usedWords: [seed],
      chain: [{ word: seed, byId: null, byName: "ระบบ" }],
      turnIndex: 0,
      phase: "playing",      // playing | challenge | finished
      deadline: null,
      challenge: null,
      lastEvent: null,
      round: 1,
      winnerId: null
    };
  }

  function alivePlayers(game) {
    return game.players.filter(function (p) { return p.alive; });
  }

  function playerById(game, id) {
    for (var i = 0; i < game.players.length; i++) {
      if (game.players[i].id === id) return game.players[i];
    }
    return null;
  }

  function currentPlayer(game) {
    return game.players[game.turnIndex] || null;
  }

  function lastWord(game) {
    return game.chain[game.chain.length - 1];
  }

  /** เลื่อนไปคนถัดไปที่ยังไม่ตกรอบ */
  function advanceTurn(game) {
    var n = game.players.length;
    for (var step = 1; step <= n; step++) {
      var idx = (game.turnIndex + step) % n;
      if (game.players[idx].alive) {
        game.turnIndex = idx;
        game.deadline = Date.now() + TURN_MS;
        return game;
      }
    }
    return game;
  }

  function checkWinner(game) {
    var alive = alivePlayers(game);
    if (alive.length <= 1) {
      game.phase = "finished";
      game.deadline = null;
      if (alive.length === 1) {
        alive[0].score += POINT_WINNER;
        game.winnerId = alive[0].id;
      }
      return true;
    }
    return false;
  }

  function eliminate(game, playerId, reason) {
    var p = playerById(game, playerId);
    if (!p || !p.alive) return game;

    p.alive = false;
    p.outReason = reason;
    return game;
  }

  /**
   * ส่งคำ
   * @returns {{ok:boolean, eliminated?:boolean, reason?:string}}
   */
  function submitWord(game, playerId, text) {
    if (game.phase !== "playing") throw new Error("ตอนนี้ยังส่งคำไม่ได้");

    var cur = currentPlayer(game);
    if (!cur || cur.id !== playerId) throw new Error("ยังไม่ถึงตาของคุณ");

    var word = String(text || "").trim().replace(/\s+/g, " ");
    if (!word) throw new Error("ยังไม่ได้พิมพ์คำ");
    if (word.length > 30) throw new Error("คำยาวเกินไป");

    var repeat = TH.checkRepeat(word, game.usedWords);
    if (repeat.repeat) {
      eliminate(game, playerId, repeat.reason);
      game.lastEvent = {
        type: "repeat",
        byId: playerId,
        byName: cur.name,
        word: word,
        reason: repeat.reason,
        part: repeat.part
      };
      if (!checkWinner(game)) advanceTurn(game);
      return { ok: false, eliminated: true, reason: repeat.reason };
    }

    game.usedWords.push(word);
    game.chain.push({ word: word, byId: playerId, byName: cur.name });
    cur.score += POINT_SURVIVE;

    game.lastEvent = { type: "accepted", byId: playerId, byName: cur.name, word: word };
    advanceTurn(game);
    return { ok: true };
  }

  /** หมดเวลาพิมพ์ = ตกรอบ */
  function timeout(game) {
    if (game.phase !== "playing") return game;

    var cur = currentPlayer(game);
    if (!cur) return game;

    eliminate(game, cur.id, "หมดเวลา พิมพ์คำไม่ทัน");
    game.lastEvent = { type: "timeout", byId: cur.id, byName: cur.name, reason: "หมดเวลา" };
    if (!checkWinner(game)) advanceTurn(game);
    return game;
  }

  // ---------- ชาเลนจ์ ----------

  /**
   * ใครก็ได้ที่ยังอยู่และยังมีสิทธิ์ กดค้านคำล่าสุดว่าไม่เชื่อมโยง
   * ระบบตัดสินความเชื่อมโยงแทนคนไม่ได้ จึงเปิดให้เถียงแล้วโหวต
   */
  function startChallenge(game, challengerId) {
    if (game.phase !== "playing") throw new Error("ตอนนี้ชาเลนจ์ไม่ได้");

    var last = lastWord(game);
    if (!last || !last.byId) throw new Error("คำตั้งต้นชาเลนจ์ไม่ได้");

    var challenger = playerById(game, challengerId);
    if (!challenger || !challenger.alive) throw new Error("คุณตกรอบไปแล้ว");
    if (!challenger.canChallenge) throw new Error("คุณใช้สิทธิ์ชาเลนจ์ไปแล้วในรอบนี้");
    if (challengerId === last.byId) throw new Error("ชาเลนจ์คำตัวเองไม่ได้");

    game.phase = "challenge";
    game.deadline = Date.now() + DEBATE_MS;
    game.challenge = {
      challengerId: challengerId,
      challengerName: challenger.name,
      defenderId: last.byId,
      defenderName: last.byName,
      word: last.word,
      votes: {}          // playerId -> true(เชื่อมโยง) / false(ไม่เชื่อมโยง)
    };
    return game;
  }

  /**
   * โหวต — คนที่ถูกชาเลนจ์กับคนชาเลนจ์ไม่มีสิทธิ์โหวต เพราะมีส่วนได้เสีย
   * @param {boolean} linked เชื่อมโยงไหม
   */
  function vote(game, voterId, linked) {
    if (game.phase !== "challenge") throw new Error("ตอนนี้ไม่มีการชาเลนจ์");

    var c = game.challenge;
    if (voterId === c.challengerId || voterId === c.defenderId) {
      throw new Error("คู่กรณีโหวตไม่ได้");
    }
    var voter = playerById(game, voterId);
    if (!voter || !voter.alive) throw new Error("คนที่ตกรอบแล้วโหวตไม่ได้");

    c.votes[voterId] = !!linked;
    return game;
  }

  function eligibleVoters(game) {
    var c = game.challenge;
    return alivePlayers(game).filter(function (p) {
      return p.id !== c.challengerId && p.id !== c.defenderId;
    });
  }

  function voteTally(game) {
    var c = game.challenge;
    var linked = 0, notLinked = 0;
    Object.keys(c.votes).forEach(function (id) {
      if (c.votes[id]) linked++; else notLinked++;
    });
    return { linked: linked, notLinked: notLinked, total: linked + notLinked };
  }

  /**
   * ปิดโหวต
   * ฝ่ายไม่เชื่อมโยงชนะ -> คนพูดตกรอบ คนชาเลนจ์ได้แต้ม และยังมีสิทธิ์ชาเลนจ์ต่อ
   * ฝ่ายเชื่อมโยงชนะหรือเสมอ -> คนชาเลนจ์หมดสิทธิ์ชาเลนจ์ในรอบนี้
   */
  function resolveChallenge(game) {
    if (game.phase !== "challenge") throw new Error("ตอนนี้ไม่มีการชาเลนจ์");

    var c = game.challenge;
    var tally = voteTally(game);
    var challenger = playerById(game, c.challengerId);
    var defender = playerById(game, c.defenderId);

    var challengerWins = tally.notLinked > tally.linked;

    if (challengerWins) {
      eliminate(game, c.defenderId, 'คำว่า "' + c.word + '" ถูกโหวตว่าไม่เชื่อมโยง');
      if (challenger) challenger.score += POINT_CHALLENGE_WIN;

      // ถอนคำที่ถูกตีตกออกจากสายและจากกองคำที่ใช้ไปแล้ว
      var idx = game.usedWords.lastIndexOf(c.word);
      if (idx >= 0) game.usedWords.splice(idx, 1);
      if (lastWord(game) && lastWord(game).word === c.word) game.chain.pop();
      if (defender) defender.score = Math.max(0, defender.score - POINT_SURVIVE);
    } else if (challenger) {
      challenger.canChallenge = false;   // เสียงข้างน้อย หมดสิทธิ์
    }

    game.lastEvent = {
      type: "challenge",
      challengerName: c.challengerName,
      defenderName: c.defenderName,
      word: c.word,
      linked: tally.linked,
      notLinked: tally.notLinked,
      challengerWins: challengerWins,
      message: challengerWins
        ? c.defenderName + " ตกรอบ เพราะคำว่า " + c.word + " ถูกโหวตว่าไม่เชื่อมโยง"
        : c.challengerName + " ชาเลนจ์ไม่สำเร็จ หมดสิทธิ์ชาเลนจ์ในรอบนี้"
    };

    game.challenge = null;
    game.phase = "playing";

    if (!checkWinner(game)) {
      // ถ้าคนที่ตกรอบคือเจ้าของตาปัจจุบัน ต้องเลื่อนตาให้ด้วย
      var cur = currentPlayer(game);
      if (!cur || !cur.alive) advanceTurn(game);
      else game.deadline = Date.now() + TURN_MS;
    }
    return game;
  }

  /** เริ่มรอบใหม่ ล้างคำทั้งหมด ทุกคนกลับมาเล่น แต่คะแนนสะสมไว้ */
  function nextRound(game, seed) {
    var word = seed || randomSeed();
    game.players.forEach(function (p) {
      p.alive = true;
      p.canChallenge = true;
      p.outReason = null;
    });
    game.usedWords = [word];
    game.chain = [{ word: word, byId: null, byName: "ระบบ" }];
    game.turnIndex = 0;
    game.phase = "playing";
    game.deadline = Date.now() + TURN_MS;
    game.challenge = null;
    game.lastEvent = null;
    game.winnerId = null;
    game.round += 1;
    return game;
  }

  function standings(game) {
    return game.players.slice().sort(function (a, b) {
      return b.score - a.score || a.name.localeCompare(b.name);
    });
  }

  return {
    TURN_MS: TURN_MS,
    DEBATE_MS: DEBATE_MS,
    POINT_SURVIVE: POINT_SURVIVE,
    POINT_CHALLENGE_WIN: POINT_CHALLENGE_WIN,
    POINT_WINNER: POINT_WINNER,
    SEED_WORDS: SEED_WORDS,
    randomSeed: randomSeed,
    createGame: createGame,
    submitWord: submitWord,
    timeout: timeout,
    startChallenge: startChallenge,
    vote: vote,
    voteTally: voteTally,
    eligibleVoters: eligibleVoters,
    resolveChallenge: resolveChallenge,
    nextRound: nextRound,
    standings: standings,
    currentPlayer: currentPlayer,
    alivePlayers: alivePlayers,
    playerById: playerById,
    lastWord: lastWord
  };
});
