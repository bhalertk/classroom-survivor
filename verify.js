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
  if(key in _target) return _target[key];
  if (key === "createRadialGradient") return () => ({ addColorStop() {} });
  return () => {};
} });
elements.game.getContext = () => drawing;
const document = { getElementById: id => elements[id], createElement: element, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, listeners:{}, addEventListener(name,callback) {this.listeners[name]=callback;} };
const math = Object.create(Math);
math.random = () => .999;
const context = vm.createContext({ document, window, Math: math, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {}, console });
vm.runInContext(source, context, { filename: "game.js" });

function evalGame(expression) { return vm.runInContext(expression, context); }
function click(id) { assert(elements[id].listeners.click, `${id} has no click listener`); elements[id].listeners.click(); }
click("start-btn");
assert.equal(evalGame("mode"), "story");
assert.equal(elements['story-progress'].textContent,'01 / 06');
for(let page=0;page<evalGame('STORY.length');page++)click('story-next');
assert.equal(evalGame("mode"), "tutorial");
evalGame("tutorialDistance = 106; tutorialAdvance()");
assert.equal(evalGame("tutorialStep"), 1);
evalGame("damageEnemy(enemies[0], 99, 'pencil')");
assert.equal(evalGame("tutorialStep"), 2);
evalGame("player.x = pickups[0].x; player.y = pickups[0].y; updatePickups(.02)");
assert.equal(evalGame("mode"), "tutorial-upgrade", "Tutorial experience opens a real three-choice upgrade screen");
assert.equal(evalGame("player.level"),2);
assert.equal(elements["upgrade-options"].children.length,3);
assert.equal(elements["tutorial-next"].hidden,true,"Practical lessons cannot be skipped with the next button");
click("tutorial-next");assert.equal(evalGame("tutorialStep"),3);
function tutorialCollect() {
  evalGame("player.x=pickups[0].x;player.y=pickups[0].y;updatePickups(.02)");
}
function runUntilTutorialStep(step,limit=500) {
  for(let i=0;i<limit&&evalGame("tutorialStep")<step;i++)evalGame("update(.02)");
  assert.equal(evalGame("tutorialStep"),step,`Tutorial reaches step ${step}`);
}
elements["upgrade-options"].children[0].listeners.click();
assert.equal(evalGame("tutorialStep"),4);
assert.equal(evalGame("player.weapons.blueberry"),0,"Selected tutorial tool must still be picked up");
tutorialCollect();assert.equal(evalGame("tutorialStep"),5);
assert.equal(evalGame("player.weapons.blueberry"),1);
evalGame("damageEnemy(enemies[0],999,'pencil')");
assert.equal(evalGame("tutorialStep"),5,"Tool lesson cannot be completed using the pencil");
runUntilTutorialStep(6);
for(let level=2;level<=5;level++) {
  tutorialCollect();
  assert.equal(evalGame("mode"),'tutorial-upgrade');
  const frozenHp=evalGame("player.hp");evalGame("update(1)");assert.equal(evalGame("player.hp"),frozenHp);
  assert.equal(elements['upgrade-options'].children.filter(b=>!b.disabled).length,1,"Guided lesson highlights only the matching tool upgrade");
  document.listeners.keydown({key:'2'});
  assert.equal(evalGame("mode"),'tutorial-upgrade',"Other guided choices cannot divert the tutorial");
  document.listeners.keydown({key:'1'});
  assert.equal(evalGame("player.weapons.blueberry"),level-1);
  tutorialCollect();assert.equal(evalGame("player.weapons.blueberry"),level);
}
assert.equal(evalGame("tutorialStep"),7);
assert.equal(evalGame("mode"),'tutorial-upgrade');
assert.equal(evalGame("upgradeChoices[0].id"),'harvest');
document.listeners.keydown({key:'1'});
assert.equal(evalGame("tutorialStep"),8);
assert.equal(evalGame("isEvolved('blueberry')"),false);
tutorialCollect();assert.equal(evalGame("tutorialStep"),9);
assert.equal(evalGame("isEvolved('blueberry')"),true);
assert.equal(evalGame("effects.some(e=>e.type==='evolution')"),true);
runUntilTutorialStep(10);
math.random=()=>0;
evalGame("damagePlayer(999)");
assert.equal(evalGame("player.hp"),30,"Tutorial protection prevents defeat during practice");
assert.equal(evalGame("mode"),'tutorial');
evalGame("enemies[0].attackClock=0;updateEnemies(.01);keys.add('w')");
runUntilTutorialStep(11,200);evalGame("keys.clear()");
assert.equal(evalGame("enemies.length"),2,"Ranged lesson introduces both water and rubber enemies");
for(let i=0;i<600&&evalGame('tutorialStep')===11;i++) {
  evalGame(`keys.clear();keys.add('${Math.floor(i/20)%2?'s':'w'}');update(.02)`);
}
evalGame('keys.clear()');assert.equal(evalGame('tutorialStep'),12,"Actual movement and missed projectiles complete ranged evasion");
evalGame("player.x=effects.find(e=>e.type==='wet-tissue').x;player.y=effects.find(e=>e.type==='wet-tissue').y;update(.02)");
assert.equal(evalGame('tutorialWetHit'),true);
assert.equal(evalGame('player.slowTime'),3);
runUntilTutorialStep(13,200);
assert.equal(evalGame('player.hp'),85);
runUntilTutorialStep(14,300);
assert.equal(elements['speed-btn'].disabled,false,"Speed lesson enables the real speed button");
click('pause-btn');assert.equal(evalGame('mode'),'paused');
const pausedTutorialStep=evalGame('tutorialStep');evalGame('advanceSimulation(.1)');assert.equal(evalGame('tutorialStep'),pausedTutorialStep);
click('resume-btn');assert.equal(evalGame('tutorialControls.resumed'),true);
click('speed-btn');assert.equal(evalGame('tutorialStep'),14);
assert.equal(evalGame('gameSpeed'),2);
evalGame("player.x=900;keys.add('d');for(let i=0;i<12&&tutorialStep===14;i++)advanceSimulation(.1);keys.clear()");
assert.equal(evalGame('tutorialStep'),15,"Player actually practices moving at double speed before finishing");
assert.equal(evalGame('gameSpeed'),1,"End of speed lesson restores normal speed");
assert.equal(elements['tutorial-detail'].hidden,false);
assert.equal(evalGame('gameTime'),0,"Tutorial never consumes the thirty-lesson game clock");
click('tutorial-next');
assert.equal(evalGame("mode"), "tutorial-done");
click("tutorial-done-btn");
assert.equal(evalGame("mode"), "playing");
assert.equal(evalGame('Object.values(player.weapons).every(level=>level===0)'),true,"Real game starts with a clean loadout");
assert.equal(evalGame('Object.values(player.talents).every(value=>!value)'),true);
math.random=()=>.999;
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
assert.equal(evalGame("player.hp"), evalGame("player.maxHp"));
evalGame("player.invulnerable = 0; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 101, "A damaging hit can summon exactly 100 enemies");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-11"));
evalGame("player.invulnerable = 0; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 101, "One lunge cannot trigger a second hit or summon");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-11"));
math.random = () => .01;
evalGame("startGame(); enemies = [makeEnemy(player.x, player.y)]; enemies[0].lungeTime = .2; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 1, "The summon chance is strictly below 1%");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-11"));
math.random = () => 0;
evalGame("enemies = [makeEnemy(player.x + 80, player.y)]; player.weapons.firecracker = 1; shootAt(enemies[0], 'firecracker', 320, 45); projectiles[0].x = enemies[0].x; projectiles[0].y = enemies[0].y; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 0);
assert.equal(evalGame("effects.some(effect => effect.type === 'explosion')"), true);
evalGame("startGame(); spawnClock = 100; player.hp = 80; for (let i = 0; i < 50; i++) update(.02)");
assert(Math.abs(evalGame("player.hp") - 82) < 1e-8, "Recover 2 HP over one second");
evalGame("player.hp = player.maxHp-.01; update(.02)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp"), "Healing respects maximum HP");
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
assert.equal(evalGame("mode"), "upgrade", "Maxed tools still allow acquiring talents");
assert.equal(evalGame("upgradeChoices.every(c => c.kind === 'talent')"), true);
evalGame("for (const t of CONTENT.talents.slice(0,6)) player.talents[t.id] = true; mode = 'playing'; gainExperience(player.xpNeed)");
assert.equal(evalGame("mode"), "playing", "All maxed tools and all equipped talents never trap the player in upgrade selection");
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
assert.equal(evalGame("pickups[0].weaponId || pickups[0].talentId"), keyboardChoice, "Number keys follow the displayed choices");
evalGame("startGame(); for (const t of CONTENT.talents.slice(0,6)) player.talents[t.id] = true; for (const w of CONTENT.weapons.slice(0,6)) player.weapons[w.id] = 5; player.weapons.ruler = 4; gainExperience(player.xpNeed)");
assert.equal(elements["upgrade-options"].children.filter(b => !b.disabled).length, 1, "With one eligible tool, maxed cards are disabled");
evalGame("startGame(); enemies = [makeEnemy(player.x + 80, player.y), makeEnemy(player.x + 150, player.y), makeEnemy(player.x + 230, player.y)]; player.weapons.bow = 5; shootAt(enemies[0], 'bow', 670, 10); projectiles[0].x = enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 1, "Arrow passes through the first enemy even at level 5");
assert.equal(evalGame("enemies[0].hp"), 27);
evalGame("updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 27, "Arrow never hits the same enemy twice");
evalGame("projectiles[0].x = enemies[1].x; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 0, "Arrow stops after the second enemy");
assert.equal(evalGame("enemies[1].hp"), 22, "Gold arrows deal 50% more damage to their second target");
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

// Exercise each tool's distinct upgrade mechanics through the actual attack loop.
for (const [id, count] of Object.entries({blueberry: 3, pistol: 1, firecracker: 1, bow: 3, eraser: 3})) {
  evalGame(`startGame(); player.pencilCooldown = 1; player.weapons.${id} = 5; enemies = [makeEnemy(player.x + 200, player.y)]; weaponAttacks(.001)`);
  assert.equal(evalGame("projectiles.length"), count, `${id} has its own level-5 volley`);
  assert.equal(evalGame(`player.${id}Cooldown`), evalGame(`toolStats('${id}', 5).cooldown`));
}
evalGame("startGame(); player.weapons.pistol = 1; enemies = [makeEnemy(player.x + 610, player.y)]; weaponAttacks(.001)");
assert.equal(evalGame("projectiles.length"), 0, "Basic pistol cannot reach a distant enemy");
evalGame("player.weapons.pistol = 2; weaponAttacks(.001)");
assert.equal(evalGame("projectiles.length"), 1, "Long barrel upgrade extends targeting range while keeping single shots");

evalGame("startGame(); player.weapons.blueberry = 3; enemies = [makeEnemy(player.x + 200,player.y),makeEnemy(player.x + 225,player.y + 20)]; shootAt(enemies[0],'blueberry',450,10); projectiles[0].x = enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 27);
assert.equal(evalGame("enemies[1].hp"), 31, "Watermelon impact damages nearby enemies with its shockwave");
assert(evalGame("enemies[0].x > player.x + 250"), "Fruit knocks its direct target forward");
assert(evalGame("enemies[1].x > player.x + 225"), "The splash also pushes nearby enemies");
assert.equal(evalGame("effects.some(e => e.type === 'fruit-impact')"), true);

evalGame("startGame(); player.weapons.firecracker = 5; enemies = [makeEnemy(player.x + 200,player.y)]; enemies[0].hp = 1000; shootAt(enemies[0],'firecracker',440,135); projectiles[0].x = enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 865, "Nuclear impact deals immediate explosion damage");
evalGame("updateEffects(.44)");
assert.equal(evalGame("enemies[0].hp"), 865, "Gold shockwave waits before dealing damage");
evalGame("mode = 'paused'; update(1)");
assert.equal(evalGame("enemies[0].hp"), 865, "Pause freezes the pending shockwave");
evalGame("mode = 'playing'; updateEffects(.02)");
assert.equal(evalGame("enemies[0].hp"), 815, "Gold nuclear upgrade adds a delayed shockwave");
evalGame("updateEffects(1)");
assert.equal(evalGame("enemies[0].hp"), 815, "Delayed shockwave damages only once");

evalGame("startGame(); player.weapons.eraser = 3; enemies = [makeEnemy(player.x + 100,player.y)]; shootAt(enemies[0],'eraser',550,10); projectiles[0].x = enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 27);
evalGame("projectiles[0].age = .7; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 12, "Reinforced eraser deals 50% more damage on return");

evalGame("startGame(); player.weapons.ruler = 3; player.pencilCooldown = 1; enemies = rulerPositions().map(p => makeEnemy(p.x,p.y)); weaponAttacks(.001)");
assert.equal(evalGame("enemies.length"), 2);
assert.equal(evalGame("enemies.every(e => e.hp === 12)"), true, "Two rulers cover opposite sides of the player");
evalGame("player.weapons.ruler = 5");
assert.equal(evalGame("rulerPositions().length"), 3, "Gold ruler forms a three-sided defense");

math.random = () => .999;
evalGame("startGame(); for (const w of CONTENT.weapons.slice(0,6)) player.weapons[w.id] = 5; player.weapons.firecracker = 4; renderUpgrades()");
const goldCard = elements["upgrade-options"].children[0];
assert.equal(goldCard.children.find(e => e.className === "upgrade-effect").textContent, "金色核彈：爆炸後追加一次衝擊波");
assert.equal(goldCard.children.find(e => e.className === "tool-role firecracker").textContent, "爆炸清場");
evalGame("startGame(); for (const w of CONTENT.weapons.slice(0,6)) player.weapons[w.id] = 1; CONTENT.weapons.push({id:'extra',name:'extra',icon:'?',description:'test'}); TOOL_APPEARANCES.extra = ['1','2','3','4','5']; player.weapons.extra = 0; gainExperience(player.xpNeed)");
assert.equal(evalGame("reservedToolSlots()"), 6);
assert.equal(evalGame("canUpgradeTool('extra')"), false, "A seventh tool cannot be equipped");
assert.equal(evalGame("upgradeChoices.some(w => w.id === 'extra')"), false);
evalGame("chooseUpgrade('extra')");
assert.equal(evalGame("pickups.length"), 0);
evalGame("CONTENT.weapons.pop(); delete TOOL_APPEARANCES.extra; startGame(); player.weapons = Object.fromEntries(CONTENT.weapons.map((w,i) => [w.id,i<6?1:0])); player.weapons.ruler = 0; pickups = [{type:'weapon',weaponId:'ruler',level:1,collected:false}]");
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
assert.equal(evalGame("enemyProjectiles.length"), 4, "Collector throws a stronger spread of bottle caps");
assert.equal(evalGame("enemies[0].lungeTime"), 0, "Collector uses ranged attacks");
evalGame("enemyProjectiles[0].x = player.x; enemyProjectiles[0].y = player.y; enemyProjectiles[0].vx = 0; enemyProjectiles[0].vy = 0; updateEnemyProjectiles(.02)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-22"), "Bottle cap collision damages the player");
evalGame("startGame(); enemies = [makeEnemy(player.x + 300,player.y,'mini2'),makeEnemy(player.x - 300,player.y,'mini2')]; enemies[0].memberIndex = 0; enemies[1].memberIndex = 1; enemies[0].attackClock = 0; enemies[1].windup = .01; enemies[1].throwAngle = 0; updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles[0].type"), "tire", "Second cyclist throws tires");
assert.equal(evalGame("enemies[0].windup"), .7, "First cyclist warns before charging");
evalGame("enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("enemies[0].lungeTime"), .52);
evalGame("for (const e of enemies) drawEnemy(e,1); for (const p of enemyProjectiles) drawEnemyProjectile(p)");
// Enemy 2 alternates a thrown bottle with a melee swing and exactly three droplets.
evalGame("startGame(); enemies = [makeEnemy(player.x + 250,player.y,'water')]; enemies[0].attackClock = 0; updateEnemies(.01)");
assert.equal(evalGame("enemies[0].windup"), .55);
assert.equal(evalGame("enemyProjectiles.length"), 0, "Bottle throw has a windup before firing");
evalGame("enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles.length"), 1);
assert.equal(evalGame("enemyProjectiles[0].type"), "bottle");
assert.equal(evalGame("enemies[0].waterAttack"), "swing");
assert.equal(evalGame("enemies[0].lungeTime"), 0, "Water enemy does not use enemy 1's lunge");
evalGame("enemyProjectiles[0].x = player.x; enemyProjectiles[0].y = player.y; enemyProjectiles[0].vx = 0; enemyProjectiles[0].vy = 0; updateEnemyProjectiles(.01)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-12"), "Thrown bottle deals collision damage");
assert.equal(evalGame("enemyProjectiles.length"), 0);

math.random = () => 0;
evalGame("enemies[0].x = player.x + 70; enemies[0].y = player.y; enemies[0].attackClock = 0; player.invulnerable = 0; updateEnemies(.01)");
assert.equal(evalGame("enemies[0].windup"), .45, "Melee swing has its own windup");
evalGame("enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-26"), "A nearby player takes water-bottle swing damage");
assert.equal(evalGame("enemyProjectiles.length"), 3, "Every swing fires exactly three droplets");
assert.equal(evalGame("enemyProjectiles.every(p => p.type === 'droplet')"), true);
assert.equal(evalGame("new Set(enemyProjectiles.map(p => p.angle)).size"), 3, "Droplets fan in three directions");
assert.equal(evalGame("enemies[0].waterAttack"), "throw", "Next attack returns to a bottle throw");
assert.equal(evalGame("enemies.length"), 1, "Enemy 2 hits cannot summon enemy 1");
evalGame("const droplet = enemyProjectiles[0]; droplet.x = player.x; droplet.y = player.y; droplet.vx = 0; droplet.vy = 0; updateEnemyProjectiles(.001)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-26"), "Swing invulnerability prevents immediate stacked droplet damage");
evalGame("player.invulnerable = 0; enemyProjectiles[0].x = player.x; enemyProjectiles[0].y = player.y; enemyProjectiles[0].vx = 0; enemyProjectiles[0].vy = 0; updateEnemyProjectiles(.001)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp-33"), "A water droplet can damage the player");

evalGame("startGame(); enemies = [makeEnemy(player.x + 70,player.y,'water')]; enemies[0].waterAttack = 'swing'; enemies[0].attackClock = 0; updateEnemies(.01); player.x -= 250; enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("player.hp"), evalGame("player.maxHp"), "Moving away during windup avoids melee damage");
assert.equal(evalGame("enemyProjectiles.length"), 3, "A missed swing still launches all three droplets");
evalGame("for (const e of enemies) drawEnemy(e,1); for (const p of enemyProjectiles) drawEnemyProjectile(p); for (const e of effects) drawEffect(e); drawWaterBottle(ctx,0,0)");
evalGame("startGame(); update(.01)");
assert.equal(evalGame("enemies.every(e => e.kind === 'basic')"), true, "Lesson one introduces enemy 1");
evalGame("gameTime = LESSON_LENGTH; spawnClock = 0; update(.01)");
assert.equal(evalGame("enemies.some(e => e.kind === 'water')"), true, "Enemy 2 enters the normal spawn pool from lesson two");
// Boss encounters freeze all new regular enemies until every boss member is defeated.
evalGame("startGame(); gameTime = 9 * LESSON_LENGTH - .02; spawnClock = 0; enemies = [makeEnemy(player.x + 400,player.y)]; update(.02)");
assert.equal(evalGame("enemies.length"), 1, "Boss arrival clears the regular enemy without spawning a new batch");
assert.equal(evalGame("enemies.filter(e => !e.boss).length"), 0, "Existing regular enemies disappear");
evalGame("update(.02)");
assert.equal(evalGame("enemies.length"), 1, "Boss presence pauses regular spawning");
assert.equal(evalGame("spawnClock"), 0, "Regular spawn timer stays frozen during a boss fight");
evalGame("damageEnemy(enemies.find(e => e.boss),99999,'pistol'); update(.01)");
assert(evalGame("enemies.length > 2"), "Regular spawning resumes after the boss is defeated");

evalGame("startGame(); gameTime = 19 * LESSON_LENGTH; spawnedBosses.add('mini1'); defeatedBosses.add('mini1'); spawnClock = 0; update(.01)");
assert.equal(evalGame("enemies.length"), 2, "Only the two cyclists spawn in their arrival frame");
evalGame("damageEnemy(enemies[0],99999,'pistol'); update(.01)");
assert.equal(evalGame("hasActiveBoss()"), true);
assert.equal(evalGame("enemies.length"), 1, "One surviving cyclist keeps regular spawning paused");
evalGame("damageEnemy(enemies[0],99999,'pistol'); update(.01)");
assert.equal(evalGame("hasActiveBoss()"), false);
assert(evalGame("enemies.some(e => !e.boss)"), "Defeating both cyclists restores regular spawning");

evalGame("startGame(); gameTime = 29 * LESSON_LENGTH; spawnedBosses.add('mini1'); spawnedBosses.add('mini2'); defeatedBosses.add('mini1'); defeatedBosses.add('mini2'); spawnClock = 0; update(.01); update(.02)");
assert.equal(evalGame("enemies.length"), 1, "Final boss also prevents new regular enemies");
assert.equal(evalGame("enemies[0].kind"), "final");
// Six talent pickups, two acquisition orders, matching pairs, and passive bonuses.
math.random = () => .999;
evalGame("startGame(); for (const w of CONTENT.weapons.slice(0,6)) player.weapons[w.id] = 5");
const talentIds = evalGame("CONTENT.talents.slice(0,6).map(t => t.id)");
for (const id of talentIds) {
  evalGame(`gainExperience(player.xpNeed); chooseUpgrade('${id}')`);
  assert.equal(evalGame("mode"), "playing");
  assert.equal(evalGame("pickups[pickups.length - 1].type"), "talent");
  assert.equal(evalGame(`player.talents['${id}']`), false, "Selecting a talent does not equip it yet");
  assert.equal(evalGame(`canAcquireTalent('${id}')`), false, "Pending talent cannot be selected twice");
  const pairedTool = evalGame(`CONTENT.talents.find(t => t.id === '${id}').toolId`);
  assert.equal(evalGame(`isEvolved('${pairedTool}')`), false);
  evalGame("player.x = pickups[pickups.length - 1].x; player.y = pickups[pickups.length - 1].y; updatePickups(.01)");
  assert.equal(evalGame(`player.talents['${id}']`), true);
  assert.equal(evalGame(`isEvolved('${pairedTool}')`), true, "Level-five tool evolves on its matching talent pickup");
  assert.equal(evalGame(`player.weapons['${pairedTool}']`), 5, "Evolution never creates a sixth upgrade level");
}
assert.equal(evalGame("reservedTalentSlots()"), 6);
assert.equal(evalGame("reservedToolSlots()"), 6, "Tool and talent capacities are separate");
assert.equal(evalGame("canAcquireTalent('seventh')"), false, "Talent capacity prevents a seventh talent");
assert.equal(evalGame("player.evolvedTools.size"), 6);
evalGame("checkEvolutions(); gainExperience(player.xpNeed)");
assert.equal(evalGame("player.evolvedTools.size"), 6, "Evolution announcement cannot repeat");
assert.equal(evalGame("mode"), "playing", "Fully acquired build skips exhausted upgrade choices");
assert.equal(elements["talent-label"].textContent, "天賦 6 / 6");
assert.equal(elements["talent-slots"].children.length, 6);
assert(elements["talent-slots"].children.every(e => e.className.includes("evolved")));

evalGame("startGame(); player.talents.harvest = true; player.weapons.blueberry = 4");
assert.equal(evalGame("isEvolved('blueberry')"), false, "Talent alone does not evolve a level-four tool");
assert(Math.abs(evalGame("toolStats('blueberry',4).damage") - 57.2) < 1e-8, "Talent gives its passive bonus before evolution");
assert.equal(evalGame("TOOL_LEVELS.blueberry[3].damage"), 52, "Bonuses do not mutate base stats");
evalGame("gainExperience(player.xpNeed); chooseUpgrade('blueberry')");
assert.equal(evalGame("isEvolved('blueberry')"), false, "Uncollected level-five tool does not evolve");
evalGame("player.x = pickups[0].x; player.y = pickups[0].y; updatePickups(.01)");
assert.equal(evalGame("isEvolved('blueberry')"), true, "Talent first, tool second also triggers evolution");
evalGame("startGame(); player.weapons.pistol = 5; player.talents.harvest = true");
assert.equal(evalGame("isEvolved('pistol')"), false, "A different tool's talent cannot trigger evolution");
evalGame("startGame(); pickups = CONTENT.talents.slice(0,6).map(t => ({type:'talent',talentId:t.id,collected:false}))");
assert.equal(evalGame("reservedTalentSlots()"), 6, "Pending pickups reserve talent slots");
assert.equal(evalGame("canAcquireTalent('focus')"), false);

for (const [id, count] of Object.entries({blueberry:5,pistol:1,firecracker:1,bow:5,eraser:4})) {
  evalGame(`startGame(); player.weapons.${id} = 5; player.talents[matchingTalent('${id}').id] = true; player.pencilCooldown = 10; enemies = [makeEnemy(player.x+220,player.y)]; enemies[0].hp = 1000; weaponAttacks(.001)`);
  assert.equal(evalGame("projectiles.length"), count, `${id} has a distinct super-evolved attack`);
  assert.equal(evalGame("projectiles.every(p => p.evolved)"), true);
  assert.equal(evalGame("projectiles[0].damage"), evalGame(`toolStats('${id}',5).damage`), "Evolution stats reach the actual attack");
  evalGame("for (const p of projectiles) drawProjectile(p); drawPlayer(1)");
}
evalGame("startGame(); player.weapons.ruler=5; player.talents.geometry=true; player.pencilCooldown=10; enemies=rulerPositions().map(p=>makeEnemy(p.x,p.y)); weaponAttacks(.001)");
assert.equal(evalGame("rulerPositions().length"), 5);
assert.equal(evalGame("enemies.every(e=>e.hp<=0)"), true, "Super ruler damages enemies at all five orbit positions");
evalGame("startGame(); player.weapons.bow=5; player.talents.trajectory=true; player.pencilCooldown=10; enemies=[makeEnemy(player.x+200,player.y),makeEnemy(player.x+300,player.y),makeEnemy(player.x+400,player.y)]; for(const e of enemies)e.hp=1000; weaponAttacks(.001); projectiles=[projectiles[2]]; projectiles[0].x=enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"), 912);
evalGame("projectiles[0].x=enemies[1].x; updateProjectiles(.001)");
assert.equal(evalGame("enemies[1].hp"), 824, "Super arrow doubles its second hit");
assert.equal(evalGame("projectiles.length"), 0, "Super arrow still stops at two distinct enemies");
assert.equal(evalGame("enemies[2].hp"), 1000);
evalGame("startGame(); player.weapons.pistol=5; player.talents.focus=true; player.pencilCooldown=10; enemies=[makeEnemy(player.x+220,player.y)]; weaponAttacks(.001)");
assert.equal(evalGame("projectiles.length"), 1, "Super Gatling fires one bullet per trigger");
evalGame("weaponAttacks(.11)");
assert.equal(evalGame("projectiles.length"), 2, "Super Gatling increases firing frequency");

// Cards describe next-level mechanics, numeric changes, and matching evolution conditions.
evalGame("startGame(); player.weapons.pistol=1; renderUpgrades()");
let pistolCard = elements["upgrade-options"].children.find(b => b.children.some(e => e.textContent?.startsWith("手槍")));
assert(pistolCard.children.find(e => e.className === "upgrade-stats").textContent.includes("傷害 19 → 25"));
assert(pistolCard.children.find(e => e.className === "evolution-hint").textContent.includes("精準瞄準"));
evalGame("for (const w of CONTENT.weapons.slice(0,6)) player.weapons[w.id]=5; renderUpgrades()");
const harvestCard=elements["upgrade-options"].children[0];
assert(harvestCard.className.includes("talent-card"));
assert(harvestCard.children.find(e=>e.className==='evolution-hint').textContent.includes("藍莓滿 5 級"));
evalGame("drawPickup({type:'talent',talentId:'focus',x:100,y:100},1); for (const t of CONTENT.talents) drawTalent(ctx,t,0,0); drawEffect({type:'evolution',x:0,y:0,radius:115,age:.3,duration:.9})");

// Speed applies to all simulation time with small steps, and stops at upgrade/pause boundaries.
evalGame("startGame(); spawnClock=100; player.hp=80");
click("speed-btn"); assert.equal(evalGame("gameSpeed"), 2);
click("speed-btn"); assert.equal(evalGame("gameSpeed"), 3);
assert.equal(elements["speed-btn"].textContent, "3×");
evalGame("keys.add('d'); advanceSimulation(.1); keys.clear()");
assert(Math.abs(evalGame("gameTime") - .3) < 1e-8);
assert(Math.abs(evalGame("player.hp") - 80.6) < 1e-8, "Healing follows simulation time at triple speed");
assert(Math.abs(evalGame("player.x") - (900 + 67.5)) < 1e-8, "Movement follows simulation time at triple speed");
evalGame("mode='paused'; advanceSimulation(.1)");
assert(Math.abs(evalGame("gameTime") - .3) < 1e-8, "Paused triple-speed game does not advance");
evalGame("mode='playing'; player.xp=player.xpNeed; advanceSimulation(.1)");
assert.equal(evalGame("mode"), "upgrade");
assert(Math.abs(evalGame("gameTime") - .32) < 1e-8, "Substeps stop as soon as an upgrade opens");
evalGame("advanceSimulation(.1)");
assert(Math.abs(evalGame("gameTime") - .32) < 1e-8);
click("speed-btn"); assert.equal(evalGame("gameSpeed"), 1);
document.listeners.keydown({key:"f",repeat:false}); assert.equal(evalGame("gameSpeed"), 2);
document.listeners.keydown({key:"f",repeat:true}); assert.equal(evalGame("gameSpeed"), 2);
evalGame("startGame(); spawnClock=100; gameSpeed=3; gameTime=29.9; advanceSimulation(.1)");
assert.equal(evalGame("currentLesson()"), 2, "Lesson progression respects triple speed");
evalGame("startGame(); spawnClock=100; gameSpeed=3; gameTime=269.9; advanceSimulation(.1)");
assert.equal(evalGame("enemies.filter(e=>e.kind==='mini1').length"), 1, "Substeps preserve timed boss spawning");
evalGame("startTutorial(); gameSpeed=3; keys.add('d'); advanceSimulation(.1); keys.clear()");
assert(Math.abs(evalGame("tutorialDistance") - 22.5) < 1e-8, "Tutorial stays at normal movement speed");
evalGame("startGame()"); assert.equal(evalGame("gameSpeed"), 1, "New games reset to normal speed");
assert.equal(evalGame("CONTENT.weapons.length"),12);
assert.equal(evalGame("CONTENT.talents.length"),12);
assert.equal(evalGame("new Set(CONTENT.talents.map(t=>t.toolId)).size"),12, "All twelve tools have a unique matching talent");
evalGame("startGame(); for(const w of CONTENT.weapons.slice(6))player.weapons[w.id]=5; for(const t of CONTENT.talents.slice(6))player.talents[t.id]=true; checkEvolutions(); updateHud()");
assert.equal(evalGame("reservedToolSlots()"),6);
assert.equal(evalGame("reservedTalentSlots()"),6);
assert.equal(evalGame("player.evolvedTools.size"),6, "All six new pairings can evolve");
assert.equal(evalGame("canUpgradeTool('blueberry')"),false, "Six new tools prevent equipping a seventh original tool");
assert.equal(evalGame("canAcquireTalent('harvest')"),false, "Six new talents prevent equipping a seventh original talent");
evalGame("gainExperience(player.xpNeed)");
assert.equal(evalGame("mode"),"playing", "A full maxed build can continue with other tools still unowned");
for(const id of ["football","plane","chalk","stapler","book","bell"]){
  evalGame(`startGame(); player.weapons.${id}=5; player.talents[matchingTalent('${id}').id]=true; player.pencilCooldown=10; enemies=[makeEnemy(player.x+90,player.y)]; enemies[0].hp=1000; weaponAttacks(.001); for(const p of projectiles)drawProjectile(p); for(const e of effects)drawEffect(e); drawPlayer(1)`);
  assert(evalGame("projectiles.length>0 || effects.length>0"), `${id} performs a real super attack`);
  for(let level=1;level<=5;level++)evalGame(`drawTool(ctx,'${id}',${level},0,0)`);
  evalGame(`drawTool(ctx,'${id}',5,0,0,1,0,true); drawTalent(ctx,matchingTalent('${id}'),0,0)`);
}
evalGame("startGame(); player.weapons.football=1; enemies=[makeEnemy(player.x+150,player.y),makeEnemy(player.x+250,player.y),makeEnemy(player.x+350,player.y),makeEnemy(player.x+450,player.y)]; shootAt(enemies[0],'football',400,10); projectiles[0].x=enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"),27);
assert.equal(evalGame("projectiles[0].target===enemies[1]"),true,"Football redirects to another enemy after hitting");
evalGame("projectiles[0].x=enemies[1].x; updateProjectiles(.001); projectiles[0].x=enemies[2].x; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"),0,"Basic football stops after its third distinct target");
assert.equal(evalGame("enemies[3].hp"),37);

