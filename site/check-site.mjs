#!/usr/bin/env node
// Zero-dependency structural checks over the built site/ files.
// Run: node site/check-site.mjs
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = dirname(fileURLToPath(import.meta.url));
let failures = 0;
let checks = 0;

function fail(msg) {
  failures++;
  console.error("  FAIL: " + msg);
}
function pass(msg) {
  checks++;
  console.log("  ok:   " + msg);
}
function check(msg, cond) {
  checks++;
  if (cond) console.log("  ok:   " + msg);
  else fail(msg);
}

const PAGES = [
  "index.html",
  "settings.html",
  "docs/index.html",
  "docs/crack-tiers.html",
  "docs/payload-profiles.html",
  "docs/delivery-routes.html",
  "docs/privacy.html",
];

console.log("== agent-whip site structural checks ==\n");

// 1. Every page file exists and is non-empty.
console.log("[1] pages exist");
const pageSource = {};
for (const p of PAGES) {
  const full = join(SITE_DIR, p);
  const exists = existsSync(full);
  check(p + " exists", exists);
  if (exists) pageSource[p] = readFileSync(full, "utf8");
}

// 2. No payload phrases leak: forbid the literal shipped default trigger phrases anywhere.
console.log("\n[2] no payload phrases displayed literally");
const FORBIDDEN_PHRASES = [
  "continue at full speed, then clean up merged branches",
];
for (const [p, src] of Object.entries(pageSource)) {
  for (const phrase of FORBIDDEN_PHRASES) {
    // allow it inside a <pre><code> fenced JSON example block only (payload-profiles.html
    // documents the shipped defaults verbatim, which is expected and fine); everywhere else
    // it must not appear.
    if (p === "docs/payload-profiles.html") continue;
    check(p + ' does not contain "' + phrase + '"', !src.toLowerCase().includes(phrase));
  }
}

// 3. Every internal href/src resolves to a real file (classic dead-link check).
console.log("\n[3] internal links resolve to real files");
const linkRe = /(?:href|src)="([^"]+)"/g;
for (const [p, src] of Object.entries(pageSource)) {
  const baseDir = dirname(join(SITE_DIR, p));
  let m;
  linkRe.lastIndex = 0;
  while ((m = linkRe.exec(src))) {
    const target = m[1];
    if (/^https?:\/\//.test(target) || target.startsWith("#") || target.startsWith("data:")) continue;
    const [pathPart] = target.split("#");
    if (!pathPart) continue; // pure fragment
    const resolved = resolve(baseDir, pathPart);
    check(p + " -> " + target + " resolves", existsSync(resolved));
  }
}

// 4. Every internal same-site fragment (#id) referenced from AW_SITE_INDEX or suggested-list
//    anchors actually exists as an element id in the target page.
console.log("\n[4] internal anchors point at real element ids");
for (const [p, src] of Object.entries(pageSource)) {
  const baseDir = dirname(join(SITE_DIR, p));
  let m;
  linkRe.lastIndex = 0;
  while ((m = linkRe.exec(src))) {
    const target = m[1];
    if (/^https?:\/\//.test(target) || target.startsWith("data:")) continue;
    if (!target.includes("#")) continue;
    const [pathPart, frag] = target.split("#");
    if (!frag) continue;
    const targetFile = pathPart ? resolve(baseDir, pathPart) : join(SITE_DIR, p);
    if (!existsSync(targetFile)) continue; // already reported in check 3
    const targetSrc = readFileSync(targetFile, "utf8");
    const idExists = new RegExp('id="' + frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"').test(targetSrc);
    check(p + " -> #" + frag + " (in " + (pathPart || p) + ") exists", idExists);
  }
}

// 5. Every page links css/app.css and js/app.js with the correct relative prefix.
console.log("\n[5] every page loads shared css + js");
for (const [p, src] of Object.entries(pageSource)) {
  check(p + " links app.css", /href="[.\/]*css\/app\.css"/.test(src));
  check(p + " loads app.js", /src="[.\/]*js\/app\.js"/.test(src));
}

// 6. Viewport meta tag present on every page (mobile-friendly requirement).
console.log("\n[6] viewport meta present");
for (const [p, src] of Object.entries(pageSource)) {
  check(p + " has viewport meta", /<meta name="viewport" content="width=device-width/.test(src));
}

// 7. Tab strip present with correct roles on every page, and exactly one tab marked
//    aria-selected="true" (the active page).
console.log("\n[7] tab strip roles + exactly one active tab per page");
for (const [p, src] of Object.entries(pageSource)) {
  check(p + ' has role="tablist"', src.includes('role="tablist"'));
  const selectedCount = (src.match(/aria-selected="true"/g) || []).length;
  check(p + " has exactly one aria-selected=true tab", selectedCount === 1);
}

// 8. CSS never scrolls the page body horizontally: body must set overflow-x: hidden.
console.log("\n[8] body overflow-x guard present in css");
const css = readFileSync(join(SITE_DIR, "css/app.css"), "utf8");
check("app.css sets body { ... overflow-x: hidden ... }", /body\s*\{[^}]*overflow-x:\s*hidden/.test(css));

// 9. Dark theme tokens defined via both prefers-color-scheme and [data-theme="dark"],
//    so the toggle works in both directions (system + explicit).
console.log("\n[9] dark theme defined for both system-preference and explicit toggle");
check("prefers-color-scheme: dark block present", /@media \(prefers-color-scheme: dark\)/.test(css));
check('[data-theme="dark"] block present', /:root\[data-theme="dark"\]/.test(css));

// 10. app.js declares the Ctrl+Shift+F command palette shortcut.
console.log("\n[10] command palette shortcut wired");
const appjs = readFileSync(join(SITE_DIR, "js/app.js"), "utf8");
check('app.js checks e.ctrlKey && e.shiftKey && key "f"', /ctrlKey\s*&&\s*e\.shiftKey/.test(appjs) && /["']F["']/i.test(appjs));
check("app.js implements focusFragment (palette teleport)", /focusFragment/.test(appjs));

// 11. Regex builder marks plain text as default (opt-in regex), never regex-by-default.
console.log("\n[11] regex is opt-in, not default");
check('app.js starts regexActive = false', /regexActive\s*=\s*false/.test(appjs));

console.log("\n== " + checks + " checks, " + failures + " failed ==");
if (failures > 0) {
  process.exit(1);
}
