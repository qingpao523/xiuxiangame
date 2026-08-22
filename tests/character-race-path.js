"use strict";
/* Race-specific portraits: yao must not reuse the human girl, and portraits must be transparent PNGs. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "web/js/ui-constants.js"), "utf8");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src + "\nthis.CHARACTER_PATHS = CHARACTER_PATHS; this.getCharacterPath = getCharacterPath;", sandbox);

const human = sandbox.getCharacterPath({ race_id: "human" });
const yao = sandbox.getCharacterPath({ race_id: "yao" });

let fail = 0;
function ok(cond, msg) {
  if (!cond) { fail++; console.log("FAIL", msg); }
  else console.log("PASS", msg);
}

ok(human.indexOf("char_cultivator") >= 0 && !human.includes("yao"), "human 炼气 uses cultivator portrait");
ok(yao.indexOf("char_yao_cultivator") >= 0, "yao 炼气 uses yao cultivator portrait");
ok(human !== yao, "yao portrait path differs from human");

const py = `
import json, sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p).convert("RGBA")
w,h = im.size
px = im.load()
n=w*h
trans=sum(1 for y in range(h) for x in range(w) if px[x,y][3]==0)
corners=[px[2,2][3], px[w-3,2][3], px[2,h-3][3], px[w-3,h-3][3]]
print(json.dumps({"trans":trans/n,"corner_a":corners,"mode":im.mode}))
`;

for (const rel of [human, yao]) {
  const abs = path.join(ROOT, "web", rel);
  ok(fs.existsSync(abs) && fs.statSync(abs).size > 0, "exists " + rel);
  const st = JSON.parse(execFileSync("python3", ["-c", py, abs], { encoding: "utf8" }));
  ok(st.corner_a.every((a) => a === 0), "transparent corners " + rel);
  ok(st.trans >= 0.5, "trans>=50% " + rel + " " + st.trans);
}

if (fail) process.exit(1);
console.log("PASS");