evalGame("startGame(); player.weapons.plane=3; enemies=[makeEnemy(player.x+150,player.y),makeEnemy(player.x+250,player.y+80)]; shootAt(enemies[0],'plane',390,10); projectiles[0].x=enemies[0].x; updateProjectiles(.001)");
assert.equal(evalGame("projectiles[0].target===enemies[1]"),true,"Paper plane finds a second target");
evalGame("projectiles[0].x=enemies[1].x; projectiles[0].y=enemies[1].y; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"),0);
assert.equal(evalGame("enemies[1].hp"),27);

evalGame("startGame(); player.weapons.chalk=1; enemies=[makeEnemy(player.x+150,player.y)]; enemies[0].hp=1000; shootAt(enemies[0],'chalk',350,10); projectiles[0].x=enemies[0].x; updateProjectiles(.001); updateEffects(.06)");
assert.equal(evalGame("enemies[0].hp"),978,"Powder cloud deals periodic damage after chalk impact");
assert(evalGame("enemies[0].slowTime>0"),"Powder cloud slows enemies");
evalGame("updateEffects(.4)");
assert.equal(evalGame("enemies[0].hp"),966);
evalGame("updateEffects(2); effects=[]; const chalkHp=enemies[0].hp; updateEffects(2)");
assert.equal(evalGame("enemies[0].hp===chalkHp"),true,"Expired powder stops damaging enemies");

