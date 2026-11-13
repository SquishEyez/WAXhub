// WAX Hub desktop shell (Linux). Serves the same web bundle as the Android app
// from a private loopback server and shows it in a locked-down window.
//
// Security model:
// - web content has no Node.js access (sandbox, contextIsolation, no preload)
// - the page is served only on 127.0.0.1, with no directory listings and no
//   files outside the bundle
// - popups are allowed only for wallet sign-in (WAX Cloud Wallet and the
//   identity providers it uses); every other link opens in the system browser
// - anchor:// and esr:// links (Anchor wallet) are handed to the OS
// - camera, microphone, location and similar permissions are denied
const { app, BrowserWindow, shell, session, Menu } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.join(__dirname, "web");
const PORTS = [47321, 47322, 47323, 47324, 47325]; // fixed so local settings persist between runs
const POPUP_HOSTS = [
  "mycloudwallet.com",
  "wax.io",
  "accounts.google.com",
  "appleid.apple.com",
  "www.facebook.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "api.twitter.com",
  "www.reddit.com",
  "discord.com",
];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
};

const hostAllowed = (u) => {
  try {
    const h = new URL(u).hostname;
    return POPUP_HOSTS.some((d) => h === d || h.endsWith("." + d));
  } catch {
    return false;
  }
};
const openOutside = (u) => {
  if (/^(https?|anchor|esr):/i.test(u)) shell.openExternal(u);
};

function serve() {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, "http://127.0.0.1");
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.normalize(path.join(WEB, rel));
      if (!file.startsWith(WEB + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Cache-Control": "no-cache",
        });
        res.end(data);
      });
    } catch {
      res.writeHead(400).end();
    }
  });
  return new Promise((resolve, reject) => {
    const tryPort = (i) => {
      if (i >= PORTS.length) return reject(new Error("No free local port for WAX Hub"));
      server.once("error", () => tryPort(i + 1));
      server.listen(PORTS[i], "127.0.0.1", () => resolve(`http://127.0.0.1:${PORTS[i]}`));
    };
    tryPort(0);
  });
}

function harden(contents, origin) {
  contents.setWindowOpenHandler(({ url }) => {
    if (hostAllowed(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 480,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    openOutside(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (e, url) => {
    if (url.startsWith(origin) || hostAllowed(url)) return;
    e.preventDefault();
    openOutside(url);
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "clipboard-sanitized-write"));
    const origin = await serve();
    app.on("web-contents-created", (_e, contents) => harden(contents, origin));

    win = new BrowserWindow({
      width: 1100,
      height: 820,
      minWidth: 380,
      minHeight: 560,
      title: "WAX Hub",
      backgroundColor: "#0b0c10",
      icon: path.join(__dirname, "build", "icon.png"),
      autoHideMenuBar: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });
    win.once("ready-to-show", () => win.show());
    win.loadURL(`${origin}/index.html`);
  });

  app.on("window-all-closed", () => app.quit());
}
