// Guided Creator studio: Collection -> Schema -> Template -> Mint -> Sell.
// Every action matches the live atomicassets / neftyblocksd ABIs.

const WHCR = (() => {
  // AtomicAssets schema types -> ATOMIC_ATTRIBUTE variant type
  const TYPES = [
    ["string", "Text", "Words, sentences, links. e.g. name, description, rarity"],
    ["image", "Image (IPFS)", "IPFS hash of a picture, e.g. QmXy…. Use the attribute name “img” so markets show it"],
    ["ipfs", "File (IPFS)", "IPFS hash of any file, e.g. a video (call it “video”) or 3D model"],
    ["bool", "Yes / no", "Stored as 1 or 0"],
    ["uint64", "Whole number", "0 or more, e.g. level, power, edition"],
    ["uint32", "Whole number (small)", "0 to ~4 billion"],
    ["uint8", "Tiny number", "0–255, e.g. stars"],
    ["int64", "Whole number (+/−)", "Can be negative"],
    ["float", "Decimal", "e.g. 1.5 (single precision)"],
    ["double", "Precise decimal", "e.g. 3.14159 (double precision)"],
    ["string[]", "List of texts", "Several values, one per line"],
    ["uint64[]", "List of numbers", "Several whole numbers, one per line"],
  ];
  const PRESETS = {
    "Art / collectible": [["name", "string"], ["img", "image"], ["description", "string"], ["artist", "string"]],
    "Video NFT": [["name", "string"], ["img", "image"], ["video", "ipfs"], ["description", "string"]],
    "Game item": [["name", "string"], ["img", "image"], ["rarity", "string"], ["level", "uint64"], ["power", "uint64"], ["description", "string"]],
    "Ticket / pass": [["name", "string"], ["img", "image"], ["event", "string"], ["valid_until", "string"], ["tier", "string"]],
  };
  function attr(type, raw) {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    const list = () => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    if (type === "string" || type === "image" || type === "ipfs") return ["string", s];
    if (type === "bool") return ["uint8", /^(1|true|yes|y)$/i.test(s) ? 1 : 0];
    if (/^u?int(8|16|32|64)$/.test(type)) {
      if (!/^-?\d+$/.test(s)) throw new Error(`“${s}” must be a whole number`);
      if (type.startsWith("u") && s.startsWith("-")) throw new Error(`“${s}” can't be negative`);
      return [type, /64/.test(type) ? s : Number(s)];
    }
    if (type === "float" || type === "double") {
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) throw new Error(`“${s}” must be a number`);
      return [type === "float" ? "float32" : "float64", n];
    }
    if (/\[\]$/.test(type)) {
      const base = type.slice(0, -2);
      if (["string", "image", "ipfs"].includes(base)) return ["STRING_VEC", list()];
      const V = { uint8: "UINT8_VEC", uint16: "UINT16_VEC", uint32: "UINT32_VEC", uint64: "UINT64_VEC", int16: "INT16_VEC", int32: "INT32_VEC", int64: "INT64_VEC", float: "FLOAT_VEC", double: "DOUBLE_VEC" }[base];
      if (V) return [V, list().map((x) => (/64/.test(base) ? x : Number(x)))];
    }
    return ["string", s];
  }
  const toMap = (obj, fmt) =>
    fmt.map((f) => ({ key: f.name, v: attr(f.type, obj[f.name]) })).filter((x) => x.v).map((x) => ({ key: x.key, value: x.v }));
  const nameOk = (v) => /^[a-z1-5.]{1,12}$/.test(v) && !v.endsWith(".");
  const ipfsImg = (v) => (!v ? null : /^https?:/.test(v) ? v : `https://ipfs.io/ipfs/${v.replace(/^ipfs:\/\//, "")}`);
  return { TYPES, PRESETS, attr, toMap, nameOk, ipfsImg };
})();

function CR_Help({ children, title = "How this works" }) {
  return (
    <details className="cr-help">
      <summary>{WH_I.info} {title}</summary>
      <div>{children}</div>
    </details>
  );
}
function CR_F({ label, hint, example, children, err }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {err ? <div className="wh-field-msg err">{err}</div> : hint || example ? (
        <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
          {hint}
          {example && <> {hint ? "· " : ""}e.g. <span className="mono">{example}</span></>}
        </div>
      ) : null}
    </div>
  );
}
function CR_Steps({ step, setStep, col, counts }) {
  const S = [
    ["collection", "1", "Collection", col ? col : "Your brand"],
    ["schema", "2", "Schema", counts.schemas != null ? `${counts.schemas} made` : "Attribute list"],
    ["template", "3", "Template", counts.templates != null ? `${counts.templates} made` : "The NFT design"],
    ["mint", "4", "Mint", "Create copies"],
    ["sell", "5", "Sell", "Drop / blend"],
  ];
  return (
    <div className="cr-steps">
      {S.map(([k, n, t, d]) => (
        <button key={k} className={`cr-step ${step === k ? "on" : ""}`} onClick={() => setStep(k)} disabled={k !== "collection" && !col}>
          <span className="cr-num">{n}</span>
          <b>{t}</b>
          <span>{d}</span>
        </button>
      ))}
    </div>
  );
}

