const fs = require("node:fs");

let html = fs.readFileSync("index.html", "utf8");
for (const file of ["style.css", "story.css", "tools.css", "polish.css"]) {
  html = html.replace(`<link rel="stylesheet" href="${file}">`, `<style>\n${fs.readFileSync(file, "utf8")}\n</style>`);
}
html = html.replace('<script src="game.js" defer></script>', `<script>\n${fs.readFileSync("game.js", "utf8")}\n</script>`);
for (const file of ["enemy19-moves.svg", "enemy20-moves.svg"]) {
  const data = fs.readFileSync(file).toString("base64");
  html = html.replaceAll(file, `data:image/svg+xml;base64,${data}`);
}
fs.writeFileSync("play.html", html, "utf8");
console.log("Created play.html");
