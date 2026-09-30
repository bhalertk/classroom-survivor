"use strict";

// The character, classroom, and upgrade names are kept here for the user's next design pass.
const CONTENT = {
  player: "轉學生",
  enemy: "方塊人",
  weapons: [
    { id: "blueberry", name: "藍莓", icon: "🫐", description: "丟出藍莓砸向附近的敵人" },
    { id: "pistol", name: "手槍", icon: "⌖", description: "自動瞄準最近的敵人，單發射擊" },
    { id: "firecracker", name: "甩炮", icon: "✹", description: "碰到敵人就爆炸，造成範圍傷害" }
  ]
};

const STORY = [
  { title: "轉學第一天", text: "你抱著新書包走進教室。老師還沒到，黑板上卻已經寫好了你的名字。" },
  { title: "不尋常的教室", text: "門在身後輕輕關上。幾個方塊人從課桌之間走出來，朝你慢慢靠近。" },
  { title: "下課之前", text: "黑板上的字忽然變成了「撐到下課」。你握緊手中的鉛筆，決定先保護自己。" }
];

const $ = id => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const screens = ["start-screen", "story-screen", "tutorial-done-screen", "upgrade-screen", "pause-screen", "end-screen"];
const keys = new Set();
const pointer = { active: false, id: null, x: 0, y: 0 };
const MAP = { w: 1800, h: 1200 };
const GAME_LENGTH = 120;
let mode = "menu";
let pauseReturnMode = "playing";
let storyIndex = 0;
let tutorialStep = 0;
let tutorialDistance = 0;
let player;
let enemies = [];
let projectiles = [];
let pickups = [];
let effects = [];
let gameTime = 0;
let spawnClock = 0;
let kills = 0;
let soundEnabled = false;
let audioContext;
let toastTimer;
let lastFrame = 0;
let cw = 0;
let ch = 0;
let scale = 1;
let camera = { x: 0, y: 0 };

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function random(min, max) { return min + Math.random() * (max - min); }
function showScreen(id) { for (const name of screens) $(name).classList.toggle("visible", name === id); }

function resize() {
  cw = window.innerWidth;
  ch = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = cw < 700 ? clamp(cw / 490, .72, .95) : clamp(cw / 1080, .85, 1.25);
}
window.addEventListener("resize", resize);
resize();

function makePlayer() {
  return {
    x: MAP.w / 2, y: MAP.h / 2 + 75, r: 21,
    hp: 100, maxHp: 100, speed: 225, invulnerable: 0,
    facing: 0, moving: false, level: 1, xp: 0, xpNeed: 6,
    pencilCooldown: 0, swingTime: 0, swingAngle: 0,
    blueberryCooldown: 0, pistolCooldown: 0, firecrackerCooldown: 0,
    weapons: { blueberry: 0, pistol: 0, firecracker: 0 }
  };
}

function resetWorld() {
  player = makePlayer();
  enemies = [];
  projectiles = [];
  pickups = [];
  effects = [];
  gameTime = 0;
  spawnClock = 0;
  kills = 0;
  tutorialDistance = 0;
  keys.clear();
  pointer.x = pointer.y = 0;
  updateHud();
}
resetWorld();

function startStory() {
  mode = "story";
  storyIndex = 0;
  renderStory();
  showScreen("story-screen");
}
function renderStory() {
  $("story-progress").textContent = `${String(storyIndex + 1).padStart(2, "0")} / 03`;
  $("story-title").textContent = STORY[storyIndex].title;
  $("story-text").textContent = STORY[storyIndex].text;
  $("story-art").className = `story-art scene-${storyIndex + 1}`;
  $("story-next").innerHTML = storyIndex === STORY.length - 1 ? "進入教學 <span>→</span>" : "下一頁 <span>→</span>";
}
function nextStory() {
  if (storyIndex < STORY.length - 1) { storyIndex++; renderStory(); }
  else startTutorial();
}

