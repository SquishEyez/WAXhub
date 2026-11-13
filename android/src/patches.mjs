// Source-level patches applied to the prettified WAX Hub 2.0 bundle.
// Each entry must match exactly once, otherwise the build fails loudly.

export const between = [
  // Shared UI primitives -> new UX components in ext.jsx
  ["function uo({", "function Qi({", "function uo(p) {\n  return N.jsx(WH_Confirm, p);\n}\n"],
  ["function Qi({", "function $e({", "function Qi(p) {\n  return N.jsx(WH_Sheet, p);\n}\n"],
  ["function dM({", "function g1({", "function dM(p) {\n  return N.jsx(WH_Toast, p);\n}\n"],
  ["function Ko({", "function Xa({", "function Ko(p) {\n  return N.jsx(WH_Empty, p);\n}\n"],
];

export const replace = [
  // ---- version
  [`z9 = "2.0",`, `z9 = "2.1",`],

  // ---- amounts: accept "1,5", reject negatives, friendlier message
  [
    `  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error("Invalid amount");`,
    `  const n = Number(String(t ?? "").trim().replace(",", "."));
  if (String(t ?? "").trim() === "" || !Number.isFinite(n))
    throw new Error("Please enter an amount");
  if (n < 0) throw new Error("Amounts can't be negative");`,
  ],

  // ---- remember transfer recipients after a successful transaction
  [
    `  return t.transact({ actions: a }, { expireSeconds: 120 });`,
    `  const res = await t.transact({ actions: a }, { expireSeconds: 120 });
  WH.afterTx(a);
  return res;`,
  ],

  /* ================================================== app shell (fW) */
  [
    `  const [t, e] = De.useState("wallet"),
    [r, n] = De.useState(null),`,
    `  const [t, e] = De.useState(() => WH.load("tab", "wallet")),
    [r, n] = De.useState(() => WH.load("tool", null)),
    [whAcct, setWhAcct] = De.useState(!1),
    [whOnb, setWhOnb] = De.useState(() => !WH.load("onboarded", 0)),
    [whKey, setWhKey] = De.useState(0),`,
  ],
  [
    `  De.useEffect(() => {
    Dh.isNativePlatform() &&`,
    `  De.useEffect(() => {
    WH.setToast(j);
  }, [j]);
  De.useEffect(() => {
    WH.save("tab", t), WH.save("tool", r);
    const sc = document.querySelector("main.scroll");
    sc && sc.scrollTo(0, 0);
  }, [t, r]);
  De.useEffect(() => {
    const go = (X) => {
      const d = X.detail || {};
      p(!1), setWhAcct(!1);
      d.tab && e(d.tab);
      (d.tab === "more" || !d.tab) && n(d.tool || null);
      setWhKey((k) => k + 1);
    };
    window.addEventListener("waxhub:nav", go);
    return () => window.removeEventListener("waxhub:nav", go);
  }, []);
  De.useEffect(() => {
    WH.setScreenBack(() =>
      r ? (n(null), !0) : t !== "wallet" ? (e("wallet"), !0) : !1,
    );
  }, [t, r]);
  De.useEffect(() => {
    o && whOnb && (WH.save("onboarded", 1), setWhOnb(!1));
  }, [o]);
  WH.useBack(f, () => !v && p(!1));
  De.useEffect(() => {
    Dh.isNativePlatform() &&`,
  ],
  [
    `            className: \`account-chip \${D ? "" : "guest"}\`,
            onClick: () => (D ? R() : p(!0)),`,
    `            className: \`account-chip \${D ? "" : "guest"}\`,
            "aria-label": D ? \`Account \${D}\` : "Sign in",
            onClick: () => (D ? setWhAcct(!0) : p(!0)),`,
  ],
  [
    `          t === "wallet" && N.jsx(Gz, { ...$ }),`,
    `          N.jsx(WH_Offline, {}),
          t === "wallet" && N.jsx(Gz, { ...$ }),`,
  ],
  [`t === "more" && r === "dao" && N.jsx(eW, { ...$, onBack: Z }),`, `t === "more" && r === "dao" && N.jsx(eW, { ...$, onBack: Z }, "dao" + whKey),`],
  [`t === "more" && r === "dex" && N.jsx(nW, { ...$, onBack: Z }),`, `t === "more" && r === "dex" && N.jsx(nW, { ...$, onBack: Z }, "dex" + whKey),`],
  [`t === "more" && r === "packs" && N.jsx(iW, { ...$, onBack: Z }),`, `t === "more" && r === "packs" && N.jsx(iW, { ...$, onBack: Z }, "packs" + whKey),`],
  [`t === "more" && r === "creator" && N.jsx(aW, { ...$, onBack: Z }),`, `t === "more" && r === "creator" && N.jsx(WH_Creator, { ...$, onBack: Z }, "creator" + whKey),`],
  [`t === "more" && r === "tools" && N.jsx(lW, { ...$, onBack: Z }),`, `t === "more" && r === "tools" && N.jsx(lW, { ...$, onBack: Z }, "tools" + whKey),`],
  [
    `              className: t === X ? "active" : "",
              onClick: () => {
                X === "more" && t === "more" && n(null), e(X);
              },`,
    `              className: t === X ? "active" : "",
              "aria-current": t === X ? "page" : void 0,
              onClick: () => {
                const sc = document.querySelector("main.scroll");
                t === X && sc && sc.scrollTo({ top: 0, behavior: "smooth" });
                X === "more" && t === "more" && n(null), e(X);
              },`,
  ],
  // sign-in sheet: explain the two wallets
  [
    `              N.jsx("button", {
                className: "btn primary block",
                disabled: v,
                onClick: () => w("cloud"),
                children: v ? "Waiting for wallet…" : "WAX Cloud Wallet",
              }),`,
    `              N.jsx("button", {
                className: "btn primary block wh-wallet-btn",
                disabled: v,
                onClick: () => w("cloud"),
                children: v
                  ? "Waiting for wallet…"
                  : [
                      N.jsx("span", { className: "wh-wallet-name", children: "WAX Cloud Wallet" }, "n"),
                      N.jsx("span", { className: "wh-wallet-desc", children: "Easiest — email or social login. New? You can create a free account in the window that opens." }, "d"),
                    ],
              }),`,
  ],
  [
    `              N.jsx("button", {
                className: "btn block",
                disabled: v,
                onClick: () => w("anchor"),
                children: "Anchor",
              }),`,
    `              N.jsx("button", {
                className: "btn block wh-wallet-btn",
                disabled: v,
                onClick: () => w("anchor"),
                children: [
                  N.jsx("span", { className: "wh-wallet-name", children: "Anchor" }, "n"),
                  N.jsx("span", { className: "wh-wallet-desc", children: "Self-custody — keys stay in the Anchor app on your device." }, "d"),
                ],
              }),`,
  ],
  [
    `      x && N.jsx(dM, { msg: x.msg, type: x.type, onClose: () => k(null) }),`,
    `      N.jsx(WH_AccountSheet, {
        open: whAcct && !!D,
        account: D,
        session: o,
        toast: j,
        onClose: () => setWhAcct(!1),
        onSignOut: () => {
          setWhAcct(!1), R();
        },
        onSwitch: async () => {
          setWhAcct(!1), await R(), p(!0);
        },
      }),
      whOnb &&
        !c &&
        !D &&
        !f &&
        N.jsx(WH_Onboarding, { onDone: () => setWhOnb(!1), onSignIn: () => p(!0) }),
      x && N.jsx(dM, { msg: x.msg, type: x.type, onClose: () => k(null) }),`,
  ],

  /* ================================================== More hub */
  [
    `  const r = t.trim().toLowerCase(),
    n = tW.filter(
      (a) => !r || \`\${a.title} \${a.blurb} \${a.tag}\`.toLowerCase().includes(r),
    );`,
    `  const r = t.trim().toLowerCase(),
    n = tW.filter(
      (a) =>
        !r ||
        \`\${a.title} \${a.blurb} \${a.tag} \${a.keys || ""}\`.toLowerCase().includes(r),
    );`,
  ],
  [`    tag: "DAO",\n`, `    tag: "DAO",\n    keys: "farm farming stake staking vote proposal lock locker airdrop token create deploy",\n`],
  [`    tag: "Trade",\n`, `    tag: "Trade",\n    keys: "swap exchange trade buy sell alcor price limit order",\n`],
  [`    tag: "NFT",\n`, `    tag: "NFT",\n    keys: "unbox open pack reveal claim",\n`],
  [`    tag: "Create",\n`, `    tag: "Create",\n    keys: "mint collection schema template drop blend nft creator",\n`],
  [`    tag: "Tools",\n`, `    tag: "Tools",\n    keys: "cpu net resources powerup vote producer proxy account create history transactions portfolio value receive qr watchlist favourites link",\n`],
  [
    `      N.jsx("div", {
        className: "hub-grid",
        children: n.map((a) =>`,
    `      N.jsx(WH_QuickActions, { query: t }),
      N.jsx("div", {
        className: "hub-grid",
        children: n.map((a) =>`,
  ],
  [
    `          "Search tools: DAO, swaps, packs, creator, vote, QR…",`,
    `          "Search: PowerUp, swap, farm, mint, vote, packs…",`,
  ],

  /* ================================================== Chain tools: open a given sub-tab */
  [
    `    [i, o] = De.useState("vote"),`,
    `    [i, o] = De.useState(() =>
      WH.takeSub("vote", ["vote", "power", "account", "history", "portfolio", "qr", "watch", "links"]),
    ),`,
  ],

  /* ================================================== Wallet (Gz) */
  [
    `  De.useEffect(() => {
    o && oe(o);
  }, [o]);`,
    `  De.useEffect(() => {
    o && oe(o);
  }, [o]);
  De.useEffect(() => {
    const go = () => {
      n &&
        WH.takeSub(null, ["ram"]) === "ram" &&
        (D({ bytes: "", wax: "", mode: "bytes" }), w("ram"));
    };
    go();
    window.addEventListener("waxhub:nav", go);
    return () => window.removeEventListener("waxhub:nav", go);
  }, [n]);`,
  ],
  [
    `      N.jsxs("form", {
        className: "search",
        onSubmit: (E) => {
          E.preventDefault(), l(a.trim().toLowerCase());
        },`,
    `      !n && !o
        ? N.jsx(WH_Welcome, {
            onSignIn: e,
            onLookup: (E) => {
              i(E), l(E);
            },
          })
        : N.jsxs("form", {
        className: "search",
        onSubmit: (E) => {
          E.preventDefault();
          const ck = WH.checkAccountName(a);
          ck.ok ? l(ck.value) : r(ck.msg || "Enter an account name", "error");
        },`,
  ],
  [
    `                N.jsx("div", {
                  className: "muted",
                  style: { fontSize: 12 },
                  children: c.account_name,
                }),`,
    `                N.jsx(WH_AccountHeader, {
                  name: c.account_name,
                  mine: o === n,
                  signedIn: !!t,
                  onBackToMine: () => {
                    i(n), l(n);
                  },
                  onRefresh: () => oe(o),
                  loading: x,
                  toast: r,
                }),`,
  ],
  [
    `                N.jsxs("div", {
                  className: "muted",
                  style: { fontSize: 12, marginTop: 4 },
                  children: [
                    "Liquid WAX · ",`,
    `                N.jsx(WH_UsdLine, {
                  wax: ie
                    ? ie.amount
                    : String(c.core_liquid_balance || "0").split(" ")[0],
                }),
                N.jsxs("div", {
                  className: "muted",
                  style: { fontSize: 12, marginTop: 4 },
                  children: [
                    "Available WAX · ",`,
  ],
  [
    `                N.jsx("h3", { children: "Resources" }),`,
    `                N.jsx("h3", { children: "Resources" }),
                N.jsx(WH_ResourceHint, {
                  cpu: F,
                  net: C,
                  ramUsed: S,
                  ramMax: h,
                  mine: o === n && !!t,
                  onBuyRam: () => {
                    D({ bytes: "", wax: "", mode: "bytes" }), w("ram");
                  },
                }),`,
  ],
  [
    `        symbol: E?.currency || "WAX",
        precision: String(E?.decimals ?? 8),
      }),`,
    `        symbol: E?.currency || "WAX",
        precision: String(E?.decimals ?? 8),
        max: String(E?.amount ?? ""),
      }),`,
  ],
  [
    `          N.jsx($e, {
            label: "To",
            children: N.jsx("input", {
              className: "input",
              value: R.to || "",
              onChange: (E) => D({ ...R, to: E.target.value }),
              autoCapitalize: "none",
              placeholder: "account name",
            }),
          }),
          N.jsx($e, {
            label: "Amount",
            children: N.jsx("input", {
              className: "input",
              inputMode: "decimal",
              value: R.amount || "",
              onChange: (E) => D({ ...R, amount: E.target.value }),
              placeholder: "0.0",
            }),
          }),`,
    `          N.jsx(WH_RecipientInput, {
            value: R.to || "",
            self: n,
            onChange: (E) => D((m) => ({ ...m, to: E })),
          }),
          N.jsx(WH_AmountInput, {
            value: R.amount || "",
            max: R.max,
            symbol: R.symbol,
            onChange: (E) => D((m) => ({ ...m, amount: E })),
          }),`,
  ],
  [
    `                if (!m) throw new Error("Enter a recipient");`,
    `                if (!m) throw new Error("Enter who to send to");
                const ck = WH.checkAccountName(m);
                if (!ck.ok) throw new Error(ck.msg);
                if (R.max && Number(String(R.amount).replace(",", ".")) > Number(R.max))
                  throw new Error("That's more than you have");`,
  ],
  [
    `            children:
              "Stake liquid WAX to power transactions. Both amounts are required (use 0.00000000 WAX if you only want one).",
          }),`,
    `            children:
              "Staking locks WAX to give your account CPU (for running transactions) and NET (bandwidth). Leave a box empty to stake 0. Unstaking takes 3 days.",
          }),
          ie &&
            N.jsxs("div", {
              className: "faint",
              style: { fontSize: 12, marginBottom: 10 },
              children: [
                "Available: ",
                Number(ie.amount).toLocaleString(void 0, { maximumFractionDigits: 8 }),
                " WAX",
              ],
            }),`,
  ],
  [
    `            children: "Unstaked WAX is refunded after a 72-hour wait.",
          }),`,
    `            children: "Unstaked WAX comes back to your balance after a 72-hour wait.",
          }),
          N.jsxs("div", {
            className: "faint",
            style: { fontSize: 12, marginBottom: 10 },
            children: [
              "Staked by you: ",
              b?.cpu_weight || "0 WAX",
              " CPU · ",
              b?.net_weight || "0 WAX",
              " NET",
            ],
          }),`,
  ],
  [
    `            N.jsx("div", {
              className: "mono",
              style: { textAlign: "center", fontWeight: 700 },
              children: o,
            }),`,
    `            N.jsx("div", {
              className: "mono",
              style: { textAlign: "center", fontWeight: 700 },
              children: o,
            }),
            N.jsx(WH_ReceiveActions, { account: o, toast: r }),`,
  ],
  /* ================================================== Rescue + Contract console */
  [
    `const tW = [
  {`,
    `const tW = [
  {
    id: "rescue",
    title: "Rescue & recover",
    blurb: "Find and reclaim stuck deposits, packs, stakes, orders, links and locks",
    tag: "Recover",
    keys: "stuck lost missing recover rescue withdraw refund unclaimed claim deposit balance stake unstake cancel",
  },
  {
    id: "console",
    title: "Contract console",
    blurb: "Call any contract action or read any table — works even when a site is gone",
    tag: "Advanced",
    keys: "contract abi action table raw advanced developer custom any",
  },
  {`,
  ],
  [
    `t === "more" && r === "dao" && N.jsx(eW, { ...$, onBack: Z }, "dao" + whKey),`,
    `t === "more" && r === "dao" && N.jsx(eW, { ...$, onBack: Z }, "dao" + whKey),
          t === "more" && r === "rescue" && N.jsx(WH_Rescue, { ...$, onBack: Z }, "rescue" + whKey),
          t === "more" && r === "console" && N.jsx(WH_Console, { ...$, onBack: Z }, "console" + whKey),`,
  ],

  /* ================================================== Packs: fixes found while mapping the contracts */
  // AtomicHub unboxpacks: use the unboxer index instead of the newest 50 rows.
  [
    `          const ie = await qr({
            code: Be.atomicpacksx,
            scope: Be.atomicpacksx,
            table: "unboxpacks",
            limit: 50,
            reverse: !0,
          });`,
    `          const ie = await qr({
            code: Be.atomicpacksx,
            scope: Be.atomicpacksx,
            table: "unboxpacks",
            index_position: 2,
            key_type: "name",
            lower_bound: a,
            upper_bound: a,
            limit: 100,
          });`,
  ],
  // NFTHive unpackpacks: small table, read all of it instead of the newest 50.
  [
    `          const ie = await qr({
            code: Be.hivePacks,
            scope: Be.hivePacks,
            table: "unpackpacks",
            limit: 50,
            reverse: !0,
          });`,
    `          const ie = await qr({
            code: Be.hivePacks,
            scope: Be.hivePacks,
            table: "unpackpacks",
            limit: 1000,
          });`,
  ],
  // NeftyBlocks claimassets live in the contract scope, indexed by recipient.
  [
    `          const ie = await qr({
            code: Be.neftyPacks,
            scope: a,
            table: "claimassets",
            limit: 30,
          }).catch(() => ({ rows: [] }));`,
    `          const ie = await qr({
            code: Be.neftyPacks,
            scope: Be.neftyPacks,
            table: "claimassets",
            index_position: 2,
            key_type: "name",
            lower_bound: a,
            upper_bound: a,
            limit: 50,
          }).catch(() => ({ rows: [] }));`,
  ],
  // Claim with the right data: Atomic needs origin_roll_ids, Nefty needs every unclaimed roll index.
  [
    `                  onClick: () => {
                    if (!t) return e();
                    const ie = String(ee.pack_asset_id || k);
                    let de = [];
                    i.id === "atomic"
                      ? (de = [oC(ie, [])])
                      : i.id === "hive"
                        ? (de = [cC(ie)])
                        : (de = [lC(ee.claim_id || k, [0])]),`,
    `                  onClick: async () => {
                    if (!t) return e();
                    const ie = String(ee.pack_asset_id || k);
                    let de = [];
                    if (i.id === "atomic") {
                      const ua = await qr({ code: Be.atomicpacksx, scope: ie, table: "unboxassets", limit: 100 }).catch(() => ({ rows: [] }));
                      const ids = [...new Set((ua.rows || []).map((x) => String(x.origin_roll_id)))];
                      if (!ids.length) return r("This pack is still waiting for randomness. Try again in a minute, or use Rescue & recover to retry it.", "info");
                      de = [oC(ie, ids)];
                    } else if (i.id === "hive") de = [cC(ie)];
                    else {
                      const idx = (ee.claims || []).map((x, j) => (x.is_claimed ? -1 : j)).filter((j) => j >= 0);
                      de = [lC(ee.claim_id || k, idx.length ? idx : [0])];
                    }`,
  ],
  // Alcor limit orders: index 3 is the account index, so old orders show up too.
  ...["buyorder", "sellorder"].map((tb) => [
    `            qr({
              code: Be.alcorDex,
              scope: String(w.id),
              table: "${tb}",
              limit: 50,
              reverse: !0,
            }),`,
    `            qr({
              code: Be.alcorDex,
              scope: String(w.id),
              table: "${tb}",
              index_position: 3,
              key_type: "name",
              lower_bound: a,
              upper_bound: a,
              limit: 200,
            }),`,
  ]),
  /* ================================================== legacy studio: open on a given tab (used for blends) */
  [
    `    [i, o] = De.useState("col"),`,
    `    [i, o] = De.useState(() => WH.takeSub("col", ["col", "schema", "templ", "mint", "auth", "drop", "blend"])),`,
  ],
  [
    `              label: "Ingredients: templateId:amount, one per line",`,
    `              label: "Ingredients: templateId:amount, one per line (e.g. 123456:3 = three NFTs of template 123456, burned when blending)",`,
  ],
  [
    `              label: "Result template ID",`,
    `              label: "Result template ID: the NFT people get from the blend",`,
  ],
  /* ================================================== Drops tab: live drops + working collection search */
  [
    `  async function E(L = !0) {
    k(!0);
    try {
      const W = M(),
        fe = j.trim();`,
    `  async function E(L = !0, whQ) {
    k(!0);
    try {
      const W = M(),
        fe = (whQ ?? j).trim();`,
  ],
  [
    `    [h, b] = De.useState(""),
    [B, _] = De.useState(null),
    [A, T] = De.useState(!1);
  function M() {`,
    `    [h, b] = De.useState(""),
    [B, _] = De.useState(null),
    [A, T] = De.useState(!1),
    [whF, setWhF] = De.useState("live"),
    [whC, setWhC] = De.useState(!0),
    [whInfo, setWhInfo] = De.useState("");
  function M() {`,
  ],
  [
    `      const J = await qr({
        code: W.code,
        scope: W.code,
        table: W.table,
        limit: 20,
        reverse: !0,
        lower_bound: L ? void 0 : f,
      });
      let Y = J.rows || [];
      if (fe && !/^\\d+$/.test(fe)) {
        const he = fe.toLowerCase();
        Y = Y.filter((Ne) => String(Ne.collection_name) === he);
      }
      if (
        ((Y = Y.filter((he) => !he.is_hidden)),
        l(L ? Y : [...(o || []), ...Y]),
        g(!!J.more),
        p(J.next_key),
        a === "blends" && L)
      )`,
    `      const q = (whQ ?? fe).trim().toLowerCase(),
        cols = q ? await WHD.collections(q) : null;
      if (cols && cols.size === 0) {
        l([]), g(!1), p(void 0), setWhInfo(\`No collection matches “\${q}”.\`);
        return;
      }
      const J = await WHD.scan({
        code: W.code,
        table: W.table,
        cursor: L ? void 0 : f,
        keep: WHD.test(whF, whC, cols, q),
        want: 20,
        maxRows: q ? 3000 : 1200,
      });
      const Y = J.rows;
      setWhInfo(
        (cols
          ? \`Collections matching “\${q}”: \${[...cols].slice(0, 6).join(", ")}\${cols.size > 6 ? \` +\${cols.size - 6} more\` : ""}. \`
          : "") +
          (J.more
            ? \`Searched the newest \${L ? "" : "next "}\${J.scanned.toLocaleString()} \${a === "blends" ? "blends" : "drops"}. Tap “Load more” to search further back.\`
            : "Searched to the start of this contract."),
      );
      if (
        (l(L ? Y : [...(o || []), ...Y]),
        g(!!J.more),
        p(J.cursor),
        a === "blends" && L)
      )`,
  ],
  [
    `  De.useEffect(() => {
    l(null), p(void 0), d([]), E(!0);
  }, [a]);`,
    `  De.useEffect(() => {
    l(null), p(void 0), d([]), E(!0);
  }, [a, whF, whC]);`,
  ],
  [
    `          a === "nefty" &&
            "NeftyBlocks drops (neftyblocksd) from chain — any token price, including alt prices.",
          a === "atomic" &&
            "AtomicHub drops (atomicdropsx) loaded with get_table_rows.",
          a === "hive" &&
            "NFTHive drops (nfthivedrops) loaded from the contract table.",
          a === "blends" &&
            "blend.nefty blends, including template, schema, collection, attribute, ownership-proof and token ingredients, plus rolls. Super blends are listed if the table is populated.",`,
    `          a === "nefty" &&
            "Claim NFTs straight from creators' NeftyBlocks drops. Tap a drop to see what you get and the price.",
          a === "atomic" &&
            "Claim NFTs from AtomicHub drops. Tap a drop to see what you get and the price.",
          a === "hive" &&
            "Claim NFTs from NFTHive drops. Tap a drop to see what you get and the price.",
          a === "blends" &&
            "Blends turn NFTs (and sometimes tokens) you own into new NFTs. Tap one to see the recipe and which of your NFTs fit.",`,
  ],
  [
    `            placeholder:
              a === "blends" ? "Collection name" : "Drop ID or collection name",`,
    `            placeholder:
              a === "blends"
                ? "Search a collection, e.g. alien or farmersworld"
                : "Search a collection (e.g. alien) or a drop ID",`,
  ],
  [
    `          N.jsx("button", {
            className: "btn",
            type: "submit",
            children: "Search",
          }),
        ],
      }),
      x &&
        !o &&`,
    `          N.jsx("button", {
            className: "btn",
            type: "submit",
            children: "Search",
          }),
          j &&
            N.jsx("button", {
              className: "btn ghost",
              type: "button",
              onClick: () => {
                w(""), E(!0, "");
              },
              children: "Clear",
            }),
        ],
      }),
      N.jsx(WH_DropFilters, {
        filter: whF,
        setFilter: setWhF,
        tested: whC,
        setTested: setWhC,
        blends: a === "blends",
        info: x ? "Searching the chain…" : whInfo,
      }),
      x &&
        !o &&`,
  ],
  [
    `          title: "Nothing here",
          text: "The chain table is paginated from the newest rows. Try a known drop ID.",`,
    `          title: whF === "live" ? "No live drops found" : "Nothing found",
          text: "Try “All recent”, turn off “Hide unclaimed”, tap “Load more” to search further back, or search by drop ID.",`,
  ],
  [
    `                  children: String(W.description).slice(0, 140),
                }),
            ],
          },
          L.drop_id || L.blend_id,`,
    `                  children: String(W.description).slice(0, 140),
                }),
              N.jsx(WH_DropStatus, { row: L }),
            ],
          },
          L.drop_id || L.blend_id,`,
  ],
  [`                          children: B.cpu_weight || "—",`, `                          children: B.cpu_weight ? WH.trimAsset(B.cpu_weight) : "—",`],
  [`                          children: B.net_weight || "—",`, `                          children: B.net_weight ? WH.trimAsset(B.net_weight) : "—",`],
];