evalGame("startGame(); player.weapons.stapler=1; enemies=[makeEnemy(player.x+150,player.y)]; enemies[0].attackClock=10; shootAt(enemies[0],'stapler',850,10); projectiles[0].x=enemies[0].x; updateProjectiles(.001); const stapledX=enemies[0].x; updateEnemies(.1)");
assert.equal(evalGame("enemies[0].x===stapledX"),true,"Book staple temporarily immobilizes its target");
evalGame("updateEnemies(.2)");
assert(evalGame("enemies[0].x<stapledX"),"Stapled enemy moves again after stun expires");

evalGame("startGame(); player.weapons.book=5; player.pencilCooldown=10; enemies=[makeEnemy(player.x+100,player.y),makeEnemy(player.x-200,player.y)]; for(const e of enemies)e.hp=1000; weaponAttacks(.001)");
assert.equal(evalGame("enemies[0].hp"),900);
assert.equal(evalGame("enemies[1].hp"),1000,"Textbook hits the forward cone, not enemies behind the player");
evalGame("startGame(); player.weapons.bell=5; player.pencilCooldown=10; enemies=[makeEnemy(player.x+100,player.y),makeEnemy(player.x-100,player.y)]; for(const e of enemies)e.hp=1000; weaponAttacks(.001)");
assert.equal(evalGame("enemies.every(e=>e.hp===975)"),true,"Bell wave covers enemies on both sides");
assert.equal(evalGame("enemies.every(e=>distance(e,player)>180)"),true,"Bell wave pushes enemies away");

