"use strict";
/* Assert every path in ui-constants mapping objects exists on disk with non-zero size. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "web/js/ui-constants.js"), "utf8");

const MAPS = [
  "ICON_PATHS",
  "SPELL_ICONS",
  "TREASURE_ICONS",
  "CHARACTER_PATHS",
  "BOSS_ICONS",
  "NPC_ICONS",
];

function grab(name) {
  const re = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`);
  const m = SRC.match(re);
  if (!m) throw new Error("missing object " + name);
  return [...m[1].matchAll(/"(assets\/[^"]+)"/g)].map((x) => x[1]);
}

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log("FAIL", msg); }
}

for (const name of MAPS) {
  const paths = grab(name);
  ok(paths.length > 0, name + " has paths");
  for (const rel of paths) {
    const abs = path.join(ROOT, "web", rel);
    const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
    ok(!!st && st.size > 0, name + " " + rel + (st ? " size=" + st.size : " MISSING"));
  }
}

console.log("PASS", pass, "FAIL", fail);
if (fail) process.exit(1);
