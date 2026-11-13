// Contract console: load any WAX contract's ABI and call any action (forms are
// generated from the ABI types), or browse any table. The universal fallback
// for sites that no longer exist.

const CC_KNOWN = [
  ["atomicassets", "AtomicAssets NFTs"], ["atomicmarket", "AtomicMarket"], ["atomicpacksx", "AtomicHub packs"], ["atomicdropsx", "AtomicHub drops"],
  ["atomictoolsx", "AtomicHub claim links"], ["neftyblocksd", "NeftyBlocks drops"], ["blend.nefty", "NeftyBlocks blends"], ["neftyblocksp", "NeftyBlocks packs"],
  ["market.nefty", "NeftyBlocks auctions"], ["secure.nefty", "Nefty security / whitelists"], ["swap.nefty", "Nefty swap"], ["claim.nefty", "Nefty claims"],
  ["nfthivedrops", "NFTHive drops"], ["nfthivepacks", "NFTHive packs"], ["nfthivecraft", "NFTHive crafting"], ["nfthivevault", "NFTHive HONEY vault"],
  ["nft.hive", "nft.hive"], ["tf.waxdao", "WAXDAO token farms"], ["farms.waxdao", "WAXDAO NFT farms"], ["dao.waxdao", "WAXDAO DAOs"],
  ["waxdaolocker", "WAXDAO locker"], ["waxdaobacker", "WAXDAO NFT backing"], ["waxdaosynths", "WAXDAO synths"], ["wufclaimtool", "WUF airdrops"],
  ["alcordexmain", "Alcor limit orders"], ["swap.alcor", "Alcor AMM"], ["swap.taco", "Taco swap"], ["stake.taco", "Taco staking"], ["swap.box", "Defibox-style swap"],
  ["s.rplanet", "RPlanet staking"], ["simpleassets", "SimpleAssets"], ["eosio", "WAX system"], ["eosio.token", "WAX token"],
];

// Actions that can hand control of an account to someone else or replace code.
const CC_DANGER = {
  eosio: { updateauth: 1, deleteauth: 1, linkauth: 1, unlinkauth: 1, setcode: 1, setabi: 1, sellram: 0, newaccount: 0 },
};