function WH_Creator({ session: t, onNeedLogin: e, toast: r, onBack: n }) {
  const me = Di(t);
  const [step, setStep] = De.useState("home");
  const [col, setCol] = De.useState(() => WH.load("cr.col", ""));
  const [mine, setMine] = De.useState(null);
  const [colInfo, setColInfo] = De.useState(null);
  const [schemas, setSchemas] = De.useState(null);
  const [templates, setTemplates] = De.useState(null);
  const [confirm, setConfirm] = De.useState(null);
  const [busy, setBusy] = De.useState(false);
  const [progress, setProgress] = De.useState("");

  const loadMine = De.useCallback(async () => {
    if (!me) return setMine([]);
    const r1 = await to(`/atomicassets/v1/collections?authorized_account=${me}&limit=100`).catch(() => ({ data: [] }));
    setMine(r1.data || []);
  }, [me]);
  const loadCol = De.useCallback(async (c) => {
    if (!c) return;
    setColInfo(null);
    setSchemas(null);
    setTemplates(null);
    const [ci, sc, tp] = await Promise.all([
      to(`/atomicassets/v1/collections/${c}`).catch(() => null),
      to(`/atomicassets/v1/schemas?collection_name=${c}&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicassets/v1/templates?collection_name=${c}&limit=100&order=desc&sort=created`).catch(() => ({ data: [] })),
    ]);
    setColInfo(ci?.data || false);
    setSchemas(sc.data || []);
    setTemplates(tp.data || []);
  }, []);
  De.useEffect(() => {
    loadMine();
  }, [loadMine]);
  De.useEffect(() => {
    WH.save("cr.col", col);
    col && loadCol(col);
  }, [col]);

  const isAuth = !!colInfo && (colInfo.authorized_accounts || []).includes(me);
  const ask = (c) => (t ? setConfirm(c) : e());
  async function run() {
    setBusy(true);
    try {
      const batches = confirm.batches || [confirm.acts];
      let last = "";
      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) setProgress(`Transaction ${i + 1} of ${batches.length}…`);
        const res = await yo(t, batches[i]);
        last = pn(res);
      }
      r(last ? `Transaction sent\n${last}` : "Transaction sent", "success");
      const after = confirm.after;
      setConfirm(null);
      setTimeout(() => {
        loadMine();
        col && loadCol(col);
        after && after();
      }, 2500);
    } catch (err) {
      r(err?.message || String(err), "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const head = (
    <div className="back-row">
      <button className="btn sm" onClick={step === "home" ? n : () => setStep("home")}>
        ← {step === "home" ? "More" : "Studio"}
      </button>
      <h1 style={{ margin: 0, flex: 1 }}>Creator studio</h1>
    </div>
  );
  const common = { me, col, setCol, colInfo, isAuth, schemas, templates, ask, toast: r, setStep, mine };

  return (
    <>
      {head}
      {!t && (
        <div className="warn">
          You can read everything here, but you need to <a onClick={e} style={{ cursor: "pointer", textDecoration: "underline" }}>sign in</a> to create or mint.
        </div>
      )}
      <CR_Steps step={step} setStep={setStep} col={col} counts={{ schemas: schemas?.length, templates: templates?.length }} />
      {step === "home" && <CR_Home {...common} />}
      {step === "collection" && <CR_Collection {...common} />}
      {step === "schema" && <CR_Schema {...common} />}
      {step === "template" && <CR_Template {...common} />}
      {step === "mint" && <CR_Mint {...common} />}
      {step === "sell" && <CR_Sell {...common} session={t} onNeedLogin={e} />}
      <WH_Confirm
        open={!!confirm}
        title={confirm?.title || ""}
        details={[...(confirm?.details || []), ...(progress ? [{ label: "Progress", value: progress }] : [])]}
        warning={confirm?.warning}
        busy={busy}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={run}
      />
    </>
  );
}

function CR_Home({ me, col, setCol, mine, setStep, colInfo }) {
  const [pick, setPick] = De.useState("");
  return (
    <>
      <CR_Help title="New to making NFTs? Start here">
        <p>NFTs on WAX use the AtomicAssets standard. Each one is built from four layers:</p>
        <ol>
          <li><b>Collection</b>: your brand. It holds a name, logo, description and the royalty (market fee) you earn on resales.</li>
          <li><b>Schema</b>: the list of attributes your NFTs have, like a spreadsheet's column headers (name, img, rarity…).</li>
          <li><b>Template</b>: one NFT design that fills in those attributes, e.g. “Gold Dragon, rarity Legendary”. You can cap how many can exist.</li>
          <li><b>Mint</b>: creates actual copies of a template and sends them to wallets.</li>
        </ol>
        <p>Then sell them with a <b>drop</b> (people claim or buy them at a fixed price), a <b>blend</b> (people combine NFTs into new ones), or by listing them on the Market tab.</p>
        <p>Costs: everything is paid in RAM (storage). Each new NFT uses about 150 bytes of RAM, a fraction of a cent. Check your RAM on the Wallet tab.</p>
      </CR_Help>
      <h2>Choose a collection</h2>
      {mine === null && De.createElement(ra, { h: 40 })}
      {mine && mine.length > 0 && (
        <div className="wh-chips" style={{ marginTop: 0 }}>
          {mine.map((c) => (
            <button key={c.collection_name} className={`wh-chip big ${col === c.collection_name ? "accent" : ""}`} onClick={() => setCol(c.collection_name)}>
              {c.name || c.collection_name} <span className="faint mono">{c.collection_name}</span>
            </button>
          ))}
        </div>
      )}
      {mine && mine.length === 0 && me && <p className="muted" style={{ fontSize: 13 }}>{me} isn't authorised on any collection yet. Create one below.</p>}
      <form
        className="search"
        style={{ marginTop: 10 }}
        onSubmit={(ev) => {
          ev.preventDefault();
          WHCR.nameOk(pick.trim()) && setCol(pick.trim());
        }}
      >
        <input className="input" placeholder="Or open any collection by name" value={pick} onChange={(ev) => setPick(ev.target.value.toLowerCase())} autoCapitalize="none" />
        <button className="btn" type="submit">
          Open
        </button>
      </form>
      <button className="btn primary block" onClick={() => { setCol(""); setStep("collection"); }}>
        + Create a new collection
      </button>
      {col && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row">
            <div>
              <div style={{ fontWeight: 700 }}>{colInfo?.name || col}</div>
              <div className="faint mono" style={{ fontSize: 11 }}>{col}</div>
            </div>
            {colInfo === false && <span className="pill bad">Not found</span>}
            {colInfo && <span className="pill">{((colInfo.market_fee || 0) * 100).toFixed(1)}% fee</span>}
          </div>
          <div className="btn-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <button className="btn" onClick={() => setStep("collection")}>Edit collection</button>
            <button className="btn" onClick={() => setStep("schema")}>Schemas</button>
            <button className="btn" onClick={() => setStep("template")}>Templates</button>
            <button className="btn primary" onClick={() => setStep("mint")}>Mint NFTs</button>
          </div>
        </div>
      )}
    </>
  );
}

