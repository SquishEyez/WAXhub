// WAX Hub 2.1 — UX layer.
// This file is compiled with esbuild (jsxFactory De.createElement) and injected
// into the original app bundle at module scope, so it can use the bundle's own
// React (`De`), Capacitor (`Dh`, `_2`), chain helpers (`FC`, `k2`) and constants.

/* ---------------------------------------------------------------- helpers */

const WH = (() => {
  const LS = "waxhub.ux.";
  const load = (k, d) => {
    try {
      const v = localStorage.getItem(LS + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(LS + k, JSON.stringify(v));
    } catch {}
  };

  /* clipboard */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(String(text));
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = String(text);
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  /* explorer links */
  const txUrl = (id) => `https://waxblock.io/transaction/${id}`;
  const accountUrl = (a) => `https://waxblock.io/account/${a}`;

  /* WAX account names: 1-12 chars of a-z, 1-5 and dots, not ending in a dot */
  function checkAccountName(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (!v) return { ok: false, msg: "" };
    if (v.length > 12) return { ok: false, msg: "Account names are at most 12 characters." };
    if (/[^a-z1-5.]/.test(v))
      return { ok: false, msg: "Only letters a–z, digits 1–5 and dots are allowed." };
    if (v.endsWith(".")) return { ok: false, msg: "Account names can't end with a dot." };
    return { ok: true, value: v };
  }

  /* ---- human-friendly errors ---- */
  const RULES = [
    [/user (cancel|reject|denied|declined)|request (was )?(cancel|reject|denied)|modal closed|cancelled by user/i,
      { title: "Request cancelled", hint: "Nothing was sent. You declined or closed the wallet window." }],
    [/billed cpu|cpu usage|tx_cpu_usage|deadline exceeded|leeway_deadline/i,
      { title: "Not enough CPU", hint: "Your account ran out of CPU for now. Rent some with PowerUp (cheap, lasts 24h) or stake WAX to CPU, then try again.",
        action: { label: "Get CPU with PowerUp", nav: { tab: "more", tool: "tools", sub: "power" } } }],
    [/net usage|tx_net_usage/i,
      { title: "Not enough NET", hint: "Your account ran out of NET bandwidth. Use PowerUp or stake a little WAX to NET.",
        action: { label: "Open PowerUp", nav: { tab: "more", tool: "tools", sub: "power" } } }],
    [/ram_usage_exceeded|insufficient ram|ram usage exceeded/i,
      { title: "Not enough RAM", hint: "This action needs more account storage (RAM). Buy a few KB of RAM and try again.",
        action: { label: "Buy RAM", nav: { tab: "wallet", sub: "ram" } } }],
    [/overdrawn balance|no balance object|insufficient (funds|balance)/i,
      { title: "Not enough balance", hint: "You don't have enough of that token to cover this. Check the amount (and fees) and try again." }],
    [/to account does not exist|account .* does not exist|unknown account|account_query_exception/i,
      { title: "Account not found", hint: "That WAX account doesn't exist. Double-check the spelling." }],
    [/missing required authority|unsatisfied_authorization|irrelevant auth|missing authority|unable to find key/i,
      { title: "Wallet couldn't authorise this", hint: "Make sure you're signed in with the account that owns these funds or NFTs, then try again." }],
    [/expired|expired_tx_exception/i,
      { title: "Transaction expired", hint: "It took too long to approve. Please try again." }],
    [/duplicate transaction|tx_duplicate/i,
      { title: "Already sent", hint: "This exact transaction was already submitted. Check your history before retrying." }],
    [/invalid amount|must be positive|must issue positive|quantity/i,
      { title: "Check the amount", hint: "Enter a positive number, using a dot or comma for decimals." }],
    [/symbol precision mismatch/i,
      { title: "Wrong token decimals", hint: "The amount doesn't match this token's decimals. Check the token and try again." }],
    [/failed to fetch|networkerror|network request failed|load failed|aborterror|timed? ?out|err_internet|offline/i,
      { title: "Network problem", hint: "Couldn't reach the WAX network. Check your connection and try again in a moment." }],
    [/popup|window (was )?(blocked|closed)/i,
      { title: "Wallet window closed", hint: "The wallet window was blocked or closed before you approved. Try again and keep it open." }],
  ];

  function friendly(msg, type) {
    const raw = String(msg || "");
    const txId = (raw.match(/\b[0-9a-f]{64}\b/) || [])[0] || null;
    if (type === "success") {
      const first = raw.replace(/\b[0-9a-f]{64}\b/g, "").trim().split("\n")[0] || "Done";
      return {
        title: /^(transaction )?sent$/i.test(first) ? "Transaction sent" : first,
        hint: txId ? "Confirmed by your wallet. It may take a few seconds to show up." : "",
        txId,
        raw: "",
      };
    }
    if (type === "error") {
      for (const [re, info] of RULES) if (re.test(raw)) {
        // Surface the contract's own assertion text when there is one.
        const assert = raw.match(/assertion failure with message:\s*([^\n]+)/i);
        return { ...info, hint: assert && !/cancel/i.test(info.title) ? `${info.hint}\n“${assert[1].trim()}”` : info.hint, raw, txId };
      }
      const assert = raw.match(/assertion failure with message:\s*([^\n]+)/i);
      if (assert) return { title: "The contract said no", hint: assert[1].trim(), raw, txId };
      if (raw.length < 90 && !/exception|error code|\{/.test(raw)) return { title: raw, hint: "", raw: "", txId };
      return { title: "Something went wrong", hint: "The network or wallet returned an error. Tap Details for the full message.", raw, txId };
    }
    return { title: raw, hint: "", raw: "", txId };
  }

  /* ---- navigation bus (cross-screen links) ---- */
  let pendingSub = null;
  function nav(target) {
    pendingSub = target.sub || null;
    window.dispatchEvent(new CustomEvent("waxhub:nav", { detail: target }));
  }
  function takeSub(fallback, allowed) {
    const s = pendingSub;
    if (s && (!allowed || allowed.includes(s))) {
      pendingSub = null;
      return s;
    }
    return fallback;
  }

  /* ---- Android back button: sheets first, then screens, then exit ---- */
  const stack = [];
  let screenHandler = null;
  let lastBack = 0;
  let toastFn = null;
  let appPlugin = null;
  const app = () => appPlugin || (appPlugin = _2("App"));
  function handleBack() {
    const top = stack[stack.length - 1];
    if (top) {
      top.current && top.current();
      return;
    }
    if (screenHandler && screenHandler()) return;
    const now = Date.now();
    if (now - lastBack < 2000) {
      try {
        app().exitApp();
      } catch {}
    } else {
      lastBack = now;
      toastFn && toastFn("Press back again to exit", "info");
    }
  }
  try {
    if (Dh.isNativePlatform()) app().addListener("backButton", handleBack);
  } catch {}
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stack.length) handleBack();
  });
  function useBack(open, onClose) {
    const ref = De.useRef(onClose);
    ref.current = onClose;
    De.useEffect(() => {
      if (!open) return;
      stack.push(ref);
      return () => {
        const i = stack.lastIndexOf(ref);
        if (i >= 0) stack.splice(i, 1);
      };
    }, [open]);
  }

  /* ---- recent recipients, remembered after successful transfers ---- */
  function recents() {
    return load("recents", []);
  }
  function afterTx(actions) {
    try {
      const to = actions
        .filter((a) => a.name === "transfer" && a.data && typeof a.data.to === "string" && a.data.quantity)
        .map((a) => a.data.to);
      if (!to.length) return;
      const next = [...new Set([...to.reverse(), ...recents()])].slice(0, 8);
      save("recents", next);
    } catch {}
  }

  /* ---- WAX/USD from the Delphi oracle (cached for 5 min) ---- */
  let usdCache = { at: 0, v: 0, p: null };
  function waxUsd() {
    if (Date.now() - usdCache.at < 3e5 && usdCache.v) return Promise.resolve(usdCache.v);
    if (usdCache.p) return usdCache.p;
    usdCache.p = k2("waxpusd")
      .then((m) => {
        const v = m ? m / 1e4 : 0;
        usdCache = { at: Date.now(), v, p: null };
        return v;
      })
      .catch(() => ((usdCache.p = null), 0));
    return usdCache.p;
  }
  function useWaxUsd() {
    const [v, set] = De.useState(usdCache.v);
    De.useEffect(() => {
      let live = true;
      waxUsd().then((x) => live && set(x));
      return () => {
        live = false;
      };
    }, []);
    return v;
  }

  function fmtUsd(n) {
    if (!n) return "";
    return "≈ $" + n.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function trimAsset(a) {
    const m = String(a || "").match(/^(-?\d+)(?:\.(\d+))?\s+(\S+)$/);
    if (!m) return a;
    const f = (m[2] || "").replace(/0+$/, "");
    return `${Number(m[1]).toLocaleString()}${f ? "." + f : ""} ${m[3]}`;
  }

  return {
    trimAsset, load, save, copy, txUrl, accountUrl, checkAccountName, friendly, nav, takeSub,
    useBack, afterTx, recents, useWaxUsd, fmtUsd,
    setSub: (sub) => (pendingSub = sub),
    setScreenBack: (fn) => (screenHandler = fn),
    setToast: (fn) => (toastFn = fn),
  };
})();