const WHCC = (() => {
  function resolve(abi, type) {
    const alias = Object.fromEntries((abi.types || []).map((t) => [t.new_type_name, t.type]));
    let t = type;
    for (let i = 0; i < 10 && alias[t]; i++) t = alias[t];
    return t;
  }
  function struct(abi, name) {
    const S = Object.fromEntries((abi.structs || []).map((s) => [s.name, s]));
    let s = S[name];
    if (!s) return null;
    let fields = [...s.fields];
    for (let i = 0; i < 10 && s.base; i++) {
      s = S[s.base];
      if (!s) break;
      fields = [...s.fields, ...fields];
    }
    return fields;
  }
  const variant = (abi, name) => (abi.variants || []).find((v) => v.name === name);
  const isInt = (t) => /^u?int(8|16|32|64|128)$|^varu?int32$/.test(t);
  const isFloat = (t) => /^float(32|64|128)$/.test(t);

  function empty(abi, type, actor, fname = "") {
    let t = resolve(abi, type);
    if (t.endsWith("$")) return empty(abi, t.slice(0, -1), actor, fname);
    if (t.endsWith("?")) return null;
    if (t.endsWith("[]")) return [];
    if (t === "bool") return false;
    if (t === "name") return /^(owner|user|from|account|claimer|staker|payer|buyer|seller|sender|creator|wallet|executor|voter|to|receiver|recipient|authorized_account|asset_owner|new_owner)$/.test(fname) ? actor || "" : "";
    if (t === "extended_asset") return { quantity: "", contract: "" };
    const v = variant(abi, t);
    if (v) return [v.types[0], empty(abi, v.types[0], actor)];
    const f = struct(abi, t);
    if (f) return Object.fromEntries(f.map((x) => [x.name, empty(abi, x.type, actor, x.name)]));
    return "";
  }

  // Convert form values to what the serializer expects.
  function clean(abi, type, v) {
    let t = resolve(abi, type);
    if (t.endsWith("$") || t.endsWith("?")) {
      const inner = t.slice(0, -1);
      return v === null || v === void 0 ? null : clean(abi, inner, v);
    }
    if (t.endsWith("[]")) return (v || []).filter((x) => x !== "").map((x) => clean(abi, t.slice(0, -2), x));
    if (t === "bool") return !!v;
    if (isInt(t)) {
      const s = String(v ?? "").trim();
      if (!/^-?\d+$/.test(s)) throw new Error(`“${s || "(empty)"}” isn't a whole number (${t})`);
      return /64|128/.test(t) ? s : Number(s);
    }
    if (isFloat(t)) {
      const n = Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) throw new Error(`“${v}” isn't a number`);
      return n;
    }
    if (t === "name") {
      const s = String(v || "").trim().toLowerCase();
      if (s && !/^[a-z1-5.]{1,13}$/.test(s)) throw new Error(`“${s}” isn't a valid account/name`);
      return s;
    }
    const va = variant(abi, t);
    if (va) return [v[0], clean(abi, v[0], v[1])];
    const f = struct(abi, t);
    if (f && t !== "extended_asset") return Object.fromEntries(f.map((x) => [x.name, clean(abi, x.type, v?.[x.name])]));
    if (t === "extended_asset") return { quantity: String(v?.quantity || "").trim(), contract: String(v?.contract || "").trim() };
    return typeof v === "string" ? v.trim() : v;
  }
  const hint = (t) =>
    ({
      asset: "e.g. 1.00000000 WAX (amount with the token's decimals + symbol)",
      symbol: "e.g. 8,WAX (decimals,SYMBOL)",
      symbol_code: "e.g. WAX",
      time_point_sec: "e.g. 2026-12-31T23:59:59",
      time_point: "e.g. 2026-12-31T23:59:59.000",
      checksum256: "64 hex characters",
      public_key: "PUB_K1_… or EOS…",
      bytes: "hex",
    })[t] || "";
  return { resolve, struct, variant, empty, clean, hint, isInt, isFloat };
})();

// Plain-English help for common parameter names across WAX contracts.
const CC_HELP = [
  [/^(owner|user|account|claimer|staker|from|payer|buyer|seller|sender|creator|wallet|executor|authorized_\w+|asset_owner)$/, "Usually your own account name"],
  [/^(to|receiver|recipient|new_asset_owner|new_owner)$/, "The account that receives it"],
  [/^(quantity|amount|token_to_withdraw|listing_price|price|stake_\w+|unstake_\w+|quant)$/, "Amount + symbol with the token's exact decimals, e.g. 1.00000000 WAX or 10.0000 TLM"],
  [/^memo$/, "Free text. Some contracts need an exact memo (check the project's docs). Leave empty if unsure"],
  [/asset_ids$|^assetids$|^asset_ids_\w+/, "NFT asset IDs (long numbers), one per line. Find them on the NFTs tab"],
  [/^asset_id$/, "One NFT asset ID (a long number from the NFTs tab)"],
  [/^collection_name$/, "The collection's account name, e.g. alien.worlds, not its display name"],
  [/^schema_name$/, "Schema (attribute group) inside the collection"],
  [/^template_id$/, "Template number, shown on the NFT's details"],
  [/(_id|^id)$/, "A numeric ID. Find it in the contract's tables (Tables tab) or on the related screen"],
  [/^(farm_name|farmname|dao)$/, "The farm/DAO's name as shown on WAXDAO"],
  [/symbol$/, "decimals,SYMBOL e.g. 8,WAX"],
  [/time$/, "Usually seconds since 1970 (Unix time). 0 often means no limit"],
  [/^(roll_indexes|origin_roll_ids)$/, "Which result slots to claim. Use Rescue & recover to fill these automatically"],
];
const ccHelp = (name) => (CC_HELP.find(([re]) => re.test(name)) || [])[1] || "";