function CR_Collection({ me, col, setCol, colInfo, isAuth, ask }) {
  const creating = !col || colInfo === false;
  const d = Object.fromEntries((colInfo?.data ? Object.entries(colInfo.data) : []).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  const [f, setF] = De.useState({});
  De.useEffect(() => {
    setF({
      cname: creating ? col || "" : col,
      name: d.name || colInfo?.name || "",
      img: d.img || colInfo?.img || "",
      description: d.description || "",
      url: d.url || "",
      fee: colInfo ? String(((colInfo.market_fee || 0) * 100).toFixed(2)).replace(/\.?0+$/, "") : "5",
      auth: (colInfo?.authorized_accounts || [me]).filter(Boolean).join("\n"),
      acct: "",
    });
  }, [colInfo, col]);
  const [avail, setAvail] = De.useState(null);
  De.useEffect(() => {
    if (!creating || !WHCR.nameOk(f.cname || "")) return setAvail(null);
    let live = true;
    const tm = setTimeout(async () => {
      const ex = await to(`/atomicassets/v1/collections/${f.cname}`).then(() => true).catch(() => false);
      let acct = false;
      try {
        await r0("/v1/chain/get_account", { account_name: f.cname });
        acct = true;
      } catch {}
      live && setAvail({ taken: ex, acct });
    }, 450);
    return () => {
      live = false;
      clearTimeout(tm);
    };
  }, [f.cname, creating]);
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const fee = Number(String(f.fee || "0").replace(",", "."));
  const feeErr = !(fee >= 0 && fee <= 15) ? "Must be between 0 and 15%" : "";
  const nameErr = creating && f.cname && !WHCR.nameOk(f.cname) ? "1–12 characters: a–z, 1–5 and dots (not at the end)" : avail?.taken ? "Already taken" : avail?.acct && f.cname !== me ? `A WAX account called ${f.cname} exists, so only that account can create this collection` : "";
  const dataMap = () =>
    [["name", f.name], ["img", f.img], ["description", f.description], ["url", f.url]]
      .filter(([, v]) => String(v || "").trim())
      .map(([k, v]) => ({ key: k, value: ["string", String(v).trim()] }));
  const auths = String(f.auth || "").split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return (
    <>
      <h2>{creating ? "Create a collection" : `Edit ${colInfo?.name || col}`}</h2>
      <CR_Help>
        <p>A collection is the home for all your NFTs. Markets show its name, image and description, and buyers check the collection account name to make sure they're buying the real thing.</p>
        <p><b>Market fee</b> is your royalty: the % you receive every time one of your NFTs resells on AtomicHub-compatible markets. 2–8% is common. You can change it later.</p>
        <p><b>Authorised accounts</b> can create schemas and templates and mint in this collection. Keep your own account. Add a team member's account, or a contract like <span className="mono">neftyblocksd</span> (needed for NeftyBlocks drops).</p>
      </CR_Help>
      {!creating && !isAuth && colInfo && <div className="warn">You're not an authorised account on this collection, so you can view it but not change it.</div>}
      <div className="card">
        {creating && (
          <CR_F label="Collection account name" hint="Permanent and unique. This is what buyers verify." example="mydragons123" err={nameErr}>
            <input className={`input ${f.cname && !nameErr && avail ? "wh-valid" : ""}`} value={f.cname || ""} maxLength={12} autoCapitalize="none" onChange={(ev) => setF({ ...f, cname: ev.target.value.toLowerCase().replace(/\s/g, "") })} />
            {avail && !nameErr && <div className="wh-field-msg ok">✓ Available</div>}
          </CR_F>
        )}
        <CR_F label="Display name" example="My Dragons">
          <input className="input" value={f.name || ""} onChange={set("name")} />
        </CR_F>
        <CR_F label="Logo image (IPFS hash or URL)" hint="Upload a square image to an IPFS service like Pinata or NFT.Storage and paste the hash" example="QmYwAPJzv5CZsnA…">
          <input className="input" value={f.img || ""} onChange={set("img")} autoCapitalize="none" />
        </CR_F>
        {f.img && (
          <div className="cr-preview-logo">
            <img src={WHCR.ipfsImg(f.img)} alt="" onError={(ev) => (ev.currentTarget.style.opacity = 0.2)} />
          </div>
        )}
        <CR_F label="Description">
          <textarea className="textarea" value={f.description || ""} onChange={set("description")} placeholder="What is this collection about?" />
        </CR_F>
        <CR_F label="Website (optional)" example="https://mydragons.io">
          <input className="input" value={f.url || ""} onChange={set("url")} autoCapitalize="none" />
        </CR_F>
        <CR_F label={`Market fee (royalty): ${Number.isFinite(fee) ? fee : 0}%`} hint="What you earn on every resale. Max 15%" err={feeErr}>
          <input type="range" min="0" max="15" step="0.5" value={Number.isFinite(fee) ? fee : 0} onChange={set("fee")} className="cr-range" />
        </CR_F>
        {creating && (
          <CR_F label="Authorised accounts (one per line)" hint="Who can create templates and mint. Include yourself">
            <textarea className="textarea" value={f.auth || ""} onChange={set("auth")} />
          </CR_F>
        )}
        <button
          className="btn primary block"
          disabled={creating ? !f.cname || !!nameErr || !!feeErr : !isAuth}
          onClick={() => {
            if (creating) {
              ask({
                title: "Create collection",
                details: [
                  { label: "Collection", value: f.cname },
                  { label: "Display name", value: f.name || "—" },
                  { label: "Royalty", value: `${fee}%` },
                  { label: "Authorised", value: auths.join(", ") || me },
                ],
                acts: [
                  {
                    account: "atomicassets",
                    name: "createcol",
                    data: { author: me, collection_name: f.cname, allow_notify: !0, authorized_accounts: auths.length ? auths : [me], notify_accounts: [], market_fee: fee / 100, data: dataMap() },
                  },
                ],
                after: () => setCol(f.cname),
              });
            } else {
              const acts = [{ account: "atomicassets", name: "setcoldata", data: { collection_name: col, data: [...dataMap(), ...Object.entries(d).filter(([k]) => !["name", "img", "description", "url"].includes(k)).map(([k, v]) => ({ key: k, value: ["string", v] }))] } }];
              if (Math.abs(fee / 100 - (colInfo.market_fee || 0)) > 1e-9) acts.push({ account: "atomicassets", name: "setmarketfee", data: { collection_name: col, market_fee: fee / 100 } });
              ask({ title: "Update collection", details: [{ label: "Collection", value: col }, { label: "Royalty", value: `${fee}%` }], acts });
            }
          }}
        >
          {creating ? "Review & create collection" : "Save changes"}
        </button>
      </div>
      {!creating && colInfo && (
        <div className="card">
          <h3>Authorised accounts</h3>
          <div className="wh-chips" style={{ marginTop: 0 }}>
            {(colInfo.authorized_accounts || []).map((a) => (
              <span key={a} className="wh-chip">
                {a}
              </span>
            ))}
          </div>
          <CR_F label="Add or remove an account" hint="Add “neftyblocksd” to run NeftyBlocks drops, or “blend.nefty” for blends">
            <input className="input" value={f.acct || ""} onChange={(ev) => setF({ ...f, acct: ev.target.value.toLowerCase().trim() })} autoCapitalize="none" />
          </CR_F>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button className="btn" disabled={!isAuth || !WHCR.nameOk(f.acct || "")} onClick={() => ask({ title: "Authorise account", details: [{ label: "Account", value: f.acct }, { label: "Collection", value: col }], acts: [{ account: "atomicassets", name: "addcolauth", data: { collection_name: col, account_to_add: f.acct } }] })}>
              Add
            </button>
            <button className="btn danger" disabled={!isAuth || !WHCR.nameOk(f.acct || "")} onClick={() => ask({ title: "Remove authorised account", details: [{ label: "Account", value: f.acct }], warning: f.acct === me ? "You're removing yourself. You won't be able to manage this collection afterwards unless another authorised account adds you back." : void 0, acts: [{ account: "atomicassets", name: "remcolauth", data: { collection_name: col, account_to_remove: f.acct } }] })}>
              Remove
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CR_Schema({ me, col, isAuth, schemas, ask }) {
  const [name, setName] = De.useState("");
  const [rows, setRows] = De.useState(WHCR.PRESETS["Art / collectible"].map(([n, t]) => ({ n, t })));
  const [extend, setExtend] = De.useState(null);
  const existing = schemas || [];
  const target = extend ? existing.find((s) => s.schema_name === extend) : null;
  const dupe = (() => {
    const seen = new Set((target?.format || []).map((f) => f.name));
    for (const r of rows) {
      if (!r.n.trim()) continue;
      if (seen.has(r.n.trim())) return r.n.trim();
      seen.add(r.n.trim());
    }
    return "";
  })();
  const valid = rows.filter((r) => r.n.trim());
  const nameErr = !extend && name && !WHCR.nameOk(name) ? "1–12 characters: a–z, 1–5, dots" : !extend && existing.some((s) => s.schema_name === name) ? "Already exists in this collection" : "";
  return (
    <>
      <h2>Schemas in {col}</h2>
      <CR_Help>
        <p>A schema is the list of attributes your NFTs can have. Every template and NFT in that schema fills in some or all of them. Think of it as the column headers of a spreadsheet.</p>
        <p>Use <b>name</b> (text) and <b>img</b> (image) so wallets and markets display your NFTs properly. Add <b>video</b> (file) for video NFTs.</p>
        <p>You can add attributes to a schema later, but you can never remove or rename them. Start simple.</p>
      </CR_Help>
      {schemas === null && De.createElement(ra, { h: 60 })}
      {existing.map((s) => (
        <div className="card" key={s.schema_name}>
          <div className="row">
            <b className="mono">{s.schema_name}</b>
            {isAuth && (
              <button className="btn sm" onClick={() => { setExtend(s.schema_name); setRows([{ n: "", t: "string" }]); }}>
                Add attributes
              </button>
            )}
          </div>
          <div className="wh-chips">
            {(s.format || []).map((f) => (
              <span className="wh-chip" key={f.name}>
                {f.name} <span className="faint">{f.type}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="card">
        <h3>{extend ? `Add attributes to “${extend}”` : "Create a new schema"}</h3>
        {!extend && (
          <>
            <CR_F label="Schema name" hint="Groups similar NFTs" example="dragons, cards, tickets" err={nameErr}>
              <input className="input" value={name} maxLength={12} onChange={(ev) => setName(ev.target.value.toLowerCase().replace(/\s/g, ""))} autoCapitalize="none" />
            </CR_F>
            <div className="label">Start from a preset</div>
            <div className="wh-chips" style={{ marginTop: 0, marginBottom: 10 }}>
              {Object.keys(WHCR.PRESETS).map((k) => (
                <button key={k} className="wh-chip" onClick={() => setRows(WHCR.PRESETS[k].map(([n, t]) => ({ n, t })))}>
                  {k}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="label">Attributes</div>
        {rows.map((r, i) => (
          <div className="cr-attr" key={i}>
            <input className="input" placeholder="attribute name" value={r.n} onChange={(ev) => setRows(rows.map((x, j) => (j === i ? { ...x, n: ev.target.value.replace(/\s/g, "_") } : x)))} autoCapitalize="none" />
            <select className="select" value={r.t} onChange={(ev) => setRows(rows.map((x, j) => (j === i ? { ...x, t: ev.target.value } : x)))}>
              {WHCR.TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button className="wh-icon-btn" aria-label="Remove attribute" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              {WH_I.close}
            </button>
            <div className="faint cr-attr-hint">{(WHCR.TYPES.find((x) => x[0] === r.t) || [])[2]}</div>
          </div>
        ))}
        <button className="btn sm" onClick={() => setRows([...rows, { n: "", t: "string" }])}>
          + Add attribute
        </button>
        {dupe && <div className="wh-field-msg err">“{dupe}” is used twice.</div>}
        <div className="btn-row">
          {extend && (
            <button className="btn" onClick={() => { setExtend(null); setRows(WHCR.PRESETS["Art / collectible"].map(([n, t]) => ({ n, t }))); }}>
              Cancel
            </button>
          )}
          <button
            className="btn primary"
            style={extend ? {} : { gridColumn: "1 / -1" }}
            disabled={!isAuth || !valid.length || !!dupe || (!extend && (!name || !!nameErr))}
            onClick={() => {
              const fmt = valid.map((r) => ({ name: r.n.trim(), type: r.t }));
              ask(
                extend
                  ? { title: "Add schema attributes", details: [{ label: "Schema", value: extend }, { label: "New attributes", value: fmt.map((f) => `${f.name} (${f.type})`).join(", ") }], acts: [{ account: "atomicassets", name: "extendschema", data: { authorized_editor: me, collection_name: col, schema_name: extend, schema_format_extension: fmt } }], warning: "Attributes can't be removed or renamed later.", after: () => setExtend(null) }
                  : { title: "Create schema", details: [{ label: "Collection", value: col }, { label: "Schema", value: name }, { label: "Attributes", value: fmt.map((f) => `${f.name} (${f.type})`).join(", ") }], acts: [{ account: "atomicassets", name: "createschema", data: { authorized_creator: me, collection_name: col, schema_name: name, schema_format: fmt } }], warning: "Attributes can't be removed or renamed later." },
              );
            }}
          >
            {extend ? "Review & add" : "Review & create schema"}
          </button>
        </div>
        {!isAuth && <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Only authorised accounts of {col} can do this.</div>}
      </div>
    </>
  );
}

function CR_Template({ me, col, isAuth, schemas, templates, ask, setStep }) {
  const [schema, setSchema] = De.useState("");
  const [vals, setVals] = De.useState({});
  const [opt, setOpt] = De.useState({ max: "0", transferable: true, burnable: true });
  const sc = (schemas || []).find((s) => s.schema_name === schema) || (schemas || [])[0];
  De.useEffect(() => {
    sc && !schema && setSchema(sc.schema_name);
  }, [schemas]);
  const fmt = sc?.format || [];
  let err = "";
  let data = [];
  try {
    data = WHCR.toMap(vals, fmt);
  } catch (ex) {
    err = ex.message;
  }
  const img = vals.img || vals.image;
  return (
    <>
      <h2>Templates in {col}</h2>
      <CR_Help>
        <p>A template is one NFT design. Fill in the attributes once and every NFT minted from it shares them. 1,000 copies of the same card = 1 template.</p>
        <p><b>Max supply</b> caps how many can ever be minted (0 = no cap). Buyers value a fixed supply. You can lower it later but never raise it.</p>
        <p><b>Transferable</b> off makes it soulbound (can't be sent or sold). <b>Burnable</b> lets owners destroy it, which blends need.</p>
      </CR_Help>
      {!(schemas || []).length && schemas !== null && (
        <div className="warn">
          This collection has no schema yet. <a onClick={() => setStep("schema")} style={{ textDecoration: "underline", cursor: "pointer" }}>Create one first</a>.
        </div>
      )}
      {!!(schemas || []).length && (
        <div className="card">
          <h3>New template</h3>
          <CR_F label="Schema">
            <select className="select" value={schema} onChange={(ev) => { setSchema(ev.target.value); setVals({}); }}>
              {(schemas || []).map((s) => (
                <option key={s.schema_name} value={s.schema_name}>
                  {s.schema_name} ({(s.format || []).length} attributes)
                </option>
              ))}
            </select>
          </CR_F>
          {fmt.map((f) => (
            <CR_F key={f.name} label={`${f.name}`} hint={(WHCR.TYPES.find((x) => x[0] === f.type) || [, f.type])[1]}>
              {f.type === "bool" ? (
                <select className="select" value={vals[f.name] || ""} onChange={(ev) => setVals({ ...vals, [f.name]: ev.target.value })}>
                  <option value="">—</option>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              ) : f.name === "description" || f.type.endsWith("[]") ? (
                <textarea className="textarea" style={{ minHeight: 60 }} value={vals[f.name] || ""} onChange={(ev) => setVals({ ...vals, [f.name]: ev.target.value })} />
              ) : (
                <input className="input" value={vals[f.name] || ""} inputMode={/int|float|double/.test(f.type) ? "decimal" : void 0} autoCapitalize="none" placeholder={f.type === "image" || f.type === "ipfs" ? "IPFS hash, e.g. QmYw…" : ""} onChange={(ev) => setVals({ ...vals, [f.name]: ev.target.value })} />
              )}
            </CR_F>
          ))}
          <div className="btn-row" style={{ marginTop: 0 }}>
            <CR_F label="Max supply" hint="0 = unlimited">
              <input className="input" inputMode="numeric" value={opt.max} onChange={(ev) => setOpt({ ...opt, max: ev.target.value.replace(/\D/g, "") })} />
            </CR_F>
            <div>
              <label className="row" style={{ justifyContent: "flex-start", gap: 8, fontSize: 13, marginTop: 22 }}>
                <input type="checkbox" className="check" checked={opt.transferable} onChange={(ev) => setOpt({ ...opt, transferable: ev.target.checked })} /> Transferable
              </label>
              <label className="row" style={{ justifyContent: "flex-start", gap: 8, fontSize: 13 }}>
                <input type="checkbox" className="check" checked={opt.burnable} onChange={(ev) => setOpt({ ...opt, burnable: ev.target.checked })} /> Burnable
              </label>
            </div>
          </div>
          <div className="label">Preview</div>
          <div className="cr-preview">
            <div className="nft-media">{img ? <img src={WHCR.ipfsImg(img)} alt="" /> : <div className="nft-ph">Add an img to preview</div>}</div>
            <div className="nft-meta">
              <div className="name">{vals.name || "Unnamed"}</div>
              <div className="col">
                {col} · {opt.max && opt.max !== "0" ? `max ${Number(opt.max).toLocaleString()}` : "unlimited"}
              </div>
            </div>
          </div>
          {err && <div className="wh-field-msg err">{err}</div>}
          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            disabled={!isAuth || !!err || !data.length}
            onClick={() =>
              ask({
                title: "Create template",
                details: [
                  { label: "Schema", value: sc.schema_name },
                  { label: "Name", value: vals.name || "—" },
                  { label: "Max supply", value: opt.max === "0" || !opt.max ? "Unlimited" : opt.max },
                  { label: "Transferable / burnable", value: `${opt.transferable ? "Yes" : "No"} / ${opt.burnable ? "Yes" : "No"}` },
                  { label: "Attributes", value: data.map((d) => `${d.key}: ${Array.isArray(d.value[1]) ? d.value[1].join(", ") : d.value[1]}`).join("\n") },
                ],
                acts: [{ account: "atomicassets", name: "createtempl", data: { authorized_creator: me, collection_name: col, schema_name: sc.schema_name, transferable: opt.transferable, burnable: opt.burnable, max_supply: Number(opt.max || 0), immutable_data: data } }],
                warning: "Template attributes can't be changed after creation.",
                after: () => setVals({}),
              })
            }
          >
            Review & create template
          </button>
        </div>
      )}
      {templates === null && De.createElement(ra, { h: 60 })}
      {(templates || []).length > 0 && <h2>Existing templates</h2>}
      <div className="grid">
        {(templates || []).map((tp) => (
          <div className="card nft-card" key={tp.template_id}>
            <div className="nft-media">{De.createElement(Xa, { src: tp.immutable_data?.img || tp.immutable_data?.image })}</div>
            <div className="nft-meta">
              <div className="name">{tp.name || tp.immutable_data?.name || `#${tp.template_id}`}</div>
              <div className="col">
                #{tp.template_id} · {Number(tp.issued_supply).toLocaleString()}/{Number(tp.max_supply) ? Number(tp.max_supply).toLocaleString() : "∞"}
              </div>
              {isAuth && Number(tp.max_supply) === 0 && (
                <button
                  className="btn sm ghost"
                  style={{ marginTop: 6, padding: "4px 8px", minHeight: 30 }}
                  onClick={() =>
                    ask({
                      title: "Lock template supply",
                      details: [{ label: "Template", value: `#${tp.template_id} ${tp.immutable_data?.name || ""}` }, { label: "Supply becomes", value: `${tp.issued_supply} forever` }],
                      warning: "Permanent. Nobody can ever mint more of this template.",
                      acts: [{ account: "atomicassets", name: "locktemplate", data: { authorized_editor: me, collection_name: col, template_id: Number(tp.template_id) } }],
                    })
                  }
                >
                  Lock supply
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CR_Mint({ me, col, isAuth, templates, ask }) {
  const [tid, setTid] = De.useState("");
  const [who, setWho] = De.useState(me ? `${me}, 1` : "");
  const tp = (templates || []).find((x) => String(x.template_id) === String(tid));
  const lines = who
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, c] = l.split(/[\s,;:]+/);
      return { a: (a || "").toLowerCase(), c: Math.max(1, Math.min(500, Number(c) || 1)) };
    });
  const bad = lines.filter((l) => !WHCR.nameOk(l.a));
  const total = lines.reduce((s, l) => s + l.c, 0);
  const left = tp && Number(tp.max_supply) ? Number(tp.max_supply) - Number(tp.issued_supply) : Infinity;
  const err = bad.length ? `Not valid account names: ${bad.map((b) => b.a).join(", ")}` : total > left ? `Only ${left} left of the max supply` : "";
  return (
    <>
      <h2>Mint NFTs</h2>
      <CR_Help>
        <p>Minting creates real NFTs from a template and sends them straight to wallets. You can mint to yourself (to sell or give away later) or airdrop directly to many accounts.</p>
        <p>Enter one account per line, optionally with how many, e.g. <span className="mono">alice.wam, 3</span>. Up to 20 NFTs go in each transaction. Bigger airdrops are split into several transactions, and you approve each one.</p>
        <p>The collection pays for the RAM of each new NFT. If minting fails with a RAM error, buy RAM on the Wallet tab.</p>
      </CR_Help>
      <div className="card">
        <CR_F label="Template">
          <select className="select" value={tid} onChange={(ev) => setTid(ev.target.value)}>
            <option value="">Choose a template…</option>
            {(templates || []).map((x) => (
              <option key={x.template_id} value={x.template_id}>
                #{x.template_id} {x.immutable_data?.name || ""} ({Number(x.issued_supply)}/{Number(x.max_supply) || "∞"})
              </option>
            ))}
          </select>
        </CR_F>
        {tp && (
          <div className="cr-preview" style={{ maxWidth: 180 }}>
            <div className="nft-media">{De.createElement(Xa, { src: tp.immutable_data?.img || tp.immutable_data?.image })}</div>
          </div>
        )}
        <CR_F label="Send to (one per line: account, how many)" example={"alice.wam, 5"} err={err}>
          <textarea className="textarea mono" value={who} onChange={(ev) => setWho(ev.target.value)} style={{ minHeight: 90 }} />
        </CR_F>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {total} NFT(s) to {lines.length} account(s){total > 20 ? ` · ${Math.ceil(total / 20)} transactions` : ""}
        </div>
        <button
          className="btn primary block"
          disabled={!isAuth || !tp || !lines.length || !!err}
          onClick={() => {
            const acts = lines.flatMap((l) =>
              Array.from({ length: l.c }, () => ({
                account: "atomicassets",
                name: "mintasset",
                data: { authorized_minter: me, collection_name: col, schema_name: tp.schema.schema_name, template_id: Number(tp.template_id), new_asset_owner: l.a, immutable_data: [], mutable_data: [], tokens_to_back: [] },
              })),
            );
            const batches = [];
            for (let i = 0; i < acts.length; i += 20) batches.push(acts.slice(i, i + 20));
            ask({
              title: `Mint ${total} NFT${total === 1 ? "" : "s"}`,
              details: [
                { label: "Template", value: `#${tp.template_id} ${tp.immutable_data?.name || ""}` },
                { label: "Recipients", value: lines.map((l) => `${l.a} × ${l.c}`).join("\n") },
                { label: "Transactions", value: String(batches.length) },
              ],
              warning: batches.length > 1 ? `Your wallet will ask you to approve ${batches.length} transactions, one after another.` : void 0,
              batches,
            });
          }}
        >
          Review mint
        </button>
        {!isAuth && <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Only authorised accounts of {col} can mint.</div>}
      </div>
    </>
  );
}

function CR_Sell({ me, col, isAuth, colInfo, templates, ask, session, onNeedLogin, toast }) {
  const [mode, setMode] = De.useState("drop");
  const [f, setF] = De.useState({ tid: "", price: "1", token: "WAX", max: "100", limit: "0", cooldown: "0", start: "", end: "", name: "", desc: "" });
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const tp = (templates || []).find((x) => String(x.template_id) === String(f.tid));
  const neftyAuth = (colInfo?.authorized_accounts || []).includes("neftyblocksd");
  const free = f.token === "FREE" || Number(f.price) === 0;
  const priceErr = !free && !(Number(String(f.price).replace(",", ".")) > 0) ? "Enter a price above 0, or choose Free" : "";
  const ts = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : 0);
  return (
    <>
      <h2>Sell or distribute</h2>
      <div className="tabs">
        <button className={`tab ${mode === "drop" ? "on" : ""}`} onClick={() => setMode("drop")}>
          Drop (fixed price)
        </button>
        <button className={`tab ${mode === "blend" ? "on" : ""}`} onClick={() => { WH.setSub("blend"); setMode("blend"); }}>
          Blend
        </button>
        <button className={`tab ${mode === "market" ? "on" : ""}`} onClick={() => setMode("market")}>
          Market listing
        </button>
      </div>
      {mode === "drop" && (
        <>
          <CR_Help>
            <p>A <b>drop</b> lets people claim NFTs at a set price (or free). Each claim mints a new copy of your template on demand, so you don't mint anything up front.</p>
            <p>It runs on the NeftyBlocks drop contract, so <span className="mono">neftyblocksd</span> has to be an authorised account on your collection (this screen adds it for you if needed). Payment goes straight to your account, minus the NeftyBlocks fee.</p>
            <p><b>Max claimable</b> caps the total. <b>Per-account limit</b> stops one wallet buying everything, and the cooldown sets how long before they can claim again.</p>
          </CR_Help>
          {!neftyAuth && colInfo && <div className="warn">neftyblocksd isn't authorised on {col} yet. It'll be added in the same transaction.</div>}
          <div className="card">
            <CR_F label="Template to sell">
              <select className="select" value={f.tid} onChange={set("tid")}>
                <option value="">Choose…</option>
                {(templates || []).map((x) => (
                  <option key={x.template_id} value={x.template_id}>
                    #{x.template_id} {x.immutable_data?.name || ""}
                  </option>
                ))}
              </select>
            </CR_F>
            <div className="btn-row" style={{ marginTop: 0 }}>
              <CR_F label="Price" err={priceErr}>
                <input className="input" inputMode="decimal" value={free ? "0" : f.price} disabled={f.token === "FREE"} onChange={set("price")} />
              </CR_F>
              <CR_F label="Paid in">
                <select className="select" value={f.token} onChange={set("token")}>
                  <option value="WAX">WAX</option>
                  <option value="FREE">Free</option>
                </select>
              </CR_F>
              <CR_F label="Max claimable" hint="0 = unlimited">
                <input className="input" inputMode="numeric" value={f.max} onChange={set("max")} />
              </CR_F>
              <CR_F label="Per-account limit" hint="0 = no limit">
                <input className="input" inputMode="numeric" value={f.limit} onChange={set("limit")} />
              </CR_F>
              <CR_F label="Starts" hint="Empty = now">
                <input className="input" type="datetime-local" value={f.start} onChange={set("start")} />
              </CR_F>
              <CR_F label="Ends" hint="Empty = never">
                <input className="input" type="datetime-local" value={f.end} onChange={set("end")} />
              </CR_F>
            </div>
            {Number(f.limit) > 0 && (
              <CR_F label="Limit resets every (hours)" hint="0 = the limit is for the whole drop">
                <input className="input" inputMode="numeric" value={f.cooldown} onChange={set("cooldown")} />
              </CR_F>
            )}
            <CR_F label="Drop title" example="Genesis Dragon Drop">
              <input className="input" value={f.name} onChange={set("name")} />
            </CR_F>
            <CR_F label="Description">
              <textarea className="textarea" value={f.desc} onChange={set("desc")} />
            </CR_F>
            <button
              className="btn primary block"
              disabled={!isAuth || !tp || !!priceErr}
              onClick={() => {
                const p = free ? "0 NULL" : `${Number(String(f.price).replace(",", ".")).toFixed(8)} WAX`;
                const acts = [];
                if (!neftyAuth) acts.push({ account: "atomicassets", name: "addcolauth", data: { collection_name: col, account_to_add: "neftyblocksd" } });
                acts.push({
                  account: "neftyblocksd",
                  name: "createdrop",
                  data: {
                    authorized_account: me,
                    collection_name: col,
                    assets_to_mint: [{ template_id: Number(tp.template_id), tokens_to_back: [], use_pool: !1 }],
                    listing_price: p,
                    alternative_prices: [],
                    settlement_symbol: free ? "0,NULL" : "8,WAX",
                    price_recipient: me,
                    auth_required: !1,
                    is_hidden: !1,
                    max_claimable: String(Number(f.max) || 0),
                    account_limit: String(Number(f.limit) || 0),
                    account_limit_cooldown: (Number(f.cooldown) || 0) * 3600,
                    start_time: ts(f.start),
                    end_time: ts(f.end),
                    display_data: JSON.stringify({ name: f.name || tp.immutable_data?.name || "Drop", description: f.desc || "" }),
                    distribution_id: "0",
                    allow_credit_card_payments: !1,
                    referral_fee: 0,
                    referral_whitelist_id: "0",
                  },
                });
                ask({
                  title: "Create NeftyBlocks drop",
                  details: [
                    { label: "NFT", value: `#${tp.template_id} ${tp.immutable_data?.name || ""}` },
                    { label: "Price", value: free ? "Free" : p },
                    { label: "Max / per account", value: `${Number(f.max) || "∞"} / ${Number(f.limit) || "∞"}` },
                    { label: "Runs", value: `${f.start ? new Date(f.start).toLocaleString() : "now"} → ${f.end ? new Date(f.end).toLocaleString() : "no end"}` },
                  ],
                  acts,
                });
              }}
            >
              Review drop
            </button>
          </div>
        </>
      )}
      {mode === "blend" && (
        <>
          <CR_Help>
            <p>A <b>blend</b> lets holders combine NFTs (the ingredients) to get a new one (the result). For example, 3 Common Dragons → 1 Rare Dragon. It runs on NeftyBlocks' <span className="mono">blend.nefty</span> contract, which must be authorised on your collection.</p>
            <p>Below: pick your collection, enter the result template ID and the ingredients as <span className="mono">templateId:amount</span>, one per line, e.g. <span className="mono">123456:3</span>. Ingredients are burned, so their templates must be burnable.</p>
          </CR_Help>
          {De.createElement(aW, { session, onNeedLogin, toast, onBack: () => setMode("drop") })}
        </>
      )}
      {mode === "market" && (
        <div className="card">
          <p style={{ marginTop: 0 }}>To sell individual NFTs you've already minted, open the <b>Market</b> tab → <b>Sell</b>. Pick NFTs from your wallet and set a price or start an auction.</p>
          <button className="btn primary block" onClick={() => WH.nav({ tab: "market" })}>
            Go to Market
          </button>
        </div>
      )}
    </>
  );
}