function startTutorial() {
  resetWorld();
  mode = "tutorial";
  tutorialStep = 0;
  $("tutorial-panel").hidden = false;
  updateTutorialPanel();
  showScreen(null);
  showToast("歡迎來到新教室！");
}
function updateTutorialPanel() {
  const steps = [
    ["先熟悉移動", "用 WASD、方向鍵或左下角搖桿移動轉學生。"],
    ["試試鉛筆揮砍", "靠近方塊人，鉛筆會自動向它揮砍。"],
    ["收集經驗", "走向掉落的光點，累積經驗就能升級。"]
  ];
  $("tutorial-count").textContent = `教學 ${tutorialStep + 1} / 3`;
  $("tutorial-title").textContent = steps[tutorialStep][0];
  $("tutorial-description").textContent = steps[tutorialStep][1];
}
function tutorialAdvance() {
  if (tutorialStep === 0) {
    tutorialStep = 1;
    enemies.push(makeEnemy(player.x + 77, player.y, "practice"));
    showToast("靠近方塊人，鉛筆會自動揮砍");
  } else if (tutorialStep === 1) {
    tutorialStep = 2;
    pickups.push({ x: player.x + 68, y: player.y, r: 9, value: 1, type: "xp", tutorial: true, age: 0 });
    showToast("撿起經驗光點");
  } else {
    mode = "tutorial-done";
    $("tutorial-panel").hidden = true;
    showScreen("tutorial-done-screen");
  }
  if (tutorialStep < 3 && mode === "tutorial") updateTutorialPanel();
}
function startGame() {
  resetWorld();
  mode = "playing";
  $("tutorial-panel").hidden = true;
  showScreen(null);
  showToast("撐到下課鐘響！");
}

function makeEnemy(x, y, kind = "basic") {
  const practice = kind === "practice";
  const health = practice ? 20 : 37 + gameTime * .42;
  return { x, y, kind, hp: health, maxHp: health, r: 21, speed: practice ? 0 : 79 + gameTime * .12, damage: 11, hitFlash: 0, wobble: random(0, 6.28), attackClock: random(.8, 2), windup: 0, lungeTime: 0, lungeVX: 0, lungeVY: 0, hitPlayer: false };
}
function spawnEnemy(kind) {
  const viewW = cw / scale;
  const viewH = ch / scale;
  const angle = random(0, Math.PI * 2);
  const radius = Math.max(viewW, viewH) * .6 + 70;
  let x = clamp(player.x + Math.cos(angle) * radius, 55, MAP.w - 55);
  let y = clamp(player.y + Math.sin(angle) * radius, 90, MAP.h - 55);
  if (distance({ x, y }, player) < 300) {
    x = clamp(player.x - Math.cos(angle) * radius, 55, MAP.w - 55);
    y = clamp(player.y - Math.sin(angle) * radius, 90, MAP.h - 55);
  }
  enemies.push(makeEnemy(x, y, kind));
}

function inputVector() {
  let x = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
  let y = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
  x += pointer.x;
  y += pointer.y;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
function nearestEnemy(range) {
  let nearest = null;
  let best = range * range;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const dx = enemy.x - player.x, dy = enemy.y - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; nearest = enemy; }
  }
  return nearest;
}
function playSound(frequency, duration = .08, type = "sine", volume = .05) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (_) { soundEnabled = false; }
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1900);
}
function addEffect(x, y, type, extra = {}) { effects.push({ x, y, type, age: 0, duration: type === "explosion" ? .48 : .38, ...extra }); }