// Common jobs, pre-filled. data(me) gives starting values.
const CC_RECIPES = [
  ["Withdraw leftover WAX from AtomicMarket", "After a cancelled offer or a sale, funds wait in the market contract.", "atomicmarket", "withdraw", (me) => ({ owner: me, token_to_withdraw: "1.00000000 WAX" })],
  ["Send tokens", "Transfer WAX to another account.", "eosio.token", "transfer", (me) => ({ from: me, to: "", quantity: "1.00000000 WAX", memo: "" })],
  ["Send NFTs", "Transfer one or more NFTs by asset ID.", "atomicassets", "transfer", (me) => ({ from: me, to: "", asset_ids: [], memo: "" })],
  ["Burn an NFT", "Permanently destroy an NFT you own.", "atomicassets", "burnasset", (me) => ({ asset_owner: me, asset_id: "" })],
  ["Cancel an AtomicHub claim link", "Get NFTs back from a link nobody claimed.", "atomictoolsx", "cancellink", () => ({ link_id: "" })],
  ["Claim WAXDAO farm rewards", "Collect rewards from an NFT farm.", "farms.waxdao", "claim", (me) => ({ user: me, farmname: "" })],
  ["Unstake NFTs from a WAXDAO farm", "Get staked NFTs back.", "farms.waxdao", "unstake", (me) => ({ user: me, farmname: "", asset_ids: [] })],
  ["Claim an unstake refund", "Collect WAX after the 3-day unstake wait.", "eosio", "refund", (me) => ({ owner: me })],
  ["Claim voting rewards", "Once every 24h if you vote for producers or a proxy.", "eosio", "claimgbmvote", (me) => ({ owner: me })],
];

function CC_Lab(p) {
  return $e(p);
}

