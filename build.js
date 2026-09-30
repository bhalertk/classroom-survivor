const fs = require("node:fs");

let html = fs.readFileSync("index.html", "utf8");
for (const file of ["style.css", "story.css"]) {
  html = html.replace(`<link rel="stylesheet" href="${file}">`, `<style>\n${fs.readFileSync(file, "utf8")}\n</style>`);
}
html = html.replace('<script src="game.js" defer></script>', `<script>\n${fs.readFileSync("game.js", "utf8")}\n</script>`);
fs.writeFileSync("play.html", html, "utf8");
console.log("Created play.html");