function damageEnemy(enemy, amount, source) {
  if (enemy.hp <= 0) return;
  enemy.hp -= amount;
  enemy.hitFlash = .12;
  addEffect(enemy.x, enemy.y - enemy.r, "number", { text: String(Math.round(amount)), color: source === "pencil" ? "#fff4c3" : "#c5ecfa" });
  if (enemy.hp <= 0) {
    playSound(enemy.kind === "boss" ? 170 : 220, .11, "triangle", .045);
    if (enemy.kind === "practice") {
      enemies = enemies.filter(e => e !== enemy);
      tutorialAdvance();
      return;
    }
    kills++;
    pickups.push({ x: enemy.x, y: enemy.y, r: 8, value: 1, type: "xp", age: 0 });
    addEffect(enemy.x, enemy.y, "burst", { color: "#9dcac3" });
  }
}
function pencilAttack() {
  const target = nearestEnemy(105);
  if (!target || player.pencilCooldown > 0) return;
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  player.facing = angle;
  player.swingAngle = angle;
  player.swingTime = .22;
  player.pencilCooldown = .48;
  playSound(510, .055, "triangle", .025);
  for (const enemy of [...enemies]) {
    const d = distance(player, enemy);
    const delta = Math.atan2(Math.sin(Math.atan2(enemy.y - player.y, enemy.x - player.x) - angle), Math.cos(Math.atan2(enemy.y - player.y, enemy.x - player.x) - angle));
    if (d < 105 + enemy.r * .5 && Math.abs(delta) < 1.05) damageEnemy(enemy, 28, "pencil");
  }
}
function shootAt(target, type, speed, damage) {
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  projectiles.push({ x: player.x + Math.cos(angle) * 25, y: player.y + Math.sin(angle) * 25, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed, type, damage, r: type === "blueberry" ? 10 : type === "firecracker" ? 10 : 5, life: 2, target });
  playSound(type === "pistol" ? 710 : 340, type === "pistol" ? .045 : .09, type === "pistol" ? "square" : "sine", .025);
}
function weaponAttacks(dt) {
  pencilAttack();
  const levels = player.weapons;
  player.blueberryCooldown -= dt;
  player.pistolCooldown -= dt;
  player.firecrackerCooldown -= dt;
  if (levels.blueberry && player.blueberryCooldown <= 0) {
    const target = nearestEnemy(480);
    if (target) { shootAt(target, "blueberry", 490, 18 + levels.blueberry * 9); player.blueberryCooldown = Math.max(.55, 1.8 - levels.blueberry * .17); }
  }
  if (levels.pistol && player.pistolCooldown <= 0) {
    const target = nearestEnemy(570);
    if (target) { shootAt(target, "pistol", 810, 13 + levels.pistol * 6); player.pistolCooldown = Math.max(.23, .88 - levels.pistol * .09); }
  }
  if (levels.firecracker && player.firecrackerCooldown <= 0) {
    const target = nearestEnemy(510);
    if (target) { shootAt(target, "firecracker", 320, 32 + levels.firecracker * 13); player.firecrackerCooldown = Math.max(1.05, 3.8 - levels.firecracker * .35); }
  }
}
function explode(projectile) {
  const radius = 65 + player.weapons.firecracker * 13;
  addEffect(projectile.x, projectile.y, "explosion", { radius });
  playSound(130, .25, "sawtooth", .04);
  for (const enemy of [...enemies]) if (distance(projectile, enemy) < radius + enemy.r) damageEnemy(enemy, projectile.damage, "firecracker");
}
function updateProjectiles(dt) {
  for (const projectile of projectiles) {
    if (projectile.type === "firecracker" && projectile.target.hp > 0) {
      const angle = Math.atan2(projectile.target.y - projectile.y, projectile.target.x - projectile.x);
      projectile.vx = Math.cos(angle) * projectile.speed;
      projectile.vy = Math.sin(angle) * projectile.speed;
    }
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (projectile.type === "firecracker") {
      for (const enemy of enemies) {
        if (enemy.hp > 0 && distance(projectile, enemy) < projectile.r + enemy.r) {
          explode(projectile);
          projectile.life = -1;
          break;
        }
      }
    } else {
      for (const enemy of [...enemies]) {
        if (enemy.hp > 0 && distance(projectile, enemy) < projectile.r + enemy.r) {
          damageEnemy(enemy, projectile.damage, projectile.type);
          projectile.life = -1;
          if (projectile.type === "blueberry") addEffect(projectile.x, projectile.y, "burst", { color: "#7899d8" });
          break;
        }
      }
    }
  }
  projectiles = projectiles.filter(p => p.life > 0 && p.x > 0 && p.x < MAP.w && p.y > 0 && p.y < MAP.h);
}
function gainExperience(value) {
  player.xp += value;
  if (mode === "playing" && player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level++;
    player.xpNeed = Math.floor(6 + player.level * 3.5);
    mode = "upgrade";
    renderUpgrades();
    showScreen("upgrade-screen");
    playSound(810, .25, "sine", .06);
  }
}
function renderUpgrades() {
  $("upgrade-options").replaceChildren();
  CONTENT.weapons.forEach((weapon, index) => {
    const level = player.weapons[weapon.id];
    const button = document.createElement("button");
    button.className = "upgrade-card";
    button.type = "button";
    button.innerHTML = `<span class="up-icon">${weapon.icon}</span><strong>${weapon.name} ${level ? `Lv.${level + 1}` : "解鎖"}</strong><small>${weapon.description}</small>`;
    button.setAttribute("aria-label", `${index + 1}，${weapon.name}，${level ? `升至 ${level + 1} 級` : "解鎖"}`);
    button.addEventListener("click", () => chooseUpgrade(weapon.id));
    $("upgrade-options").append(button);
  });
}
function chooseUpgrade(id) {
  if (mode !== "upgrade") return;
  const weapon = CONTENT.weapons.find(w => w.id === id);
  pickups.push({ x: clamp(player.x + 150, 40, MAP.w - 40), y: player.y, r: 15, type: "weapon", weaponId: id, age: 0 });
  mode = "playing";
  showScreen(null);
  showToast(`${weapon.name}掉在附近，走過去撿起來！`);
  updateHud();
}