// Enemy 3 fires rubber bands; enemy 4's misses become three-second ground hazards.
evalGame("startGame(); enemies=[makeEnemy(player.x+250,player.y,'rubber')]; enemies[0].attackClock=0; updateEnemies(.01)");
assert.equal(evalGame("enemies[0].windup"),.5);
evalGame("enemies[0].windup=.01; updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles[0].type"),"rubber");
evalGame("enemyProjectiles[0].x=player.x; enemyProjectiles[0].y=player.y; enemyProjectiles[0].vx=0; enemyProjectiles[0].vy=0; updateEnemyProjectiles(.001)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp-10"),"A rubber band damages the player");

evalGame("startGame(); enemies=[makeEnemy(player.x+250,player.y,'tissue')]; enemies[0].attackClock=0; updateEnemies(.01)");
assert.equal(evalGame("enemies[0].windup"),.6);
evalGame("enemies[0].windup=.01; updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles[0].type"),"tissue");
evalGame("enemyProjectiles[0].x=player.x; enemyProjectiles[0].y=player.y; enemyProjectiles[0].vx=0; enemyProjectiles[0].vy=0; updateEnemyProjectiles(.001)");
assert.equal(evalGame("player.slowTime"),3,"Direct wet-tissue impact slows the player for three seconds");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp"),"Wet tissue applies slowdown without extra damage");
assert.equal(evalGame("effects.some(e=>e.type==='wet-tissue')"),false,"A direct hit does not leave a missed-shot hazard");
evalGame("enemies=[]; spawnClock=100; const slowedX=player.x; keys.add('d'); update(.1); keys.clear()");
assert.equal(evalGame("player.x-slowedX"),11.25,"Wet tissue reduces movement speed by half");
evalGame("for(let i=0;i<30;i++)update(.1)");
assert.equal(evalGame("player.slowTime"),0,"The player recovers normal speed after three seconds");

evalGame("startGame(); enemyProjectiles=[{type:'tissue',x:player.x+120,y:player.y,vx:0,vy:0,r:12,life:.01,angle:0}]; updateEnemyProjectiles(.02)");
assert.equal(evalGame("enemyProjectiles.length"),0);
assert.equal(evalGame("effects.filter(e=>e.type==='wet-tissue').length"),1);
assert.equal(evalGame("effects.find(e=>e.type==='wet-tissue').duration"),3);
evalGame("updateEffects(2.99)");
assert.equal(evalGame("effects.some(e=>e.type==='wet-tissue')"),true);
evalGame("updateEffects(.02)");
assert.equal(evalGame("effects.some(e=>e.type==='wet-tissue')"),false,"Missed tissue disappears after three seconds");
evalGame("startGame(); addEffect(player.x+60,player.y,'wet-tissue',{radius:17,duration:3}); player.x+=60; updateEffects(.01)");
assert.equal(evalGame("player.slowTime"),3,"Stepping on landed tissue has the same slowdown");
evalGame("slowPlayer(3)");assert.equal(evalGame("player.slowTime"),3,"Repeated hits refresh rather than stack slowdown duration");
evalGame("mode='paused'; update(1)");
assert.equal(evalGame("player.slowTime"),3,"Pause freezes slowdown duration");
assert.equal(evalGame("effects.find(e=>e.type==='wet-tissue').age"),.01,"Pause also freezes landed tissue lifetime");
evalGame("mode='playing'; for(const kind of ['rubber','tissue'])drawEnemy(makeEnemy(player.x+100,player.y,kind),1); drawEnemyProjectile({type:'rubber',x:0,y:0,vx:1,vy:0}); drawEnemyProjectile({type:'tissue',x:0,y:0}); for(const e of effects)drawEffect(e)");
math.random=()=>.35;evalGame("gameTime=60");assert.equal(evalGame("regularEnemyKind()"),"rubber");
math.random=()=>.55;evalGame("gameTime=90");assert.equal(evalGame("regularEnemyKind()"),"tissue");