function CC_Field({ abi, type, value, onChange, label, actor, depth = 0 }) {
  const t = WHCC.resolve(abi, type);
  const lab = (
    <>
      <span className="label wh-label-row">
        <span>{label}</span>
        <span className="faint mono" style={{ fontSize: 10.5 }}>{type}</span>
      </span>
      {ccHelp(label) && <div className="faint" style={{ fontSize: 11, margin: "-2px 0 6px" }}>{ccHelp(label)}</div>}
    </>
  );
  if (t.endsWith("?") || t.endsWith("$")) {
    const inner = t.slice(0, -1);
    const on = value !== null && value !== void 0;
    return (
      <div className="field cc-box">
        <label className="row" style={{ justifyContent: "flex-start", gap: 8, fontSize: 13 }}>
          <input type="checkbox" className="check" checked={on} onChange={(e) => onChange(e.target.checked ? WHCC.empty(abi, inner, actor, label) : null)} />
          <span>{label} <span className="faint">(optional)</span></span>
        </label>
        {on && <CC_Field abi={abi} type={inner} value={value} onChange={onChange} label={label} actor={actor} depth={depth + 1} />}
      </div>
    );
  }
  if (t.endsWith("[]")) {
    const inner = t.slice(0, -2);
    const arr = value || [];
    const simple = !WHCC.struct(abi, WHCC.resolve(abi, inner)) && !WHCC.variant(abi, WHCC.resolve(abi, inner)) && WHCC.resolve(abi, inner) !== "extended_asset";
    return (
      <div className="field cc-box">
        {lab}
        {simple && (
          <textarea
            className="textarea"
            style={{ minHeight: 60 }}
            placeholder="One per line, or comma-separated"
            value={arr.join("\n")}
            onChange={(e) => onChange(e.target.value.split(/[\n,]/).map((s) => s.trim()))}
          />
        )}
        {!simple &&
          arr.map((v, i) => (
            <div key={i} className="cc-item">
              <CC_Field abi={abi} type={inner} value={v} label={`#${i + 1}`} actor={actor} depth={depth + 1} onChange={(nv) => onChange(arr.map((x, j) => (j === i ? nv : x)))} />
              <button type="button" className="btn sm ghost" onClick={() => onChange(arr.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
        {!simple && (
          <button type="button" className="btn sm" onClick={() => onChange([...arr, WHCC.empty(abi, inner, actor)])}>
            + Add item
          </button>
        )}
      </div>
    );
  }
  if (t === "bool")
    return (
      <label className="field row" style={{ justifyContent: "flex-start", gap: 8 }}>
        <input type="checkbox" className="check" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  const v = WHCC.variant(abi, t);
  if (v)
    return (
      <div className="field cc-box">
        {lab}
        <select className="select" value={value?.[0] || v.types[0]} onChange={(e) => onChange([e.target.value, WHCC.empty(abi, e.target.value, actor)])}>
          {v.types.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <CC_Field abi={abi} type={value?.[0] || v.types[0]} value={value?.[1]} label="value" actor={actor} depth={depth + 1} onChange={(nv) => onChange([value?.[0] || v.types[0], nv])} />
      </div>
    );
  if (t === "extended_asset")
    return (
      <div className="field cc-box">
        {lab}
        <input className="input" placeholder="quantity, e.g. 1.0000 TLM" value={value?.quantity || ""} onChange={(e) => onChange({ ...value, quantity: e.target.value })} />
        <input className="input" style={{ marginTop: 6 }} placeholder="token contract, e.g. alien.worlds" value={value?.contract || ""} onChange={(e) => onChange({ ...value, contract: e.target.value.toLowerCase() })} />
      </div>
    );
  const f = WHCC.struct(abi, t);
  if (f)
    return (
      <div className="field cc-box">
        {lab}
        {f.map((x) => (
          <CC_Field key={x.name} abi={abi} type={x.type} label={x.name} actor={actor} depth={depth + 1} value={value?.[x.name]} onChange={(nv) => onChange({ ...(value || {}), [x.name]: nv })} />
        ))}
      </div>
    );
  return (
    <div className="field">
      {lab}
      <input
        className="input"
        value={value ?? ""}
        inputMode={WHCC.isInt(t) || WHCC.isFloat(t) ? "decimal" : void 0}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={WHCC.hint(t) || (t === "name" ? "account name" : "")}
        onChange={(e) => onChange(e.target.value)}
      />
      {!ccHelp(label) && WHCC.hint(t) && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{WHCC.hint(t)}</div>}
    </div>
  );
}

function WH_Console({ session: t, onNeedLogin: e, toast: r, onBack: n }) {
  const me = Di(t);
  const [contract, setContract] = De.useState(() => WH.takeSub("", null) || "");
  const [input, setInput] = De.useState(contract);
  const [abi, setAbi] = De.useState(null);
  const [loading, setLoading] = De.useState(false);
  const [mode, setMode] = De.useState("actions");
  const [q, setQ] = De.useState("");
  const [action, setAction] = De.useState(null);
  const [form, setForm] = De.useState(null);
  const [raw, setRaw] = De.useState(false);
  const [rawText, setRawText] = De.useState("");
  const [perm, setPerm] = De.useState("");
  const [confirm, setConfirm] = De.useState(null);
  const [typed, setTyped] = De.useState("");
  const [busy, setBusy] = De.useState(false);
  const [recent, setRecent] = De.useState(() => WH.load("cc.recent", []));
  // tables
  const [table, setTable] = De.useState("");
  const [tq, setTq] = De.useState({ scope: "", lower: "", upper: "", index: "1", key: "", limit: "20", reverse: false });
  const [rows, setRows] = De.useState(null);
  const [more, setMore] = De.useState(null);
  const [tLoading, setTLoading] = De.useState(false);
  const [prefill, setPrefill] = De.useState(null);

  async function load(c) {
    const ck = WH.checkAccountName(c);
    if (!ck.ok) return r(ck.msg || "Enter a contract account", "error");
    setLoading(true);
    setAbi(null);
    setAction(null);
    setRows(null);
    try {
      const res = await r0("/v1/chain/get_abi", { account_name: ck.value });
      if (!res.abi) throw new Error(`${ck.value} has no contract deployed`);
      setContract(ck.value);
      setInput(ck.value);
      setAbi(res.abi);
      const nr = [ck.value, ...recent.filter((x) => x !== ck.value)].slice(0, 8);
      setRecent(nr);
      WH.save("cc.recent", nr);
    } catch (err) {
      r(err?.message || String(err), "error");
    } finally {
      setLoading(false);
    }
  }
  De.useEffect(() => {
    contract && load(contract);
  }, []);

  De.useEffect(() => {
    if (abi && prefill && prefill.contract === contract) {
      pick(prefill.action);
      setForm((f) => ({ ...(f || {}), ...prefill.data(me) }));
      setMode("actions");
      setPrefill(null);
    }
  }, [abi]);

  const actions = (abi?.actions || []).map((a) => a.name).filter((x) => !q || x.includes(q.toLowerCase())).sort();
  const actType = action && abi ? (abi.actions.find((a) => a.name === action) || {}).type : null;
  const danger = action && CC_DANGER[contract]?.[action];

  function pick(name) {
    const type = abi.actions.find((a) => a.name === name).type;
    const init = WHCC.empty(abi, type, me);
    setAction(name);
    setForm(init);
    setRawText(JSON.stringify(init, null, 2));
    setRaw(false);
  }

  function review() {
    if (!t) return e();
    let data;
    try {
      data = raw ? JSON.parse(rawText) : WHCC.clean(abi, actType, form);
    } catch (err) {
      return r(raw ? `That JSON doesn't parse: ${err.message}` : err.message, "error");
    }
    const authz = [{ actor: me, permission: perm.trim() || String(t.permission || "active") }];
    setTyped("");
    setConfirm({ acts: [{ account: contract, name: action, data, authorization: authz }], data });
  }
  async function send() {
    setBusy(true);
    try {
      const res = await yo(t, confirm.acts);
      r(pn(res) ? `Transaction sent\n${pn(res)}` : "Transaction sent", "success");
      setConfirm(null);
    } catch (err) {
      r(err?.message || String(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function fetchRows(append) {
    if (!table) return;
    setTLoading(true);
    try {
      const p = {
        code: contract,
        table,
        scope: tq.scope.trim() || contract,
        limit: Math.max(1, Math.min(500, Number(tq.limit) || 20)),
        reverse: !!tq.reverse,
      };
      if (tq.index && tq.index !== "1") {
        p.index_position = Number(tq.index);
        p.key_type = tq.key || "name";
      } else if (tq.key) p.key_type = tq.key;
      const lb = append ? more : tq.lower.trim();
      if (lb) p.lower_bound = lb;
      if (tq.upper.trim()) p.upper_bound = tq.upper.trim();
      const res = await qr(p);
      setRows(append ? [...(rows || []), ...(res.rows || [])] : res.rows || []);
      setMore(res.more ? res.next_key || null : null);
    } catch (err) {
      r(err?.message || String(err), "error");
    } finally {
      setTLoading(false);
    }
  }

  return (
    <>
      <div className="back-row">
        <button className="btn sm" onClick={n}>
          ← More
        </button>
        <h1 style={{ margin: 0, flex: 1 }}>Contract console</h1>
      </div>
      <p className="sub">Use any WAX contract directly, even if its website is gone. Forms are built from the contract's own ABI, and nothing is sent until you approve it in your wallet.</p>
      <CR_Help title="How the console works (read me first)">
        <ol>
          <li><b>Contract</b>: the account where a dApp's code lives, e.g. <span className="mono">atomicmarket</span>. Type it or pick one below.</li>
          <li><b>Actions</b> are the buttons a website would have pressed for you: <span className="mono">withdraw</span>, <span className="mono">claim</span>, <span className="mono">cancelsale</span>… Pick one and fill in the form. Every field has a hint.</li>
          <li><b>Review</b> shows exactly what will be sent. Your wallet then asks you to approve it. Nothing happens if you reject it.</li>
          <li><b>Tables</b> are the contract's stored data. Use them to look up IDs you need, e.g. your sale IDs or farm names. <i>Scope</i> is like a folder (often the contract itself or your account). <i>Bounds</i> jump to a key, e.g. your account name.</li>
        </ol>
        <p>Formats: amounts are <span className="mono">1.00000000 WAX</span> (all of the token's decimals plus the symbol). Symbols are <span className="mono">8,WAX</span>. Lists go one item per line.</p>
        <p>Tip: if you're not sure which action to use, try <b>Rescue & recover</b> first. It finds stuck items and fills these in for you.</p>
      </CR_Help>
      <form
        className="search"
        onSubmit={(ev) => {
          ev.preventDefault();
          load(input);
        }}
      >
        <input className="input" list="cc-known" value={input} placeholder="Contract account, e.g. blend.nefty" autoCapitalize="none" onChange={(ev) => setInput(ev.target.value.toLowerCase())} />
        <datalist id="cc-known">
          {CC_KNOWN.map(([c, d]) => (
            <option key={c} value={c}>
              {d}
            </option>
          ))}
        </datalist>
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? <div className="spinner" /> : "Load"}
        </button>
      </form>
      {!abi && !loading && (
        <>
          <h2>Common tasks</h2>
          <div className="cc-recipes">
            {CC_RECIPES.map(([title, desc, c, a, data]) => (
              <button
                key={title}
                className="hub-card"
                onClick={() => {
                  setPrefill({ contract: c, action: a, data });
                  load(c);
                }}
              >
                <span className="pill">{c}::{a}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </button>
            ))}
          </div>
          {recent.length > 0 && (
            <div className="wh-chips" style={{ marginTop: 0, marginBottom: 12 }}>
              <span className="faint" style={{ fontSize: 11 }}>Recent:</span>
              {recent.map((c) => (
                <button key={c} className="wh-chip" onClick={() => load(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <h2>Popular contracts</h2>
          <div className="card" style={{ paddingTop: 4 }}>
            {CC_KNOWN.map(([c, d]) => (
              <button key={c} className="list-item" style={{ width: "100%", textAlign: "left" }} onClick={() => load(c)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{d}</div>
                  <div className="faint mono" style={{ fontSize: 11 }}>{c}</div>
                </div>
                <span className="faint">›</span>
              </button>
            ))}
          </div>
        </>
      )}
      {abi && (
        <>
          <div className="tabs">
            <button className={`tab ${mode === "actions" ? "on" : ""}`} onClick={() => setMode("actions")}>
              Actions ({abi.actions.length})
            </button>
            <button className={`tab ${mode === "tables" ? "on" : ""}`} onClick={() => setMode("tables")}>
              Tables ({abi.tables.length})
            </button>
            <WH_Link className="tab" href={WH.accountUrl(contract)}>
              Explorer ↗
            </WH_Link>
          </div>
          {mode === "actions" && !action && (
            <>
              <input className="input" style={{ marginBottom: 10 }} placeholder="Filter actions, e.g. claim, withdraw, cancel" value={q} onChange={(ev) => setQ(ev.target.value)} />
              <div className="wh-chips" style={{ marginTop: 0 }}>
                {actions.map((a) => (
                  <button key={a} className={`wh-chip ${CC_DANGER[contract]?.[a] ? "" : !a.startsWith("log") && /claim|withdraw|cancel|unstake|refund|retry|return/.test(a) ? "accent" : ""}`} onClick={() => pick(a)}>
                    {a}
                  </button>
                ))}
              </div>
              <p className="faint" style={{ fontSize: 12 }}>Highlighted actions usually return funds or NFTs to you (claim, withdraw, cancel, unstake…).</p>
            </>
          )}
          {mode === "actions" && action && (
            <div className="card">
              <div className="row">
                <h3 style={{ margin: 0 }} className="mono">
                  {contract}::{action}
                </h3>
                <button className="btn sm ghost" onClick={() => setAction(null)}>
                  Change
                </button>
              </div>
              {(() => {
                const ric = String((abi.actions.find((x) => x.name === action) || {}).ricardian_contract || "")
                  .replace(/^---[\s\S]*?---/, "")
                  .replace(/\{\{[^}]*\}\}/g, "…")
                  .replace(/[#*_`>]/g, "")
                  .trim();
                return ric ? (
                  <details className="cr-help" style={{ marginTop: 8 }}>
                    <summary>{WH_I.info} What the contract says this action does</summary>
                    <div style={{ whiteSpace: "pre-wrap" }}>{ric.slice(0, 900)}</div>
                  </details>
                ) : null;
              })()}
              {danger ? (
                <div className="warn" style={{ background: "var(--bad-dim)", color: "#ffb3b3", borderColor: "rgba(255,93,93,.4)" }}>
                  ⚠ <b>{action}</b> can change who controls your account or what code it runs. Never do this because someone asked you to in a chat or DM. That's how accounts get stolen.
                </div>
              ) : null}
              <div className="tabs" style={{ marginTop: 10 }}>
                <button className={`tab ${!raw ? "on" : ""}`} onClick={() => setRaw(false)}>
                  Form
                </button>
                <button
                  className={`tab ${raw ? "on" : ""}`}
                  onClick={() => {
                    try {
                      setRawText(JSON.stringify(WHCC.clean(abi, actType, form), null, 2));
                    } catch {
                      setRawText(JSON.stringify(form, null, 2));
                    }
                    setRaw(true);
                  }}
                >
                  JSON
                </button>
              </div>
              {!raw && (WHCC.struct(abi, actType) || []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>This action takes no parameters.</p>}
              {!raw &&
                (WHCC.struct(abi, actType) || []).map((x) => (
                  <CC_Field key={x.name} abi={abi} type={x.type} label={x.name} actor={me} value={form?.[x.name]} onChange={(nv) => setForm((f) => ({ ...(f || {}), [x.name]: nv }))} />
                ))}
              {raw && <textarea className="textarea mono" style={{ minHeight: 180, fontSize: 12.5 }} value={rawText} onChange={(ev) => setRawText(ev.target.value)} spellCheck={false} />}
              <details style={{ margin: "6px 0 12px" }}>
                <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>
                  Advanced: permission
                </summary>
                <input className="input" style={{ marginTop: 8 }} placeholder={`default: ${t ? String(t.permission || "active") : "active"}`} value={perm} onChange={(ev) => setPerm(ev.target.value.toLowerCase())} />
              </details>
              <button className="btn primary block" onClick={review}>
                Review
              </button>
            </div>
          )}
          {mode === "tables" && (
            <>
              <div className="wh-chips" style={{ marginTop: 0, marginBottom: 10 }}>
                {abi.tables.map((x) => (
                  <button
                    key={x.name}
                    className={`wh-chip ${table === x.name ? "accent" : ""}`}
                    onClick={() => {
                      setTable(x.name);
                      setRows(null);
                    }}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
              {table && (
                <div className="card">
                  <div className="faint mono" style={{ fontSize: 11, marginBottom: 8 }}>
                    row: {(WHCC.struct(abi, (abi.tables.find((x) => x.name === table) || {}).type) || []).map((f) => f.name).join(", ")}
                  </div>
                  <div className="btn-row" style={{ marginTop: 0 }}>
                    <CC_Lab label="Scope">
                      <input className="input" placeholder={contract} value={tq.scope} onChange={(ev) => setTq({ ...tq, scope: ev.target.value })} />
                    </CC_Lab>
                    <CC_Lab label="Limit">
                      <input className="input" inputMode="numeric" value={tq.limit} onChange={(ev) => setTq({ ...tq, limit: ev.target.value })} />
                    </CC_Lab>
                    <CC_Lab label="Lower bound">
                      <input className="input" value={tq.lower} onChange={(ev) => setTq({ ...tq, lower: ev.target.value })} />
                    </CC_Lab>
                    <CC_Lab label="Upper bound">
                      <input className="input" value={tq.upper} onChange={(ev) => setTq({ ...tq, upper: ev.target.value })} />
                    </CC_Lab>
                    <CC_Lab label="Index (1 = primary)">
                      <input className="input" inputMode="numeric" value={tq.index} onChange={(ev) => setTq({ ...tq, index: ev.target.value })} />
                    </CC_Lab>
                    <CC_Lab label="Key type">
                      <select className="select" value={tq.key} onChange={(ev) => setTq({ ...tq, key: ev.target.value })}>
                        {["", "name", "i64", "i128", "sha256", "float64"].map((k) => (
                          <option key={k} value={k}>
                            {k || "auto"}
                          </option>
                        ))}
                      </select>
                    </CC_Lab>
                  </div>
                  <label className="row" style={{ justifyContent: "flex-start", gap: 8, fontSize: 13, marginBottom: 10 }}>
                    <input type="checkbox" className="check" checked={tq.reverse} onChange={(ev) => setTq({ ...tq, reverse: ev.target.checked })} />
                    Newest first (reverse)
                  </label>
                  <div className="btn-row" style={{ marginTop: 0 }}>
                    {me && (
                      <button className="btn" onClick={() => setTq({ ...tq, scope: me, lower: "", upper: "", index: "1", key: "" })}>
                        Scope = me
                      </button>
                    )}
                    {me && (
                      <button className="btn" onClick={() => setTq({ ...tq, scope: "", lower: me, upper: me, index: "1", key: "name" })}>
                        Key = me
                      </button>
                    )}
                  </div>
                  <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => fetchRows(false)} disabled={tLoading}>
                    {tLoading ? <div className="spinner" /> : "Fetch rows"}
                  </button>
                </div>
              )}
              {rows && (
                <>
                  <div className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>{rows.length} row(s)</div>
                  {rows.length === 0 && <WH_Empty title="No rows" text="Try a different scope, bounds or index." />}
                  {rows.map((x, i) => (
                    <pre key={i} className="card mono cc-row">
                      {JSON.stringify(x, null, 2)}
                    </pre>
                  ))}
                  {more && (
                    <button className="btn block" onClick={() => fetchRows(true)} disabled={tLoading}>
                      Load more
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {confirm && (
        <WH_Sheet open title={`Run ${action}`} onClose={() => !busy && setConfirm(null)}>
          <div className="wh-confirm-intro">
            <span className="wh-confirm-shield">{WH_I.shield}</span>
            <span>
              {contract}::{action} as {confirm.acts[0].authorization[0].actor}@{confirm.acts[0].authorization[0].permission}. Check the data below.
            </span>
          </div>
          <pre className="mono cc-row" style={{ maxHeight: 260 }}>{JSON.stringify(confirm.data, null, 2)}</pre>
          {danger ? (
            <div className="field">
              <span className="label">Type your account name ({me}) to confirm this high-risk action</span>
              <input className="input" value={typed} onChange={(ev) => setTyped(ev.target.value.toLowerCase())} autoCapitalize="none" />
            </div>
          ) : null}
          {busy && (
            <div className="wh-waiting">
              <div className="spinner" />
              <span>Waiting for your wallet…</span>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </button>
            <button className={`btn ${danger ? "danger" : "primary"}`} onClick={send} disabled={busy || (danger && typed !== me)}>
              {busy ? <div className="spinner" /> : "Approve in wallet"}
            </button>
          </div>
        </WH_Sheet>
      )}
    </>
  );
}
