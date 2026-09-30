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
    setPointerCapture() {}
  };
}
const elements = Object.fromEntries(ids.map(id => [id, element()]));
const drawing = new Proxy({}, { get(_target, key) {
  if (key === "createRadialGradient") return () => ({ addColorStop() {} });
  return () => {};
} });
elements.game.getContext = () => drawing;
const document = { getElementById: id => elements[id], createElement: element, addEventListener() {} };
const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
const math = Object.create(Math);
math.random = () => 0;
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
evalGame("enemies = [makeEnemy(player.x + 80, player.y)]; enemies[0].windup = .01; updateEnemies(.02)");
assert.equal(evalGame("enemies.length"), 101);
evalGame("enemies = [makeEnemy(player.x + 80, player.y)]; player.weapons.firecracker = 1; shootAt(enemies[0], 'firecracker', 320, 45); projectiles[0].x = enemies[0].x; projectiles[0].y = enemies[0].y; updateProjectiles(.001)");
assert.equal(evalGame("projectiles.length"), 0);
assert.equal(evalGame("effects.some(effect => effect.type === 'explosion')"), true);
console.log("PASS: menu, story, tutorial, upgrade pickup, and 1% summon path");