/* ------------------------------------------------------------- icons */

const WH_I = {
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </svg>
  ),
  ext: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 8v5M12 16.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 11v6M12 7.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  ),
  wifi: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.8M10.5 5.6A15 15 0 0 1 22 9.5" />
      <circle cx="12" cy="20" r=".6" fill="currentColor" />
    </svg>
  ),
};

/* ------------------------------------------------------- small widgets */

function WH_CopyBtn({ text, label, toast, className = "wh-icon-btn" }) {
  const [done, setDone] = De.useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={label || "Copy"}
      title={label || "Copy"}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await WH.copy(text);
        setDone(ok);
        if (ok) setTimeout(() => setDone(false), 1500);
        toast && toast(ok ? "Copied to clipboard" : "Couldn't copy", ok ? "success" : "error");
      }}
    >
      {done ? WH_I.check : WH_I.copy}
      {className !== "wh-icon-btn" && <span>{done ? "Copied" : label || "Copy"}</span>}
    </button>
  );
}

function WH_Link({ href, children, className = "wh-icon-btn", label }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
      {children}
    </a>
  );
}

/* Sheet header used by every bottom sheet */
function WH_SheetHead({ title, onClose, disabled }) {
  return (
    <div className="wh-sheet-head">
      <h2>{title}</h2>
      <button type="button" className="wh-icon-btn" aria-label="Close" onClick={onClose} disabled={disabled}>
        {WH_I.close}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------- toasts */

function WH_Toast({ msg, type = "info", onClose }) {
  const f = De.useMemo(() => WH.friendly(msg, type), [msg, type]);
  const [details, setDetails] = De.useState(false);
  const [hold, setHold] = De.useState(false);
  De.useEffect(() => setDetails(false), [msg]);
  De.useEffect(() => {
    if (hold || details) return;
    const ms = type === "error" ? 12e3 : type === "success" ? 8e3 : 4e3;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [msg, type, onClose, hold, details]);
  const icon = type === "success" ? WH_I.check : type === "error" ? WH_I.alert : WH_I.info;
  return (
    <div
      className={`toast wh-toast ${type}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      onPointerDown={() => setHold(true)}
    >
      <div className="wh-toast-icon">{icon}</div>
      <div className="wh-toast-body">
        <div className="wh-toast-title">{f.title}</div>
        {f.hint && <div className="wh-toast-hint">{f.hint}</div>}
        {(f.txId || f.action || f.raw) && (
          <div className="wh-toast-actions">
            {f.txId && (
              <WH_Link className="wh-chip" href={WH.txUrl(f.txId)}>
                View on explorer
              </WH_Link>
            )}
            {f.txId && <WH_CopyBtn className="wh-chip" text={f.txId} label="Copy ID" />}
            {f.action && (
              <button
                type="button"
                className="wh-chip accent"
                onClick={() => {
                  WH.nav(f.action.nav);
                  onClose();
                }}
              >
                {f.action.label}
              </button>
            )}
            {f.raw && f.raw !== f.title && (
              <button type="button" className="wh-chip" onClick={() => setDetails(!details)}>
                {details ? "Hide details" : "Details"}
              </button>
            )}
          </div>
        )}
        {details && <pre className="wh-toast-raw">{f.raw}</pre>}
      </div>
      <button type="button" className="wh-icon-btn" aria-label="Dismiss" onClick={onClose}>
        {WH_I.close}
      </button>
    </div>
  );
}

/* --------------------------------------------------- confirm sheet */

function WH_Confirm({ open, title, details, warning, confirmLabel = "Approve in wallet", busy, onClose, onConfirm }) {
  WH.useBack(open, () => !busy && onClose());
  if (!open) return null;
  return (
    <div className="sheet-back" onClick={() => !busy && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <WH_SheetHead title={title} onClose={onClose} disabled={busy} />
        <div className="wh-confirm-intro">
          <span className="wh-confirm-shield">{WH_I.shield}</span>
          <span>Check these details. Nothing happens until you approve it in your wallet.</span>
        </div>
        <div className="wh-kv-list">
          {details.map((d) => (
            <div className="kv" key={d.label}>
              <span className="muted">{d.label}</span>
              <span>{d.value}</span>
            </div>
          ))}
        </div>
        {warning && <div className="warn">{warning}</div>}
        {busy && (
          <div className="wh-waiting">
            <div className="spinner" />
            <span>Waiting for your wallet… approve or reject the request there.</span>
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onConfirm} disabled={busy}>
            {busy ? <div className="spinner" /> : confirmLabel === "Confirm & sign" ? "Approve in wallet" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------- generic sheet */

function WH_Sheet({ open, title, children, onClose }) {
  WH.useBack(open, onClose);
  if (!open) return null;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <WH_SheetHead title={title} onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

function WH_Empty({ title, text }) {
  return (
    <div className="empty">
      <div className="wh-empty-art" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div style={{ fontWeight: 650, color: "var(--text)" }}>{title}</div>
      {text && <div style={{ marginTop: 6 }}>{text}</div>}
    </div>
  );
}

/* ------------------------------------------------- form helpers */

function WH_RecipientInput({ value, onChange, self }) {
  const chk = WH.checkAccountName(value);
  const [exists, setExists] = De.useState(null); // null = unknown/checking
  const recents = De.useMemo(() => WH.recents().filter((r) => r !== self), [self]);
  De.useEffect(() => {
    setExists(null);
    if (!chk.ok) return;
    let live = true;
    const t = setTimeout(() => {
      FC(chk.value)
        .then(() => live && setExists(true))
        .catch((e) => live && setExists(/not|unknown|exist|account_query/i.test(String(e?.message || e)) ? false : null));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [chk.ok && chk.value]);
  const exchange = /^(binance|huobi|kucoin|bitfinex|gateio|okx|okex|bittrex|upbit|bithumb|mexc|coinex|probit|bitget|crypto|kraken)/i.test(chk.value || "");
  return (
    <div className="field">
      <span className="label">To</span>
      <input
        className={`input ${value && !chk.ok ? "wh-invalid" : exists === true ? "wh-valid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ""))}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={13}
        placeholder="e.g. abcde.wam"
      />
      {value && !chk.ok && chk.msg && <div className="wh-field-msg err">{chk.msg}</div>}
      {chk.ok && exists === true && <div className="wh-field-msg ok">✓ Account found</div>}
      {chk.ok && exists === false && <div className="wh-field-msg err">This account doesn't exist on WAX.</div>}
      {chk.ok && chk.value === self && <div className="wh-field-msg warn-t">That's your own account.</div>}
      {exchange && (
        <div className="wh-field-msg warn-t">Sending to an exchange? Most exchanges require a memo — copy it exactly from the exchange.</div>
      )}
      {!value && recents.length > 0 && (
        <div className="wh-chips">
          <span className="faint" style={{ fontSize: 11 }}>Recent:</span>
          {recents.map((r) => (
            <button type="button" key={r} className="wh-chip" onClick={() => onChange(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WH_AmountInput({ label = "Amount", value, onChange, max, symbol }) {
  const has = max !== void 0 && max !== "" && Number(max) > 0;
  const over = has && Number(String(value).replace(",", ".")) > Number(max);
  return (
    <div className="field">
      <span className="label wh-label-row">
        <span>{label}</span>
        {has && (
          <span className="faint">
            Available: {Number(max).toLocaleString(void 0, { maximumFractionDigits: 8 })} {symbol}
          </span>
        )}
      </span>
      <div className="wh-input-wrap">
        <input
          className={`input ${has ? "wh-pad-max" : symbol ? "wh-pad" : ""} ${over ? "wh-invalid" : ""}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
          placeholder="0.0"
        />
        {symbol && <span className={`wh-input-suffix ${has ? "" : "nomax"}`}>{symbol}</span>}
        {has && (
          <button type="button" className="wh-max" onClick={() => onChange(String(max))}>
            MAX
          </button>
        )}
      </div>
      {over && <div className="wh-field-msg err">That's more than you have.</div>}
    </div>
  );
}

/* ---------------------------------------------------- wallet extras */

function WH_AccountHeader({ name, mine, signedIn, onBackToMine, onRefresh, loading, toast }) {
  return (
    <div className="wh-acct-row">
      <span className="wh-acct-name">{name}</span>
      <WH_CopyBtn text={name} label="Copy account name" toast={toast} />
      <WH_Link href={WH.accountUrl(name)} label="Open in block explorer">
        {WH_I.ext}
      </WH_Link>
      <span style={{ flex: 1 }} />
      {signedIn && !mine && (
        <button type="button" className="btn sm" onClick={onBackToMine}>
          My account
        </button>
      )}
      <button type="button" className={`wh-icon-btn ${loading ? "wh-spin" : ""}`} aria-label="Refresh" onClick={onRefresh} disabled={loading}>
        {WH_I.refresh}
      </button>
    </div>
  );
}

function WH_UsdLine({ wax }) {
  const usd = WH.useWaxUsd();
  if (!usd || !Number(wax)) return null;
  return <div className="wh-usd">{WH.fmtUsd(Number(wax) * usd)}</div>;
}

function WH_ResourceHint({ cpu, net, ramUsed, ramMax, mine, onBuyRam }) {
  const pc = (u, m) => (Number(m) > 0 ? (Number(u) / Number(m)) * 100 : 0);
  const c = pc(cpu?.used, cpu?.max);
  const n = pc(net?.used, net?.max);
  const r = pc(ramUsed, ramMax);
  const items = [];
  if (c >= 80) items.push(["CPU", c]);
  if (n >= 80) items.push(["NET", n]);
  if (!items.length && r < 90) {
    return <div className="wh-health ok">{WH_I.check}<span>Resources look healthy — you can transact normally.</span></div>;
  }
  return (
    <div className="wh-health low">
      {WH_I.alert}
      <div style={{ flex: 1 }}>
        {items.length > 0 && (
          <div>
            {items.map(([k, v]) => `${k} ${v.toFixed(0)}%`).join(" · ")} used — transactions may fail.{" "}
            {mine && "PowerUp rents resources for 24h for a few cents of WAX."}
          </div>
        )}
        {r >= 90 && <div>RAM is {r.toFixed(0)}% full — receiving new NFTs or tokens may need more RAM.</div>}
        {mine && (
          <div className="wh-chips" style={{ marginTop: 8 }}>
            {items.length > 0 && (
              <button type="button" className="wh-chip accent" onClick={() => WH.nav({ tab: "more", tool: "tools", sub: "power" })}>
                PowerUp now
              </button>
            )}
            {r >= 90 && (
              <button type="button" className="wh-chip accent" onClick={onBuyRam}>
                Buy RAM
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WH_Welcome({ onSignIn, onLookup }) {
  const [q, setQ] = De.useState("");
  return (
    <div className="wh-welcome">
      <div className="wh-welcome-glow" />
      <h2>Your WAX, all in one place</h2>
      <p>Check balances, manage NFTs, trade on the market, claim drops and use WAXDAO — straight from the chain.</p>
      <button type="button" className="btn primary block" onClick={onSignIn}>
        Sign in with a wallet
      </button>
      <div className="wh-or">
        <span>or just look around</span>
      </div>
      <form
        className="search"
        style={{ marginBottom: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          const c = WH.checkAccountName(q);
          c.ok && onLookup(c.value);
        }}
      >
        <input
          className="input"
          placeholder="Any WAX account name"
          value={q}
          onChange={(e) => setQ(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button className="btn" type="submit" disabled={!WH.checkAccountName(q).ok}>
          View
        </button>
      </form>
      <div className="wh-feature-grid">
        {[
          ["NFTs", "See, send, list or burn your NFTs", "nfts"],
          ["Market", "Buy, sell, auction and make offers", "market"],
          ["Drops", "Claim drops, run blends, open packs", "drops"],
          ["Tools", "PowerUp, voting, swaps, WAXDAO", "more"],
        ].map(([t, d, tab]) => (
          <button type="button" key={t} className="wh-feature" onClick={() => WH.nav({ tab })}>
            <b>{t}</b>
            <span>{d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WH_ReceiveActions({ account, toast }) {
  return (
    <div className="btn-row" style={{ marginTop: 12 }}>
      <WH_CopyBtn className="btn" text={account} label="Copy name" toast={toast} />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title: "My WAX account", text: account });
            } catch {}
          } else {
            const ok = await WH.copy(account);
            toast && toast(ok ? "Copied to clipboard" : "Couldn't copy", ok ? "success" : "error");
          }
        }}
      >
        {WH_I.share}
        <span>Share</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------ app-shell pieces */

function WH_AccountSheet({ open, account, session, onClose, onSignOut, onSwitch, toast }) {
  const [confirm, setConfirm] = De.useState(false);
  De.useEffect(() => setConfirm(false), [open]);
  const perm = session ? String(session.permission || "active") : "";
  const wallet = session?.walletPlugin?.metadata?.name || session?.walletPlugin?.id || "";
  return (
    <WH_Sheet open={open} title="Your account" onClose={onClose}>
      <div className="wh-acct-card">
        <div className="wh-avatar">{WH_I.user}</div>
        <div style={{ minWidth: 0 }}>
          <div className="wh-acct-big">{account}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {[perm && `@${perm}`, wallet && `via ${wallet}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="btn-row">
        <WH_CopyBtn className="btn" text={account} label="Copy name" toast={toast} />
        <WH_Link className="btn" href={WH.accountUrl(account)}>
          {WH_I.ext}
          <span>Explorer</span>
        </WH_Link>
      </div>
      <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={onSwitch}>
        Switch account
      </button>
      {!confirm ? (
        <button type="button" className="btn danger block" style={{ marginTop: 8 }} onClick={() => setConfirm(true)}>
          Sign out
        </button>
      ) : (
        <div className="warn" style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 10 }}>Sign out of {account}? You can sign back in any time — nothing on-chain changes.</div>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              Keep me in
            </button>
            <button type="button" className="btn danger" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </WH_Sheet>
  );
}

function WH_Offline() {
  const [on, setOn] = De.useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  De.useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (on) return null;
  return (
    <div className="wh-offline" role="status">
      {WH_I.wifi}
      <span>You're offline. Balances and markets will refresh when you reconnect.</span>
    </div>
  );
}

const WH_ONBOARD = [
  {
    t: "Welcome to WAX Hub",
    d: "One app for your WAX wallet, NFTs, the AtomicMarket, drops, packs, swaps and WAXDAO — read straight from the blockchain.",
    art: "◆",
  },
  {
    t: "You stay in control",
    d: "Your keys never leave your wallet. Before anything is sent you'll see a plain-English summary, and nothing happens until you approve it.",
    art: "🛡",
  },
  {
    t: "Handy tips",
    d: "Tap your account chip for copy/sign-out options. Look up any account from the Wallet tab. Low on CPU? PowerUp in More → Chain tools fixes it in seconds.",
    art: "✦",
  },
];

function WH_Onboarding({ onDone, onSignIn }) {
  const [i, setI] = De.useState(0);
  const finish = () => {
    WH.save("onboarded", 1);
    onDone();
  };
  WH.useBack(true, finish);
  const s = WH_ONBOARD[i];
  const last = i === WH_ONBOARD.length - 1;
  return (
    <div className="sheet-back wh-onboard-back">
      <div className="sheet wh-onboard" role="dialog" aria-modal="true" aria-label={s.t}>
        <button type="button" className="wh-skip" onClick={finish}>
          Skip
        </button>
        <div className="wh-onboard-art" aria-hidden="true">
          {s.art}
        </div>
        <h1>{s.t}</h1>
        <p>{s.d}</p>
        <div className="wh-dots" aria-hidden="true">
          {WH_ONBOARD.map((_, k) => (
            <i key={k} className={k === i ? "on" : ""} />
          ))}
        </div>
        {!last ? (
          <button type="button" className="btn primary block" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn primary block"
              onClick={() => {
                finish();
                onSignIn();
              }}
            >
              Sign in
            </button>
            <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={finish}>
              Explore first
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* Quick actions shown on the More hub */
const WH_QUICK = [
  ["Find stuck assets", { tool: "rescue" }],
  ["Get CPU (PowerUp)", { tool: "tools", sub: "power" }],
  ["Swap tokens", { tool: "dex", sub: "swap" }],
  ["Open packs", { tool: "packs" }],
  ["Vote for producers", { tool: "tools", sub: "vote" }],
  ["Portfolio value", { tool: "tools", sub: "portfolio" }],
  ["Account history", { tool: "tools", sub: "history" }],
  ["Create an account", { tool: "tools", sub: "account" }],
  ["Mint an NFT", { tool: "creator" }],
  ["Contract console", { tool: "console" }],
];

function WH_QuickActions({ query }) {
  const q = String(query || "").trim().toLowerCase();
  const list = WH_QUICK.filter(([l]) => !q || l.toLowerCase().includes(q));
  if (!list.length) return null;
  return (
    <>
      <h2 style={{ marginTop: 4 }}>Quick actions</h2>
      <div className="wh-quick">
        {list.map(([label, target]) => (
          <button type="button" key={label} className="wh-chip big" onClick={() => WH.nav({ tab: "more", ...target })}>
            {label}
          </button>
        ))}
      </div>
      <h2>All tools</h2>
    </>
  );
}