function updatePickups(dt) {
  for (const pickup of pickups) {
    pickup.age += dt;
    const d = distance(pickup, player);
    if (d < (pickup.type === "weapon" ? 55 : 135) && d > 1) {
      const pull = Math.min(1, 320 * dt / d);
      pickup.x += (player.x - pickup.x) * pull;
      pickup.y += (player.y - pickup.y) * pull;
    }
    if (distance(pickup, player) < 26) {
      pickup.collected = true;
      playSound(750, .07, "sine", .03);
      if (pickup.type === "weapon") {
        player.weapons[pickup.weaponId]++;
        const weapon = CONTENT.weapons.find(w => w.id === pickup.weaponId);
        showToast(`${weapon.name}已成為工具！Lv.${player.weapons[pickup.weaponId]}`);
      } else if (mode === "tutorial" && tutorialStep === 2 && pickup.tutorial) tutorialAdvance();
      else if (mode === "playing") gainExperience(pickup.value);
    }
  }
  pickups = pickups.filter(p => !p.collected);
}
function updateEnemies(dt) {
  let summons = 0;
  for (const enemy of enemies) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    if (enemy.kind === "practice") continue;
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    enemy.attackClock -= dt;
    if (enemy.windup > 0) {
      enemy.windup -= dt;
      if (enemy.windup <= 0) {
        enemy.lungeTime = .32;
        enemy.hitPlayer = false;
        if (Math.random() < .01) summons += 100;
      }
    } else if (enemy.lungeTime > 0) {
      enemy.lungeTime -= dt;
      enemy.x = clamp(enemy.x + enemy.lungeVX * dt, 35, MAP.w - 35);
      enemy.y = clamp(enemy.y + enemy.lungeVY * dt, 80, MAP.h - 35);
    } else {
      if (d > enemy.r + player.r + 12) {
        enemy.x += dx / d * enemy.speed * dt;
        enemy.y += dy / d * enemy.speed * dt;
      }
      if (d < 235 && enemy.attackClock <= 0) {
        enemy.windup = .45;
        enemy.attackClock = random(2.2, 2.8);
        enemy.lungeVX = dx / d * 520;
        enemy.lungeVY = dy / d * 520;
      }
    }
    if (enemy.lungeTime > 0 && !enemy.hitPlayer && distance(enemy, player) < enemy.r + player.r && player.invulnerable <= 0) {
      player.hp = Math.max(0, player.hp - enemy.damage);
      player.invulnerable = .68;
      enemy.hitPlayer = true;
      addEffect(player.x, player.y - 28, "number", { text: `-${enemy.damage}`, color: "#ff806e" });
      playSound(160, .18, "sawtooth", .055);
      if (player.hp <= 0) finishGame(false);
    }
  }
  enemies = enemies.filter(e => e.hp > 0);
  if (summons) {
    for (let i = 0; i < summons; i++) spawnEnemy("basic");
    showToast(`方塊人突刺後召喚了 ${summons} 隻同伴！`);
  }
}
function update(dt) {
  if (mode !== "playing" && mode !== "tutorial") return;
  const v = inputVector();
  const speed = player.speed * dt;
  player.x = clamp(player.x + v.x * speed, 45, MAP.w - 45);
  player.y = clamp(player.y + v.y * speed, 87, MAP.h - 45);
  player.moving = Math.hypot(v.x, v.y) > .05;
  if (player.moving) {
    player.facing = Math.atan2(v.y, v.x);
    if (mode === "tutorial" && tutorialStep === 0) {
      tutorialDistance += Math.hypot(v.x, v.y) * speed;
      if (tutorialDistance >= 105) tutorialAdvance();
    }
  }
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.pencilCooldown = Math.max(0, player.pencilCooldown - dt);
  player.swingTime = Math.max(0, player.swingTime - dt);
  if (mode === "playing") {
    gameTime += dt;
    spawnClock -= dt;
    if (spawnClock <= 0 && enemies.length < 65) {
      const count = gameTime > 75 && Math.random() < .28 ? 2 : 1;
      for (let i = 0; i < count; i++) spawnEnemy("basic");
      spawnClock = Math.max(.43, 1.55 - gameTime * .008);
    }
  }
  updateEnemies(dt);
  weaponAttacks(dt);
  updateProjectiles(dt);
  updatePickups(dt);
  for (const effect of effects) effect.age += dt;
  effects = effects.filter(e => e.age < e.duration);
  if (mode === "playing" && gameTime >= GAME_LENGTH) finishGame(true);
  updateHud();
}
function finishGame(won) {
  if (mode === "ended") return;
  mode = "ended";
  $("end-kicker").textContent = won ? "CLASS DISMISSED!" : "GAME OVER";
  $("end-title").textContent = won ? "下課了！" : "再試一次！";
  $("end-description").textContent = won ? "轉學生撐過了不可思議的第一天。明天的教室，又會發生什麼事呢？" : "轉學生這次沒撐到鐘響。調整走位和升級選擇，再挑戰一次！";
  $("result-time").textContent = formatTime(Math.floor(gameTime));
  $("result-kills").textContent = kills;
  $("result-level").textContent = player.level;
  showScreen("end-screen");
  playSound(won ? 880 : 190, .5, "triangle", .06);
}
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function updateHud() {
  $("hp-text").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  $("hp-fill").style.width = `${player.hp / player.maxHp * 100}%`;
  $("level-text").textContent = `Lv. ${player.level}`;
  $("xp-text").textContent = `${player.xp} / ${player.xpNeed}`;
  $("xp-fill").style.width = `${player.xp / player.xpNeed * 100}%`;
  $("timer").textContent = formatTime(Math.max(0, Math.ceil(GAME_LENGTH - gameTime)));
  $("wave").textContent = gameTime < 40 ? "第 1 節" : gameTime < 80 ? "第 2 節" : "第 3 節";
  $("kill-count").textContent = `擊退 ${kills}`;
  $("weapon-levels").textContent = `🫐${player.weapons.blueberry}　⌖${player.weapons.pistol}　✹${player.weapons.firecracker}`;
}

