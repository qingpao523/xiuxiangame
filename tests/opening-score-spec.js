"use strict";
/**
 * Parse design/9.5 opening score archive.
 * Usage: node tests/opening-score-spec.js [spec|plan|impl]
 * Default: spec (system gates only).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOC = path.join(ROOT, "design/9.5 开局第一眼至择后首页验收评分标准 v0.2.md");
const md = fs.readFileSync(DOC, "utf8");
const mode = process.argv[2] || "spec";

const fail = (m) => { console.error("FAIL", m); process.exitCode = 1; };
const ok = (m) => console.log("ok ", m);

if (!md.includes("第一眼")) fail("missing 第一眼");
else ok("第一眼");
if (!md.includes("择跟脚")) fail("missing 择跟脚");
else ok("择跟脚");
if (!md.includes("首页")) fail("missing 首页");
else ok("首页");
if (!/≥\s*95|>=\s*95/.test(md) && !md.includes("≥95")) fail("missing ≥95 通过");
else ok("≥95 通过");

const redHits = [];
if (/CSS冒充成品|冒充成品/.test(md)) redHits.push("CSS冒充成品");
if (/半屏新旧混用|新旧混用/.test(md)) redHits.push("半屏新旧混用");
if (/无封神锚点|封神锚点/.test(md)) redHits.push("无封神锚点");
if (redHits.length < 3) fail("红线不足 3: " + redHits.join(","));
else ok("红线 " + redHits.join(" / "));

function section(title) {
  const start = md.indexOf(title);
  if (start < 0) return "";
  const next = md.indexOf("\n## ", start + title.length);
  return next < 0 ? md.slice(start) : md.slice(start, next);
}

const weightSec = section("## 二、百分制栏位");
let weightSum = 0;
const weightRows = [];
for (const line of weightSec.split("\n")) {
  if (!line.startsWith("| ")) continue;
  const cols = line.split("|").map((s) => s.trim()).filter((s, i, a) => i > 0 && i < a.length - 1);
  if (!cols.length) continue;
  if (cols[0] === "栏" || cols[0].startsWith("---")) continue;
  const w = parseInt(cols[1], 10);
  if (!Number.isFinite(w)) continue;
  weightRows.push({ col: cols[0], w });
  weightSum += w;
}
if (weightSum !== 100) fail("栏位权重之和=" + weightSum + " 行=" + JSON.stringify(weightRows));
else ok("栏位权重之和 100 (" + weightRows.map((r) => r.col + r.w).join("+") + ")");

function parseScoreTable(secTitle) {
  const sec = section(secTitle);
  if (!sec) return null;
  const rows = [];
  let total = null;
  let redline = false;
  for (const line of sec.split("\n")) {
    if (!line.startsWith("| ")) continue;
    const cols = line.split("|").map((s) => s.trim()).filter((s, i, a) => i > 0 && i < a.length - 1);
    if (cols.length < 3) continue;
    if (cols[0] === "栏" || cols[0].startsWith("---")) continue;
    const score = parseInt(cols[2], 10);
    if (cols[0].includes("合计")) {
      total = score;
      if (/红线/.test(cols.slice(2).join(" "))) redline = true;
      continue;
    }
    if (!Number.isFinite(score)) continue;
    if (String(cols[2]).includes("红线") || String(cols[3] || "").startsWith("红线")) redline = true;
    rows.push({ col: cols[0], weight: parseInt(cols[1], 10), score, note: cols[3] || "" });
  }
  return { rows, total, redline, raw: sec };
}

const css = fs.readFileSync(path.join(ROOT, "web/style.css"), "utf8");
const prologChunk = css.split("#prologue-layer")[1] || "";
if (/prologue-layer\[data-scene="[123]"\]::before[\s\S]{0,180}bg_chentang|prologue-layer\[data-scene="[123]"\]::before[\s\S]{0,180}bg_bone/.test(css)) {
  fail("卷首仍切到陈塘/骷髅旧图");
} else ok("卷首不切陈塘/骷髅");
if (!css.includes("bg_mountain_cave.jpg")) fail("择跟脚/首页未使用洞府底");
else ok("择跟脚/首页使用洞府底");
if (!css.includes("race-fog")) fail("择跟脚无雾中未醒");
else ok("择跟脚有雾中未醒");
const ws = fs.readFileSync(path.join(ROOT, "web/js/world-scroll.js"), "utf8");
if (!ws.includes("prologue_wake.jpg") || !ws.includes("prologue_gold.jpg") || !ws.includes("prologue_breathe.jpg")) {
  fail("卷首未挂三帧定帧");
} else ok("卷首三帧定帧");
if (!ws.includes("你睁开眼") || !ws.includes("盘膝吐纳")) fail("走查关键字被改");
else ok("走查关键字仍在");

if (mode === "spec") {
  console.log("SPEC_OK weights=" + weightSum + " redlines=" + redHits.length);
} else if (mode === "plan") {
  const t = parseScoreTable("## 五、方案自评");
  if (!t) fail("missing 方案自评");
  else {
    if (!Number.isInteger(t.total)) fail("方案合计非整数: " + t.total);
    else ok("方案合计整数 " + t.total);
    for (const r of t.rows) {
      if (!Number.isInteger(r.score)) fail("方案栏非整数 " + r.col);
    }
    if (t.rows.length) ok("方案栏整数 " + t.rows.length);
    if (t.redline) fail("方案自评有红线标记");
    else ok("方案无红线");
    if (!(t.total >= 95)) fail("方案合计 " + t.total + " < 95");
    else ok("方案合计 ≥95");
    console.log("PLAN_SCORE total=" + t.total + " redline=" + (t.redline ? 1 : 0));
  }
} else if (mode === "impl") {
  const t = parseScoreTable("## 六、实现复评");
  if (!t) fail("missing 实现复评");
  else {
    if (!Number.isInteger(t.total)) fail("实现合计非整数: " + t.total);
    const pending = /待实现/.test(t.raw);
    if (pending) fail("实现复评仍待实现");
    else ok("实现复评已填写");
    if (t.redline) fail("实现复评有红线标记");
    else ok("实现无红线");
    if (!(t.total >= 95)) fail("实现合计 " + t.total + " < 95");
    else ok("实现合计 ≥95");
    console.log("IMPL_SCORE total=" + t.total + " redline=" + (t.redline ? 1 : 0));
  }
} else {
  fail("unknown mode " + mode);
}

if (!process.exitCode) console.log("PASS " + mode);
