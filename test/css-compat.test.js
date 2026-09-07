"use strict";
// ============================================================================
// test/css-compat.test.js —— G7 渲染兼容纪律（design/19.0）
//
// 静态扫描 web/style.css，钉死三条纪律（源自 2026-08-25 移动端破图事故）：
//   ① 禁止 background: 简写内带斜杠 size（url(...) 与 "/" 同现的简写，
//      老内核解析分歧 → 整条声明被丢弃 → 破图）。background-size 独立声明是安全写法。
//   ② 每个含 border-image-source 的规则块内必须有 background-color 兜底声明
//      （border-image 不支持或贴图 404 时整块不可见，兜底色保证内容仍可读）。
//   ③ 所有 url("assets/...") 引用的文件必须真实存在。
// 附加：web/index.html 与 web/js/*.js 的内联样式同样不得出现 ① 的违规。
//
// 用法：node test/css-compat.test.js
// ============================================================================
const fs = require("fs");
const path = require("path");

const WEB = path.resolve(__dirname, "..", "web");
const CSS_FILE = path.join(WEB, "style.css");

let pass = 0;
let fail = 0;
function check(ok, label, detail) {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? ` —— ${detail}` : ""}`);
  }
}

// 去注释（/* ... */），保留换行以维持行号
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const raw = fs.readFileSync(CSS_FILE, "utf8");
const css = stripComments(raw);

// ---------------------------------------------------------------------------
// ① background: 简写内不得出现斜杠 size（含 url 的简写风险最高）
// ---------------------------------------------------------------------------
console.log("① background 斜杠简写扫描（style.css + index.html + js 内联）");
const SLASH_SHORTHAND_RE = /(?:^|[;{\s])background\s*:\s*[^;{}]*\//gm;

function findSlashShorthand(text, fileLabel) {
  const hits = [];
  let m;
  SLASH_SHORTHAND_RE.lastIndex = 0;
  while ((m = SLASH_SHORTHAND_RE.exec(text)) !== null) {
    const upto = text.slice(0, m.index);
    const line = upto.split("\n").length;
    hits.push(`${fileLabel}:${line} ${m[0].trim()}`);
  }
  return hits;
}

const cssHits = findSlashShorthand(css, "web/style.css");
check(cssHits.length === 0, "style.css 无 background 斜杠简写", cssHits.slice(0, 5).join(" | "));

const inlineFiles = [path.join(WEB, "index.html")];
for (const f of fs.readdirSync(path.join(WEB, "js"))) {
  if (f.endsWith(".js")) inlineFiles.push(path.join(WEB, "js", f));
}
let inlineHits = [];
for (const f of inlineFiles) {
  const text = fs.readFileSync(f, "utf8");
  const label = path.relative(path.resolve(WEB, ".."), f);
  inlineHits = inlineHits.concat(findSlashShorthand(stripComments(text), label));
}
check(inlineHits.length === 0, "index.html / web/js/*.js 内联无 background 斜杠简写", inlineHits.slice(0, 5).join(" | "));

// ---------------------------------------------------------------------------
// ② 含 border-image-source 的规则块必须有 background-color 兜底
//    （深度跟踪扫描：兼容 @media 嵌套）
// ---------------------------------------------------------------------------
console.log("② border-image-source 兜底检查");
function scanBlocks(text) {
  // 返回 [{selector, body, line}]：body 为该块直接声明（不含子块）
  const blocks = [];
  const stack = []; // {selector, start, decl}
  let buf = "";
  let bufStart = 0;
  let line = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") line += 1;
    if (ch === "{") {
      stack.push({ selector: buf.trim(), line: bufStart === 0 ? line : bufStart, decl: "" });
      buf = "";
      bufStart = line;
    } else if (ch === "}") {
      const blk = stack.pop();
      if (blk) blocks.push({ selector: blk.selector, body: blk.decl + buf, line: blk.line });
      buf = "";
      bufStart = line;
    } else {
      buf += ch;
      if (stack.length) stack[stack.length - 1].decl += ch === ";" ? ";" : ch;
    }
  }
  return blocks;
}

const blocks = scanBlocks(css);
const borderImageBlocks = blocks.filter((b) => b.body.includes("border-image-source"));
check(borderImageBlocks.length > 0, `找到 ${borderImageBlocks.length} 个 border-image 规则块（预期 4）`);
for (const b of borderImageBlocks) {
  const sel = b.selector.replace(/\s+/g, " ").slice(0, 60);
  check(b.body.includes("background-color"), `规则「${sel}」有 background-color 兜底`);
}

// ---------------------------------------------------------------------------
// ③ url("assets/...") 引用文件必须存在
// ---------------------------------------------------------------------------
console.log("③ 资产引用存在性检查");
const URL_RE = /url\(\s*["']?(assets\/[^"')]+)["']?\s*\)/g;
const refs = new Set();
let um;
while ((um = URL_RE.exec(css)) !== null) refs.add(um[1]);
const missing = [...refs].filter((r) => !fs.existsSync(path.join(WEB, r)));
check(refs.size > 0, `style.css 引用 ${refs.size} 个 assets 资产`);
check(missing.length === 0, "全部资产文件存在", missing.slice(0, 5).join(" | "));

// ---------------------------------------------------------------------------
// ④ style-ui-v4.css（主屏 UI 从0重写后的权威 HUD 表，2026-09-04）同样过三条纪律
//    （旧 style-hud-v3.css 已随主屏重写删除，此处改钉新表）
// ---------------------------------------------------------------------------
console.log("④ style-ui-v4.css 三条纪律复查");
const HUD_CSS = path.join(WEB, "style-ui-v4.css");
const hudCss = stripComments(fs.readFileSync(HUD_CSS, "utf8"));
const hudSlash = findSlashShorthand(hudCss, "web/style-ui-v4.css");
check(hudSlash.length === 0, "style-ui-v4.css 无 background 斜杠简写", hudSlash.slice(0, 5).join(" | "));
const hudBlocks = scanBlocks(hudCss).filter((b) => b.body.includes("border-image-source"));
for (const b of hudBlocks) {
  const sel = b.selector.replace(/\s+/g, " ").slice(0, 60);
  check(b.body.includes("background-color"), `style-ui-v4.css 规则「${sel}」有 background-color 兜底`);
}
const hudRefs = new Set();
let hm;
URL_RE.lastIndex = 0;
while ((hm = URL_RE.exec(hudCss)) !== null) hudRefs.add(hm[1]);
const hudMissing = [...hudRefs].filter((r) => !fs.existsSync(path.join(WEB, r)));
check(hudRefs.size > 0, `style-ui-v4.css 引用 ${hudRefs.size} 个 assets 资产`);
check(hudMissing.length === 0, "style-ui-v4.css 资产文件全存在", hudMissing.slice(0, 5).join(" | "));

// ---------------------------------------------------------------------------
console.log(`\nCSS 兼容回归：PASS ${pass} FAIL ${fail}`);
if (fail > 0) process.exit(1);