function roundedRect(x, y, w, h, radius, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function drawDesk(x, y) {
  roundedRect(x - 53, y + 24, 106, 21, 5, "#9c7553", "#77563f", 2);
  roundedRect(x - 65, y - 28, 130, 65, 8, "#987454", "#74563e", 3);
  roundedRect(x - 61, y - 31, 122, 57, 7, "#d9ae72", "#ac7d4c", 3);
  ctx.fillStyle = "#ecd09b"; ctx.fillRect(x - 48, y - 21, 95, 3);
  roundedRect(x - 28, y - 9, 35, 22, 3, "#f5e9ce", "#cabd9d");
  ctx.fillStyle = "#e5b66b"; ctx.fillRect(x + 23, y - 11, 27, 4);
}
function drawClassroom() {
  ctx.fillStyle = "#d8c9ac"; ctx.fillRect(0, 0, MAP.w, MAP.h);
  ctx.strokeStyle = "#c8b994"; ctx.lineWidth = 2;
  for (let x = 0; x < MAP.w; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP.h); ctx.stroke(); }
  for (let y = 0; y < MAP.h; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP.w, y); ctx.stroke(); }
  roundedRect(20, 20, MAP.w - 40, MAP.h - 40, 12, null, "#b89970", 22);
  roundedRect(535, 36, 730, 176, 7, "#8a6446", "#684c37", 8);
  roundedRect(551, 52, 698, 143, 4, "#306d66", "#d4c6a2", 5);
  ctx.fillStyle = "#e1edcf"; ctx.textAlign = "center"; ctx.font = "900 44px 'Noto Sans TC',sans-serif"; ctx.fillText("撐到下課！", 900, 142);
  roundedRect(800, 250, 200, 78, 8, "#b98553", "#7f5b3e", 4);
  roundedRect(810, 321, 180, 16, 5, "#8a6345");
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) drawDesk(290 + col * 300, 415 + row * 230);
  for (let y = 275; y < 970; y += 230) {
    roundedRect(31, y, 34, 130, 2, "#b6dce1", "#8aacae", 5);
    ctx.strokeStyle = "#8aacae"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(48, y); ctx.lineTo(48, y + 130); ctx.moveTo(31, y + 65); ctx.lineTo(65, y + 65); ctx.stroke();
  }
  roundedRect(MAP.w - 73, 423, 45, 145, 4, "#a57850", "#775339", 5);
  ctx.fillStyle = "#ebd59d"; ctx.beginPath(); ctx.arc(MAP.w - 59, 501, 5, 0, 7); ctx.fill();
  ctx.textAlign = "left";
}
function drawEnemy(enemy, time) {
  const size = 1;
  const x = enemy.x, y = enemy.y + Math.sin(time * 5 + enemy.wobble) * 2;
  const main = enemy.hitFlash ? "#fff6e5" : enemy.windup > 0 ? "#e69b76" : enemy.lungeTime > 0 ? "#db7868" : enemy.kind === "practice" ? "#7aabb4" : "#829b93";
  const edge = "#4c6a68";
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.fillStyle = "#34505a44"; ctx.beginPath(); ctx.ellipse(0, 22, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
  roundedRect(-15, 1, 30, 25, 2, main, edge, 3);
  roundedRect(-23, 4, 8, 20, 1, main, edge, 2); roundedRect(15, 4, 8, 20, 1, main, edge, 2);
  roundedRect(-12, 23, 9, 9, 1, "#425c62"); roundedRect(3, 23, 9, 9, 1, "#425c62");
  roundedRect(-17, -26, 34, 29, 2, main, edge, 3);
  ctx.fillStyle = "#253d46"; ctx.fillRect(-9, -13, 4, 5); ctx.fillRect(6, -13, 4, 5);
  ctx.strokeStyle = "#253d46"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(4, -5); ctx.stroke();
  ctx.restore();
  if (enemy.windup > 0) {
    ctx.strokeStyle = `rgba(221,99,78,${.4 + Math.sin(time * 35) * .25})`;
    ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 29, 0, 7); ctx.stroke();
  }
  if (enemy.hp < enemy.maxHp) {
    const barW = 40;
    roundedRect(x - barW / 2, y - enemy.r - 25, barW, 6, 3, "#284246");
    roundedRect(x - barW / 2, y - enemy.r - 25, barW * Math.max(0, enemy.hp / enemy.maxHp), 6, 3, "#f0a184");
  }
}
function drawPlayer(time) {
  const x = player.x, y = player.y + (player.moving ? Math.sin(time * 17) * 2 : Math.sin(time * 3) * 1.5);
  ctx.save(); ctx.translate(x, y);
  if (player.invulnerable > 0 && Math.floor(time * 16) % 2) ctx.globalAlpha = .5;
  ctx.fillStyle = "#334f5744"; ctx.beginPath(); ctx.ellipse(0, 25, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
  roundedRect(-20, -2, 40, 30, 10, "#527a9d", "#284c69", 3);
  roundedRect(-26, 3, 9, 20, 3, "#f5c7a5", "#bc917e", 2); roundedRect(17, 3, 9, 20, 3, "#f5c7a5", "#bc917e", 2);
  roundedRect(-14, 23, 11, 10, 3, "#3e4f70"); roundedRect(3, 23, 11, 10, 3, "#3e4f70");
  ctx.fillStyle = "#eec39e"; ctx.beginPath(); ctx.arc(0, -15, 18, 0, 7); ctx.fill();
  ctx.fillStyle = "#394258"; ctx.beginPath(); ctx.arc(0, -22, 18, Math.PI, Math.PI * 2); ctx.lineTo(18, -16); ctx.lineTo(8, -26); ctx.lineTo(-18, -13); ctx.fill();
  ctx.fillStyle = "#283c4a"; ctx.fillRect(-8, -13, 3, 4); ctx.fillRect(5, -13, 3, 4);
  ctx.fillStyle = "#f1d072"; ctx.fillRect(-18, 4, 36, 4);
  ctx.save(); ctx.rotate(player.facing); roundedRect(19, -3, 25, 5, 2, "#e6b95e", "#a46f3e", 1); ctx.fillStyle = "#3d4953"; ctx.beginPath(); ctx.moveTo(44, -3); ctx.lineTo(51, -.5); ctx.lineTo(44, 2); ctx.fill(); ctx.restore();
  ctx.restore();
  if (player.swingTime > 0) {
    const alpha = player.swingTime / .22;
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.swingAngle);
    ctx.strokeStyle = `rgba(255,244,196,${alpha})`; ctx.lineWidth = 13 * alpha + 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, 66, -.9, .9); ctx.stroke(); ctx.restore();
  }
}
function drawPickup(pickup, time) {
  const y = pickup.y + Math.sin(time * 5 + pickup.x) * 4;
  if (pickup.type === "weapon") {
    ctx.fillStyle = "#fff3d1aa"; ctx.beginPath(); ctx.arc(pickup.x, y, 28, 0, 7); ctx.fill();
    ctx.strokeStyle = "#fff6d9"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pickup.x, y, 23, 0, 7); ctx.stroke();
    const weapon = CONTENT.weapons.find(w => w.id === pickup.weaponId);
    ctx.fillStyle = "#17384c"; ctx.textAlign = "center"; ctx.font = "900 22px sans-serif"; ctx.fillText(weapon.icon, pickup.x, y + 8);
    ctx.font = "900 13px 'Noto Sans TC',sans-serif"; ctx.fillText(weapon.name, pickup.x, y - 34);
    ctx.textAlign = "left";
    return;
  }
  ctx.save(); ctx.translate(pickup.x, y); ctx.rotate(Math.PI / 4);
  roundedRect(-7, -7, 14, 14, 2, "#83e1d0", "#e8fff1", 2);
  ctx.restore();
}
function drawProjectile(p) {
  if (p.type === "blueberry") {
    ctx.fillStyle = "#566fc4"; ctx.strokeStyle = "#d1ddff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#9db1ed"; ctx.beginPath(); ctx.arc(p.x - 3, p.y - 3, 2, 0, 7); ctx.fill();
  } else if (p.type === "pistol") {
    ctx.strokeStyle = "#fff0ab"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x - p.vx * .017, p.y - p.vy * .017); ctx.lineTo(p.x, p.y); ctx.stroke();
  } else {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); roundedRect(-9, -9, 18, 18, 3, "#ef8871", "#fff0a5", 2); ctx.restore();
  }
}
function drawEffect(effect) {
  const t = effect.age / effect.duration;
  if (effect.type === "number") {
    ctx.globalAlpha = 1 - t; ctx.fillStyle = effect.color; ctx.font = "900 20px Nunito,sans-serif"; ctx.textAlign = "center"; ctx.fillText(effect.text, effect.x, effect.y - t * 25); ctx.globalAlpha = 1;
  } else if (effect.type === "explosion") {
    ctx.fillStyle = `rgba(255,209,116,${(1 - t) * .32})`; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (0.4 + t * .65), 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(255,242,189,${1 - t})`; ctx.lineWidth = 8 * (1 - t); ctx.stroke();
  } else {
    ctx.strokeStyle = effect.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(effect.x, effect.y, 10 + t * 25, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
function render(timestamp) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const viewW = cw / scale, viewH = ch / scale;
  camera.x = clamp(player.x - viewW / 2, 0, Math.max(0, MAP.w - viewW));
  camera.y = clamp(player.y - viewH / 2, 0, Math.max(0, MAP.h - viewH));
  ctx.save(); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
  drawClassroom();
  for (const pickup of pickups) drawPickup(pickup, timestamp);
  for (const enemy of enemies) drawEnemy(enemy, timestamp);
  drawPlayer(timestamp);
  for (const projectile of projectiles) drawProjectile(projectile);
  for (const effect of effects) drawEffect(effect);
  ctx.restore();
  const shade = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * .2, cw / 2, ch / 2, Math.max(cw, ch) * .7);
  shade.addColorStop(0, "#172b3c00"); shade.addColorStop(1, "#172b3c59");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, cw, ch);
}
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000 || 0, .035);
  lastFrame = now;
  update(dt);
  render(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function togglePause() {
  if (mode === "playing" || mode === "tutorial") {
    pauseReturnMode = mode;
    mode = "paused";
    showScreen("pause-screen");
  } else if (mode === "paused") {
    mode = pauseReturnMode;
    showScreen(null);
  }
}
$("start-btn").addEventListener("click", startStory);
$("story-next").addEventListener("click", nextStory);
$("story-skip").addEventListener("click", startTutorial);
$("skip-tutorial").addEventListener("click", startGame);
$("tutorial-done-btn").addEventListener("click", startGame);
$("pause-btn").addEventListener("click", togglePause);
$("resume-btn").addEventListener("click", togglePause);
$("pause-restart-btn").addEventListener("click", startGame);
$("restart-btn").addEventListener("click", startGame);
$("sound-btn").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("sound-btn").classList.toggle("muted", !soundEnabled);
  $("sound-btn").setAttribute("aria-label", soundEnabled ? "關閉音效" : "開啟音效");
  if (soundEnabled) playSound(650, .1);
});
$("sound-btn").classList.add("muted");
document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === "p" || key === "escape") togglePause();
  if (mode === "story" && key === "enter") nextStory();
  if (mode === "upgrade" && ["1", "2", "3"].includes(key)) chooseUpgrade(CONTENT.weapons[Number(key) - 1].id);
});
document.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); if (mode === "playing" || mode === "tutorial") togglePause(); });

const joystick = $("joystick");
function moveStick(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx, dy = event.clientY - cy;
  const length = Math.hypot(dx, dy) || 1;
  const strength = Math.min(length / 42, 1);
  pointer.x = dx / length * strength;
  pointer.y = dy / length * strength;
  $("stick").style.transform = `translate(${pointer.x * 39}px,${pointer.y * 39}px)`;
}
joystick.addEventListener("pointerdown", event => {
  pointer.active = true; pointer.id = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveStick(event);
});
joystick.addEventListener("pointermove", event => { if (pointer.active && event.pointerId === pointer.id) moveStick(event); });
function releaseStick(event) {
  if (event.pointerId !== pointer.id) return;
  pointer.active = false; pointer.id = null; pointer.x = pointer.y = 0;
  $("stick").style.transform = "translate(0,0)";
}
joystick.addEventListener("pointerup", releaseStick);
joystick.addEventListener("pointercancel", releaseStick);