// Enemy 5: a telegraphed, fixed-direction jet dash alternates with a timed grenade.
evalGame("startGame(); enemies=[makeEnemy(player.x+200,player.y,'weilong')]; enemies[0].attackClock=0; updateEnemies(.01)");
assert.equal(evalGame("enemies[0].windup"),.7);
evalGame("enemies[0].windup=.01; updateEnemies(.02); const jetDirection=enemies[0].lungeVY; player.y+=90; updateEnemies(.02)");
assert.equal(evalGame("enemies[0].lungeVY"),evalGame("jetDirection"),"A warned dash cannot follow a dodging player");
evalGame("enemies[0].x=player.x+30;enemies[0].y=player.y;enemies[0].lungeVX=0;enemies[0].lungeVY=0;updateEnemies(.02)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp-18"));
evalGame("player.invulnerable=0;updateEnemies(.02)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp-18"),"Each jet dash hits only once");
evalGame("enemies[0].lungeTime=.01;updateEnemies(.02);enemies[0].attackClock=0;updateEnemies(.01);enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles[0].type"),"grenade");
evalGame("enemies=[];player.x=enemyProjectiles[0].targetX;player.y=enemyProjectiles[0].targetY;player.hp=player.maxHp;player.invulnerable=0;updateEnemyProjectiles(.75)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp"),"Grenade landing is followed by a visible fuse");
evalGame("updateEnemyProjectiles(.61)");assert.equal(evalGame("player.hp"),evalGame("player.maxHp-18"));
assert.equal(evalGame("enemyProjectiles.length"),0);
evalGame("updateEnemyProjectiles(1)");assert.equal(evalGame("player.hp"),evalGame("player.maxHp-18"),"A grenade explodes only once");

// Summoned spiders and dogs have independent attacks, lifetimes, and global caps.
evalGame("startGame();enemies=[makeEnemy(player.x+250,player.y,'bit')];enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("enemies.filter(e=>e.kind==='spider').length"),3);
evalGame("enemies=enemies.filter(e=>e.kind==='spider').slice(0,1);enemies[0].x=player.x+30;enemies[0].y=player.y;updateEnemies(.01)");
assert.equal(evalGame("enemies[0].windup"),.5);
evalGame("updateEnemies(.51)");assert.equal(evalGame("player.hp"),evalGame("player.maxHp-10"));assert.equal(evalGame("enemies.length"),0);
evalGame("startGame();enemies=Array.from({length:8},()=>makeEnemy(player.x+250,player.y,'bit'));for(const e of enemies)e.windup=.01;updateEnemies(.02)");
assert.equal(evalGame("enemies.filter(e=>e.kind==='spider').length"),12,"Multiple summoners share the spider cap");
evalGame("enemies=enemies.filter(e=>e.kind==='spider');for(const e of enemies)e.life=.01;updateEnemies(.02)");
assert.equal(evalGame("enemies.length"),0,"Expired spiders leave without damaging distant players");
evalGame("startGame();enemies=Array.from({length:6},()=>makeEnemy(player.x+250,player.y,'handler'));for(const e of enemies)e.windup=.01;updateEnemies(.02)");
assert.equal(evalGame("enemies.filter(e=>e.kind==='dog').length"),8);
evalGame("enemies=enemies.filter(e=>e.kind==='dog').slice(0,1);enemies[0].x=player.x+30;enemies[0].y=player.y;enemies[0].attackClock=0;updateEnemies(.01);updateEnemies(.31)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp-9"),"Released dogs can bite the player");
evalGame("enemies[0].windup=.01;player.y+=100;player.invulnerable=0;updateEnemies(.02)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp-9"),"Moving out of reach avoids a bite");
evalGame("damageEnemy(enemies[0],999,'pencil')");assert.equal(evalGame("pickups[0].type"),"xp");
evalGame("startGame();enemies=[makeEnemy(player.x+300,player.y,'mini1'),makeEnemy(player.x+250,player.y,'bit'),makeEnemy(player.x-250,player.y,'handler')];enemies[1].windup=.01;enemies[2].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("enemies.length"),3,"Boss presence also stops spider and dog summons");

// Directional shields use attack origins, including projectiles that approach from behind.
evalGame("startGame();enemies=[makeEnemy(player.x+70,player.y,'deepblue')];const shieldHp=enemies[0].hp;damageEnemy(enemies[0],20,'pencil')");
assert.equal(evalGame("enemies[0].hp"),evalGame("shieldHp"));
evalGame("damageEnemy(enemies[0],20,'pistol',{x:enemies[0].x+100,y:enemies[0].y})");
assert.equal(evalGame("enemies[0].hp"),evalGame("shieldHp-20"));
evalGame("enemies[0].hp=1000;shootAt(enemies[0],'stapler',850,20);projectiles[0].x=enemies[0].x;updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"),1000);assert.equal(evalGame("enemies[0].stunTime"),0,"Blocked staples do not stun through shields");
evalGame("shootAt(enemies[0],'pistol',850,20);projectiles[0].x=enemies[0].x+1;projectiles[0].vx=-850;updateProjectiles(.001)");
assert.equal(evalGame("enemies[0].hp"),980,"Rear projectile damage is independent of the player's position");
evalGame("enemies[0].attackClock=0;updateEnemies(.01);enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp-16"),"A shield swing damages and pushes the player");

