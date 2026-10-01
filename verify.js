// Run with `node verify.js` to smoke-test the menu, tutorial, upgrade, and summon rules.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const source = fs.readFileSync("game.js", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const referenced = [...source.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
for (const id of referenced) assert(ids.includes(id), `Missing HTML element: ${id}`);

function element() {
  return {
    style: {}, children: [], listeners: {}, textContent: "", innerHTML: "", hidden: false,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 116, height: 116 }; },
    setPointerCapture() {},
    getContext() { return drawing; }
  };
}
const elements = Object.fromEntries(ids.map(id => [id, element()]));
const drawing = new Proxy({}, { get(_target, key) {
  if (key === "createRadialGradient") return () => ({ addColorStop() {} });
  return () => {};
} });
elements.game.getContext = () => drawing;
const document = { getElementById: id => elements[id], createElement: element, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
const math = Object.create(Math);
math.random = () => .999;
const context = vm.createContext({ document, window, Math: math, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {}, console });
vm.runInContext(source, context, { filename: "game.js" });

function evalGame(expression) { return vm.runInContext(expression, context); }
function click(id) { assert(elements[id].listeners.click, `${id} has no click listener`); elements[id].listeners.click(); }
click("start-btn");
assert.equal(evalGame("mode"), "story");
click("story-next"); click("story-next"); click("story-next");
assert.equal(evalGame("mode"), "tutorial");
evalGame("tutorialDistance = 106; tutorialAdvance()");
assert.equal(evalGame("tutorialStep"), 1);
evalGame("damageEnemy(enemies[0], 99, 'pencil')");
assert.equal(evalGame("tutorialStep"), 2);
evalGame("player.x = pickups[0].x; player.y = pickups[0].y; updatePickups(.02)");
assert.equal(evalGame("mode"), "tutorial-done");
click("tutorial-done-btn");
assert.equal(evalGame("mode"), "playing");
evalGame("player.xpNeed = 1; gainExperience(1)");
assert.equal(evalGame("mode"), "upgrade");
assert.equal(elements["upgrade-options"].children.length, 3);
elements["upgrade-options"].children[0].listeners.click();
assert.equal(evalGame("mode"), "playing");
assert.equal(evalGame("pickups[0].type"), "weapon");
evalGame("player.x = pickups[0].x; player.y = pickups[0].y; updatePickups(.02)");
assert.equal(evalGame("player.weapons.blueberry"), 1);
math.random = () => 0;
evalGame("startGame(); enemies = [makeEnemy(player.x + 80, player.y)]; enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 1, "A missed lunge never summons enemies");
evalGame("enemies[0].x = player.x; enemies[0].y = player.y; enemies[0].lungeTime = .2; player.invulnerable = .5; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 1, "Invulnerability prevents damage and summoning");
assert.equal(evalGame("player.hp"), 100);
evalGame("player.invulnerable = 0; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 101, "A damaging hit can summon exactly 100 enemies");
assert.equal(evalGame("player.hp"), 89);
evalGame("player.invulnerable = 0; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 101, "One lunge cannot trigger a second hit or summon");
assert.equal(evalGame("player.hp"), 89);
math.random = () => .01;
evalGame("startGame(); enemies = [makeEnemy(player.x, player.y)]; enemies[0].lungeTime = .2; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 1, "The summon chance is strictly below 1%");
assert.equal(evalGame("player.hp"), 89);
math.random = () => 0;
evalGame("enemies = [makeEnemy(player.x + 80, player.y)]; player.weapons.firecracker = 1; shootAt(enemies[0], 'firecracker', 320, 45); projectiles[0].x = enemies[0].x; projectiles[0].y = enemies[0].y; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 0);
assert.equal(evalGame("effects.some(effect => effect.type === 'explosion')"), true);
evalGame("startGame(); spawnClock = 100; player.hp = 80; for (let i = 0; i < 50; i++) update(.02)");
assert(Math.abs(evalGame("player.hp") - 82) < 1e-8, "Recover 2 HP over one second");
evalGame("player.hp = 99.99; update(.02)");
assert.equal(evalGame("player.hp"), 100, "Healing respects maximum HP");
for (const state of ["paused", "upgrade", "ended"]) {
  evalGame(`player.hp = 80; mode = '${state}'; update(1)`);
  assert.equal(evalGame("player.hp"), 80, `No healing while ${state}`);
}
evalGame("startGame(); spawnClock = 100; player.hp = 1; enemies = [makeEnemy(player.x, player.y)]; enemies[0].lungeTime = .2; update(.02); update(.02)");
assert.equal(evalGame("player.hp"), 0, "Healing cannot revive a defeated player");
assert.equal(evalGame("mode"), "ended");
evalGame("startGame()");
math.random = () => .999;
const toolIds = ["blueberry", "pistol", "firecracker", "bow", "eraser", "ruler"];
for (const id of toolIds) {
  for (let level = 1; level <= 5; level++) {
    evalGame(`gainExperience(player.xpNeed); chooseUpgrade('${id}')`);
    assert.equal(evalGame("mode"), "playing");
    assert.equal(evalGame("pickups[pickups.length - 1].level"), level);
    evalGame("player.x = pickups[pickups.length - 1].x; player.y = pickups[pickups.length - 1].y; updatePickups(.02)");
    assert.equal(evalGame(`player.weapons.${id}`), level);
  }
  evalGame(`mode = 'upgrade'; chooseUpgrade('${id}')`);
  assert.equal(evalGame("mode"), "upgrade", "Keyboard selection cannot upgrade a maxed tool");
  assert.equal(evalGame("pickups.length"), 0);
  evalGame("mode = 'playing'");
}
evalGame("gainExperience(player.xpNeed)");
assert.equal(evalGame("mode"), "playing", "All maxed tools never trap the player in upgrade selection");
evalGame("startGame(); player.weapons.blueberry = 4; gainExperience(player.xpNeed); chooseUpgrade('blueberry'); gainExperience(player.xpNeed)");
assert.equal(evalGame("upgradeChoices.some(w => w.id === 'blueberry')"), false, "Pending level-5 pickup reserves the cap and is excluded from choices");
evalGame("chooseUpgrade('blueberry')");
assert.equal(evalGame("pickups.length"), 1);
evalGame("startGame(); gainExperience(player.xpNeed); chooseUpgrade('blueberry'); gainExperience(player.xpNeed); chooseUpgrade('blueberry'); player.x = pickups[1].x; player.y = pickups[1].y; pickups[0].x = 100; pickups[0].y = 100; updatePickups(.02)");
assert.equal(evalGame("player.weapons.blueberry"), 2, "Higher-tier pickup equips its displayed level");
evalGame("player.x = pickups[0].x; player.y = pickups[0].y; updatePickups(.02)");
assert.equal(evalGame("player.weapons.blueberry"), 2, "An older pickup cannot downgrade a tool");
for (const id of toolIds) {
  for (let level = 1; level <= 5; level++) {
    evalGame(`drawTool(ctx, '${id}', ${level}, 0, 0); player.weapons.${id} = ${level}`);
  }
}
evalGame("drawPlayer(1); drawPickup({type:'weapon',weaponId:'pistol',level:5,x:0,y:0},1); renderUpgrades()");
math.random = () => .37;
evalGame("startGame(); gainExperience(player.xpNeed)");
assert.equal(evalGame("upgradeChoices.length"), 3);
assert.equal(evalGame("new Set(upgradeChoices.map(w => w.id)).size"), 3, "Three distinct tools are drawn from the pool of six");
const keyboardChoice = evalGame("upgradeChoices[2].id");
document.listeners.keydown({ key: "3", preventDefault() {} });
assert.equal(evalGame("pickups[0].weaponId"), keyboardChoice, "Number keys follow the displayed choices");
evalGame("startGame(); for (const w of CONTENT.weapons) player.weapons[w.id] = 5; player.weapons.ruler = 4; gainExperience(player.xpNeed)");
assert.equal(elements["upgrade-options"].children.filter(b => !b.disabled).length, 1, "With one eligible tool, maxed cards are disabled");
evalGame("startGame(); enemies = [makeEnemy(player.x + 80, player.y), makeEnemy(player.x + 150, player.y), makeEnemy(player.x + 230, player.y)]; player.weapons.bow = 5; shootAt(enemies[0], 'bow', 670, 10); projectiles[0].x = enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 1, "Arrow passes through the first enemy even at level 5");
assert.equal(evalGame("enemies[0].hp"), 27);
evalGame("updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 27, "Arrow never hits the same enemy twice");
evalGame("projectiles[0].x = enemies[1].x; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 0, "Arrow stops after the second enemy");
assert.equal(evalGame("enemies[1].hp"), 27);
assert.equal(evalGame("enemies[2].hp"), 37);
evalGame("startGame(); enemies = [makeEnemy(player.x + 100, player.y)]; player.weapons.eraser = 1; shootAt(enemies[0], 'eraser', 510, 10); projectiles[0].x = enemies[0].x; updateProjectiles(.001); updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 27, "Eraser hits once on the outward pass");
evalGame("projectiles[0].age = .55; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 17, "Eraser can hit the same enemy on its return");
evalGame("projectiles[0].x = player.x; projectiles[0].y = player.y; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 0, "Returning eraser is removed at the player");
evalGame("startGame(); player.weapons.ruler = 1; player.pencilCooldown = 1; const rulerPoint = rulerPosition(); enemies = [makeEnemy(rulerPoint.x,rulerPoint.y)]; weaponAttacks(.001)");
assert.equal(evalGame("enemies[0].hp"), 20, "Orbiting ruler deals contact damage");
evalGame("weaponAttacks(.001)");
assert.equal(evalGame("enemies[0].hp"), 20, "Ruler cannot damage every frame");
evalGame("drawPlayer(1); render(1)");
evalGame("startGame(); for (const w of CONTENT.weapons) player.weapons[w.id] = 1; CONTENT.weapons.push({id:'extra',name:'extra',icon:'?',description:'test'}); TOOL_APPEARANCES.extra = ['1','2','3','4','5']; player.weapons.extra = 0; gainExperience(player.xpNeed)");
assert.equal(evalGame("reservedToolSlots()"), 6);
assert.equal(evalGame("canUpgradeTool('extra')"), false, "A seventh tool cannot be equipped");
assert.equal(evalGame("upgradeChoices.some(w => w.id === 'extra')"), false);
evalGame("chooseUpgrade('extra')");
assert.equal(evalGame("pickups.length"), 0);
evalGame("CONTENT.weapons.pop(); delete TOOL_APPEARANCES.extra; startGame(); player.weapons = Object.fromEntries(CONTENT.weapons.map(w => [w.id,1])); player.weapons.ruler = 0; pickups = [{type:'weapon',weaponId:'ruler',level:1,collected:false}]");
assert.equal(evalGame("reservedToolSlots()"), 6, "Pending pickups also reserve an equipment slot");
evalGame("startGame(); gameTime = 29.98; spawnClock = 100; update(.02)");
assert.equal(evalGame("currentLesson()"), 2);
assert.equal(elements["lesson-label"].textContent, "第 2 / 30 節");
assert.equal(elements.timer.textContent, "00:30");
assert.equal(evalGame("GAME_LENGTH"), 900);
evalGame("startGame(); update(.01)");
assert.equal(evalGame("enemies.length"), 2, "First lesson starts with two enemies per batch");
const earlySpawns = evalGame("spawnSettings()");
evalGame("gameTime = 29 * LESSON_LENGTH");
const lateSpawns = evalGame("spawnSettings()");
assert(lateSpawns.count > earlySpawns.count && lateSpawns.interval < earlySpawns.interval && lateSpawns.cap > earlySpawns.cap);
evalGame("startGame(); gameTime = 9 * LESSON_LENGTH - .02; spawnClock = 100; update(.02)");
assert.equal(evalGame("enemies.filter(e => e.kind === 'mini1').length"), 1, "First mini boss appears in lesson ten");
evalGame("update(.02)");
assert.equal(evalGame("enemies.filter(e => e.kind === 'mini1').length"), 1, "Boss cannot spawn twice");
evalGame("damageEnemy(enemies.find(e => e.kind === 'mini1'), 99999, 'pistol'); gameTime = 19 * LESSON_LENGTH - .02; update(.02)");
assert.equal(evalGame("enemies.filter(e => e.kind === 'mini2').length"), 2, "Both cyclists appear in lesson twenty");
evalGame("damageEnemy(enemies.find(e => e.kind === 'mini2' && e.hp > 0),99999,'pistol')");
assert.equal(evalGame("defeatedBosses.has('mini2')"), false, "Defeating one cyclist does not finish the encounter");
evalGame("damageEnemy(enemies.find(e => e.kind === 'mini2' && e.hp > 0), 99999, 'pistol'); gameTime = 29 * LESSON_LENGTH - .02; update(.02)");
assert.equal(evalGame("enemies.filter(e => e.kind === 'final').length"), 1, "Final boss appears in lesson thirty");
assert.equal(elements["boss-name"].textContent, "最終 Boss");
evalGame("gameTime = GAME_LENGTH - .02; spawnClock = 100; update(.02)");
assert.equal(evalGame("mode"), "playing", "The bell cannot end the game while a boss survives");
evalGame("damageEnemy(enemies.find(e => e.kind === 'final'),99999,'pistol'); update(.02)");
assert.equal(evalGame("defeatedBosses.size"), 3);
assert.equal(evalGame("mode"), "ended", "Victory requires all thirty lessons and all three bosses");
assert.equal(elements["end-title"].textContent, "放學了！");
evalGame("startGame(); enemies = [makeEnemy(player.x + 250,player.y,'mini1')]; enemies[0].windup = .01; enemies[0].throwAngle = Math.PI; updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles.length"), 3, "Collector throws a spread of bottle caps");
assert.equal(evalGame("enemies[0].lungeTime"), 0, "Collector uses ranged attacks");
evalGame("enemyProjectiles[0].x = player.x; enemyProjectiles[0].y = player.y; enemyProjectiles[0].vx = 0; enemyProjectiles[0].vy = 0; updateEnemyProjectiles(.02)");
assert.equal(evalGame("player.hp"), 84, "Bottle cap collision damages the player");
evalGame("startGame(); enemies = [makeEnemy(player.x + 300,player.y,'mini2'),makeEnemy(player.x - 300,player.y,'mini2')]; enemies[0].memberIndex = 0; enemies[1].memberIndex = 1; enemies[0].attackClock = 0; enemies[1].windup = .01; enemies[1].throwAngle = 0; updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles[0].type"), "tire", "Second cyclist throws tires");
assert.equal(evalGame("enemies[0].windup"), .7, "First cyclist warns before charging");
evalGame("enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("enemies[0].lungeTime"), .52);
evalGame("for (const e of enemies) drawEnemy(e,1); for (const p of enemyProjectiles) drawEnemyProjectile(p)");
console.log("PASS: six equipment slots, six tools, five levels, projectiles, 30 lessons, three bosses, and existing game rules");
