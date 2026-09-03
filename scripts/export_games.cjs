const fs = require("fs");
const path = require("path");
const vm = require("vm");

const catalog = path.join(__dirname, "..", "src", "random", "gamelayout.js");
const source = `${fs.readFileSync(catalog, "utf8")}\n;JSON.stringify(G_DATA);`;
process.stdout.write(vm.runInNewContext(source));