// Enemy 9 only obscures an eye after a successful damaging hit.
math.random=()=>.1;
evalGame("startGame();enemies=[makeEnemy(player.x+60,player.y,'eye')];enemies[0].attackClock=0;updateEnemies(.01);enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("player.visionSide"),"left");assert.equal(evalGame("player.visionTime"),3);
const maskRects=[];drawing.fillRect=(...args)=>maskRects.push(args);evalGame("drawVisionOverlay()");delete drawing.fillRect;
assert.deepEqual(maskRects[0],[0,0,640,720],"Left eye hides exactly the left half of the canvas");
evalGame("enemies[0].windup=.01;enemies[0].throwAngle=Math.PI;player.visionTime=2;updateEnemies(.02)");
assert.equal(evalGame("player.visionTime"),2,"Invulnerable hits do not refresh blindness");
math.random=()=>.9;evalGame("player.invulnerable=0;enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("player.visionSide"),"right");assert.equal(evalGame("player.visionTime"),3);
maskRects.length=0;drawing.fillRect=(...args)=>maskRects.push(args);evalGame("drawVisionOverlay()");delete drawing.fillRect;
assert.deepEqual(maskRects[0],[640,0,640,720]);
evalGame("mode='paused';update(1)");assert.equal(evalGame("player.visionTime"),3);
evalGame("mode='upgrade';update(1)");assert.equal(evalGame("player.visionTime"),3);
evalGame("mode='playing';enemies=[];spawnClock=100;for(let i=0;i<150;i++)update(.02)");
assert.equal(evalGame("player.visionTime"),0);assert.equal(evalGame("player.visionSide"),null);
evalGame("startGame();enemies=[makeEnemy(player.x+60,player.y,'eye')];enemies[0].windup=.01;enemies[0].throwAngle=0;updateEnemies(.02)");
assert.equal(evalGame("player.visionTime"),0,"A poke facing away from the player cannot obscure vision");

// Enemy 10 alternates arming a ground trap and throwing a grenade.
evalGame("startGame();enemies=[makeEnemy(player.x+250,player.y,'shepherd')];enemies[0].attackClock=0;updateEnemies(.01);enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("effects.filter(e=>e.type==='enemy-trap').length"),1);
evalGame("player.x=effects.find(e=>e.type==='enemy-trap').x;player.y=effects.find(e=>e.type==='enemy-trap').y;updateEffects(.5)");
assert.equal(evalGame("player.hp"),evalGame("player.maxHp"),"A newly placed trap gives time to escape before arming");
evalGame("updateEffects(.11)");assert.equal(evalGame("player.hp"),evalGame("player.maxHp-14"));
assert.equal(evalGame("effects.some(e=>e.type==='enemy-trap')"),false);
evalGame("enemies[0].attackClock=0;updateEnemies(.01);enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame("enemyProjectiles[0].type"),"grenade");
evalGame("enemyProjectiles=[];addEffect(player.x+300,player.y,'enemy-trap',{radius:22,duration:8});updateEffects(8)");
assert.equal(evalGame("effects.some(e=>e.type==='enemy-trap')"),false,"Untouched traps expire");

// Boss freezes the lesson clock, while combat and effects still advance at the chosen speed.
math.random=()=>.999;
evalGame("startGame();gameTime=269.99;gameSpeed=3;spawnClock=100;advanceSimulation(.1)");
assert.equal(evalGame("gameTime"),270,"Clock stops exactly at the first boss boundary, even at triple speed");
assert(elements['lesson-label'].textContent.includes('計時暫停'));
evalGame("player.hp=80;player.invulnerable=100;player.visionTime=3;player.visionSide='left';const frozenBossX=enemies[0].x;advanceSimulation(.1)");
assert.equal(evalGame("gameTime"),270);
assert(evalGame("enemies[0].x!==frozenBossX"),"Boss combat continues while the lesson clock is held");
assert(Math.abs(evalGame("player.hp")-80.6)<1e-8);
assert(Math.abs(evalGame("player.visionTime")-2.7)<1e-8,"Combat status timers continue during boss encounters");
evalGame("damageEnemy(enemies.find(e=>e.boss),99999,'pistol');advanceSimulation(.1)");
assert(Math.abs(evalGame("gameTime")-270.3)<1e-8);
evalGame("startGame();gameTime=570;spawnedBosses.add('mini1');defeatedBosses.add('mini1');update(.02);damageEnemy(enemies.find(e=>e.kind==='mini2'),99999,'pistol');update(.1)");
assert.equal(evalGame("gameTime"),570,"The clock stays held while the second cyclist survives");
evalGame("damageEnemy(enemies.find(e=>e.kind==='mini2'&&e.hp>0),99999,'pistol');update(.1)");
assert.equal(evalGame("gameTime"),570.1);

// New types enter from their own lessons, and every type can render its combat cues.
for(const [kind,lesson,roll] of [['weilong',5,.44],['bit',6,.53],['deepblue',7,.62],['handler',8,.68],['eye',9,.73],['shepherd',10,.78]]) {
  math.random=()=>roll;evalGame(`gameTime=(${lesson}-1)*LESSON_LENGTH`);
  assert.equal(evalGame('regularEnemyKind()'),kind);
  evalGame(`gameTime=(${lesson}-2)*LESSON_LENGTH`);assert.notEqual(evalGame('regularEnemyKind()'),kind);
}
evalGame("startGame();for(const kind of ['weilong','bit','spider','deepblue','handler','dog','eye','shepherd'])drawEnemy(makeEnemy(player.x+100,player.y,kind),1);enemies=[makeEnemy(player.x+200,player.y,'shepherd')];enemies[0].targetX=player.x;enemies[0].targetY=player.y;throwEnemyGrenade(enemies[0]);drawEnemyProjectile(enemyProjectiles[0]);for(const type of ['enemy-trap','enemy-explosion','shield-block','shield-swing','eye-poke'])drawEffect({type,x:player.x,y:player.y,age:.1,duration:1,radius:60,angle:0})");
math.random=()=>.999;
// New ranged attacks use the real enemy and projectile loops.
evalGame("startGame();enemies=[makeEnemy(player.x+300,player.y,'megaphone')];enemies[0].attackClock=0;updateEnemies(.01)");
assert.equal(evalGame('enemies[0].windup'),.7);assert.equal(evalGame('enemyProjectiles.length'),0);
evalGame("player.y+=90;enemies[0].windup=.01;updateEnemies(.02)");
assert.equal(evalGame('enemyProjectiles[0].type'),'sound-wave');
assert(Math.abs(evalGame('enemyProjectiles[0].vy'))<1e-8,'A sound wave keeps its warned direction');
evalGame("enemyProjectiles[0].x=player.x;enemyProjectiles[0].y=player.y;enemyProjectiles[0].vx=0;enemyProjectiles[0].vy=0;updateEnemyProjectiles(.001);updateHud()");
assert.equal(evalGame('player.hp'),191);assert.equal(evalGame('player.stunTime'),1);
assert.equal(elements['stun-label'].hidden,false);
evalGame("enemies=[];spawnClock=100;keys.add('d');const stunStartX=player.x;update(.5)");
assert.equal(evalGame('player.x'),evalGame('stunStartX'),'Stun blocks keyboard movement');
evalGame("pointer.x=1;keys.clear();mode='paused';update(2)");
assert.equal(evalGame('player.stunTime'),.5);
evalGame("mode='upgrade';update(2)");assert.equal(evalGame('player.stunTime'),.5);
evalGame("mode='playing';stunPlayer(1);stunPlayer(1)");assert.equal(evalGame('player.stunTime'),1,'Stun refreshes without adding durations');
evalGame("player.weapons.pistol=1;player.pistolCooldown=.2;player.pencilCooldown=0;enemies=[makeEnemy(player.x+80,player.y)];const stunTargetHp=enemies[0].hp;weaponAttacks(.1)");
assert.equal(evalGame('projectiles.length'),0);assert.equal(evalGame('enemies[0].hp'),evalGame('stunTargetHp'));
assert(Math.abs(evalGame('player.pistolCooldown')-.1)<1e-8,'Tool cooldowns continue during stun');
evalGame("enemies=[];for(let i=0;i<50;i++)update(.02)");
assert.equal(evalGame('player.stunTime'),0);assert(Math.abs(evalGame('player.x-stunStartX'))<1e-8);
evalGame("update(.02);pointer.x=0");assert(evalGame('player.x>stunStartX'),'Joystick movement resumes after one second');
assert.equal(elements['stun-label'].hidden,true);
evalGame("enemies=[makeEnemy(player.x+200,player.y)];weaponAttacks(.01)");assert.equal(evalGame('projectiles.length'),1,'Auto attacks resume after stun');
evalGame("startGame();player.invulnerable=1;enemyProjectiles=[{type:'sound-wave',x:player.x,y:player.y,vx:0,vy:0,r:17,damage:9,life:1,angle:0}];updateEnemyProjectiles(.01)");
assert.equal(evalGame('player.stunTime'),0,'Invulnerability also prevents sonic stun');assert.equal(evalGame('player.hp'),200);
evalGame("startGame();enemies=[makeEnemy(player.x+300,player.y,'kicker')];enemies[0].attackClock=0;updateEnemies(.01)");
assert.equal(evalGame('enemies[0].windup'),.9);
assert.equal(evalGame('enemyProjectiles.length'),0,'The unlucky classmate appears during preparation before becoming a projectile');
evalGame("enemies[0].windup=.01;updateEnemies(.02)");assert.equal(evalGame('enemyProjectiles[0].type'),'unlucky');
evalGame("enemyProjectiles[0].x=player.x;enemyProjectiles[0].y=player.y;enemyProjectiles[0].vx=0;enemyProjectiles[0].vy=0;updateEnemyProjectiles(.01)");
assert.equal(evalGame('player.hp'),186);assert.equal(evalGame('enemyProjectiles.length'),0);
evalGame("enemies[0].targetX=player.x;enemies[0].throwAngle=0;kickUnlucky(enemies[0]);enemyProjectiles[0].x=player.x+200;enemyProjectiles[0].y=player.y;enemyProjectiles[0].vx=0;updateEnemyProjectiles(2.41)");
assert.equal(evalGame('player.hp'),186);assert.equal(evalGame('enemyProjectiles.length'),0,'Missed unlucky projectiles expire');
for(const [kind,lesson,roll] of [['megaphone',11,.84],['kicker',12,.9]]) {
  math.random=()=>roll;evalGame(`gameTime=(${lesson}-1)*LESSON_LENGTH`);assert.equal(evalGame('regularEnemyKind()'),kind);
  evalGame(`gameTime=(${lesson}-2)*LESSON_LENGTH`);assert.notEqual(evalGame('regularEnemyKind()'),kind);
}
evalGame("startGame();for(const kind of ['megaphone','kicker']){const e=makeEnemy(player.x+100,player.y,kind);e.windup=.3;e.throwAngle=0;drawEnemy(e,1);}drawEnemyProjectile({type:'sound-wave',x:player.x,y:player.y,vx:1,vy:0,angle:0});drawEnemyProjectile({type:'unlucky',x:player.x,y:player.y,vx:1,vy:0,angle:1});player.stunTime=1;drawPlayer(1)");

// Classroom, opening, chapter dialogue, journal, and both endings stay connected.
math.random=()=>.999;evalGame('startGame()');
assert.equal(evalGame('player.hp'),200);assert.equal(evalGame('player.maxHp'),200);
assert.equal(elements['hp-text'].textContent,'200 / 200');
assert.equal(evalGame('narrativeHistory.length'),1);assert.equal(elements['chapter-dialogue'].hidden,false);
const firstDialogueText=elements['dialogue-text'].textContent;
evalGame('updateNarrative(0)');assert.equal(evalGame('narrativeHistory.length'),1,'A chapter cannot repeat each frame');
evalGame("mode='paused';update(2)");assert.equal(elements['dialogue-text'].textContent,firstDialogueText);
assert.equal(evalGame('dialogueTime'),15,'Pause holds dialogue timeout');
click('dialogue-next');assert.equal(elements['chapter-dialogue'].hidden,true);
evalGame("mode='playing';gameSpeed=3;updateNarrative(.3)");assert.equal(evalGame('narrativeHistory.length'),1);
evalGame("gameTime=60;updateNarrative(0);const heldDialogueTime=dialogueTime;updateNarrative(.3)");
assert(Math.abs(evalGame('heldDialogueTime-dialogueTime')-.1)<1e-8,'Dialogue reading time stays the same at triple speed');
evalGame("gameTime=270;spawnedBosses.add('mini1');enemies=[makeEnemy(player.x+300,player.y,'mini2'),makeEnemy(player.x-300,player.y,'mini2')];damageEnemy(enemies[0],99999,'pistol')");
assert.equal(evalGame("narrativeSeen.has('boss-defeat-mini2')"),false,'One cyclist does not trigger the victory dialogue');
evalGame("damageEnemy(enemies.find(e=>e.kind==='mini2'&&e.hp>0),99999,'pistol')");
assert.equal(evalGame("narrativeHistory.filter(e=>e.title===BOSS_DIALOGUE.mini2.defeat.title).length"),1);
assert(elements['pause-story-log'].children.length>1);
evalGame('finishGame(true)');assert(elements['end-epilogue'].textContent.includes('歡迎加入 102 班'));assert.equal(elements['chapter-dialogue'].hidden,true);
evalGame('startGame();finishGame(false)');assert(elements['end-epilogue'].textContent.includes('下次'));
evalGame('startGame()');assert.equal(evalGame('narrativeHistory.length'),1,'Restart begins a fresh story journal');
click('practice-btn');assert.equal(elements['chapter-dialogue'].hidden,true,'Combat dialogue stays out of practice');
click('skip-tutorial');
const classroomTexts=[];drawing.fillText=(text)=>classroomTexts.push(text);evalGame('drawClassroom()');delete drawing.fillText;
assert(classroomTexts.includes('國中 102 班'));assert(classroomTexts.includes('102 班課表'));assert(classroomTexts.includes('102 班公布欄'));assert(classroomTexts.includes('102 班'));
assert(evalGame('STORY.every(page=>page.title&&page.text&&page.scene>=1&&page.scene<=3)'));
// Cinematics use a separate real-time clock and never advance the classroom simulation.
evalGame('startStory();gameSpeed=3;const movieGameTime=gameTime;lastFrame=0;frame(1000)');
assert.equal(evalGame('storyAnimationTime'),.1);assert.equal(evalGame('gameTime'),evalGame('movieGameTime'));
click('story-next');assert.equal(evalGame('storyAnimationTime'),0,'Changing pages restarts the scene animation');
for(let page=0;page<8;page++)evalGame(`drawStoryFrame($('story-canvas').getContext('2d'),${page},0);drawStoryFrame($('story-canvas').getContext('2d'),${page},3);drawStoryFrame($('story-canvas').getContext('2d'),${page},3,true)`);
click('story-skip');assert.equal(evalGame('mode'),'tutorial','Animation never blocks skipping to practice');
assert.equal(evalGame('gameTime'),0);
const entranceCalls=[];let entranceCancels=0;
elements['chapter-dialogue'].animate=(_frames,options)=>{entranceCalls.push(options);return {cancel(){entranceCancels++;}};};
evalGame('storyReducedMotion=false;startGame()');assert.equal(entranceCalls.length,1);
evalGame("queueNarrative('boss-arrival-mini1',BOSS_DIALOGUE.mini1.arrival)");click('dialogue-next');
assert.equal(entranceCalls.at(-1).duration,550);assert.equal(entranceCancels,1,'Advancing dialogue cancels the old entrance');
evalGame('storyReducedMotion=true;startGame()');assert.equal(entranceCalls.length,2,'Reduced motion skips dialogue entrance animation');
evalGame('finishGame(true);frame(1100)');assert.equal(evalGame('endingWon'),true);assert.equal(evalGame('storyAnimationTime'),.1);
evalGame('startGame();finishGame(false)');assert.equal(evalGame('endingWon'),false);assert.equal(evalGame('storyAnimationTime'),0);
delete elements['chapter-dialogue'].animate;evalGame('storyReducedMotion=false;startGame()');
const standalone = fs.readFileSync("play.html", "utf8");
// Strengthened bosses change attacks at half health without losing their windup cues.
evalGame("startGame();enemies=[makeEnemy(player.x+250,player.y,'mini1')];enemies[0].hp=enemies[0].maxHp/2;enemies[0].attackClock=0;updateEnemies(.01)");
assert.equal(evalGame('enemies[0].maxHp'),1600);assert.equal(evalGame('enemies[0].windup'),.55);
assert.equal(evalGame("effects.filter(e=>e.type==='boss-enrage').length"),1);
evalGame('enemies[0].windup=.01;updateEnemies(.02);updateHud()');
assert.equal(evalGame('enemyProjectiles.length'),7);assert.equal(evalGame('enemies[0].attackClock'),.95);
assert(Math.abs(evalGame('Math.hypot(enemyProjectiles[0].vx,enemyProjectiles[0].vy)')-340)<1e-8);
assert(elements['boss-name'].textContent.includes('暴走'));
evalGame('updateEnemies(.01)');assert.equal(evalGame("effects.filter(e=>e.type==='boss-enrage').length"),1,'Rage introduction occurs once');
evalGame("startGame();enemies=[makeEnemy(player.x+300,player.y,'mini2')];enemies[0].memberIndex=1;enemies[0].hp=enemies[0].maxHp/2;enemies[0].windup=.01;enemies[0].throwAngle=Math.PI;updateEnemies(.02)");
assert.equal(evalGame('enemyProjectiles.length'),3);assert.equal(evalGame('enemies[0].maxHp'),1500);
evalGame("startGame();enemies=[makeEnemy(player.x+300,player.y,'mini2')];enemies[0].memberIndex=0;enemies[0].hp=enemies[0].maxHp/2;enemies[0].attackClock=0;updateEnemies(.01)");
assert.equal(evalGame('enemies[0].windup'),.6);
assert(Math.abs(evalGame('Math.hypot(enemies[0].lungeVX,enemies[0].lungeVY)')-840)<1e-8);
for(const [rage,count] of [[false,5],[true,10]]) {
  evalGame(`startGame();enemies=[makeEnemy(player.x+250,player.y,'final')];enemies[0].hp=${rage?'enemies[0].maxHp/2':'enemies[0].maxHp'};enemies[0].lungeTime=.01;enemies[0].attackClock=10;updateEnemies(.02)`);
  assert.equal(evalGame("enemyProjectiles.filter(p=>p.type==='boss-wave').length"),count);
  assert.equal(evalGame('enemies[0].maxHp'),7000);
  evalGame('updateEnemies(.02)');assert.equal(evalGame('enemyProjectiles.length'),count,'A charge emits its shockwave only once');
  evalGame('enemyProjectiles[0].x=player.x;enemyProjectiles[0].y=player.y;enemyProjectiles[0].vx=0;enemyProjectiles[0].vy=0;updateEnemyProjectiles(.001)');
  assert.equal(evalGame('player.hp'),178);
  evalGame('drawEnemyProjectile({type:"boss-wave",x:player.x,y:player.y,vx:1,vy:0});for(const e of effects)drawEffect(e)');
}
// Every encounter clears ordinary enemies and hazards while retaining equipment and drops.
for(const boss of ['mini1','mini2','final']) {
  evalGame(`startGame();for(const b of BOSS_SCHEDULE)if(b.id!=='${boss}'){spawnedBosses.add(b.id);defeatedBosses.add(b.id);}gameTime=(BOSS_SCHEDULE.find(b=>b.id==='${boss}').lesson-1)*LESSON_LENGTH;enemies=['basic','water','spider','dog','megaphone','kicker'].map(kind=>makeEnemy(player.x+250,player.y,kind));var disappearingTarget=enemies[0];player.weapons.plane=1;shootAt(disappearingTarget,'plane',310,16);pickups=[{x:player.x+300,y:player.y,type:'xp',value:1,r:8,age:0}];enemyProjectiles=[{type:'unlucky',x:player.x,y:player.y,vx:0,vy:0,r:18,damage:14,life:1,angle:0}];for(const type of ['enemy-trap','wet-tissue'])addEffect(player.x,player.y,type,{radius:22,duration:8});spawnScheduledBosses()`);
  assert(evalGame('enemies.every(e=>e.boss)'));assert.equal(evalGame('enemyProjectiles.length'),0);
  assert.equal(evalGame("effects.some(e=>['enemy-trap','wet-tissue'].includes(e.type))"),false);
  assert.equal(evalGame('kills'),0);assert.equal(evalGame('pickups.length'),1);
  assert.equal(evalGame('player.weapons.plane'),1);assert.equal(evalGame('projectiles.length'),1);
  assert.equal(evalGame('disappearingTarget.hp'),0,'Homing tools stop tracking a disappeared enemy');
  assert.equal(evalGame('enemies.length'),boss==='mini2'?2:1);
  evalGame('spawnScheduledBosses()');assert.equal(evalGame('enemies.length'),boss==='mini2'?2:1,'An encounter does not repeat or remove its own members');
}
// Each of the three starter choices follows the same complete pickup/evolution lesson.
for(const id of ['pistol','firecracker']) {
  click('practice-btn');assert.equal(evalGame('tutorialStep'),0);
  evalGame('enterTutorialStep(3)');
  const choiceIndex=evalGame(`upgradeChoices.findIndex(w=>w.id==='${id}')`);
  document.listeners.keydown({key:String(choiceIndex+1)});
  assert.equal(evalGame('tutorialToolId'),id);
  tutorialCollect();runUntilTutorialStep(6);
  for(let level=2;level<=5;level++) {
    tutorialCollect();document.listeners.keydown({key:'1'});tutorialCollect();
    assert.equal(evalGame(`player.weapons.${id}`),level);
  }
  const talent=evalGame(`matchingTalent('${id}').id`);
  assert.equal(evalGame('upgradeChoices[0].id'),talent);
  document.listeners.keydown({key:'1'});tutorialCollect();
  assert.equal(evalGame(`isEvolved('${id}')`),true);
  runUntilTutorialStep(10);
  click('skip-tutorial');assert.equal(evalGame('mode'),'playing');
  assert.equal(evalGame('enemies.length'),0,"Skipping clears protected practice enemies");
  assert.equal(evalGame('Object.values(player.weapons).every(level=>level===0)'),true);
}
click('tutorial-replay-btn');assert.equal(evalGame('mode'),'tutorial');
evalGame('enterTutorialStep(3)');click('upgrade-skip-tutorial');
assert.equal(evalGame('mode'),'playing',"The upgrade overlay also offers a working tutorial skip");
evalGame('gainExperience(player.xpNeed)');assert.equal(elements['tutorial-upgrade-guide'].hidden,true,"Tutorial guide does not appear in real upgrade screens");
click('practice-btn');evalGame('enterTutorialStep(14)');click('pause-btn');click('pause-restart-btn');
assert.equal(evalGame('mode'),'tutorial');assert.equal(evalGame('tutorialStep'),0,"Restarting paused tutorial restarts the lesson");
click('skip-tutorial');
assert(standalone.includes(source.trim()), "Rebuild play.html so the standalone game includes the latest code");
// Martial enemies complete a warned movement, a warned strike, and a recovery.
function martialSetup(kind) {
  evalGame(`startGame();enemies=[makeEnemy(player.x+200,player.y,'${kind}')];enemies[0].attackClock=0;updateEnemies(.01)`);
}
function martialUntil(condition) {
  for(let i=0;i<200&&!evalGame(condition);i++)evalGame('updateEnemies(.02)');
  assert(evalGame(condition),`Martial phase did not complete: ${condition}`);
}
martialSetup('boxer');
assert.equal(evalGame('enemies[0].martialMove'),'step');
assert.equal(evalGame('player.hp'),200);
martialUntil("enemies[0].martialMove==='uppercut'");
assert(Math.abs(evalGame('enemies[0].y-player.y'))>50,'The sidestep actually moves sideways');
assert.equal(evalGame('player.hp'),200,'The sidestep itself does not damage the player');
assert.equal(evalGame('enemies[0].windup'),.5);
martialUntil('enemies[0].martialRecovery>0');
assert.equal(evalGame('player.hp'),180,'The uppercut deals its damage once');
evalGame('player.invulnerable=0;updateEnemies(.1)');assert.equal(evalGame('player.hp'),180);
martialSetup('boxer');martialUntil("enemies[0].martialMove==='uppercut'");
evalGame('player.x=enemies[0].x-Math.cos(enemies[0].throwAngle)*70;player.y=enemies[0].y-Math.sin(enemies[0].throwAngle)*70');
martialUntil('enemies[0].martialRecovery>0');assert.equal(evalGame('player.hp'),200,'Moving behind the locked uppercut dodges it');
martialSetup('striker');assert.equal(evalGame('enemies[0].windup'),.65);
martialUntil('enemies[0].lungeTime>0');
martialUntil("enemies[0].martialMove==='heavy'");
assert.equal(evalGame('player.hp'),180,'The flying kick hits during travel');
assert.equal(evalGame('enemies[0].windup'),.75);
evalGame('player.invulnerable=0;player.x=enemies[0].targetX;player.y=enemies[0].targetY');
martialUntil('enemies[0].martialRecovery>0');assert.equal(evalGame('player.hp'),154,'The heavy strike damages its warned circle');
martialSetup('striker');
evalGame('player.y+=200');
martialUntil("enemies[0].martialMove==='heavy'");
assert.equal(evalGame('player.hp'),200,'The flying kick keeps the warned direction');
evalGame('player.x=enemies[0].targetX+180;player.y=enemies[0].targetY');
martialUntil('enemies[0].martialRecovery>0');assert.equal(evalGame('player.hp'),200,'Leaving the locked circle dodges the heavy strike');
for(const kind of ['boxer','striker']) {
  martialSetup(kind);
  evalGame('enemies[0].stunTime=1;var martialWindup=enemies[0].windup;updateEnemies(.1)');
  assert.equal(evalGame('enemies[0].windup'),evalGame('martialWindup'),'Tool stuns delay attacks');
  evalGame('mode="paused";advanceSimulation(.1)');assert.equal(evalGame('enemies[0].windup'),evalGame('martialWindup'));
  evalGame('mode="upgrade";advanceSimulation(.1)');assert.equal(evalGame('enemies[0].windup'),evalGame('martialWindup'));
  evalGame('mode="playing";enemies[0].stunTime=0');
  martialUntil('enemies[0].lungeTime>0');
  evalGame('drawEnemy(enemies[0],1);for(const e of effects)drawEffect(e)');
  martialUntil('enemies[0].windup>0');evalGame('drawEnemy(enemies[0],1)');
  martialUntil('enemies[0].martialRecovery>0');evalGame('for(const e of effects)drawEffect(e)');
  evalGame('gameTime=270;spawnScheduledBosses()');
  assert.equal(evalGame('enemies.some(e=>!e.boss)'),false,'Boss arrival removes the martial enemies');
  assert.equal(evalGame('effects.some(e=>e.type.startsWith("martial-"))'),false);
}
for(const [kind,lesson,roll] of [['boxer',13,.02],['striker',14,.1]]) {
  math.random=()=>roll;evalGame(`gameTime=(${lesson}-1)*LESSON_LENGTH`);assert.equal(evalGame('regularEnemyKind()'),kind);
  evalGame(`gameTime=(${lesson}-2)*LESSON_LENGTH`);assert.notEqual(evalGame('regularEnemyKind()'),kind);
}
math.random=()=>.999;evalGame('gameTime=870');assert.equal(evalGame('regularEnemyKind()'),'basic','Basic enemies remain in the late game pool');
// Simultaneous pickups must survive the exact moment an upgrade pauses the world.
evalGame("startGame();player.xp=player.xpNeed-1;pickups=Array.from({length:3},()=>({x:player.x,y:player.y,r:8,type:'xp',value:1,age:0}));updatePickups(0)");
assert.equal(evalGame('mode'),'upgrade');assert.equal(evalGame('pickups.length'),2,'Unprocessed experience remains on the floor');
document.listeners.keydown({key:'1',repeat:true});assert.equal(evalGame('mode'),'upgrade','Holding a selection key does not auto-select');
evalGame('chooseUpgrade(upgradeChoices.find(canChooseUpgrade).id);updatePickups(0)');
assert.equal(evalGame('player.xp'),2,'All remaining experience can still be collected');
assert.equal(evalGame("pickups.filter(p=>p.type==='xp').length"),0);
evalGame("startGame();spawnClock=100;player.hp=1;player.healthRegen=0;enemies=[makeEnemy(player.x,player.y)];enemies[0].lungeTime=1;pickups=[{x:player.x,y:player.y,r:8,type:'xp',value:1,age:0}];var deathEnemyHp=enemies[0].hp;update(.02)");
assert.equal(evalGame('mode'),'ended');assert.equal(evalGame('enemies[0].hp'),evalGame('deathEnemyHp'),'No player attack happens after a fatal enemy hit');
assert.equal(evalGame('pickups.length'),1);assert.equal(evalGame('player.xp'),0);
evalGame("startGame();spawnClock=100;player.xp=player.xpNeed;addEffect(player.x,player.y,'burst',{duration:1});update(.02)");
assert.equal(evalGame('mode'),'upgrade');assert.equal(evalGame('effects[0].age'),0,'Effects freeze as soon as the upgrade opens');
// Touch ownership and app lifecycle never leave a stuck movement vector.
click('quick-start-btn');
elements.joystick.listeners.pointerdown({pointerId:1,clientX:115,clientY:58});
assert(evalGame('pointer.x>0'));
elements.joystick.listeners.pointerdown({pointerId:2,clientX:0,clientY:58});
assert.equal(evalGame('pointer.id'),1,'A second finger cannot steal the active stick');
elements.joystick.listeners.lostpointercapture({pointerId:1});assert.equal(evalGame('pointer.x'),0);
elements.joystick.listeners.pointerdown({pointerId:3,clientX:115,clientY:58});
evalGame("keys.add('d')");window.listeners.blur();
assert.equal(evalGame('mode'),'paused');assert.equal(evalGame('keys.size'),0);assert.equal(evalGame('pointer.active'),false);
document.listeners.keydown({key:'d'});assert.equal(evalGame('keys.size'),0,'Movement keys pressed in menus do not stick');
click('resume-btn');evalGame('var resumedX=player.x;spawnClock=100;advanceSimulation(.1)');assert.equal(evalGame('player.x'),evalGame('resumedX'));
document.hidden=true;document.listeners.visibilitychange();assert.equal(evalGame('mode'),'paused');
document.hidden=false;document.listeners.visibilitychange();assert.equal(evalGame('mode'),'paused','Returning to the tab waits for an explicit resume');
// Pause inventory explains both pending pickups and completed evolution.
evalGame("startGame();player.weapons.blueberry=5;player.talents.harvest=true;pickups=[{type:'talent',talentId:'focus',x:100,y:100}];togglePause()");
const guideText=elements['loadout-guide'].children.map(row=>row.children.map(child=>child.textContent).join(' ')).join(' ');
assert(guideText.includes('超級進化'));assert(guideText.includes('待拾取'));
assert(guideText.includes('鉛筆'));
// Only offscreen equipment and living bosses need navigation hints.
evalGame("startGame();camera={x:500,y:500};cw=800;ch=600;scale=1;pickups=[{type:'xp',x:0,y:0},{type:'weapon',weaponId:'bow',x:50,y:300}];enemies=[makeEnemy(1700,1000,'mini1')]");
assert.equal(evalGame('navigationHints().length'),2);evalGame('drawNavigationHints()');
evalGame('pickups[1].x=900;pickups[1].y=700;enemies[0].hp=0');assert.equal(evalGame('navigationHints().length'),0);
evalGame("mode='paused'");assert.equal(evalGame('navigationHints().length'),0);
evalGame('startGame();player.hp=40;updateHud()');assert.equal(elements['hp-warning'].hidden,false);
evalGame('player.hp=100;player.xp=999;updateHud()');assert.equal(elements['hp-warning'].hidden,true);assert.equal(elements['xp-fill'].style.width,'100%');
assert(standalone.includes(fs.readFileSync('polish.css','utf8').trim()),'The standalone game includes responsive polish styles');
// Acceleration updates the HUD once, and drawing optimizations retain distant warnings.
let hpWrites=0,hpDisplay=elements['hp-text'].textContent;
Object.defineProperty(elements['hp-text'],'textContent',{configurable:true,get(){return hpDisplay;},set(value){hpWrites++;hpDisplay=value;}});
evalGame('startGame();spawnClock=100;gameSpeed=3;player.hp=80');hpWrites=0;
evalGame('advanceSimulation(.1)');assert.equal(hpWrites,1);assert.equal(hpDisplay,'81 / 200');
evalGame("startGame();cw=800;ch=600;scale=1;enemies=[makeEnemy(50,90),makeEnemy(60,90),makeEnemy(player.x+80,player.y)];enemies[1].windup=.5;var savedDrawEnemy=drawEnemy;var drawnEnemyCount=0;drawEnemy=(...args)=>{drawnEnemyCount++;savedDrawEnemy(...args);};render(1);drawEnemy=savedDrawEnemy");
assert.equal(evalGame('drawnEnemyCount'),2,'An offscreen attack warning remains drawable while idle offscreen enemies are skipped');
console.log("PASS: 14 enemies, story/tutorial/evolution, boss rules, lossless XP, fatal-hit freeze, touch/visibility pause, loadout guide, navigation, and standalone build");
