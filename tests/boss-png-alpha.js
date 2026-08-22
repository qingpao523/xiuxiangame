"use strict";
/* BOSS_ICONS PNGs must be true cutouts (transparent canvas), not a keyed plate.
 * Reads the shipped mapping in web/js/ui-constants.js and inspects those files.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "web/js/ui-constants.js"), "utf8");
const m = SRC.match(/const BOSS_ICONS = \{([\s\S]*?)\n\};/);
if (!m) { console.error("BOSS_ICONS missing"); process.exit(1); }
const rels = [...m[1].matchAll(/"(assets\/[^"]+\.png)"/g)].map((x) => x[1]);
if (!rels.length) { console.error("no boss png paths"); process.exit(1); }

const py = `
import json, sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p).convert("RGBA")
w, h = im.size
px = im.load()
n = w * h
trans = 0
lime = 0
for y in range(h):
    for x in range(w):
        r,g,b,a = px[x,y]
        if a == 0:
            trans += 1
        elif g > r + 25 and g > b + 20 and g > 140:
            lime += 1
corners = [px[2,2][3], px[w-3,2][3], px[2,h-3][3], px[w-3,h-3][3]]
print(json.dumps({"w":w,"h":h,"trans":trans/n,"lime":lime/n,"corner_a":corners}))
`;

let fail = 0;
for (const rel of rels) {
  const abs = path.join(ROOT, "web", rel);
  const raw = execFileSync("python3", ["-c", py, abs], { encoding: "utf8" });
  const st = JSON.parse(raw);
  const okCorner = st.corner_a.every((a) => a === 0);
  const okTrans = st.trans >= 0.5;
  const okLime = st.lime < 0.02;
  const pass = okCorner && okTrans && okLime;
  console.log(rel, JSON.stringify(st), pass ? "PASS" : "FAIL");
  if (!pass) fail++;
}
if (fail) process.exit(1);
console.log("PASS", rels.length);
