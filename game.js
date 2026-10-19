(() => {
  "use strict";

  /* =========================================================
     NINE ROOM
     A nine-ball salon for the browser.
     Canvas 2D · custom fixed-step physics · synthesized audio.
     ========================================================= */

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const W = 1000;
  const H = 500;
  const R = 12.25;
  const RAIL = 58;
  const OUT_W = W + RAIL * 2;
  const OUT_H = H + RAIL * 2;
  const CORNER_GAP = 36;
  const SIDE_GAP = 29;
  const FIXED_DT = 1 / 240;
  const ROLL_DECEL = 213;
  const MIN_SHOT = 195;
  const MAX_SHOT = 2250;
  const BALL_RESTITUTION = 0.962;
  const RAIL_RESTITUTION = 0.91;
  const STOP_SPEED = 2.4;
  const MAX_CHARGE_SECONDS = 1.08;
  const footSpot = { x: W * 0.75, y: H / 2 };
  const headSpot = { x: W * 0.25, y: H / 2 };

  const COLORS = {
    0: "#f1eadb",
    1: "#e6bd3f",
    2: "#2b64c7",
    3: "#d24840",
    4: "#7049aa",
    5: "#e87e2c",
    6: "#1c8a62",
    7: "#8b2c3e",
    8: "#181a18",
    9: "#e6bd3f",
  };

  const BALL_NAMES = {
    0: "cue ball",
    1: "1 ball",
    2: "2 ball",
    3: "3 ball",
    4: "4 ball",
    5: "5 ball",
    6: "6 ball",
    7: "7 ball",
    8: "8 ball",
    9: "9 ball",
  };

  const POCKETS = [
    { id: "tl", x: 0, y: 0, r: 27, capture: 39, type: "corner", sx: 0, sy: 0 },
    { id: "tm", x: W / 2, y: 0, r: 24, capture: 36, type: "side", sx: W / 2, sy: 0 },
    { id: "tr", x: W, y: 0, r: 27, capture: 39, type: "corner", sx: W, sy: 0 },
    { id: "bl", x: 0, y: H, r: 27, capture: 39, type: "corner", sx: 0, sy: H },
    { id: "bm", x: W / 2, y: H, r: 24, capture: 36, type: "side", sx: W / 2, sy: H },
    { id: "br", x: W, y: H, r: 27, capture: 39, type: "corner", sx: W, sy: H },
  ];

  const dom = {
    hud: document.getElementById("hud"),
    rackTrack: document.getElementById("rackTrack"),
    soundBtn: document.getElementById("soundBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    menuOverlay: document.getElementById("menuOverlay"),
    menuSoundBtn: document.getElementById("menuSoundBtn"),
    menuContrastBtn: document.getElementById("menuContrastBtn"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    resumeBtn: document.getElementById("resumeBtn"),
    restartBtn: document.getElementById("restartBtn"),
    quitBtn: document.getElementById("quitBtn"),
    pauseSoundBtn: document.getElementById("pauseSoundBtn"),
    contrastBtn: document.getElementById("contrastBtn"),
    pauseSub: document.getElementById("pauseSub"),
    gameOverOverlay: document.getElementById("gameOverOverlay"),
    gameOverKicker: document.getElementById("gameOverKicker"),
    gameOverTitle: document.getElementById("gameOverTitle"),
    gameOverSub: document.getElementById("gameOverSub"),
    matchStats: document.getElementById("matchStats"),
    rematchBtn: document.getElementById("rematchBtn"),
    gameMenuBtn: document.getElementById("gameMenuBtn"),
    turnPanel: document.getElementById("turnPanel"),
    turnName: document.getElementById("turnName"),
    turnSub: document.getElementById("turnSub"),
    turnKicker: document.getElementById("turnKicker"),
    turnStatusText: document.getElementById("turnStatusText"),
    turnStripe: document.getElementById("turnStripe"),
    ballInHandBadge: document.getElementById("ballInHandBadge"),
    hint: document.getElementById("hint"),
    toast: document.getElementById("toast"),
    powerFill: document.getElementById("powerFill"),
    powerValue: document.getElementById("powerValue"),
    slowmoTag: document.getElementById("slowmoTag"),
    foulFlash: document.getElementById("foulFlash"),
    aiSettings: document.getElementById("aiSettings"),
    menuContent: document.querySelector(".menu-content"),
  };

  /* ————— Utility ————— */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  };
  const dist = (a, b) => Math.sqrt(dist2(a, b));
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const approachAngle = (current, target, amount) => {
    const d = angleDelta(current, target);
    return current + clamp(d, -amount, amount);
  };
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const randomRange = (a, b) => a + Math.random() * (b - a);
  const seedRandom = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function roundedRect(context, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    context.beginPath();
    context.moveTo(x + rr, y);
    context.arcTo(x + w, y, x + w, y + h, rr);
    context.arcTo(x + w, y + h, x, y + h, rr);
    context.arcTo(x, y + h, x, y, rr);
    context.arcTo(x, y, x + w, y, rr);
    context.closePath();
  }

  function pointSegmentDistance(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    if (!lengthSq) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq, 0, 1);
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
  }

  function loadSettings() {
    const defaults = { muted: false, contrast: false, difficulty: "casual" };
    try {
      const raw = JSON.parse(localStorage.getItem("nine-room-settings") || "null");
      return raw ? { ...defaults, ...raw } : defaults;
    } catch {
      return defaults;
    }
  }

  const settings = loadSettings();

  function saveSettings() {
    try {
      localStorage.setItem("nine-room-settings", JSON.stringify(settings));
    } catch {
      /* Storage may be unavailable under file:// or privacy modes. */
    }
  }

  /* ————— Synthesized audio ————— */

  class SoundRoom {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noise = null;
      this.muted = settings.muted;
      this.lastClick = 0;
      this.lastRail = 0;
    }

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.38;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buffer;
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.38, this.ctx.currentTime, 0.02);
      }
    }

    now() {
      return this.ctx ? this.ctx.currentTime : 0;
    }

    noiseBurst(duration, gain, lowpass, highpass, pan = 0) {
      if (!this.ctx || this.muted) return;
      const t = this.now();
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      filter.Q.value = 0.7;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = highpass;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(gain, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      let node = src;
      node.connect(filter);
      node = filter;
      node.connect(hp);
      node = hp;
      if (pan && this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = clamp(pan, -1, 1);
        node.connect(panner);
        node = panner;
      }
      node.connect(env);
      env.connect(this.master);
      src.start(t);
      src.stop(t + duration + 0.05);
    }

    tone(type, freq, duration, gain, slide = 0, delay = 0) {
      if (!this.ctx || this.muted) return;
      const t = this.now() + delay;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(env);
      env.connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.03);
    }

    strike(power) {
      if (!this.ctx || this.muted) return;
      this.noiseBurst(0.055 + power * 0.025, 0.12 + power * 0.16, 4200, 950);
      this.tone("triangle", 205 - power * 45, 0.1, 0.055 + power * 0.05, -60);
      this.tone("sine", 880 + power * 300, 0.035, 0.035, -380);
    }

    click(strength) {
      if (!this.ctx || this.muted) return;
      const now = this.now();
      if (now - this.lastClick < 0.018) return;
      this.lastClick = now;
      const p = clamp(strength / 700, 0.15, 1);
      this.noiseBurst(0.028, 0.035 + p * 0.08, 5200, 1500);
      this.tone("triangle", 1460 + p * 620, 0.028, 0.03 + p * 0.05, -400);
      this.tone("sine", 430 + p * 100, 0.045, 0.018 + p * 0.03, 80);
    }

    rail(strength) {
      if (!this.ctx || this.muted) return;
      const now = this.now();
      if (now - this.lastRail < 0.025) return;
      this.lastRail = now;
      const p = clamp(strength / 850, 0.12, 1);
      this.noiseBurst(0.08, 0.025 + p * 0.07, 460, 80);
      this.tone("sine", 112, 0.11, 0.025 + p * 0.04, -35);
    }

    pocket(heavy = false) {
      if (!this.ctx || this.muted) return;
      this.noiseBurst(heavy ? 0.24 : 0.17, heavy ? 0.075 : 0.055, 950, 60);
      this.tone("sine", heavy ? 88 : 125, heavy ? 0.26 : 0.18, heavy ? 0.08 : 0.05, -50);
      this.tone("triangle", 520, 0.05, 0.02, -150, 0.04);
      if (heavy) {
        this.tone("triangle", 392, 0.7, 0.022, 0, 0.12);
        this.tone("triangle", 493.88, 0.9, 0.02, 0, 0.25);
        this.tone("triangle", 587.33, 1.1, 0.018, 0, 0.38);
      }
    }

    foul() {
      this.tone("sine", 155, 0.28, 0.055, -50);
      this.tone("sine", 116, 0.34, 0.04, -38, 0.06);
    }

    ui() {
      if (!this.ctx || this.muted) return;
      this.tone("sine", 760, 0.035, 0.018, 120);
    }

    win() {
      if (!this.ctx || this.muted) return;
      [392, 493.88, 587.33, 783.99].forEach((f, i) => {
        this.tone("triangle", f, 0.8, 0.035, 0, i * 0.12);
        this.tone("sine", f / 2, 0.9, 0.025, 0, i * 0.12 + 0.02);
      });
    }

    lose() {
      if (!this.ctx || this.muted) return;
      [329.63, 277.18, 220, 164.81].forEach((f, i) => {
        this.tone("sine", f, 0.9, 0.03, -8, i * 0.16);
      });
    }
  }

  const audio = new SoundRoom();

  /* ————— Game state ————— */

  const game = {
    state: "menu",
    prevState: "aiming",
    mode: "ai",
    turn: 0,
    breaker: 0,
    players: [],
    balls: [],
    aimAngle: 0,
    power: 0,
    charging: false,
    chargeSource: null,
    breakPending: false,
    ballInHand: false,
    placement: { x: W / 2, y: H / 2, valid: false },
    shot: null,
    settleTimer: 0,
    timeScale: 1,
    slowmoTimer: 0,
    winner: -1,
    winReason: "",
    matchId: 0,
    statOpen: false,
    prediction: null,
    cueStrike: null,
    accumulated: 0,
    lastTime: performance.now(),
    toastToken: 0,
  };

  const playersBase = () => [
    {
      name: "YOU",
      color: "#e6bc7a",
      isAI: false,
      shots: 0,
      pots: 0,
      fouls: 0,
      foulStreak: 0,
    },
    {
      name: "THE HOUSE",
      color: "#74b9c9",
      isAI: true,
      shots: 0,
      pots: 0,
      fouls: 0,
      foulStreak: 0,
    },
  ];

  const aiCtl = {
    active: false,
    phase: "idle",
    timer: 0,
    targetAngle: 0,
    targetPower: 0.5,
    thinkText: "",
    placements: [],
  };

  const cam = {
    focusX: W / 2,
    focusY: H / 2,
    zoom: 1,
    shake: 0,
    shakeX: 0,
    shakeY: 0,
  };

  const view = {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: 1,
    baseScale: 1,
    centerX: window.innerWidth / 2,
    centerY: window.innerHeight / 2,
    topPad: 82,
    bottomPad: 154,
  };

  let tableCache = null;
  let clothTexture = null;
  let ballShadowSprite = null;
  let dust = [];
  let particles = [];
  const keys = new Set();
  let pointerWorld = { x: W / 2, y: H / 2 };
  let pointerInside = false;
  let ignorePointerUp = false;
  let lastHudUpdate = 0;

  /* ————— Rack + balls ————— */

  function makeBall(number, x, y) {
    return {
      id: number === 0 ? "cue" : `ball-${number}`,
      number,
      x,
      y,
      vx: 0,
      vy: 0,
      active: true,
      pocketed: false,
      sink: null,
    };
  }

  function rackPositions() {
    const d = R * 2 + 0.8;
    const dx = Math.sqrt(d * d - (d / 2) * (d / 2));
    const local = [
      [0, 0],
      [dx, -d / 2],
      [dx, d / 2],
      [dx * 2, -d],
      [dx * 2, 0],
      [dx * 2, d],
      [dx * 3, -d / 2],
      [dx * 3, d / 2],
      [dx * 4, 0],
    ];
    return local.map(([x, y]) => ({ x: footSpot.x + x, y: footSpot.y + y }));
  }

  function resetRack() {
    const positions = rackPositions();
    const order = [1, 0, 0, 0, 9, 0, 0, 0, 0];
    const pool = [2, 3, 4, 5, 6, 7, 8];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let p = 0;
    for (let i = 0; i < order.length; i++) {
      if (!order[i]) order[i] = pool[p++];
    }
    const balls = [makeBall(0, headSpot.x, headSpot.y)];
    positions.forEach((pos, i) => {
      balls.push(makeBall(order[i], pos.x, pos.y));
    });
    game.balls = balls;
    game.aimAngle = 0;
    game.power = 0;
    game.charging = false;
    game.chargeSource = null;
    game.ballInHand = false;
    game.breakPending = false;
    game.shot = null;
    game.prediction = null;
    game.settleTimer = 0;
    game.accumulated = 0;
    game.slowmoTimer = 0;
    game.timeScale = 1;
    game.cueStrike = null;
    particles = [];
    aiCtl.active = false;
    aiCtl.phase = "idle";
    dom.slowmoTag.classList.remove("show");
  }

  function cueBall() {
    return game.balls.find((b) => b.number === 0);
  }

  function activeObjects() {
    return game.balls.filter((b) => b.number > 0 && b.active);
  }

  function lowestBall() {
    let lowest = null;
    for (const ball of game.balls) {
      if (ball.number > 0 && ball.active && (!lowest || ball.number < lowest.number)) lowest = ball;
    }
    return lowest;
  }

  function ballByNumber(n) {
    return game.balls.find((b) => b.number === n);
  }

  /* ————— UI ————— */

  let lastUISignature = "";

  function applySettingsUI() {
    document.body.classList.toggle("muted", settings.muted);
    document.body.classList.toggle("high-contrast", settings.contrast);
    const soundLabel = settings.muted ? "SOUND: OFF" : "SOUND: ON";
    const contrastLabel = settings.contrast ? "HIGH CONTRAST: ON" : "HIGH CONTRAST: OFF";
    dom.menuSoundBtn.textContent = soundLabel;
    dom.pauseSoundBtn.textContent = soundLabel;
    dom.menuContrastBtn.textContent = contrastLabel;
    dom.contrastBtn.textContent = contrastLabel;
    dom.soundBtn.setAttribute("aria-label", settings.muted ? "Unmute sound" : "Mute sound");
    dom.soundBtn.title = settings.muted ? "Sound off" : "Sound on";
    for (const btn of document.querySelectorAll("[data-difficulty]")) {
      btn.classList.toggle("is-active", btn.dataset.difficulty === settings.difficulty);
    }
  }

  function updateRackTrack() {
    if (!dom.rackTrack) return;
    const lowest = lowestBall();
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= 9; n++) {
      const ball = ballByNumber(n);
      const el = document.createElement("span");
      el.className = "rack-ball";
      el.style.setProperty("--ball-color", COLORS[n]);
      if (n === 9) el.classList.add("is-stripe");
      if (!ball || !ball.active) el.classList.add("out");
      if (lowest && lowest.number === n) {
        el.classList.add("lowest");
        el.title = `${n} ball · lowest on the table`;
      } else {
        el.title = `${n} ball`;
      }
      const inner = document.createElement("span");
      inner.textContent = String(n);
      el.appendChild(inner);
      frag.appendChild(el);
    }
    dom.rackTrack.replaceChildren(frag);
    dom.rackTrack.setAttribute(
      "aria-label",
      `The rack. ${activeObjects().length} balls remaining.${lowest ? ` Lowest ball is ${lowest.number}.` : ""}`
    );
  }

  function hintMarkup(state) {
    if (state === "ball-in-hand") return '<span class="keycap">CLICK</span><span>a clear spot on the felt</span>';
    if (state === "shooting") return '<span>Let it roll</span>';
    if (state === "paused") return '<span>The room is paused</span>';
    if (state === "gameOver") return '<span>Rack complete</span>';
    if (state !== "aiming") return "";
    if (game.players[game.turn]?.isAI) return "<span>The House is lining up</span>";
    if (game.charging) return '<span class="keycap">RELEASE</span><span>to strike</span>';
    if (game.breakPending) return '<span class="keycap">HOLD</span><span>to break · release to shoot</span>';
    return '<span class="keycap">HOLD</span><span>to charge · release to shoot</span>';
  }

  function statusForState() {
    if (game.state === "shooting") return "IN MOTION";
    if (game.state === "ball-in-hand") return "PLACING CUE";
    if (game.state === "gameOver") return "RACK OVER";
    if (game.state === "paused") return "PAUSED";
    if (game.state === "aiming") {
      if (game.players[game.turn]?.isAI) {
        if (aiCtl.phase === "think") return "THINKING";
        if (aiCtl.phase === "charge" || game.charging) return "LINING UP";
        return "AT THE TABLE";
      }
      if (game.charging) return "CHARGING";
      return "READY";
    }
    return "READY";
  }

  function updateUI(force = false) {
    if (!game.players.length) return;
    const lowest = lowestBall();
    const signature = [
      game.state,
      game.turn,
      game.charging ? 1 : 0,
      game.ballInHand ? 1 : 0,
      game.breakPending ? 1 : 0,
      game.winner,
      game.mode,
      lowest ? lowest.number : 0,
      aiCtl.phase,
      settings.muted ? 1 : 0,
      settings.contrast ? 1 : 0,
    ].join("|");
    if (!force && signature === lastUISignature) {
      updatePowerUI();
      return;
    }
    lastUISignature = signature;

    for (const cls of ["aiming", "shooting", "ball-in-hand", "paused", "gameOver", "menu"]) {
      document.body.classList.remove(`state-${cls.toLowerCase()}`);
    }
    document.body.classList.add(`state-${game.state.toLowerCase()}`);

    const player = game.players[game.turn] || game.players[0];
    document.documentElement.style.setProperty("--accent", player ? player.color : "#e6bc7a");
    dom.turnStripe.style.background = player ? player.color : "";
    dom.turnName.textContent = player ? player.name : "—";
    dom.turnKicker.textContent = game.breakPending ? "ON THE BREAK" : "TO SHOOT";
    if (game.state === "ball-in-hand") {
      dom.turnSub.textContent = "Ball in hand · place the cue";
    } else if (game.state === "paused") {
      dom.turnSub.textContent = "The room is quiet";
    } else if (game.state === "gameOver") {
      dom.turnSub.textContent = game.winReason === "three-fouls" ? "Three fouls · rack forfeit" : "Nine-ball · rack complete";
    } else if (game.breakPending) {
      dom.turnSub.textContent = "Break · full power";
    } else if (lowest) {
      dom.turnSub.textContent = `Lowest · ${lowest.number} ball`;
    } else {
      dom.turnSub.textContent = "Table cleared";
    }
    dom.turnStatusText.textContent = statusForState();
    dom.hint.innerHTML = hintMarkup(game.state);
    dom.ballInHandBadge.hidden = game.state !== "ball-in-hand";
    dom.powerFill.style.transform = `scaleX(${game.power})`;
    dom.powerValue.textContent = `${Math.round(game.power * 100)}%`;
    if (game.state !== "menu") updateRackTrack();
  }

  function updatePowerUI() {
    const value = clamp(game.power, 0, 1);
    dom.powerFill.style.transform = `scaleX(${value})`;
    dom.powerValue.textContent = `${Math.round(value * 100)}%`;
  }

  function showToast(message, tone = "", duration = 2400) {
    const token = ++game.toastToken;
    dom.toast.textContent = message;
    dom.toast.className = `toast show${tone ? ` ${tone}` : ""}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      if (token === game.toastToken) dom.toast.classList.remove("show");
    }, duration);
  }

  function flashFoul() {
    dom.foulFlash.classList.remove("flash");
    void dom.foulFlash.offsetWidth;
    dom.foulFlash.classList.add("flash");
  }

  function hideOverlay(el) {
    if (!el || el.hidden) return;
    el.style.pointerEvents = "none";
    if (prefersReducedMotion || !el.animate) {
      el.hidden = true;
      el.style.pointerEvents = "";
      return;
    }
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 240,
      easing: "ease-out",
      fill: "forwards",
    });
    anim.onfinish = () => {
      el.hidden = true;
      el.style.pointerEvents = "";
      el.style.opacity = "";
      anim.cancel();
    };
  }

  function showOverlay(el) {
    if (!el) return;
    el.hidden = false;
    el.style.opacity = "";
    if (!prefersReducedMotion && el.animate) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        easing: "cubic-bezier(.22,1,.36,1)",
      });
    }
  }

  function toggleSound() {
    audio.unlock();
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    saveSettings();
    applySettingsUI();
    if (!settings.muted) audio.ui();
    updateUI(true);
  }

  function toggleContrast() {
    audio.unlock();
    settings.contrast = !settings.contrast;
    saveSettings();
    applySettingsUI();
    audio.ui();
    updateUI(true);
  }

  /* ————— Match / turn flow ————— */

  function makePlayers(mode) {
    const list = playersBase();
    if (mode === "local") {
      list[0].name = "PLAYER ONE";
      list[1].name = "PLAYER TWO";
      list[1].isAI = false;
    }
    return list;
  }

  function startMatch(mode, rematch = false) {
    game.matchId++;
    const matchId = game.matchId;
    game.mode = mode;
    game.players = makePlayers(mode);
    game.breaker = rematch ? 1 - game.breaker : 0;
    game.turn = game.breaker;
    game.winner = -1;
    game.winReason = "";
    game.breakPending = true;
    game.state = "aiming";
    game.prevState = "aiming";
    aiCtl.active = false;
    aiCtl.phase = "idle";
    resetRack();
    game.breakPending = true;
    cueBall().active = true;
    cueBall().x = headSpot.x;
    cueBall().y = headSpot.y;
    hideOverlay(dom.menuOverlay);
    hideOverlay(dom.pauseOverlay);
    hideOverlay(dom.gameOverOverlay);
    document.body.classList.add("in-game");
    updateRackTrack();
    aimAtLowest();
    updateUI(true);
    const breaker = game.players[game.breaker];
    window.setTimeout(() => {
      if (game.matchId !== matchId) return;
      if (breaker.isAI) {
        showToast("The House breaks.", "gold", 1800);
      } else {
        showToast("Your break. Hold for full power.", "gold", 2200);
      }
    }, 340);
    startTurn(game.turn, false);
  }

  function aimAtLowest() {
    const cue = cueBall();
    if (!cue) return;
    const target = lowestBall();
    if (target) {
      game.aimAngle = Math.atan2(target.y - cue.y, target.x - cue.x);
    }
  }

  function scheduleAI() {
    const player = game.players[game.turn];
    if (!player || !player.isAI) {
      aiCtl.active = false;
      aiCtl.phase = "idle";
      return;
    }
    aiCtl.active = true;
    aiCtl.phase = "think";
    aiCtl.timer = game.state === "ball-in-hand" ? 0.95 : 0.8;
    aiCtl.thinkText = "READING THE TABLE";
  }

  function startTurn(playerIndex, ballInHand = false, notice = "") {
    game.turn = playerIndex;
    game.ballInHand = ballInHand;
    game.charging = false;
    game.chargeSource = null;
    game.power = 0;
    game.settleTimer = 0;
    game.accumulated = 0;
    const cue = cueBall();
    const player = game.players[playerIndex];

    if (ballInHand) {
      cue.active = false;
      cue.vx = 0;
      cue.vy = 0;
      game.state = "ball-in-hand";
      const spot = findCuePlacementNear(W / 2, H / 2);
      game.placement = { x: spot.x, y: spot.y, valid: true };
    } else {
      cue.active = true;
      cue.pocketed = false;
      cue.sink = null;
      game.state = "aiming";
      aimAtLowest();
    }

    if (player.isAI) {
      scheduleAI();
      if (ballInHand) aiCtl.timer = 0.95;
    } else {
      aiCtl.active = false;
      aiCtl.phase = "idle";
    }

    if (notice) showToast(notice, ballInHand ? "foul" : "gold", 2900);
    updateUI(true);
    updatePowerUI();
  }

  function beginCharge(source = "pointer") {
    if (game.state !== "aiming" || game.players[game.turn]?.isAI) return;
    audio.unlock();
    game.charging = true;
    game.chargeSource = source;
    game.power = 0.035;
    updateUI(true);
  }

  function cancelCharge() {
    game.charging = false;
    game.chargeSource = null;
    game.power = 0;
    updateUI(true);
    updatePowerUI();
  }

  function releaseShot() {
    if (!game.charging || game.state !== "aiming" || game.players[game.turn]?.isAI) return;
    const power = Math.max(game.power, 0.035);
    fireShot(power, false);
  }

  function shotSpeedForPower(power) {
    return MIN_SHOT + (MAX_SHOT - MIN_SHOT) * Math.pow(clamp(power, 0, 1), 0.92);
  }

  function fireShot(power, fromAI = false) {
    const cue = cueBall();
    if (!cue || !cue.active || game.state !== "aiming") return;
    const actualPower = clamp(power, 0.035, 1);
    const speed = shotSpeedForPower(actualPower);
    game.shot = {
      break: game.breakPending,
      lowest: lowestBall()?.number || 0,
      firstHit: null,
      railAfterContact: false,
      pocketed: [],
      cueScratched: false,
      railBalls: new Set(),
    };
    cue.vx = Math.cos(game.aimAngle) * speed;
    cue.vy = Math.sin(game.aimAngle) * speed;
    game.players[game.turn].shots++;
    game.charging = false;
    game.chargeSource = null;
    game.cueStrike = {
      x: cue.x,
      y: cue.y,
      angle: game.aimAngle,
      power: actualPower,
      t: 0,
      duration: 0.17,
    };
    game.power = 0;
    game.state = "shooting";
    game.settleTimer = 0;
    game.accumulated = 0;
    aiCtl.active = false;
    aiCtl.phase = "idle";
    addShake(1.3 + actualPower * 4.5);
    spawnChalk(cue.x, cue.y, game.aimAngle, actualPower);
    audio.strike(actualPower);
    updateUI(true);
    updatePowerUI();
  }

  function pauseGame() {
    if (!["aiming", "shooting", "ball-in-hand"].includes(game.state)) return;
    game.prevState = game.state;
    if (game.charging) {
      game.charging = false;
      game.chargeSource = null;
      game.power = 0;
      if (aiCtl.active && aiCtl.phase === "charge") {
        aiCtl.phase = "align";
        aiCtl.timer = 0.65;
      }
    }
    dom.pauseSub.textContent = ["aiming", "ball-in-hand"].includes(game.prevState)
      ? "The table is exactly as you left it."
      : "The balls will wait. So will the House.";
    game.state = "paused";
    showOverlay(dom.pauseOverlay);
    updateUI(true);
  }

  function resumeGame() {
    if (game.state !== "paused") return;
    hideOverlay(dom.pauseOverlay);
    game.state = game.prevState;
    updateUI(true);
  }

  function goToMenu() {
    game.matchId++;
    game.state = "menu";
    game.charging = false;
    game.power = 0;
    game.winner = -1;
    aiCtl.active = false;
    aiCtl.phase = "idle";
    hideOverlay(dom.pauseOverlay);
    hideOverlay(dom.gameOverOverlay);
    document.body.classList.remove("in-game");
    resetRack();
    game.players = makePlayers(game.mode);
    updateUI(true);
    showOverlay(dom.menuOverlay);
  }

  function finishGame(winner, reason) {
    game.matchId++;
    const matchId = game.matchId;
    game.state = "gameOver";
    game.winner = winner;
    game.winReason = reason;
    game.charging = false;
    game.chargeSource = null;
    game.power = 0;
    game.ballInHand = false;
    aiCtl.active = false;
    aiCtl.phase = "idle";
    updateUI(true);
    dom.turnStatusText.textContent = "RACK OVER";

    const winnerPlayer = game.players[winner];
    const isAIWin = winnerPlayer.isAI;
    const local = game.mode === "local";

    dom.gameOverKicker.textContent = reason === "three-fouls" ? "THREE FOULS · RACK FORFEIT" : "NINE-BALL · RACK COMPLETE";
    if (local) {
      dom.gameOverTitle.innerHTML = `${winnerPlayer.name}<br>TAKES IT`;
    } else if (winner === 0) {
      dom.gameOverTitle.innerHTML = "YOU TAKE<br>THE ROOM";
    } else {
      dom.gameOverTitle.innerHTML = "THE HOUSE<br>TAKES IT";
    }
    if (reason === "three-fouls") {
      dom.gameOverSub.textContent = local
        ? "Three consecutive fouls. The rack is forfeit."
        : winner === 0
          ? "The House fouled out. The room is yours."
          : "Three consecutive fouls. The House claims the rack.";
    } else {
      dom.gameOverSub.textContent = local
        ? "The 9 fell clean. A rack worth remembering."
        : winner === 0
          ? "The 9 fell clean. The room is yours."
          : "A clean finish. The House sweeps the felt.";
    }

    const p = winnerPlayer;
    dom.matchStats.innerHTML = `
      <div class="stat-item"><span class="stat-value">${p.pots}</span><span class="stat-label">BALLS POTTED</span></div>
      <div class="stat-item"><span class="stat-value">${p.shots}</span><span class="stat-label">SHOTS TAKEN</span></div>
      <div class="stat-item"><span class="stat-value">${p.fouls}</span><span class="stat-label">FOULS</span></div>
    `;

    if (local || winner === 0) audio.win();
    else audio.lose();

    if (!prefersReducedMotion) {
      cam.zoom = Math.max(cam.zoom, 1.035);
      addShake(2.4);
    }

    window.setTimeout(() => {
      if (game.state !== "gameOver" || game.matchId !== matchId) return;
      dom.gameOverOverlay.hidden = false;
      if (!prefersReducedMotion && dom.gameOverOverlay.animate) {
        dom.gameOverOverlay.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 420,
          easing: "ease-out",
        });
      }
      audio.unlock();
    }, reason === "three-fouls" ? 500 : 900);
  }

  function addShake(amount) {
    if (prefersReducedMotion) return;
    cam.shake = Math.min(10, Math.max(cam.shake, amount));
  }

  function spawnChalk(x, y, angle, power) {
    const amount = 10 + Math.round(power * 10);
    for (let i = 0; i < amount; i++) {
      const a = angle + Math.PI + randomRange(-0.9, 0.9);
      const speed = randomRange(12, 58) * (0.4 + power);
      particles.push({
        x: x + Math.cos(angle) * (R + 2),
        y: y + Math.sin(angle) * (R + 2),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed + randomRange(-14, 14),
        life: randomRange(0.22, 0.55),
        maxLife: 0.55,
        size: randomRange(0.7, 2),
        color: Math.random() < 0.65 ? "206,196,171" : "92,147,184",
        kind: "chalk",
      });
    }
    for (let i = 0; i < 4; i++) {
      particles.push({
        x: x + Math.cos(angle) * (R + 3),
        y: y + Math.sin(angle) * (R + 3),
        vx: Math.cos(angle + Math.PI + randomRange(-0.3, 0.3)) * randomRange(30, 80),
        vy: Math.sin(angle + Math.PI + randomRange(-0.3, 0.3)) * randomRange(30, 80),
        life: 0.22,
        maxLife: 0.22,
        size: 1.4,
        color: "238,231,211",
        kind: "spark",
      });
    }
  }

  function isAITurn() {
    return Boolean(game.players[game.turn]?.isAI && ["aiming", "ball-in-hand"].includes(game.state));
  }

  /* ————— Ball in hand ————— */

  function isValidCuePlacement(x, y) {
    if (x < R + 4 || x > W - R - 4 || y < R + 4 || y > H - R - 4) return false;
    for (const p of POCKETS) {
      if (Math.hypot(x - p.x, y - p.y) < p.r + R + 4) return false;
    }
    for (const ball of game.balls) {
      if (ball.number === 0 || !ball.active) continue;
      if (Math.hypot(x - ball.x, y - ball.y) < R * 2 + 2) return false;
    }
    return true;
  }

  function findCuePlacementNear(targetX, targetY) {
    const startX = clamp(targetX, R + 8, W - R - 8);
    const startY = clamp(targetY, R + 8, H - R - 8);
    if (isValidCuePlacement(startX, startY)) return { x: startX, y: startY, valid: true };
    for (let radius = 18; radius < 460; radius += 18) {
      const steps = Math.max(10, Math.round(radius / 10));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = startX + Math.cos(a) * radius;
        const y = startY + Math.sin(a) * radius;
        if (isValidCuePlacement(x, y)) return { x, y, valid: true };
      }
    }
    return { x: W / 2, y: H / 2, valid: false };
  }

  function commitCuePlacement() {
    if (game.state !== "ball-in-hand" || game.players[game.turn]?.isAI) return;
    const { x, y, valid } = game.placement;
    if (!valid) {
      addShake(0.7);
      audio.foul();
      showToast("Not there — the cue needs clear felt.", "foul", 1700);
      return;
    }
    const cue = cueBall();
    cue.active = true;
    cue.pocketed = false;
    cue.sink = null;
    cue.x = x;
    cue.y = y;
    cue.vx = 0;
    cue.vy = 0;
    game.ballInHand = false;
    game.state = "aiming";
    const target = lowestBall();
    if (target) game.aimAngle = Math.atan2(target.y - y, target.x - x);
    audio.ui();
    updateUI(true);
  }

  /* ————— Physics ————— */

  function isTableStill() {
    return !game.balls.some((b) => b.active && (Math.abs(b.vx) > 0.001 || Math.abs(b.vy) > 0.001));
  }

  function applyRollingFriction(ball, dt) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!speed) return;
    let nextSpeed = speed - ROLL_DECEL * dt;
    if (nextSpeed <= STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    const ratio = nextSpeed / speed;
    ball.vx *= ratio;
    ball.vy *= ratio;
  }

  function registerBallContact(a, b, impact) {
    if (impact > 24) audio.click(impact);
    if (impact > 580) addShake(0.35 + Math.min(1.2, impact / 1300));
    if (!game.shot) return;
    if (a.number === 0 || b.number === 0) {
      const objectBall = a.number === 0 ? b : a;
      if (game.shot.firstHit === null) game.shot.firstHit = objectBall.number;
    }
  }

  function collideBalls(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = R * 2;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) return;
    let d = Math.sqrt(d2);
    let nx;
    let ny;
    if (d < 0.0001) {
      nx = 1;
      ny = 0;
      d = 0.0001;
    } else {
      nx = dx / d;
      ny = dy / d;
    }
    const overlap = minDist - d;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;

    const relX = b.vx - a.vx;
    const relY = b.vy - a.vy;
    const normalVelocity = relX * nx + relY * ny;
    if (normalVelocity >= 0) return;
    const impact = -normalVelocity;
    const impulse = (-(1 + BALL_RESTITUTION) * normalVelocity) / 2;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;

    const tangentX = -ny;
    const tangentY = nx;
    const tangentVelocity = relX * tangentX + relY * tangentY;
    const tangentTransfer = tangentVelocity * 0.012;
    a.vx += tangentX * tangentTransfer;
    a.vy += tangentY * tangentTransfer;
    b.vx -= tangentX * tangentTransfer;
    b.vy -= tangentY * tangentTransfer;
    registerBallContact(a, b, impact);
  }

  function registerRailContact(ball, impact) {
    if (game.shot) {
      if (game.shot.firstHit !== null) game.shot.railAfterContact = true;
      if (ball.number > 0 && game.shot.firstHit !== null) game.shot.railBalls.add(ball.number);
    }
    if (impact > 28) {
      audio.rail(impact);
      if (impact > 700) addShake(0.22);
    }
  }

  function collideCushions(ball) {
    let impact = 0;
    const topGap = ball.x < CORNER_GAP || ball.x > W - CORNER_GAP || Math.abs(ball.x - W / 2) < SIDE_GAP;
    const bottomGap = ball.x < CORNER_GAP || ball.x > W - CORNER_GAP || Math.abs(ball.x - W / 2) < SIDE_GAP;
    const leftGap = ball.y < CORNER_GAP || ball.y > H - CORNER_GAP;
    const rightGap = ball.y < CORNER_GAP || ball.y > H - CORNER_GAP;

    if (ball.y < R && !topGap) {
      ball.y = R;
      if (ball.vy < 0) {
        impact = Math.max(impact, -ball.vy);
        ball.vy = -ball.vy * RAIL_RESTITUTION;
        ball.vx *= 0.985;
      }
    }
    if (ball.y > H - R && !bottomGap) {
      ball.y = H - R;
      if (ball.vy > 0) {
        impact = Math.max(impact, ball.vy);
        ball.vy = -ball.vy * RAIL_RESTITUTION;
        ball.vx *= 0.985;
      }
    }
    if (ball.x < R && !leftGap) {
      ball.x = R;
      if (ball.vx < 0) {
        impact = Math.max(impact, -ball.vx);
        ball.vx = -ball.vx * RAIL_RESTITUTION;
        ball.vy *= 0.985;
      }
    }
    if (ball.x > W - R && !rightGap) {
      ball.x = W - R;
      if (ball.vx > 0) {
        impact = Math.max(impact, ball.vx);
        ball.vx = -ball.vx * RAIL_RESTITUTION;
        ball.vy *= 0.985;
      }
    }
    if (impact) registerRailContact(ball, impact);
  }

  function pocketAt(ball) {
    for (const p of POCKETS) {
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      if (dx * dx + dy * dy < p.capture * p.capture) return p;
    }
    return null;
  }

  function triggerSlowmo() {
    if (prefersReducedMotion) return;
    game.slowmoTimer = 1.3;
    game.timeScale = 0.24;
    dom.slowmoTag.classList.add("show");
    addShake(4.2);
  }

  function pocketBall(ball, pocket) {
    ball.active = false;
    ball.pocketed = true;
    ball.vx = 0;
    ball.vy = 0;
    ball.sink = {
      t: 0,
      duration: 0.42,
      fromX: ball.x,
      fromY: ball.y,
      toX: pocket.sx,
      toY: pocket.sy,
    };
    if (ball.number === 0) {
      if (game.shot) game.shot.cueScratched = true;
      audio.pocket(false);
      addShake(1.2);
    } else {
      if (game.shot) game.shot.pocketed.push(ball.number);
      game.players[game.turn].pots++;
      audio.pocket(ball.number === 9);
      addShake(ball.number === 9 ? 3.8 : 1.1);
      spawnPocketDust(pocket, ball.number === 9);
      if (ball.number === 9) triggerSlowmo();
      updateRackTrack();
    }
  }

  function spawnPocketDust(pocket, gold) {
    for (let i = 0; i < (gold ? 22 : 7); i++) {
      const a = randomRange(0, Math.PI * 2);
      const speed = randomRange(10, gold ? 95 : 36);
      particles.push({
        x: pocket.x + randomRange(-5, 5),
        y: pocket.y + randomRange(-5, 5),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 8,
        life: randomRange(0.3, gold ? 0.95 : 0.5),
        maxLife: gold ? 0.95 : 0.5,
        size: randomRange(0.8, gold ? 2.5 : 1.6),
        color: gold ? (Math.random() < 0.5 ? "233,205,143" : "250,239,211") : "23,18,13",
        kind: gold ? "spark" : "dust",
      });
    }
  }

  function stepPhysics(dt) {
    const balls = game.balls;
    for (const ball of balls) {
      if (!ball.active) continue;
      applyRollingFriction(ball, dt);
      if (!ball.vx && !ball.vy) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
    }

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (!a.active) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (!b.active) continue;
          collideBalls(a, b);
        }
      }
    }

    for (const ball of balls) {
      if (!ball.active) continue;
      const pocket = pocketAt(ball);
      if (pocket) {
        pocketBall(ball, pocket);
        continue;
      }
      collideCushions(ball);
      const latePocket = pocketAt(ball);
      if (latePocket) pocketBall(ball, latePocket);
    }

    for (const ball of balls) {
      if (!ball.active) continue;
      if (Math.abs(ball.vx) < STOP_SPEED && Math.abs(ball.vy) < STOP_SPEED) {
        ball.vx = 0;
        ball.vy = 0;
      }
    }
  }

  function updatePhysics(dt) {
    game.accumulated += dt;
    let steps = 0;
    while (game.accumulated >= FIXED_DT && steps < 14) {
      stepPhysics(FIXED_DT);
      game.accumulated -= FIXED_DT;
      steps++;
    }
    if (steps === 14) game.accumulated = 0;
  }

  function updateSlowmo(dt) {
    if (game.slowmoTimer > 0) {
      game.slowmoTimer -= dt;
      if (game.slowmoTimer <= 0) {
        game.slowmoTimer = 0;
        game.timeScale = 1;
        dom.slowmoTag.classList.remove("show");
      }
    }
  }

  function updateSinkingBalls(dt) {
    for (const ball of game.balls) {
      if (!ball.sink) continue;
      ball.sink.t += dt / ball.sink.duration;
      if (ball.sink.t >= 1) ball.sink = null;
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.08, dt);
      if (p.kind === "chalk" || p.kind === "dust") p.vy += 7 * dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  /* ————— Shot resolution ————— */

  function respotNine() {
    const nine = ballByNumber(9);
    if (!nine) return;
    nine.active = true;
    nine.pocketed = false;
    nine.sink = null;
    nine.vx = 0;
    nine.vy = 0;
    let x = footSpot.x;
    let y = footSpot.y;
    let found = false;
    for (let step = 0; step < 40 && !found; step++) {
      const testX = footSpot.x + step * (R * 2 + 3);
      if (testX < W - R - 4) {
        let clear = true;
        for (const ball of game.balls) {
          if (ball === nine || !ball.active) continue;
          if (Math.hypot(testX - ball.x, y - ball.y) < R * 2 + 1.5) {
            clear = false;
            break;
          }
        }
        if (clear) {
          x = testX;
          found = true;
        }
      }
    }
    if (!found) {
      for (let step = 0; step < 40 && !found; step++) {
        const testY = H / 2 + (step % 2 ? 1 : -1) * step * (R * 2 + 3);
        if (testY > R + 4 && testY < H - R - 4) {
          let clear = true;
          for (const ball of game.balls) {
            if (ball === nine || !ball.active) continue;
            if (Math.hypot(x - ball.x, testY - ball.y) < R * 2 + 1.5) {
              clear = false;
              break;
            }
          }
          if (clear) {
            y = testY;
            found = true;
          }
        }
      }
    }
    nine.x = x;
    nine.y = y;
    updateRackTrack();
  }

  function resolveShot() {
    if (!game.shot) return;
    const shot = game.shot;
    const shooterIndex = game.turn;
    const shooter = game.players[shooterIndex];
    const ninePotted = shot.pocketed.includes(9);
    const reasons = [];

    if (shot.firstHit === null) {
      reasons.push("no contact");
    } else if (shot.firstHit !== shot.lowest) {
      reasons.push(`wrong ball first — ${shot.lowest} is lowest`);
    }
    if (shot.cueScratched) reasons.push("cue ball scratched");
    if (shot.firstHit !== null && !shot.railAfterContact && shot.pocketed.length === 0) {
      reasons.push("no rail after contact");
    }
    if (shot.break && shot.pocketed.length === 0 && shot.railBalls.size < 4) {
      reasons.push("illegal break — four balls must reach a rail");
    }
    const foul = reasons.length > 0;
    game.breakPending = false;
    game.shot = null;

    if (ninePotted && foul) respotNine();

    if (foul) {
      shooter.fouls++;
      shooter.foulStreak++;
      flashFoul();
      audio.foul();
      addShake(1.1);
      updateUI(true);
      if (shooter.foulStreak >= 3) {
        finishGame(1 - shooterIndex, "three-fouls");
        return;
      }
      const next = 1 - shooterIndex;
      const nextPlayer = game.players[next];
      startTurn(next, true, `Foul — ${reasons[0]}. ${nextPlayer.name} has ball in hand.`);
      return;
    }

    shooter.foulStreak = 0;

    if (ninePotted) {
      updateRackTrack();
      finishGame(shooterIndex, "nine");
      return;
    }

    if (shot.pocketed.length > 0) {
      updateRackTrack();
      startTurn(shooterIndex, false, `${shooter.name} pockets and stays at the table.`);
    } else {
      const next = 1 - shooterIndex;
      startTurn(next, false, `${shooter.name} misses. ${game.players[next].name} is up.`);
    }
  }

  /* ————— The House ————— */

  function pathBlocked(from, to, ignoreIds, clearance) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return false;
    const ux = dx / length;
    const uy = dy / length;
    for (const ball of game.balls) {
      if (!ball.active || ignoreIds.has(ball.id)) continue;
      const px = ball.x - from.x;
      const py = ball.y - from.y;
      const t = px * ux + py * uy;
      if (t < -clearance || t > length + clearance) continue;
      const perpendicular = Math.abs(px * uy - py * ux);
      if (perpendicular < clearance) return true;
    }
    return false;
  }

  function rayCircleT(origin, dirX, dirY, ball, radius) {
    const ox = origin.x - ball.x;
    const oy = origin.y - ball.y;
    const b = ox * dirX + oy * dirY;
    const c = ox * ox + oy * oy - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const t1 = -b - root;
    if (t1 > 0.001) return t1;
    const t2 = -b + root;
    return t2 > 0.001 ? t2 : null;
  }

  function firstObjectOnRay(origin, angle, ignoreIds = new Set()) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let bestBall = null;
    let bestT = Infinity;
    for (const ball of game.balls) {
      if (ball.number === 0 || !ball.active || ignoreIds.has(ball.id)) continue;
      const t = rayCircleT(origin, dirX, dirY, ball, R * 2);
      if (t !== null && t < bestT) {
        bestT = t;
        bestBall = ball;
      }
    }
    return bestBall ? { ball: bestBall, t: bestT } : null;
  }

  function buildPotPlans(cuePos, target) {
    const plans = [];
    for (const pocket of POCKETS) {
      const pdx = pocket.x - target.x;
      const pdy = pocket.y - target.y;
      const pocketDist = Math.hypot(pdx, pdy);
      if (pocketDist < 1) continue;
      const ux = pdx / pocketDist;
      const uy = pdy / pocketDist;
      const ghost = {
        x: target.x - ux * R * 2,
        y: target.y - uy * R * 2,
      };
      if (ghost.x < R + 2 || ghost.x > W - R - 2 || ghost.y < R + 2 || ghost.y > H - R - 2) continue;
      const cdx = ghost.x - cuePos.x;
      const cdy = ghost.y - cuePos.y;
      const cueDist = Math.hypot(cdx, cdy);
      if (cueDist < R * 2) continue;
      const cut = (cdx * ux + cdy * uy) / cueDist;
      if (cut < 0.26) continue;
      const ignoreCuePath = new Set([cueBall().id, target.id]);
      if (pathBlocked(cuePos, ghost, ignoreCuePath, R * 2 + 1.4)) continue;
      const ignoreObjectPath = new Set([cueBall().id, target.id]);
      if (pathBlocked(target, pocket, ignoreObjectPath, R * 2 - 0.7)) continue;

      const objectTravel = pocketDist + 26;
      const objectSpeed = Math.sqrt(2 * ROLL_DECEL * objectTravel) + 28;
      const cueAtContact = objectSpeed / Math.max(0.3, cut) / 0.975;
      const cueLaunch = Math.sqrt(cueAtContact * cueAtContact + 2 * ROLL_DECEL * cueDist);
      let power = (cueLaunch * 1.1 - MIN_SHOT) / (MAX_SHOT - MIN_SHOT);
      power = clamp(power, 0.12, 0.93);
      const cutQuality = Math.pow(clamp(cut, 0, 1), 0.72);
      const score =
        cutQuality * 3 -
        (cueDist / W) * 0.52 -
        (pocketDist / W) * 0.72 +
        (pocket.type === "side" ? 0.025 : 0);
      plans.push({
        target,
        pocket,
        ghost,
        angle: Math.atan2(cdy, cdx),
        power,
        cut,
        cueDist,
        pocketDist,
        score,
      });
    }
    plans.sort((a, b) => b.score - a.score);
    return plans;
  }

  function bankContactPlan(cuePos, target) {
    const walls = [
      { id: "top", line: R, axis: "y", outward: -1 },
      { id: "bottom", line: H - R, axis: "y", outward: 1 },
      { id: "left", line: R, axis: "x", outward: -1 },
      { id: "right", line: W - R, axis: "x", outward: 1 },
    ];
    let best = null;
    for (const wall of walls) {
      let mirrorX = target.x;
      let mirrorY = target.y;
      if (wall.axis === "y") mirrorY = wall.line * 2 - target.y;
      else mirrorX = wall.line * 2 - target.x;
      const segX = mirrorX - cuePos.x;
      const segY = mirrorY - cuePos.y;
      let t;
      if (wall.axis === "y") {
        if (Math.abs(segY) < 0.001) continue;
        t = (wall.line - cuePos.y) / segY;
      } else {
        if (Math.abs(segX) < 0.001) continue;
        t = (wall.line - cuePos.x) / segX;
      }
      if (t <= 0.02 || t >= 0.98) continue;
      const bounce = {
        x: cuePos.x + segX * t,
        y: cuePos.y + segY * t,
      };
      if (wall.axis === "y") {
        if (bounce.x < CORNER_GAP + 3 || bounce.x > W - CORNER_GAP - 3) continue;
        if (Math.abs(bounce.x - W / 2) < SIDE_GAP + 4) continue;
      } else if (bounce.y < CORNER_GAP + 3 || bounce.y > H - CORNER_GAP - 3) {
        continue;
      }
      if (pathBlocked(cuePos, bounce, new Set([cueBall().id, target.id]), R * 2 + 0.8)) continue;
      if (pathBlocked(bounce, target, new Set([cueBall().id, target.id]), R * 2 + 0.5)) continue;
      const length = dist(cuePos, bounce) + dist(bounce, target);
      if (!best || length < best.length) {
        best = {
          angle: Math.atan2(bounce.y - cuePos.y, bounce.x - cuePos.x),
          length,
          bounce,
        };
      }
    }
    return best;
  }

  function fallbackAIPlan(cuePos, target) {
    const directAngle = Math.atan2(target.y - cuePos.y, target.x - cuePos.x);
    const direct = firstObjectOnRay(cuePos, directAngle);
    let angle = directAngle;
    let bank = false;
    if (!direct || direct.ball.number !== target.number) {
      const bankPlan = bankContactPlan(cuePos, target);
      if (bankPlan) {
        angle = bankPlan.angle;
        bank = true;
      }
    }
    const travel = dist(cuePos, target);
    const speed = Math.sqrt(2 * ROLL_DECEL * (travel + 150)) * 1.18;
    let power = (speed - MIN_SHOT) / (MAX_SHOT - MIN_SHOT);
    power = clamp(power, bank ? 0.4 : 0.3, 0.72);
    return { angle, power, fallback: true, bank };
  }

  function computeAIPlan() {
    const cue = cueBall();
    const target = lowestBall();
    if (!cue || !target) return null;

    if (game.breakPending) {
      const jitter = randomRange(-0.0035, 0.0035);
      return {
        angle: Math.atan2(target.y - cue.y, target.x - cue.x) + jitter,
        power: randomRange(0.95, 1),
        fallback: false,
      };
    }

    const plans = buildPotPlans(cue, target);
    let plan = null;
    if (plans.length) {
      if (settings.difficulty === "shark") {
        plan = plans[0];
      } else {
        const pool = plans.slice(0, Math.min(3, plans.length));
        const weights = pool.map((_, index) => 1 / (index + 1.4));
        const total = weights.reduce((a, b) => a + b, 0);
        let roll = Math.random() * total;
        let chosen = pool[0];
        for (let i = 0; i < pool.length; i++) {
          roll -= weights[i];
          if (roll <= 0) {
            chosen = pool[i];
            break;
          }
        }
        plan = chosen;
      }
    } else {
      plan = fallbackAIPlan(cue, target);
    }
    if (!plan) return null;

    let errorScale = settings.difficulty === "shark" ? 0.0034 : 0.0125;
    if (!plan.fallback) errorScale *= 1 + (1 - plan.cut) * 1.8;
    const angleError = (Math.random() + Math.random() - 1) * errorScale;
    const powerError = settings.difficulty === "shark" ? randomRange(0.98, 1.025) : randomRange(0.94, 1.08);
    return {
      angle: plan.angle + angleError,
      power: clamp(plan.power * powerError, 0.1, 0.98),
      fallback: Boolean(plan.fallback),
    };
  }

  function chooseAIPlacement() {
    const target = lowestBall();
    if (!target) return null;
    let best = null;
    for (let ix = 1; ix <= 13; ix++) {
      for (let iy = 1; iy <= 7; iy++) {
        const x = R + 18 + ((W - R * 2 - 36) * ix) / 14;
        const y = R + 18 + ((H - R * 2 - 36) * iy) / 8;
        if (!isValidCuePlacement(x, y)) continue;
        const pos = { x, y };
        const plans = buildPotPlans(pos, target);
        let score = -Infinity;
        if (plans.length) {
          score = plans[0].score + 0.85;
        } else {
          const directAngle = Math.atan2(target.y - y, target.x - x);
          const first = firstObjectOnRay(pos, directAngle);
          if (first && first.ball.number === target.number) {
            score = 0.32 - dist(pos, target) / W;
          }
        }
        if (score > -Infinity) {
          score -= Math.abs(x - W / 2) / W * 0.06;
          if (!best || score > best.score) best = { x, y, score };
        }
      }
    }
    return best;
  }

  function startAIPhase(phase, timer) {
    aiCtl.phase = phase;
    aiCtl.timer = timer;
  }

  function placeCueForAI() {
    const spot = chooseAIPlacement() || findCuePlacementNear(W / 2, H / 2);
    const cue = cueBall();
    cue.active = true;
    cue.pocketed = false;
    cue.sink = null;
    cue.x = spot.x;
    cue.y = spot.y;
    cue.vx = 0;
    cue.vy = 0;
    game.placement = { x: spot.x, y: spot.y, valid: true };
    game.ballInHand = false;
    game.state = "aiming";
    game.aimAngle = -Math.PI / 2;
    updateUI(true);
  }

  function updateAI(dt) {
    if (!aiCtl.active || !isAITurn()) return;

    if (aiCtl.phase === "think") {
      aiCtl.timer -= dt;
      if (aiCtl.timer > 0) return;
      if (game.state === "ball-in-hand") {
        placeCueForAI();
        showToast("The House takes ball in hand.", "", 1600);
        startAIPhase("think", 0.55);
        return;
      }
      const plan = computeAIPlan();
      if (!plan) {
        startAIPhase("think", 0.6);
        return;
      }
      aiCtl.targetAngle = plan.angle;
      aiCtl.targetPower = plan.power;
      startAIPhase("align", 1.0);
      updateUI(true);
      return;
    }

    if (aiCtl.phase === "align") {
      aiCtl.timer -= dt;
      const delta = angleDelta(game.aimAngle, aiCtl.targetAngle);
      game.aimAngle = approachAngle(game.aimAngle, aiCtl.targetAngle, dt * 3.3);
      if (aiCtl.timer <= 0 && Math.abs(delta) < 0.012) {
        game.charging = true;
        game.chargeSource = "ai";
        game.power = 0;
        startAIPhase("charge", 0.92);
        updateUI(true);
      } else if (aiCtl.timer <= -1.4) {
        game.aimAngle = aiCtl.targetAngle;
        game.charging = true;
        game.chargeSource = "ai";
        game.power = 0;
        startAIPhase("charge", 0.92);
        updateUI(true);
      }
      return;
    }

    if (aiCtl.phase === "charge") {
      aiCtl.timer -= dt;
      const rate = Math.max(0.58, aiCtl.targetPower / 0.58);
      game.power = Math.min(aiCtl.targetPower, game.power + dt * rate);
      if (aiCtl.timer <= 0) {
        game.charging = false;
        game.chargeSource = null;
        fireShot(aiCtl.targetPower, true);
      }
    }
  }

  /* ————— Aim prediction ————— */

  function rayBoundary(origin, dx, dy) {
    let best = Infinity;
    let nx = 0;
    let ny = 0;
    if (dx > 0.00001) {
      const t = (W - R - origin.x) / dx;
      if (t >= 0 && t < best) {
        best = t;
        nx = -1;
        ny = 0;
      }
    } else if (dx < -0.00001) {
      const t = (R - origin.x) / dx;
      if (t >= 0 && t < best) {
        best = t;
        nx = 1;
        ny = 0;
      }
    }
    if (dy > 0.00001) {
      const t = (H - R - origin.y) / dy;
      if (t >= 0 && t < best) {
        best = t;
        nx = 0;
        ny = -1;
      }
    } else if (dy < -0.00001) {
      const t = (R - origin.y) / dy;
      if (t >= 0 && t < best) {
        best = t;
        nx = 0;
        ny = 1;
      }
    }
    return { t: best, nx, ny };
  }

  function pocketOnRay(origin, dx, dy, maxT) {
    let best = null;
    for (const pocket of POCKETS) {
      const px = pocket.x - origin.x;
      const py = pocket.y - origin.y;
      const t = px * dx + py * dy;
      if (t < R) continue;
      const perp = Math.abs(px * dy - py * dx);
      if (perp > pocket.r * 0.92) continue;
      if (t > maxT + 50) continue;
      if (!best || t < best.t) best = { pocket, t };
    }
    return best;
  }

  function predictAim() {
    const cue = cueBall();
    if (!cue || !cue.active) return null;
    const dx = Math.cos(game.aimAngle);
    const dy = Math.sin(game.aimAngle);
    const bounds = rayBoundary(cue, dx, dy);
    let closestBall = null;
    let closestT = Infinity;
    for (const ball of game.balls) {
      if (ball.number === 0 || !ball.active) continue;
      const t = rayCircleT(cue, dx, dy, ball, R * 2);
      if (t !== null && t < closestT) {
        closestT = t;
        closestBall = ball;
      }
    }

    if (closestBall && closestT < bounds.t - 0.5) {
      const ghost = { x: cue.x + dx * closestT, y: cue.y + dy * closestT };
      const ndx = (closestBall.x - ghost.x) / (R * 2);
      const ndy = (closestBall.y - ghost.y) / (R * 2);
      const dot = dx * ndx + dy * ndy;
      let tangentX = dx - ndx * dot;
      let tangentY = dy - ndy * dot;
      const tangentLength = Math.hypot(tangentX, tangentY);
      if (tangentLength > 0.001) {
        tangentX /= tangentLength;
        tangentY /= tangentLength;
      }
      const objectBounds = rayBoundary(closestBall, ndx, ndy);
      const objectMaxT = objectBounds.t;
      const objectPocket = pocketOnRay(closestBall, ndx, ndy, objectMaxT);
      const objectEnd = objectPocket
        ? { x: objectPocket.pocket.x, y: objectPocket.pocket.y }
        : {
            x: closestBall.x + ndx * objectMaxT,
            y: closestBall.y + ndy * objectMaxT,
          };
      const bounceLength = 150;
      const reflectedObject = {
        x: objectEnd.x + (ndx - 2 * (ndx * objectBounds.nx + ndy * objectBounds.ny) * objectBounds.nx) * bounceLength,
        y: objectEnd.y + (ndy - 2 * (ndx * objectBounds.nx + ndy * objectBounds.ny) * objectBounds.ny) * bounceLength,
      };
      return {
        type: "ball",
        ghost,
        target: closestBall,
        objectDir: { x: ndx, y: ndy },
        objectEnd,
        objectPocket: objectPocket?.pocket || null,
        hasObjectBounce: !objectPocket && objectBounds.nx + objectBounds.ny !== 0,
        reflectedObject,
        deflectionDir: tangentLength > 0.001 ? { x: tangentX, y: tangentY } : null,
      };
    }

    if (!Number.isFinite(bounds.t)) return null;
    const hit = { x: cue.x + dx * bounds.t, y: cue.y + dy * bounds.t };
    const dot = dx * bounds.nx + dy * bounds.ny;
    const rx = dx - 2 * dot * bounds.nx;
    const ry = dy - 2 * dot * bounds.ny;
    return {
      type: "rail",
      hit,
      reflect: { x: rx, y: ry },
      bounds,
    };
  }

  function drawDashedLine(from, to, color, width, dash, alpha = 1, offset = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.setLineDash(dash);
    ctx.lineDashOffset = offset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAimGuide() {
    if (game.state !== "aiming" || !cueBall()?.active || !game.players.length) return;
    const pred = predictAim();
    game.prediction = pred;
    if (!pred) return;
    const cue = cueBall();
    const accent = game.players[game.turn]?.color || "#e6bc7a";
    const pulse = (Math.sin(performance.now() * 0.004) + 1) / 2;
    const dx = Math.cos(game.aimAngle);
    const dy = Math.sin(game.aimAngle);
    const start = { x: cue.x + dx * (R + 5), y: cue.y + dy * (R + 5) };
    const dashOffset = -performance.now() * 0.018;

    if (pred.type === "ball") {
      const end = pred.ghost;
      // Soft under-glow makes the guide readable on any part of the felt.
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
      drawDashedLine(start, end, accent, 1.15, [4.5, 7], 0.82, dashOffset);

      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.15;
      ctx.setLineDash([2.5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();

      const objectStart = {
        x: pred.target.x + pred.objectDir.x * (R + 3),
        y: pred.target.y + pred.objectDir.y * (R + 3),
      };
      const objectEnd = pred.objectEnd;
      drawDashedLine(objectStart, objectEnd, pred.objectPocket ? "#e9cd8f" : accent, 1.35, [3, 7], 0.65, dashOffset * 0.7);
      if (pred.hasObjectBounce) {
        drawDashedLine(objectEnd, pred.reflectedObject, accent, 1, [2, 8], 0.22);
      }
      if (pred.objectPocket) {
        const p = pred.objectPocket;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = 0.38 + pulse * 0.3;
        ctx.strokeStyle = "#e9cd8f";
        ctx.lineWidth = 1.15;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, p.r + 6 + pulse * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (pred.deflectionDir) {
        const deflectStart = {
          x: end.x + pred.deflectionDir.x * (R + 3),
          y: end.y + pred.deflectionDir.y * (R + 3),
        };
        const deflectEnd = {
          x: deflectStart.x + pred.deflectionDir.x * 58,
          y: deflectStart.y + pred.deflectionDir.y * 58,
        };
        drawDashedLine(deflectStart, deflectEnd, accent, 0.9, [2, 8], 0.24);
      }

      ctx.save();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (pred.type === "rail") {
      drawDashedLine(start, pred.hit, accent, 1.15, [4.5, 7], 0.72, dashOffset);
      const bounceEnd = {
        x: pred.hit.x + pred.reflect.x * 205,
        y: pred.hit.y + pred.reflect.y * 205,
      };
      drawDashedLine(pred.hit, bounceEnd, accent, 0.9, [2.5, 8], 0.2);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pred.hit.x, pred.hit.y, 3.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ————— Layout, input, simulation loop ————— */

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
    const narrow = view.w < 760;
    view.topPad = narrow ? 76 : 84;
    view.bottomPad = narrow ? 144 : 154;
    const sidePad = clamp(view.w * 0.03, 10, 50);
    const availW = Math.max(260, view.w - sidePad * 2);
    const availH = Math.max(150, view.h - view.topPad - view.bottomPad);
    view.baseScale = Math.min(availW / OUT_W, availH / OUT_H);
    view.centerX = view.w / 2;
    view.centerY = view.topPad + availH / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    buildDust();
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * view.w;
    const sy = ((clientY - rect.top) / rect.height) * view.h;
    const scale = view.baseScale * cam.zoom;
    return {
      x: cam.focusX + (sx - view.centerX - cam.shakeX) / scale,
      y: cam.focusY + (sy - view.centerY - cam.shakeY) / scale,
    };
  }

  function updateAimFromPointer() {
    if (game.state !== "aiming" || game.charging || game.players[game.turn]?.isAI) return;
    const cue = cueBall();
    if (!cue || !cue.active) return;
    const dx = pointerWorld.x - cue.x;
    const dy = pointerWorld.y - cue.y;
    if (Math.hypot(dx, dy) > R * 1.2) game.aimAngle = Math.atan2(dy, dx);
  }

  function updatePlacementFromPointer() {
    if (game.state !== "ball-in-hand" || game.players[game.turn]?.isAI) return;
    const x = clamp(pointerWorld.x, R, W - R);
    const y = clamp(pointerWorld.y, R, H - R);
    const valid = isValidCuePlacement(x, y);
    game.placement = { x, y, valid };
  }

  function updateAimKeys(dt) {
    if (game.state !== "aiming" || game.players[game.turn]?.isAI) return;
    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const right = keys.has("ArrowRight") || keys.has("KeyD");
    if (!left && !right) return;
    const fine = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const rate = fine ? 0.075 : 0.32;
    game.aimAngle += ((right ? 1 : 0) - (left ? 1 : 0)) * rate * dt;
    game.aimAngle = Math.atan2(Math.sin(game.aimAngle), Math.cos(game.aimAngle));
  }

  function updateCamera(dt) {
    let targetZoom = 1;
    let targetX = W / 2;
    let targetY = H / 2;
    if (game.state === "menu") {
      targetZoom = 1.035;
      targetX = W / 2 + Math.sin(performance.now() * 0.00011) * 7;
      targetY = H / 2 + Math.cos(performance.now() * 0.00009) * 3;
    } else if (game.state === "shooting") {
      targetZoom = 1.018;
      const moving = game.balls.filter((b) => b.active && Math.hypot(b.vx, b.vy) > 8);
      if (moving.length) {
        const avgX = moving.reduce((sum, b) => sum + b.x, 0) / moving.length;
        const avgY = moving.reduce((sum, b) => sum + b.y, 0) / moving.length;
        targetX = W / 2 + clamp((avgX - W / 2) * 0.055, -14, 14);
        targetY = H / 2 + clamp((avgY - H / 2) * 0.055, -14, 14);
      }
    } else if (game.state === "gameOver") {
      targetZoom = 1.03;
    }
    if (prefersReducedMotion) {
      targetZoom = 1;
      targetX = W / 2;
      targetY = H / 2;
    }
    const focusEase = 1 - Math.exp(-dt * 2.2);
    const zoomEase = 1 - Math.exp(-dt * 2.8);
    cam.focusX = lerp(cam.focusX, targetX, focusEase);
    cam.focusY = lerp(cam.focusY, targetY, focusEase);
    cam.zoom = lerp(cam.zoom, targetZoom, zoomEase);
    cam.shake *= Math.exp(-dt * 8.5);
    if (cam.shake < 0.01) cam.shake = 0;
    const t = performance.now() * 0.001;
    cam.shakeX = Math.sin(t * 93) * cam.shake + Math.sin(t * 177 + 1.7) * cam.shake * 0.45;
    cam.shakeY = Math.cos(t * 111 + 2.4) * cam.shake * 0.8;
  }

  function buildDust() {
    const count = view.w < 760 ? 18 : 30;
    dust = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: randomRange(0.4, 1.6),
      speed: randomRange(0.002, 0.009),
      drift: randomRange(0.4, 1.4),
      phase: randomRange(0, Math.PI * 2),
      alpha: randomRange(0.05, 0.17),
    }));
  }

  function updateDust(dt) {
    for (const mote of dust) {
      mote.y -= mote.speed * dt;
      mote.x += Math.sin(performance.now() * 0.0003 + mote.phase) * 0.0001 * dt * 60;
      if (mote.y < -0.02) {
        mote.y = 1.02;
        mote.x = Math.random();
      }
    }
  }

  function updateCueStrike(dt) {
    if (!game.cueStrike) return;
    game.cueStrike.t += dt;
    if (game.cueStrike.t > game.cueStrike.duration + 0.1) game.cueStrike = null;
  }

  function update(dt) {
    if (game.state === "paused") return;
    updateSlowmo(dt);
    updateCamera(dt);
    updateDust(dt);
    updateCueStrike(dt);
    const simScale = game.state === "shooting" ? game.timeScale : 1;
    updateParticles(dt * (game.state === "shooting" ? simScale : 1));
    updateSinkingBalls(dt * simScale);

    if (game.state === "shooting") {
      updatePhysics(dt * game.timeScale);
      if (isTableStill()) {
        game.settleTimer += dt;
      } else {
        game.settleTimer = 0;
      }
      if (game.settleTimer > 0.36) {
        game.settleTimer = 0;
        resolveShot();
      }
    } else if (game.state === "aiming" || game.state === "ball-in-hand") {
      if (game.state === "aiming" && !isAITurn()) updateAimKeys(dt);
      if (game.charging && game.chargeSource !== "ai") {
        game.power = Math.min(1, game.power + dt / MAX_CHARGE_SECONDS);
        updatePowerUI();
      }
      updateAI(dt);
    }
    updateUI();
    updatePowerUI();
  }

  function frame(now) {
    const raw = (now - game.lastTime) / 1000;
    game.lastTime = now;
    const dt = Math.min(0.045, Math.max(0, raw));
    update(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  /* ————— Painting the room ————— */

  function parseHex(hex) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }

  function shade(hex, amount) {
    const { r, g, b } = parseHex(hex);
    const target = amount > 0 ? 255 : 0;
    const mix = Math.abs(amount);
    return `rgb(${Math.round(lerp(r, target, mix))}, ${Math.round(lerp(g, target, mix))}, ${Math.round(lerp(b, target, mix))})`;
  }

  function rgba(hex, alpha) {
    const { r, g, b } = parseHex(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function buildClothTexture() {
    const texture = document.createElement("canvas");
    texture.width = 160;
    texture.height = 160;
    const g = texture.getContext("2d");
    const img = g.createImageData(160, 160);
    const data = img.data;
    const rng = seedRandom(894221);
    for (let i = 0; i < data.length; i += 4) {
      const v = rng();
      const light = v > 0.52;
      data[i] = light ? 255 : 6;
      data[i + 1] = light ? 250 : 12;
      data[i + 2] = light ? 229 : 10;
      data[i + 3] = Math.floor(rng() * (light ? 11 : 16));
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = "rgba(255,255,255,0.022)";
    g.lineWidth = 0.5;
    for (let x = -160; x < 320; x += 7) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 160, 160);
      g.stroke();
    }
    clothTexture = texture;
  }

  function drawCushion(c, points, direction) {
    c.save();
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
    let gradient;
    if (direction === "top") {
      gradient = c.createLinearGradient(0, -18, 0, 0);
      gradient.addColorStop(0, "#082f27");
      gradient.addColorStop(0.7, "#0a4438");
      gradient.addColorStop(1, "#0e5646");
    } else if (direction === "bottom") {
      gradient = c.createLinearGradient(0, H + 18, 0, H);
      gradient.addColorStop(0, "#082f27");
      gradient.addColorStop(0.7, "#0a4438");
      gradient.addColorStop(1, "#0e5646");
    } else if (direction === "left") {
      gradient = c.createLinearGradient(-18, 0, 0, 0);
      gradient.addColorStop(0, "#082f27");
      gradient.addColorStop(0.7, "#0a4438");
      gradient.addColorStop(1, "#0e5646");
    } else {
      gradient = c.createLinearGradient(W + 18, 0, W, 0);
      gradient.addColorStop(0, "#082f27");
      gradient.addColorStop(0.7, "#0a4438");
      gradient.addColorStop(1, "#0e5646");
    }
    c.fillStyle = gradient;
    c.fill();
    c.strokeStyle = "rgba(169, 201, 183, 0.055)";
    c.lineWidth = 0.7;
    c.stroke();
    c.restore();
  }

  function drawPocket(c, pocket) {
    const { x, y, r } = pocket;
    const halo = c.createRadialGradient(x, y, 4, x, y, r + 21);
    halo.addColorStop(0, "rgba(0,0,0,0.55)");
    halo.addColorStop(0.62, "rgba(0,0,0,0.22)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, r + 21, 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(x, y);
    const leather = c.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r + 6);
    leather.addColorStop(0, "#11130f");
    leather.addColorStop(0.72, "#090b09");
    leather.addColorStop(0.9, "#3a2b1b");
    leather.addColorStop(1, "#1b130c");
    c.fillStyle = leather;
    c.beginPath();
    c.arc(0, 0, r + 5, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = "rgba(214, 181, 114, 0.22)";
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(0, 0, r + 4.2, 0, Math.PI * 2);
    c.stroke();

    const hole = c.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r);
    hole.addColorStop(0, "#000000");
    hole.addColorStop(0.82, "#010201");
    hole.addColorStop(1, "#090a08");
    c.fillStyle = hole;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = "rgba(241, 225, 190, 0.12)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(0, 0, r - 1.8, Math.PI * 1.08, Math.PI * 1.62);
    c.stroke();

    c.strokeStyle = "rgba(198, 160, 91, 0.14)";
    c.lineWidth = 0.9;
    c.beginPath();
    c.arc(0, 0, r + 6.4, Math.PI * 0.95, Math.PI * 1.65);
    c.stroke();
    c.restore();
  }

  function drawDiamond(c, x, y) {
    const g = c.createLinearGradient(x - 3, y - 3, x + 3, y + 3);
    g.addColorStop(0, "rgba(240, 216, 164, 0.88)");
    g.addColorStop(1, "rgba(129, 95, 45, 0.72)");
    c.save();
    c.translate(x, y);
    c.rotate(Math.PI / 4);
    c.fillStyle = g;
    c.fillRect(-2.6, -2.6, 5.2, 5.2);
    c.strokeStyle = "rgba(25, 16, 7, 0.6)";
    c.lineWidth = 0.6;
    c.strokeRect(-2.6, -2.6, 5.2, 5.2);
    c.restore();
  }

  function buildTableCache() {
    if (!clothTexture) buildClothTexture();
    const scale = 2.4;
    const cache = document.createElement("canvas");
    cache.width = Math.ceil(OUT_W * scale);
    cache.height = Math.ceil(OUT_H * scale);
    const c = cache.getContext("2d");
    c.scale(scale, scale);
    c.translate(RAIL, RAIL);

    const rng = seedRandom(77413);
    const outerX = -RAIL;
    const outerY = -RAIL;
    const outerW = W + RAIL * 2;
    const outerH = H + RAIL * 2;

    // Deep shadow under the table body.
    c.save();
    c.shadowColor = "rgba(0, 0, 0, 0.68)";
    c.shadowBlur = 38;
    c.shadowOffsetY = 25;
    roundedRect(c, outerX + 6, outerY + 6, outerW - 12, outerH - 12, 32);
    c.fillStyle = "rgba(0, 0, 0, 0.24)";
    c.fill();
    c.restore();

    // Outer wood body.
    roundedRect(c, outerX, outerY, outerW, outerH, 31);
    const wood = c.createLinearGradient(outerX, outerY, outerX + outerW * 0.7, outerY + outerH);
    wood.addColorStop(0, "#744729");
    wood.addColorStop(0.24, "#57331d");
    wood.addColorStop(0.58, "#382013");
    wood.addColorStop(0.82, "#5a341d");
    wood.addColorStop(1, "#2b180e");
    c.fillStyle = wood;
    c.fill();

    c.save();
    roundedRect(c, outerX, outerY, outerW, outerH, 31);
    c.clip();
    for (let i = 0; i < 92; i++) {
      const y = outerY + rng() * outerH;
      const wave = 3 + rng() * 12;
      c.beginPath();
      c.moveTo(outerX - 20, y);
      c.bezierCurveTo(
        outerX + outerW * 0.25,
        y + wave,
        outerX + outerW * 0.62,
        y - wave * 0.8,
        outerX + outerW + 20,
        y + wave * 0.3
      );
      c.strokeStyle =
        i % 5 === 0 ? "rgba(241, 194, 119, 0.035)" : `rgba(15, 7, 3, ${0.035 + rng() * 0.055})`;
      c.lineWidth = 0.35 + rng() * 1.15;
      c.stroke();
    }
    const woodSheen = c.createLinearGradient(outerX, outerY, outerX + outerW * 0.45, outerY + outerH * 0.2);
    woodSheen.addColorStop(0, "rgba(255, 224, 170, 0.09)");
    woodSheen.addColorStop(0.45, "rgba(255, 213, 148, 0.018)");
    woodSheen.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = woodSheen;
    c.fillRect(outerX, outerY, outerW, outerH);
    c.restore();

    // Bevels and brass pinlines.
    c.strokeStyle = "rgba(10, 5, 2, 0.82)";
    c.lineWidth = 3.2;
    roundedRect(c, outerX + 1.5, outerY + 1.5, outerW - 3, outerH - 3, 30);
    c.stroke();
    c.strokeStyle = "rgba(231, 197, 127, 0.36)";
    c.lineWidth = 1;
    roundedRect(c, outerX + 9, outerY + 9, outerW - 18, outerH - 18, 25);
    c.stroke();
    c.strokeStyle = "rgba(0, 0, 0, 0.32)";
    c.lineWidth = 2.5;
    roundedRect(c, outerX + 15, outerY + 15, outerW - 30, outerH - 30, 21);
    c.stroke();
    c.strokeStyle = "rgba(188, 148, 82, 0.2)";
    c.lineWidth = 0.8;
    roundedRect(c, outerX + 22, outerY + 22, outerW - 44, outerH - 44, 18);
    c.stroke();

    // Felt bed.
    const feltBase = c.createLinearGradient(0, 0, W, H);
    feltBase.addColorStop(0, "#0d5d4b");
    feltBase.addColorStop(0.44, "#0b5544");
    feltBase.addColorStop(1, "#063d32");
    c.fillStyle = feltBase;
    c.fillRect(0, 0, W, H);

    const light = c.createRadialGradient(W * 0.43, H * 0.34, 20, W * 0.5, H * 0.49, W * 0.72);
    light.addColorStop(0, "rgba(56, 132, 107, 0.34)");
    light.addColorStop(0.5, "rgba(18, 83, 66, 0.12)");
    light.addColorStop(1, "rgba(0, 20, 14, 0.32)");
    c.fillStyle = light;
    c.fillRect(0, 0, W, H);

    c.save();
    c.fillStyle = c.createPattern(clothTexture, "repeat");
    c.globalAlpha = 0.9;
    c.fillRect(0, 0, W, H);
    c.restore();

    // Tournament cloth markings.
    c.save();
    c.strokeStyle = "rgba(237, 228, 205, 0.028)";
    c.lineWidth = 0.7;
    c.setLineDash([1.4, 7]);
    c.beginPath();
    c.moveTo(W * 0.25, 17);
    c.lineTo(W * 0.25, H - 17);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(227, 200, 146, 0.2)";
    c.beginPath();
    c.arc(W * 0.25, H / 2, 2.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(W * 0.75, H / 2, 2.4, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // Quiet center crest.
    c.save();
    c.translate(W / 2, H / 2);
    c.globalAlpha = 0.055;
    c.strokeStyle = "#f2e7d1";
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(0, 0, 84, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 76, 0, Math.PI * 2);
    c.stroke();
    c.font = "italic 62px Georgia, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#f2e7d1";
    c.fillText("9", 0, 3);
    c.font = "600 6.5px 'DM Sans', sans-serif";
    c.fillText("N I N E   R O O M", 0, 45);
    c.restore();

    // Inner rail shadow.
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    let edge = c.createLinearGradient(0, 0, 0, 46);
    edge.addColorStop(0, "rgba(0, 0, 0, 0.44)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = edge;
    c.fillRect(0, 0, W, 46);
    edge = c.createLinearGradient(0, H, 0, H - 46);
    edge.addColorStop(0, "rgba(0, 0, 0, 0.4)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = edge;
    c.fillRect(0, H - 46, W, 46);
    edge = c.createLinearGradient(0, 0, 46, 0);
    edge.addColorStop(0, "rgba(0, 0, 0, 0.38)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = edge;
    c.fillRect(0, 0, 46, H);
    edge = c.createLinearGradient(W, 0, W - 46, 0);
    edge.addColorStop(0, "rgba(0, 0, 0, 0.38)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = edge;
    c.fillRect(W - 46, 0, 46, H);
    c.restore();

    // Cushion blocks.
    const topLeftStart = CORNER_GAP;
    const topLeftEnd = W / 2 - SIDE_GAP;
    const topRightStart = W / 2 + SIDE_GAP;
    const topRightEnd = W - CORNER_GAP;
    drawCushion(c, [[topLeftStart, -18], [topLeftEnd, -18], [topLeftEnd - 5, 0], [topLeftStart + 5, 0]], "top");
    drawCushion(c, [[topRightStart, -18], [topRightEnd, -18], [topRightEnd - 5, 0], [topRightStart + 5, 0]], "top");
    drawCushion(c, [[topLeftStart, H + 18], [topLeftEnd, H + 18], [topLeftEnd - 5, H], [topLeftStart + 5, H]], "bottom");
    drawCushion(c, [[topRightStart, H + 18], [topRightEnd, H + 18], [topRightEnd - 5, H], [topRightStart + 5, H]], "bottom");
    drawCushion(c, [[-18, CORNER_GAP], [-18, H - CORNER_GAP], [0, H - CORNER_GAP - 5], [0, CORNER_GAP + 5]], "left");
    drawCushion(c, [[W + 18, CORNER_GAP], [W + 18, H - CORNER_GAP], [W, H - CORNER_GAP - 5], [W, CORNER_GAP + 5]], "right");

    // A soft highlight along every cushion nose.
    c.save();
    c.strokeStyle = "rgba(209, 234, 216, 0.085)";
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(topLeftStart + 5, -0.6);
    c.lineTo(topLeftEnd - 5, -0.6);
    c.moveTo(topRightStart + 5, -0.6);
    c.lineTo(topRightEnd - 5, -0.6);
    c.moveTo(topLeftStart + 5, H + 0.6);
    c.lineTo(topLeftEnd - 5, H + 0.6);
    c.moveTo(topRightStart + 5, H + 0.6);
    c.lineTo(topRightEnd - 5, H + 0.6);
    c.moveTo(-0.6, CORNER_GAP + 5);
    c.lineTo(-0.6, H - CORNER_GAP - 5);
    c.moveTo(W + 0.6, CORNER_GAP + 5);
    c.lineTo(W + 0.6, H - CORNER_GAP - 5);
    c.stroke();
    c.restore();

    // Pockets.
    for (const pocket of POCKETS) drawPocket(c, pocket);

    // Rail sights.
    const longXs = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875].map((v) => W * v);
    for (const x of longXs) {
      drawDiamond(c, x, -RAIL + 27);
      drawDiamond(c, x, H + RAIL - 27);
    }
    for (const y of [H * 0.25, H * 0.5, H * 0.75]) {
      drawDiamond(c, -RAIL + 27, y);
      drawDiamond(c, W + RAIL - 27, y);
    }

    // Small rail plaque, bottom-left.
    c.save();
    c.translate(W * 0.18, H + RAIL - 18);
    c.globalAlpha = 0.36;
    c.strokeStyle = "rgba(230, 200, 139, 0.7)";
    c.lineWidth = 0.6;
    roundedRect(c, -38, -6.5, 76, 13, 2);
    c.stroke();
    c.fillStyle = "rgba(236, 211, 160, 0.82)";
    c.font = "600 6px 'DM Sans', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("N I N E   R O O M   ·   N ° 9", 0, 0.4);
    c.restore();

    // Outer warm edge highlight.
    c.strokeStyle = "rgba(246, 215, 157, 0.16)";
    c.lineWidth = 0.8;
    roundedRect(c, outerX + 3, outerY + 3, outerW - 6, outerH - 6, 29);
    c.stroke();

    tableCache = cache;
  }

  /* ————— Balls, cues, particles ————— */

  function buildBallShadowSprite() {
    const sprite = document.createElement("canvas");
    sprite.width = 96;
    sprite.height = 96;
    const g = sprite.getContext("2d");
    const grad = g.createRadialGradient(48, 48, 4, 48, 48, 45);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.62)");
    grad.addColorStop(0.55, "rgba(0, 0, 0, 0.3)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
    ballShadowSprite = sprite;
  }

  function ballRenderState(ball) {
    let x = ball.x;
    let y = ball.y;
    let scale = 1;
    let alpha = 1;
    if (ball.sink) {
      const t = clamp(ball.sink.t, 0, 1);
      const e = smoothstep(t);
      x = lerp(ball.sink.fromX, ball.sink.toX, e);
      y = lerp(ball.sink.fromY, ball.sink.toY, e);
      scale = 1 - e * 0.8;
      alpha = 1 - e * 0.86;
    }
    return { x, y, scale, alpha };
  }

  function drawBallShadow(ball) {
    if (!ballShadowSprite) buildBallShadowSprite();
    const state = ballRenderState(ball);
    if (state.scale <= 0.04) return;
    ctx.save();
    ctx.globalAlpha = 0.7 * state.alpha;
    ctx.translate(state.x + 3.2, state.y + 4.6);
    ctx.scale(state.scale, state.scale * 0.62);
    ctx.drawImage(ballShadowSprite, -R * 1.55, -R * 1.55, R * 3.1, R * 3.1);
    ctx.restore();
  }

  function sphereGradient(base, boost = 0.5) {
    const grad = ctx.createRadialGradient(-R * 0.36, -R * 0.42, R * 0.06, 0, 0, R * 1.14);
    grad.addColorStop(0, shade(base, Math.min(0.86, boost + 0.3)));
    grad.addColorStop(0.32, shade(base, boost * 0.32));
    grad.addColorStop(0.72, shade(base, -0.16));
    grad.addColorStop(1, shade(base, -0.62));
    return grad;
  }

  function drawBall(ball) {
    const state = ballRenderState(ball);
    if (state.scale <= 0.04) return;
    const number = ball.number;
    const base = COLORS[number] || "#c4c4c4";
    const stripe = number >= 9;

    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.scale(state.scale, state.scale);
    ctx.globalAlpha = state.alpha;

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();

    if (number === 0) {
      ctx.fillStyle = sphereGradient("#f1eadb", 0.28);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.save();
      ctx.fillStyle = "rgba(196, 58, 52, 0.9)";
      ctx.beginPath();
      ctx.arc(R * 0.34, -R * 0.28, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (stripe) {
      const ivory = ctx.createRadialGradient(-R * 0.36, -R * 0.42, R * 0.06, 0, 0, R * 1.14);
      ivory.addColorStop(0, "#fffaf0");
      ivory.addColorStop(0.4, "#f3ecd9");
      ivory.addColorStop(0.75, "#cfc4aa");
      ivory.addColorStop(1, "#8e8268");
      ctx.fillStyle = ivory;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      const band = ctx.createLinearGradient(0, -R, 0, R);
      band.addColorStop(0, shade(base, -0.34));
      band.addColorStop(0.24, shade(base, 0.22));
      band.addColorStop(0.52, shade(base, 0.02));
      band.addColorStop(0.78, shade(base, -0.26));
      band.addColorStop(1, shade(base, -0.55));
      ctx.fillStyle = band;
      ctx.fillRect(-R, -R * 0.58, R * 2, R * 1.16);
    } else {
      ctx.fillStyle = sphereGradient(base, number === 8 ? 0.34 : 0.52);
      ctx.fillRect(-R, -R, R * 2, R * 2);
    }

    // Occlusion around the lower-right limb.
    const shadeGrad = ctx.createRadialGradient(R * 0.32, R * 0.38, R * 0.2, 0, 0, R * 1.12);
    shadeGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    shadeGrad.addColorStop(0.62, "rgba(0, 0, 0, 0.03)");
    shadeGrad.addColorStop(1, "rgba(0, 0, 0, 0.44)");
    ctx.fillStyle = shadeGrad;
    ctx.fillRect(-R, -R, R * 2, R * 2);

    // Bounce light along the bottom-right rim.
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = R * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.94, Math.PI * 0.18, Math.PI * 0.62);
    ctx.stroke();
    ctx.restore();

    // Number plate.
    if (number > 0) {
      ctx.save();
      const plate = ctx.createRadialGradient(-1.6, -1.8, 0.5, 0, 0, R * 0.52);
      plate.addColorStop(0, "#ffffff");
      plate.addColorStop(0.72, "#f4efe2");
      plate.addColorStop(1, "#cfc6b0");
      ctx.fillStyle = plate;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(30, 26, 18, 0.22)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = "#191a1c";
      ctx.font = `700 ${R * 0.66}px "DM Sans", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), 0, 0.7);
      ctx.restore();
    }

    // Specular highlights.
    ctx.save();
    ctx.rotate(-0.62);
    ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
    ctx.beginPath();
    ctx.ellipse(-R * 0.3, -R * 0.38, R * 0.33, R * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.52;
    ctx.beginPath();
    ctx.ellipse(-R * 0.56, R * 0.02, R * 0.1, R * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Crisp rim.
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.scale(state.scale, state.scale);
    ctx.globalAlpha = state.alpha;
    if (settings.highContrast) {
      ctx.strokeStyle = "rgba(8, 10, 9, 0.85)";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, R + 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, R + 0.6, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(6, 9, 7, 0.5)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, R - 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function cueBodyPath(c, tipX, buttX, halfTip, halfButt) {
    c.beginPath();
    c.moveTo(tipX, -halfTip);
    c.lineTo(buttX, -halfButt);
    c.lineTo(buttX, halfButt);
    c.lineTo(tipX, halfTip);
    c.closePath();
  }

  function drawCueStick(x, y, angle, power, extraPull = 0, alpha = 1) {
    const pull = 9 + power * 55 + extraPull;
    const tipX = -(R + 7 + pull);
    const buttX = tipX - 318;
    const halfTip = 1.7;
    const halfButt = 5.4;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    // Soft contact shadow.
    ctx.save();
    ctx.translate(2.5, 5.5);
    cueBodyPath(ctx, tipX, buttX, halfTip + 0.8, halfButt + 1.1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    cueBodyPath(ctx, tipX, buttX, halfTip, halfButt);
    ctx.clip();

    const shaft = ctx.createLinearGradient(0, -halfButt - 1, 0, halfButt + 1);
    shaft.addColorStop(0, "#f6e9cb");
    shaft.addColorStop(0.2, "#e0c493");
    shaft.addColorStop(0.5, "#b0854f");
    shaft.addColorStop(0.8, "#77502c");
    shaft.addColorStop(1, "#3c2413");
    ctx.fillStyle = shaft;
    ctx.fillRect(buttX - 2, -halfButt - 2, tipX - buttX + 4, halfButt * 2 + 4);

    // Rosewood butt sleeve.
    const butt = ctx.createLinearGradient(0, -halfButt, 0, halfButt);
    butt.addColorStop(0, "#7a3b32");
    butt.addColorStop(0.32, "#56271f");
    butt.addColorStop(0.7, "#33150f");
    butt.addColorStop(1, "#1c0a07");
    ctx.fillStyle = butt;
    ctx.fillRect(buttX - 2, -halfButt - 2, 118, halfButt * 2 + 4);

    // Irish linen wrap.
    ctx.fillStyle = "#4c3421";
    ctx.fillRect(buttX + 32, -halfButt - 1, 74, halfButt * 2 + 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(buttX + 32, -halfButt - 1, 74, halfButt * 2 + 2);
    ctx.clip();
    for (let wx = buttX + 32; wx < buttX + 106; wx += 2.6) {
      ctx.strokeStyle = wx % 5.2 < 2.6 ? "rgba(20, 11, 5, 0.5)" : "rgba(226, 190, 137, 0.22)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(wx, -halfButt - 2);
      ctx.lineTo(wx + 1.6, halfButt + 2);
      ctx.stroke();
    }
    ctx.restore();

    // Brass rings and joint.
    const ring = (rx, width) => {
      const g = ctx.createLinearGradient(0, -halfButt, 0, halfButt);
      g.addColorStop(0, "#f0d9a4");
      g.addColorStop(0.45, "#c79f58");
      g.addColorStop(1, "#6d5227");
      ctx.fillStyle = g;
      ctx.fillRect(rx, -halfButt - 0.4, width, halfButt * 2 + 0.8);
    };
    ring(buttX + 112, 4.6);
    ring(buttX + 22, 3.4);
    ring(tipX - 138, 4.2);

    // Ferrule and tip.
    ctx.fillStyle = "#f7f1e0";
    ctx.fillRect(tipX - 13, -1.9, 11.5, 3.8);
    const tipGrad = ctx.createLinearGradient(0, -2, 0, 2);
    tipGrad.addColorStop(0, "#3f9d8b");
    tipGrad.addColorStop(1, "#175b4f");
    ctx.fillStyle = tipGrad;
    ctx.fillRect(tipX - 2.2, -1.6, 2.4, 3.2);

    // Lengthwise sheen.
    const sheen = ctx.createLinearGradient(buttX, 0, tipX, 0);
    sheen.addColorStop(0, "rgba(255, 240, 205, 0.05)");
    sheen.addColorStop(0.55, "rgba(255, 244, 214, 0.2)");
    sheen.addColorStop(1, "rgba(255, 250, 232, 0.34)");
    ctx.strokeStyle = sheen;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(buttX + 8, -2.2);
    ctx.lineTo(tipX - 4, -1.1);
    ctx.stroke();
    ctx.restore();

    cueBodyPath(ctx, tipX, buttX, halfTip, halfButt);
    ctx.strokeStyle = "rgba(12, 8, 4, 0.55)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  }

  function drawPlacementGhost(now) {
    if (game.state !== "ball-in-hand") return;
    const cue = cueBall();
    if (!cue || cue.inactive) return;
    if (game.players[game.turn]?.isAI) return;
    const { x, y, valid } = game.placement;
    const pulse = (Math.sin(now * 0.005) + 1) / 2;
    const color = valid ? "#e8d8ae" : "#e5796b";

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.5;
    const hover = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.06, 0, 0, R * 1.1);
    hover.addColorStop(0, "#fffdf6");
    hover.addColorStop(0.6, valid ? "#efe6d0" : "#e8a598");
    hover.addColorStop(1, valid ? "#9f9480" : "#a3564c");
    ctx.fillStyle = hover;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -now * 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, R + 7 + pulse * 2.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-R - 13, 0);
    ctx.lineTo(-R - 5, 0);
    ctx.moveTo(R + 5, 0);
    ctx.lineTo(R + 13, 0);
    ctx.moveTo(0, -R - 13);
    ctx.lineTo(0, -R - 5);
    ctx.moveTo(0, R + 5);
    ctx.lineTo(0, R + 13);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    if (!particles.length) return;
    ctx.save();
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = p.gold ? "#f4d491" : "#f2f6f4";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + alpha * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = p.gold ? "#d9b571" : "#e7ebe4";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ————— Frame composition ————— */

  function drawRoomBackground() {
    const base = ctx.createLinearGradient(0, 0, 0, view.h);
    base.addColorStop(0, "#101c18");
    base.addColorStop(0.42, "#081210");
    base.addColorStop(1, "#030706");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, view.w, view.h);

    const tableW = OUT_W * view.baseScale * cam.zoom;
    const tableH = OUT_H * view.baseScale * cam.zoom;

    // Warm overhead lamp.
    ctx.save();
    ctx.translate(view.centerX, view.centerY - tableH * 0.1);
    ctx.scale(1, 0.52);
    const lamp = ctx.createRadialGradient(0, 0, tableW * 0.08, 0, 0, tableW * 0.82);
    lamp.addColorStop(0, "rgba(255, 224, 168, 0.115)");
    lamp.addColorStop(0.42, "rgba(226, 178, 112, 0.05)");
    lamp.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(-tableW, -tableW, tableW * 2, tableW * 2);
    ctx.restore();

    // Cool salon falloff on the walls.
    const wall = ctx.createLinearGradient(0, 0, view.w, 0);
    wall.addColorStop(0, "rgba(23, 63, 55, 0.24)");
    wall.addColorStop(0.24, "rgba(0, 0, 0, 0)");
    wall.addColorStop(0.76, "rgba(0, 0, 0, 0)");
    wall.addColorStop(1, "rgba(23, 63, 55, 0.24)");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, view.w, view.h);

    // Faint wainscot lines for depth.
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#c9a86b";
    ctx.lineWidth = 1;
    const lineY = view.centerY + tableH * 0.62;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(view.w, lineY);
    ctx.stroke();
    ctx.restore();
  }

  function drawDustMotes() {
    if (!dust.length) return;
    ctx.save();
    for (const mote of dust) {
      const x = mote.x * view.w + Math.sin(performance.now() * 0.00035 + mote.phase) * 9;
      const y = mote.y * view.h;
      ctx.globalAlpha = mote.alpha;
      ctx.fillStyle = "#f1e3c4";
      ctx.beginPath();
      ctx.arc(x, y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTableSheen(now) {
    if (prefersReducedMotion || game.state !== "menu") return;
    const sweep = ((now * 0.00006) % 1.6) - 0.3;
    const cx = lerp(-520, W + 520, sweep / 1.6);
    ctx.save();
    roundedRect(ctx, -RAIL, -RAIL, OUT_W, OUT_H, 31);
    ctx.clip();
    const sheen = ctx.createLinearGradient(cx - 330, 0, cx + 330, H);
    sheen.addColorStop(0, "rgba(255, 244, 220, 0)");
    sheen.addColorStop(0.5, "rgba(255, 244, 220, 0.045)");
    sheen.addColorStop(1, "rgba(255, 244, 220, 0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-RAIL, -RAIL, OUT_W, OUT_H);
    ctx.restore();
  }

  function drawScreenVignette() {
    const radius = Math.hypot(view.w, view.h) * 0.5;
    const vignette = ctx.createRadialGradient(
      view.centerX,
      view.centerY,
      Math.min(view.w, view.h) * 0.24,
      view.centerX,
      view.centerY,
      radius * 1.05
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.62, "rgba(0, 0, 0, 0.2)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.72)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.w, view.h);

    let edge = ctx.createLinearGradient(0, 0, 0, 130);
    edge.addColorStop(0, "rgba(0, 0, 0, 0.42)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, view.w, 130);
    edge = ctx.createLinearGradient(0, view.h, 0, view.h - 190);
    edge.addColorStop(0, "rgba(0, 0, 0, 0.5)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, view.h - 190, view.w, 190);

    if (game.slowmoTimer > 0) {
      ctx.fillStyle = "rgba(9, 14, 12, 0.12)";
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function render(now) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = "#030706";
    ctx.fillRect(0, 0, view.w, view.h);
    drawRoomBackground();

    if (!tableCache) buildTableCache();
    const scale = view.baseScale * cam.zoom;

    ctx.save();
    ctx.translate(view.centerX + cam.shakeX, view.centerY + cam.shakeY);
    ctx.scale(scale, scale);
    ctx.translate(-cam.focusX, -cam.focusY);

    ctx.drawImage(tableCache, -RAIL, -RAIL, OUT_W, OUT_H);
    drawTableSheen(now);

    for (const ball of game.balls) {
      if (ball.active || ball.sink) drawBallShadow(ball);
    }
    for (const ball of game.balls) {
      if (ball.active || ball.sink) drawBall(ball);
    }

    drawParticles();
    drawAimGuide();
    drawPlacementGhost(now);

    if (game.state === "aiming") {
      const cue = cueBall();
      if (cue && cue.active) {
        drawCueStick(cue.x, cue.y, game.aimAngle, game.charging ? game.power : 0.012, 0, 1);
      }
    }

    if (game.cueStrike) {
      const strike = game.cueStrike;
      const t = clamp(strike.t / strike.duration, 0, 1);
      const alpha = 1 - smoothstep(t);
      const recoil = Math.sin(t * Math.PI) * 26;
      drawCueStick(strike.x, strike.y, strike.angle, strike.power, recoil, alpha * 0.92);
    }

    ctx.restore();

    drawDustMotes();
    drawScreenVignette();
  }

  /* ————— Input + boot ————— */

  function placeCueAt(x, y) {
    if (game.state !== "ball-in-hand" || isAITurn()) return;
    const px = clamp(x, R + 2, W - R - 2);
    const py = clamp(y, R + 2, H - R - 2);
    if (!isValidCuePlacement(px, py)) {
      game.placement = { x: px, y: py, valid: false };
      showToast("That spot is crowded. Find clear felt.", "foul", 1700);
      audio.foul();
      return;
    }
    const cue = cueBall();
    cue.x = px;
    cue.y = py;
    cue.vx = 0;
    cue.vy = 0;
    cue.active = true;
    cue.pocketed = false;
    cue.sink = null;
    game.placement = { x: px, y: py, valid: true };
    game.ballInHand = false;
    game.state = "aiming";
    aimAtLowest();
    audio.ui();
    updateUI(true);
  }

  function handlePointerMove(event) {
    pointerWorld = screenToWorld(event.clientX, event.clientY);
    pointerInside = true;
    if (game.state === "ball-in-hand") updatePlacementFromPointer();
    else if (game.state === "aiming") updateAimFromPointer();
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    audio.unlock();
    pointerWorld = screenToWorld(event.clientX, event.clientY);
    if (game.state === "ball-in-hand") {
      placeCueAt(pointerWorld.x, pointerWorld.y);
      return;
    }
    if (game.state === "aiming" && !isAITurn()) {
      updateAimFromPointer();
      beginCharge("pointer");
      if (canvas.setPointerCapture && event.pointerId !== undefined) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* Pointer capture is best-effort. */
        }
      }
    }
  }

  function handlePointerUp() {
    if (ignorePointerUp) {
      ignorePointerUp = false;
      return;
    }
    if (game.charging && game.chargeSource === "pointer") releaseShot();
  }

  function handleKeyDown(event) {
    const code = event.code;
    if (event.repeat) {
      if (code === "Space" || code.startsWith("Arrow")) event.preventDefault();
      return;
    }
    audio.unlock();

    if (code === "Space") {
      event.preventDefault();
      if (game.state === "aiming" && !isAITurn()) beginCharge("key");
      return;
    }
    if (code === "Escape" || code === "KeyP") {
      if (game.state === "paused") resumeGame();
      else pauseGame();
      return;
    }
    if (code === "Enter" && game.state === "gameOver") {
      startMatch(game.mode, true);
      return;
    }
    if (code === "KeyM") {
      toggleSound();
      return;
    }
    if (code.startsWith("Arrow")) event.preventDefault();
    keys.add(code);
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
    if (event.code === "Space" && game.charging && game.chargeSource === "key") {
      event.preventDefault();
      releaseShot();
    }
  }

  function clearInput() {
    keys.clear();
    if (game.charging) cancelCharge();
  }

  function bindEvents() {
    window.addEventListener("resize", resize);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearInput();
    });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    for (const btn of document.querySelectorAll("[data-start]")) {
      btn.addEventListener("click", () => {
        audio.unlock();
        startMatch(btn.dataset.start, false);
      });
    }
    for (const btn of document.querySelectorAll("[data-difficulty]")) {
      btn.addEventListener("click", () => {
        settings.difficulty = btn.dataset.difficulty;
        saveSettings();
        applySettingsUI();
        audio.unlock();
        audio.ui();
        updateUI(true);
      });
    }

    dom.soundBtn.addEventListener("click", toggleSound);
    dom.menuSoundBtn.addEventListener("click", toggleSound);
    dom.pauseSoundBtn.addEventListener("click", toggleSound);
    dom.contrastBtn.addEventListener("click", toggleContrast);
    dom.menuContrastBtn.addEventListener("click", toggleContrast);
    dom.pauseBtn.addEventListener("click", pauseGame);
    dom.resumeBtn.addEventListener("click", resumeGame);
    dom.restartBtn.addEventListener("click", () => startMatch(game.mode, false));
    dom.quitBtn.addEventListener("click", goToMenu);
    dom.rematchBtn.addEventListener("click", () => startMatch(game.mode, true));
    dom.gameMenuBtn.addEventListener("click", goToMenu);
  }

  function boot() {
    resize();
    buildTableCache();
    game.players = makePlayers(game.mode);
    game.state = "menu";
    resetRack();
    applySettingsUI();
    updateUI(true);
    bindEvents();
    game.lastTime = performance.now();
    requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        buildTableCache();
      });
    }
  }

  boot();
})();
