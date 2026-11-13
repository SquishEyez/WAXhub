#!/usr/bin/env node
// Build WAX Hub 2.1 from the WAX Hub 2.0 release APK.
//
//   node build.mjs <wax-hub-2.0.apk> [--web-only]
//
// Steps: extract the web bundle from the APK, prettify it so patches are
// stable, apply src/patches.mjs, inject src/ext.jsx + src/ext.css, minify,
// and write a new unsigned APK (dist/wax-hub-2.1-unsigned.apk) plus the web
// folder (dist/web) for testing in a browser. Sign with sign.sh.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import * as prettier from "prettier";
import { between, replace } from "./src/patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apkIn = process.argv[2];
const webOnly = process.argv.includes("--web-only");
if (!apkIn) {
  console.error("usage: node build.mjs <wax-hub-2.0.apk> [--web-only]");
  process.exit(1);
}

const dist = path.join(here, "dist");
const tmp = path.join(dist, "apk");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execFileSync("unzip", ["-q", "-o", path.resolve(apkIn), "-d", tmp]);

const pub = path.join(tmp, "assets/public");
const assets = path.join(pub, "assets");
const jsName = fs.readdirSync(assets).find((f) => /^index-.*\.js$/.test(f));
const cssName = fs.readdirSync(assets).find((f) => /^index-.*\.css$/.test(f));
if (!jsName || !cssName) throw new Error("web bundle not found in APK");

// 1. prettify so the patch anchors are stable text
let js = await prettier.format(fs.readFileSync(path.join(assets, jsName), "utf8"), {
  parser: "babel",
});

// 2. apply patches
function once(hay, needle, label) {
  const i = hay.indexOf(needle);
  if (i < 0) throw new Error(`patch anchor not found: ${label}`);
  if (hay.indexOf(needle, i + 1) >= 0) throw new Error(`patch anchor not unique: ${label}`);
  return i;
}
for (const [start, end, text] of between) {
  const a = once(js, start, start);
  const b = js.indexOf(end, a);
  if (b < 0) throw new Error(`end anchor not found: ${end}`);
  js = js.slice(0, a) + text + js.slice(b);
}
for (const [from, to] of replace) {
  const i = once(js, from, from.split("\n")[0].trim().slice(0, 80));
  js = js.slice(0, i) + to + js.slice(i + from.length);
}

// 3. inject the UX layer at module scope, right before the app code
const ext = await esbuild.transform(["ext.jsx", "rescue.jsx", "console.jsx", "drops.jsx", "creator.jsx"].map((f) => fs.readFileSync(path.join(here, "src", f), "utf8")).join("\n"), {
  loader: "jsx",
  jsxFactory: "De.createElement",
  jsxFragment: "De.Fragment",
  target: "es2020",
});
const anchor = "function Kz(t) {";
const at = once(js, anchor, anchor);
js = js.slice(0, at) + ext.code + "\n" + js.slice(at);

// 4. minify (syntax check included)
const min = await esbuild.transform(js, { loader: "js", format: "esm", minify: true, target: "es2020" });
const css = await esbuild.transform(
  fs.readFileSync(path.join(assets, cssName), "utf8") + "\n" + fs.readFileSync(path.join(here, "src/ext.css"), "utf8"),
  { loader: "css", minify: true },
);

const hash = (s) => crypto.createHash("sha256").update(s).digest("base64url").slice(0, 8);
const newJs = `index-${hash(min.code)}.js`;
const newCss = `index-${hash(css.code)}.css`;
fs.rmSync(path.join(assets, jsName));
fs.rmSync(path.join(assets, cssName));
fs.writeFileSync(path.join(assets, newJs), min.code);
fs.writeFileSync(path.join(assets, newCss), css.code);
let html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
html = html.replace(jsName, newJs).replace(cssName, newCss);
fs.writeFileSync(path.join(pub, "index.html"), html);

fs.cpSync(pub, path.join(dist, "web"), { recursive: true });
console.log(`web bundle: ${newJs} (${(min.code.length / 1024).toFixed(0)} KB), ${newCss}`);
if (webOnly) process.exit(0);

// 5. release hardening: correct version metadata, no WebView remote debugging, no mixed content
execFileSync("python3", ["-I", path.join(here, "axml.py"), "patch", path.join(tmp, "AndroidManifest.xml"), path.join(tmp, "AndroidManifest.xml"), "versionCode=3", "versionName=2.1"], { stdio: "inherit" });
const capPath = path.join(tmp, "assets/capacitor.config.json");
const cap = JSON.parse(fs.readFileSync(capPath, "utf8"));
cap.android = { ...(cap.android || {}), webContentsDebuggingEnabled: false, allowMixedContent: false };
fs.writeFileSync(capPath, JSON.stringify(cap, null, "\t"));

// 6. repack: keep every entry's original compression (resources.arsc etc. stay stored)
execFileSync("python3", ["-I", path.join(here, "repack.py"), path.resolve(apkIn), tmp, path.join(dist, "wax-hub-2.1-unsigned.apk")], {
  stdio: "inherit",
});
