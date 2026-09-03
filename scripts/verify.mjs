import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const catalogSource = readFileSync(join(root, "src/random/gamelayout.js"), "utf8");
const games = vm.runInNewContext(`${catalogSource}\n;G_DATA`);
const slugify = value => value.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const errors = [];

if (games.length !== 106) errors.push(`Expected 106 games, found ${games.length}`);
if (new Set(games.map(game => String(game.id))).size !== games.length) errors.push("Game IDs must be unique");
for (const game of games) {
  if (!/^https:\/\//.test(game.url)) errors.push(`${game.n}: invalid launch URL`);
  for (const kind of ["cover", "hero"]) {
    const file = join(root, "src/assets/games", slugify(game.n), `${kind}.webp`);
    if (!existsSync(file) || statSync(file).size < 2000) errors.push(`${game.n}: missing ${kind}.webp`);
  }
}
for (const required of ["src/index.html", "src/styles.css", "src/app.js"]) if (!existsSync(join(root, required))) errors.push(`Missing ${required}`);
const interfaceSource = ["src/index.html", "src/styles.css", "src/app.js"].map(file => readFileSync(join(root, file), "utf8")).join("\n");
if (/Cine[- ]Cloud|Cine Softwares/i.test(interfaceSource)) errors.push("Legacy branding remains in the interface");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Verified ${games.length} games, ${games.length * 2} optimized images, launch URLs, and Emrys interface files.`);
