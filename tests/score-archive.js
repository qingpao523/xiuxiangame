"use strict";
/* Parse design/9.3 §六 待重绘 filenames vs §七 通过 rows with 总分 ≥95. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const md = fs.readFileSync(path.join(ROOT, "design/9.3 美术素材验收评分标准 v0.1.md"), "utf8");

const i6 = md.indexOf("## 六、全量清单");
const i7 = md.indexOf("## 七、本轮评分档案");
const i8 = md.indexOf("## 八、和旧口径的关系");
if (i6 < 0 || i7 < 0 || i8 < 0) {
  console.error("missing section markers");
  process.exit(1);
}
const sec6 = md.slice(i6, i7);
const sec7 = md.slice(i7, i8);

const pending = new Set();
for (const line of sec6.split("\n")) {
  if (!line.includes("待重绘")) continue;
  const m = line.match(/`([^`]+\.(?:jpg|png))`/);
  if (m) pending.add(path.basename(m[1]));
}

const passed = {};
for (const line of sec7.split("\n")) {
  if (!line.startsWith("| ")) continue;
  const cols = line.split("|").map((s) => s.trim()).filter((s, i, a) => i > 0 && i < a.length - 1);
  if (cols.length < 8) continue;
  if (cols[0] === "素材") continue;
  if (cols[0].startsWith("---")) continue;
  const name = cols[0];
  const total = parseInt(cols[7], 10);
  const verdict = cols[cols.length - 1];
  if (verdict === "通过" && Number.isFinite(total) && total >= 95 && cols[1] === "过") {
    passed[name] = total;
  }
}

const report = { pending: [...pending].sort(), passed, missing: [], low: [] };
let fail = 0;
for (const name of pending) {
  if (passed[name] == null) {
    report.missing.push(name);
    fail++;
    console.log("FAIL missing 通过 row", name);
  }
}

console.log("pending", pending.size, "passed_rows", Object.keys(passed).length, "missing", report.missing.length);
if (fail) process.exit(1);
const out = process.env.SCORE_ARCHIVE_JSON;
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("PASS");
