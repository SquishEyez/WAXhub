// Rescue & recover: finds value a contract still holds for an account
// (deposits, unclaimed results, stakes, open orders, links, locks…) and
// builds the on-chain action that returns it.
//
// Every scanner below was mapped against the live mainnet ABIs and tables
// (scope / index verified with real rows). `seen` marks actions that had a
// recent successful mainnet call with exactly this data shape.

const WHRX = (() => {
  const amt = (a) => Number(String(a || "0").split(" ")[0]) || 0;
  const pos = (a) => amt(a) > 0;
  const now = () => Math.floor(Date.now() / 1000);
  const auth = (a) => [{ actor: a, permission: "active" }];
  const act = (account, name, data) => ({ account, name, data });

  async function rowsAll(p, max = 2000) {
    const out = [];
    let lb = p.lower_bound;
    for (let i = 0; i < 20 && out.length < max; i++) {
      const r = await qr({ ...p, limit: Math.min(p.limit || 500, max - out.length), ...(lb !== void 0 ? { lower_bound: lb } : {}) });
      out.push(...(r.rows || []));
      if (!r.more || !r.next_key) break;
      lb = r.next_key;
    }
    return out;
  }
  const byOwner = (code, table, a, field, extra = {}) =>
    qr({ code, scope: code, table, lower_bound: a, upper_bound: a, limit: 5, ...extra }).then((r) =>
      (r.rows || []).filter((x) => x[field] === a),
    );
  // Secondary-index lookups on one name can't be paged (next_key repeats the
  // same key), so ask for one large page and de-duplicate.
  const byIndex = (code, table, a, field, index, scope = code) =>
    qr({ code, scope, table, index_position: index, key_type: "name", lower_bound: a, upper_bound: a, limit: 1000 }).then((r) => {
      const seen = new Set();
      return (r.rows || []).filter((x) => {
        const k = JSON.stringify(x);
        if (x[field] !== a || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    });
  const scanAll = (code, table, a, field) => rowsAll({ code, scope: code, table, limit: 500 }, 3000).then((rs) => rs.filter((x) => x[field] === a));

  const qtyList = (rows, key = "quantities") => rows.flatMap((r) => (r[key] || []).filter((q) => pos(q.quantity || q)));

  // Each scanner: { id, app, contract, label, run(a) -> items[] }
  // item: { key, title, detail?, note?, actions:[{label, acts, danger?}], batch?: acts[], seen }
  const S = [];
  const add = (app, contract, label, run) => S.push({ id: `${contract}:${label}`, app, contract, label, run });

  /* ---------------- WAX system ---------------- */
  add("WAX system", "eosio", "Unstake refunds", async (a) => {
    const r = await qr({ code: "eosio", scope: a, table: "refunds", limit: 1 });
    return (r.rows || []).map((x) => {
      const t = Date.parse(x.request_time + "Z") / 1000 + 3 * 86400;
      const ready = now() >= t;
      return {
        key: "refund",
        title: `Unstaked WAX: ${[x.cpu_amount, x.net_amount].filter(pos).map(WH.trimAsset).join(" + ")}`,
        detail: ready ? "The 3-day wait is over. Claim it back to your balance." : `Claimable from ${new Date(t * 1000).toLocaleString()}.`,
        actions: ready ? [{ label: "Claim refund", acts: [act("eosio", "refund", { owner: a })] }] : [],
        batch: ready ? [act("eosio", "refund", { owner: a })] : null,
        seen: true,
      };
    });
  });
  add("WAX system", "eosio", "WAX staked to other accounts", async (a) => {
    const rs = await rowsAll({ code: "eosio", scope: a, table: "delband", limit: 100 }, 300);
    return rs
      .filter((x) => x.to !== a && (pos(x.cpu_weight) || pos(x.net_weight)))
      .map((x) => ({
        key: `delband-${x.to}`,
        title: `${WH.trimAsset(x.cpu_weight)} CPU + ${WH.trimAsset(x.net_weight)} NET staked to ${x.to}`,
        detail: "You can unstake this. It comes back to you after the 3-day refund wait.",
        actions: [{ label: "Unstake", acts: [act("eosio", "undelegatebw", { from: a, receiver: x.to, unstake_net_quantity: x.net_weight, unstake_cpu_quantity: x.cpu_weight })] }],
        seen: true,
      }));
  });
  add("WAX system", "eosio", "Voting rewards", async (a) => {
    const [v] = await byOwner("eosio", "voters", a, "owner");
    if (!v || (!v.producers?.length && !v.proxy) || !(Number(v.unpaid_voteshare) > 0)) return [];
    const last = Date.parse(v.last_claim_time + "Z") / 1000 || 0;
    const ready = now() - last > 86400;
    return [
      {
        key: "gbm",
        title: "Voting rewards",
        detail: ready ? "You vote, so you may have WAX rewards to claim (claimable once every 24h)." : "Already claimed in the last 24 hours. Check back tomorrow.",
        actions: ready ? [{ label: "Claim rewards", acts: [act("eosio", "claimgbmvote", { owner: a })] }] : [],
        batch: ready ? [act("eosio", "claimgbmvote", { owner: a })] : null,
        seen: true,
      },
    ];
  });
  add("WAX system", "eosio", "Genesis balance", async (a) => {
    const r = await qr({ code: "eosio", scope: a, table: "genesis", limit: 1 });
    return (r.rows || [])
      .filter((x) => pos(x.unclaimed_balance))
      .map((x) => ({
        key: "genesis",
        title: `Unclaimed genesis WAX: ${WH.trimAsset(x.unclaimed_balance)}`,
        actions: [{ label: "Claim", acts: [act("eosio", "claimgenesis", { claimer: a })] }],
        batch: [act("eosio", "claimgenesis", { claimer: a })],
        seen: true,
      }));
  });

  /* ---------------- deposit balances (withdraw) ---------------- */
  const deposit = (app, code, table, field, label, mk, seen) =>
    add(app, code, label, async (a) =>
      qtyList(await byOwner(code, table, a, field), table === "balances" && code === "nfthivecraft" ? "assets" : "quantities").map((q) => {
        const acts = [mk(a, q)];
        return {
          key: `${code}-${q}`,
          title: `${WH.trimAsset(q)} deposited in ${code}`,
          detail: "Left over from a purchase, offer, drop or fee. Withdraw it back to your wallet.",
          actions: [{ label: "Withdraw", acts }],
          batch: acts,
          seen,
        };
      }),
    );
  deposit("AtomicHub", "atomicmarket", "balances", "owner", "Market balance", (a, q) => act("atomicmarket", "withdraw", { owner: a, token_to_withdraw: q }), true);
  deposit("AtomicHub", "atomicassets", "balances", "owner", "Assets balance", (a, q) => act("atomicassets", "withdraw", { owner: a, token_to_withdraw: q }), true);
  deposit("AtomicHub", "atomicdropsx", "balances", "identifier", "Drops balance", (a, q) => act("atomicdropsx", "withdraw", { owner: a, token_to_withdraw: q }), true);
  deposit("NeftyBlocks", "neftyblocksd", "balances", "owner", "Drops balance", (a, q) => act("neftyblocksd", "withdraw", { owner: a, token_to_withdraw: q }), true);
  deposit("NeftyBlocks", "market.nefty", "balances", "owner", "Auction balance", (a, q) => act("market.nefty", "withdraw", { owner: a, token_to_withdraw: q }), false);
  deposit("NFTHive", "nfthivedrops", "balances", "user", "Drops balance", (a, q) => act("nfthivedrops", "withdraw", { account: a, amount: q }), true);
  deposit("NFTHive", "nfthivecraft", "balances", "account", "Crafting balance", (a, q) => act("nfthivecraft", "withdraw", { tokens: [q], account: a }), true);
  add("NeftyBlocks", "blend.nefty", "Blend balance", async (a) =>
    qtyList(await byOwner("blend.nefty", "extbalances", a, "owner")).map((q) => {
      const acts = [act("blend.nefty", "withdrawubal", { owner: a, amount: q })];
      return { key: `blend-${q.quantity}`, title: `${WH.trimAsset(q.quantity)} (${q.contract}) deposited for blends`, actions: [{ label: "Withdraw", acts }], batch: acts, seen: false };
    }),
  );
  add("NFTHive", "nft.hive", "Hive balances", async (a) => {
    const [u] = await byOwner("nft.hive", "users", a, "user");
    const acc = await byOwner("nft.hive", "accounts", a, "account");
    const qs = [...(u && pos(u.quantity) ? [u.quantity] : []), ...qtyList(acc)];
    return qs.map((q) => {
      const acts = [act("nft.hive", "withdraw", { user: a, quantity: q })];
      return { key: `hive-${q}`, title: `${WH.trimAsset(q)} held by nft.hive`, actions: [{ label: "Withdraw", acts }], batch: acts, seen: false };
    });
  });
  add("WAXDAO", "waxdaobacker", "Backed-NFT tokens", async (a) => {
    const [b] = await byOwner("waxdaobacker", "balances", a, "wallet");
    const list = (b?.balances || []).filter((x) => pos(x.quantity));
    if (!list.length) return [];
    const acts = [act("waxdaobacker", "withdraw", { user: a, contract_ignore_list: [] })];
    return [{ key: "backer", title: `Tokens from burned backed NFTs: ${list.map((x) => WH.trimAsset(x.quantity)).join(", ")}`, actions: [{ label: "Withdraw all", acts }], batch: acts, seen: false }];
  });

  /* ---------------- AtomicHub (indexed API + tables) ---------------- */
  add("AtomicHub", "atomicmarket", "Auctions & buy offers", async (a) => {
    const out = [];
    const t = Date.now();
    const [won, sold, live, bo, tbo, waiting] = await Promise.all([
      to(`/atomicmarket/v1/auctions?buyer=${a}&state=3&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicmarket/v1/auctions?seller=${a}&state=3&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicmarket/v1/auctions?seller=${a}&state=1&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicmarket/v1/buyoffers?buyer=${a}&state=0&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicmarket/v1/template_buyoffers?buyer=${a}&state=0&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicmarket/v2/sales?seller=${a}&state=0&limit=100`).catch(() => ({ data: [] })),
    ]);
    const names = (x) => (x.assets || []).map((s) => s.name || `#${s.asset_id}`).slice(0, 3).join(", ");
    for (const x of won.data || [])
      if (!x.claimed_by_buyer) {
        const acts = [act("atomicmarket", "auctclaimbuy", { auction_id: x.auction_id })];
        out.push({ key: `won-${x.auction_id}`, title: `Auction you won: ${names(x)}`, detail: `Auction #${x.auction_id}. The NFTs are waiting for you.`, actions: [{ label: "Claim NFTs", acts }], batch: acts, seen: true });
      }
    for (const x of sold.data || [])
      if (!x.claimed_by_seller) {
        const acts = [act("atomicmarket", "auctclaimsel", { auction_id: x.auction_id })];
        out.push({ key: `sold-${x.auction_id}`, title: `Sold at auction: ${names(x)}`, detail: `Auction #${x.auction_id}. Collect the winning bid, then withdraw it from your market balance.`, actions: [{ label: "Collect payment", acts }], batch: acts, seen: true });
      }
    for (const x of live.data || [])
      if (Number(x.end_time) < t && !x.buyer) {
        const acts = [act("atomicmarket", "cancelauct", { auction_id: x.auction_id })];
        out.push({ key: `nobid-${x.auction_id}`, title: `Ended with no bids: ${names(x)}`, detail: `Auction #${x.auction_id}. Cancel it to get your NFTs back.`, actions: [{ label: "Return NFTs", acts }], batch: acts, seen: true });
      }
    for (const x of bo.data || []) {
      const acts = [act("atomicmarket", "cancelbuyo", { buyoffer_id: x.buyoffer_id })];
      const p = x.price ? `${(Number(x.price.amount) / 10 ** x.price.token_precision).toLocaleString()} ${x.price.token_symbol}` : "";
      out.push({ key: `bo-${x.buyoffer_id}`, title: `Open buy offer ${p}`, detail: `Offer #${x.buyoffer_id} for ${names(x)}. Cancelling returns the funds to your market balance (withdraw after).`, actions: [{ label: "Cancel offer", acts, danger: true }], seen: true });
    }
    for (const x of tbo.data || []) {
      const acts = [act("atomicmarket", "canceltbuyo", { buyoffer_id: x.buyoffer_id })];
      out.push({ key: `tbo-${x.buyoffer_id}`, title: `Open template buy offer #${x.buyoffer_id}`, detail: "Cancelling returns the funds to your market balance.", actions: [{ label: "Cancel offer", acts, danger: true }], seen: true });
    }
    for (const x of waiting.data || []) {
      const acts = [act("atomicmarket", "cancelsale", { sale_id: x.sale_id })];
      out.push({ key: `ws-${x.sale_id}`, title: `Half-finished listing: ${names(x)}`, detail: `Sale #${x.sale_id} was never completed. Cancel it to tidy up.`, actions: [{ label: "Cancel listing", acts }], batch: acts, seen: true });
    }
    return out;
  });
  add("AtomicHub", "atomicassets", "Trade offers", async (a) => {
    const [sent, got] = await Promise.all([byIndex("atomicassets", "offers", a, "sender", 2), byIndex("atomicassets", "offers", a, "recipient", 3)]);
    return [
      ...sent
        .filter((o) => o.recipient !== "atomicmarket")
        .map((o) => ({
          key: `os-${o.offer_id}`,
          title: `Trade offer you sent to ${o.recipient}`,
          detail: `Offer #${o.offer_id}: ${o.sender_asset_ids.length} of your NFTs for ${o.recipient_asset_ids.length} of theirs.`,
          actions: [{ label: "Cancel offer", acts: [act("atomicassets", "canceloffer", { offer_id: o.offer_id })], danger: true }],
          seen: true,
        })),
      ...got.map((o) => {
        const scam = !o.sender_asset_ids.length && o.recipient_asset_ids.length > 0;
        return {
          key: `or-${o.offer_id}`,
          title: scam ? `⚠ Suspicious offer from ${o.sender}` : `Trade offer from ${o.sender}`,
          detail: scam
            ? `Offer #${o.offer_id} asks for ${o.recipient_asset_ids.length} of your NFT(s) and gives nothing back. This is a common scam. Decline it.`
            : `Offer #${o.offer_id}: you'd get ${o.sender_asset_ids.length} NFT(s) and give ${o.recipient_asset_ids.length}. Check what's in it on the NFTs tab before accepting.`,
          actions: [
            ...(scam ? [] : [{ label: "Accept", acts: [act("atomicassets", "acceptoffer", { offer_id: o.offer_id })], danger: true }]),
            { label: "Decline", acts: [act("atomicassets", "declineoffer", { offer_id: o.offer_id })] },
          ],
          seen: true,
        };
      }),
    ];
  });
  add("AtomicHub", "atomictoolsx", "NFT claim links", async (a) => {
    const r = await to(`/atomictools/v1/links?creator=${a}&state=1&limit=100`).catch(() => ({ data: [] }));
    const w = await to(`/atomictools/v1/links?creator=${a}&state=0&limit=100`).catch(() => ({ data: [] }));
    return [...(r.data || []), ...(w.data || [])].map((l) => {
      const acts = [act("atomictoolsx", "cancellink", { link_id: l.link_id })];
      return {
        key: `link-${l.link_id}`,
        title: `Unclaimed claim link #${l.link_id}`,
        detail: `${(l.assets || []).length} NFT(s) sitting in a share link${l.memo ? ` (“${l.memo}”)` : ""}. Cancel it to get them back.`,
        actions: [{ label: "Cancel link & return NFTs", acts }],
        batch: acts,
        seen: true,
      };
    });
  });
  add("AtomicHub", "atomicpacksx", "Opened packs", async (a) => {
    const rs = await byIndex("atomicpacksx", "unboxpacks", a, "unboxer", 2);
    return Promise.all(
      rs.map(async (p) => {
        const ua = await qr({ code: "atomicpacksx", scope: String(p.pack_asset_id), table: "unboxassets", limit: 100 }).catch(() => ({ rows: [] }));
        const ids = [...new Set((ua.rows || []).map((x) => String(x.origin_roll_id)))];
        const acts = ids.length
          ? [act("atomicpacksx", "claimunboxed", { pack_asset_id: p.pack_asset_id, origin_roll_ids: ids })]
          : [act("atomicpacksx", "retryrand", { pack_asset_id: p.pack_asset_id })];
        return {
          key: `apack-${p.pack_asset_id}`,
          title: `Opened pack #${p.pack_asset_id} not claimed`,
          detail: ids.length ? "The pack is opened and the results are ready." : "Waiting on randomness. Retry if it's been more than a few minutes.",
          actions: [{ label: ids.length ? "Claim pack contents" : "Retry randomness", acts }],
          batch: ids.length ? acts : null,
          seen: !!ids.length,
        };
      }),
    );
  });

  /* ---------------- NeftyBlocks ---------------- */
  add("NeftyBlocks", "neftyblocksp", "Opened packs", async (a) => {
    const rs = await byIndex("neftyblocksp", "claimassets", a, "recipient", 2);
    return rs.map((c) => {
      const idx = (c.claims || []).map((x, i) => (x.is_claimed ? -1 : i)).filter((i) => i >= 0);
      const acts = [act("neftyblocksp", "claim", { claim_id: c.claim_id, roll_indexes: idx })];
      return { key: `npack-${c.claim_id}`, title: `NeftyBlocks pack results (${c.collection_name})`, detail: `${idx.length} item(s) waiting from claim #${c.claim_id}.`, actions: [{ label: "Claim all items", acts }], batch: acts, seen: true };
    });
  });

  /* ---------------- NFTHive ---------------- */
  add("NFTHive", "nfthivepacks", "Opened packs", async (a) => {
    const rs = await scanAll("nfthivepacks", "unpackpacks", a, "owner");
    return Promise.all(
      rs.map(async (p) => {
        const r = await qr({ code: "nfthivepacks", scope: "nfthivepacks", table: "unpackresult", lower_bound: String(p.pack_asset_id), upper_bound: String(p.pack_asset_id), limit: 1 }).catch(() => ({ rows: [] }));
        const ready = (r.rows || []).length > 0;
        const acts = ready ? [act("nfthivepacks", "claimunpack", { pack_asset_id: p.pack_asset_id })] : [act("nfthivepacks", "retryrand", { pack_asset_id: p.pack_asset_id })];
        return { key: `hpack-${p.pack_asset_id}`, title: `NFTHive pack #${p.pack_asset_id} not claimed`, detail: ready ? "Results are ready to claim." : "Waiting on randomness.", actions: [{ label: ready ? "Claim pack contents" : "Retry randomness", acts }], batch: ready ? acts : null, seen: ready };
      }),
    );
  });
  add("NFTHive", "nfthivecraft", "Craft results & items", async (a) => {
    const [claims, items] = await Promise.all([scanAll("nfthivecraft", "claims", a, "owner"), byOwner("nfthivecraft", "items", a, "user_name")]);
    const out = claims.map((c) => {
      const acts = [act("nfthivecraft", "claim", { result_id: c.result_id, claimer: a })];
      return { key: `craft-${c.result_id}`, title: `Unclaimed craft result #${c.result_id}`, detail: `${(c.assets || []).length} NFT(s) from craft ${c.craft_id}.`, actions: [{ label: "Claim", acts }], batch: acts, seen: false };
    });
    for (const it of items) {
      if ((it.assets || []).length) {
        const acts = [act("nfthivecraft", "withditems", { asset_ids: it.assets, account: a })];
        out.push({ key: "craft-items", title: `${it.assets.length} NFT(s) deposited for crafting`, actions: [{ label: "Withdraw NFTs", acts }], batch: acts, seen: false });
      }
      const toks = (it.tokens || []).filter(pos);
      if (toks.length) {
        const acts = [act("nfthivecraft", "withdraw", { tokens: toks, account: a })];
        out.push({ key: "craft-tokens", title: `Crafting tokens: ${toks.map(WH.trimAsset).join(", ")}`, actions: [{ label: "Withdraw", acts }], seen: false });
      }
    }
    return out;
  });
  add("NFTHive", "nfthivevault", "HONEY vault", async (a) => {
    const [[s], [r]] = await Promise.all([byOwner("nfthivevault", "stakes", a, "staker"), byOwner("nfthivevault", "rewards", a, "user")]);
    const out = [];
    if (r && pos(r.rewards)) {
      const acts = [act("nfthivevault", "claim", { claimer: a })];
      out.push({ key: "vault-r", title: `Vault rewards: ${WH.trimAsset(r.rewards)}`, actions: [{ label: "Claim", acts }], batch: acts, seen: true });
    }
    if (s && pos(s.amount))
      out.push({
        key: "vault-s",
        title: `Staked in the HONEY vault: ${WH.trimAsset(s.amount)}`,
        actions: [
          { label: "Claim staking rewards", acts: [act("nfthivevault", "claimstake", { claimer: a })] },
          { label: "Unstake all", acts: [act("nfthivevault", "unstake", { staker: a, amount: s.amount })], danger: true },
        ],
        seen: true,
      });
    return out;
  });
  add("NFTHive", "nfthivedrops", "Pending drop claims", async (a) =>
    (await scanAll("nfthivedrops", "claims", a, "claimer")).map((c) => ({
      key: `hdrop-${c.claim_id}`,
      title: `Drop claim #${c.claim_id} stuck waiting for randomness`,
      detail: `Drop ${c.drop_id}, ${c.amount} item(s).`,
      actions: [{ label: "Retry randomness", acts: [act("nfthivedrops", "retryrand", { claim_id: c.claim_id })] }],
      seen: false,
    })),
  );

  /* ---------------- WAXDAO ---------------- */
  add("WAXDAO", "tf.waxdao", "Token farms", async (a) => {
    const rs = await rowsAll({ code: "tf.waxdao", scope: a, table: "stakers", limit: 100 }, 300);
    return rs.filter((s) => pos(s.balance) || (s.claimable_balances || []).some((x) => pos(x.quantity))).map((s) => {
      const claim = (s.claimable_balances || []).filter((x) => pos(x.quantity));
      const actions = [];
      if (claim.length || pos(s.balance)) actions.push({ label: "Claim rewards", acts: [act("tf.waxdao", "getreward", { user: a, farm_name: s.farm_name })] });
      if (pos(s.balance)) actions.push({ label: "Unstake all", acts: [act("tf.waxdao", "unstake", { user: a, farm_name: s.farm_name, amount: s.balance })], danger: true });
      return {
        key: `tf-${s.farm_name}`,
        title: `Token farm “${s.farm_name}”: ${WH.trimAsset(s.balance)} staked`,
        detail: claim.length ? `Rewards waiting: ${claim.map((x) => WH.trimAsset(x.quantity)).join(", ")}` : "",
        actions,
        batch: claim.length ? [act("tf.waxdao", "getreward", { user: a, farm_name: s.farm_name })] : null,
        seen: true,
      };
    });
  });
  add("WAXDAO", "farms.waxdao", "NFT farms", async (a) =>
    (await byIndex("farms.waxdao", "stakers", a, "user", 3)).map((s) => {
      const claim = (s.claimable_balances || []).filter((x) => pos(x.quantity));
      return {
        key: `nf-${s.farmname}`,
        title: `NFT farm “${s.farmname}”: ${(s.asset_ids || []).length} NFT(s) staked`,
        detail: claim.length ? `Rewards waiting: ${claim.map((x) => WH.trimAsset(x.quantity)).join(", ")}` : "",
        actions: [
          { label: "Claim rewards", acts: [act("farms.waxdao", "claim", { user: a, farmname: s.farmname })] },
          ...((s.asset_ids || []).length ? [{ label: "Unstake all NFTs", acts: [act("farms.waxdao", "unstake", { user: a, farmname: s.farmname, asset_ids: s.asset_ids })], danger: true }] : []),
        ],
        batch: claim.length ? [act("farms.waxdao", "claim", { user: a, farmname: s.farmname })] : null,
        seen: true,
      };
    }),
  );
  add("WAXDAO", "dao.waxdao", "DAO staked tokens", async (a) => {
    const rs = await rowsAll({ code: "dao.waxdao", scope: a, table: "stakedtokens", limit: 100 }, 300);
    return rs
      .filter((s) => pos(s.balance))
      .map((s) => {
        const t = Number(s.unlock_time) || 0;
        const ready = now() >= t;
        return {
          key: `dao-${s.dao}`,
          title: `${WH.trimAsset(s.balance)} staked in DAO “${s.dao}”`,
          detail: ready ? "Unlocked. You can unstake it." : `Locked until ${new Date(t * 1000).toLocaleString()}.`,
          actions: ready ? [{ label: "Unstake", acts: [act("dao.waxdao", "unstaketoken", { user: a, dao: s.dao, quantity: s.balance })] }] : [],
          seen: false,
        };
      });
  });
  add("WAXDAO", "waxdaolocker", "Token locks", async (a) => {
    const [mine, forMe] = await Promise.all([byIndex("waxdaolocker", "locks", a, "creator", 2), byIndex("waxdaolocker", "locks", a, "receiver", 3)]);
    const seenIds = new Set();
    const out = [];
    for (const l of [...forMe, ...mine]) {
      if (seenIds.has(l.ID) || l.status === 2) continue;
      seenIds.add(l.ID);
      const t = Number(l.unlock_time) || 0;
      if (l.status === 0 && l.creator === a) {
        out.push({ key: `lock-${l.ID}`, title: `Lock #${l.ID} was never funded`, detail: `${WH.trimAsset(l.amount)} for ${l.receiver}. Cancel it to free the RAM.`, actions: [{ label: "Cancel lock", acts: [act("waxdaolocker", "cancellock", { lock_ID: l.ID })] }], seen: false });
      } else if (l.status === 1 && l.receiver === a) {
        const ready = now() >= t;
        out.push({
          key: `lock-${l.ID}`,
          title: `Locked tokens for you: ${WH.trimAsset(l.amount)}`,
          detail: ready ? `Lock #${l.ID} has unlocked.` : `Lock #${l.ID} unlocks ${new Date(t * 1000).toLocaleString()}.`,
          actions: ready ? [{ label: "Withdraw", acts: [act("waxdaolocker", "withdraw", { lock_ID: l.ID })] }] : [],
          batch: ready ? [act("waxdaolocker", "withdraw", { lock_ID: l.ID })] : null,
          seen: true,
        });
      }
    }
    return out;
  });
  add("WAXDAO", "wufclaimtool", "WUF airdrops", async (a) => {
    const drops = await rowsAll({ code: "wufclaimtool", scope: "wufclaimtool", table: "airdrops", limit: 200 }, 400);
    const res = await Promise.all(
      drops.map((d) =>
        qr({ code: "wufclaimtool", scope: String(d.airdrop_id), table: "claims", lower_bound: a, upper_bound: a, limit: 1 })
          .then((r) => (r.rows || []).filter((x) => x.claimer === a && pos(x.amount)).map((x) => ({ d, x })))
          .catch(() => []),
      ),
    );
    return res.flat().map(({ d, x }) => {
      const acts = [act("wufclaimtool", "claim", { airdrop_id: d.airdrop_id, account: a })];
      return { key: `wuf-${d.airdrop_id}`, title: `Airdrop waiting: ${WH.trimAsset(x.amount)}`, detail: `Airdrop #${d.airdrop_id} from ${d.creator}.`, actions: [{ label: "Claim", acts }], batch: acts, seen: true };
    });
  });

  /* ---------------- DEX ---------------- */
  add("Alcor", "alcordexmain", "Open limit orders", async (a) => {
    const [acc] = await byOwner("alcordexmain", "account", a, "account");
    if (!acc) return [];
    const markets = [...new Set([...(acc.buyorders || []), ...(acc.sellorders || [])].map((p) => p.first))];
    const res = await Promise.all(
      markets.flatMap((m) =>
        ["buyorder", "sellorder"].map((side) =>
          byIndex("alcordexmain", side, a, "account", 3, String(m))
            .then((rs) => rs.map((o) => ({ o, m, side })))
            .catch(() => []),
        ),
      ),
    );
    return res.flat().map(({ o, m, side }) => {
      const acts = [act("alcordexmain", side === "buyorder" ? "cancelbuy" : "cancelsell", { executor: a, market_id: m, order_id: o.id })];
      return {
        key: `alcor-${m}-${side}-${o.id}`,
        title: `${side === "buyorder" ? "Buy" : "Sell"} order: ${o.bid} for ${o.ask}`,
        detail: `Market #${m}, order #${o.id}${o.timestamp ? `, placed ${new Date(o.timestamp * 1000).toLocaleDateString()}` : ""}. Cancelling returns your ${o.bid}.`,
        actions: [{ label: "Cancel order", acts }],
        batch: acts,
        seen: true,
      };
    });
  });
  add("Taco", "stake.taco", "Taco staking", async (a) => {
    const [u] = await byOwner("stake.taco", "users", a, "user");
    if (!u) return [];
    const out = [{ key: "taco-claim", title: "Taco staking rewards", detail: `You stake in ${u.venues.length} venue(s).`, actions: [{ label: "Claim rewards", acts: [act("stake.taco", "claim", { account: a })] }], seen: true }];
    for (const v of u.venues || []) {
      const [st] = await qr({ code: "stake.taco", scope: "stake.taco", table: "staked", lower_bound: String(v), upper_bound: String(v), limit: 1 }).then((r) => r.rows || []);
      const mine = (st?.staked_users || []).find((p) => p.first === a || p.key === a);
      const n = mine ? mine.second ?? mine.value : 0;
      if (n > 0) out.push({ key: `taco-${v}`, title: `Staked in Taco venue #${v}`, detail: `Raw amount ${n}.`, actions: [{ label: "Unstake", acts: [act("stake.taco", "unstake", { account: a, amount: n, venue_asset_id: v })], danger: true }], seen: true });
    }
    return out;
  });

  /* ---------------- others ---------------- */
  add("RPlanet", "s.rplanet", "RPlanet staking", async (a) => {
    const [u] = await byOwner("s.rplanet", "accounts", a, "user");
    if (!u) return [];
    const out = [];
    if (pos(u.collected)) out.push({ key: "rp-claim", title: `RPlanet rewards: ${WH.trimAsset(u.collected)}`, actions: [{ label: "Claim", acts: [act("s.rplanet", "claim", { to: a })] }], batch: [act("s.rplanet", "claim", { to: a })], seen: true });
    if (Number(u.staked) > 0) out.push({ key: "rp-staked", title: "NFTs staked on RPlanet", detail: "Unstaking needs the asset IDs. Use the Contract console (s.rplanet → unstake) with the NFTs listed on your RPlanet account.", actions: [], seen: false, console: "s.rplanet" });
    return out;
  });
  add("SimpleAssets", "simpleassets", "SimpleAssets offers", async (a) => {
    const [sent, got] = await Promise.all([byIndex("simpleassets", "offers", a, "owner", 2), byIndex("simpleassets", "offers", a, "offeredto", 3)]);
    const out = [];
    if (sent.length) {
      const ids = sent.map((o) => o.assetid);
      out.push({ key: "sa-sent", title: `${ids.length} SimpleAssets NFT(s) offered but not claimed`, detail: "Cancel to keep them.", actions: [{ label: "Cancel offers", acts: [act("simpleassets", "canceloffer", { owner: a, assetids: ids })] }], seen: false });
    }
    if (got.length) {
      const ids = got.map((o) => o.assetid);
      const acts = [act("simpleassets", "claim", { claimer: a, assetids: ids })];
      out.push({ key: "sa-got", title: `${ids.length} SimpleAssets NFT(s) waiting for you to claim`, actions: [{ label: "Claim NFTs", acts }], batch: acts, seen: true });
    }
    return out;
  });
  add("NeftyBlocks", "claim.nefty", "Nefty claims", async (a) => {
    const [c] = await byOwner("claim.nefty", "claims", a, "account");
    const bal = (c?.balance || []).filter((x) => pos(x.quantity));
    if (!bal.length) return [];
    return [{ key: "nclaim", title: `Nefty claim: ${bal.map((x) => WH.trimAsset(x.quantity)).join(", ")}`, actions: [{ label: "Claim", acts: [act("claim.nefty", "claim", { account: a })] }], seen: false }];
  });
  add("WAXDAO", "waxdaosynths", "Synth orders", async (a) => {
    const rs = await scanAll("waxdaosynths", "ordersnew", a, "user");
    if (!rs.length) return [];
    return [{ key: "synth", title: `${rs.length} unfinished synth order(s)`, detail: "Cancelling returns the ingredients you sent.", actions: [{ label: "Cancel orders", acts: [act("waxdaosynths", "cancelorders", { order_ids: rs.map((r) => r.ID) })] }], seen: false }];
  });

  return { scanners: S, auth };
})();

const RX_NOT_SCANNED = [
  ["swap.alcor", "Alcor liquidity positions: manage them on alcor.exchange or in the Contract console (subliquid, collect)."],
  ["swap.taco", "Taco liquidity: remove it in the Contract console (remliquidity)."],
  ["nfthivecraft", "NFTHive timed craft lockups (6,000+ rows, not indexed by owner): unlock them in the Contract console (unlock)."],
  ["nft.hive", "nft.hive token sales (not indexed by seller): cancel them in the Contract console (cancelsale)."],
];

function WH_Rescue({ session: t, onNeedLogin: e, toast: r, onBack: n }) {
  const me = Di(t);
  const [acct, setAcct] = De.useState(me);
  const [target, setTarget] = De.useState(me);
  const [state, setState] = De.useState({}); // id -> {status, items, err}
  const [running, setRunning] = De.useState(false);
  const [confirm, setConfirm] = De.useState(null);
  const [busy, setBusy] = De.useState(false);
  const runId = De.useRef(0);

  De.useEffect(() => {
    if (me && !target) {
      setAcct(me);
      setTarget(me);
    }
  }, [me]);

  async function scan(a) {
    if (!a) return;
    const id = ++runId.current;
    setRunning(true);
    setState(Object.fromEntries(WHRX.scanners.map((s) => [s.id, { status: "wait" }])));
    const queue = [...WHRX.scanners];
    const worker = async () => {
      while (queue.length) {
        const s = queue.shift();
        try {
          const items = (await s.run(a)).filter(Boolean);
          if (runId.current === id) setState((st) => ({ ...st, [s.id]: { status: "done", items } }));
        } catch (err) {
          if (runId.current === id) setState((st) => ({ ...st, [s.id]: { status: "err", err: String(err?.message || err), items: [] } }));
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);
    if (runId.current === id) setRunning(false);
  }
  De.useEffect(() => {
    target && scan(target);
  }, [target]);

  const canAct = !!t && me === target;
  const all = WHRX.scanners.flatMap((s) => (state[s.id]?.items || []).map((it) => ({ ...it, s })));
  const done = WHRX.scanners.filter((s) => state[s.id] && state[s.id].status !== "wait").length;
  const errs = WHRX.scanners.filter((s) => state[s.id]?.status === "err");
  const batch = all.flatMap((it) => it.batch || []);
  const groups = {};
  for (const it of all) (groups[it.s.app] = groups[it.s.app] || []).push(it);

  function ask(title, acts, it) {
    if (!t) return e();
    if (!canAct) return r(`Sign in as ${target} to recover these items.`, "error");
    setConfirm({
      title,
      acts,
      details: [
        { label: "Account", value: me },
        { label: "Contract actions", value: acts.map((x) => `${x.account}::${x.name}`).join("\n") },
        ...(it?.title ? [{ label: "Item", value: it.title }] : []),
      ],
      warning: acts.length > 1 ? `${acts.length} actions in one transaction. If one fails, none of them happen.` : it && !it.seen ? "This contract action hasn't been seen on-chain recently. It's built from the contract's own ABI, but nobody has tested it lately." : void 0,
    });
  }
  async function run() {
    setBusy(true);
    try {
      const res = await yo(t, confirm.acts);
      r(pn(res) ? `Transaction sent\n${pn(res)}` : "Transaction sent", "success");
      setConfirm(null);
      setTimeout(() => scan(target), 1500);
    } catch (err) {
      r(err?.message || String(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="back-row">
        <button className="btn sm" onClick={n}>
          ← More
        </button>
        <h1 style={{ margin: 0, flex: 1 }}>Rescue & recover</h1>
      </div>
      <p className="sub">
        Checks {WHRX.scanners.length} places across {new Set(WHRX.scanners.map((s) => s.contract)).size} contracts (AtomicHub, NeftyBlocks, NFTHive, WAXDAO, Alcor, Taco and
        more) for anything still held for your account: deposits, unclaimed packs and blends, stakes, open orders, claim links and locks. Then gets it back, even if the
        original website is gone.
      </p>
      <form
        className="search"
        onSubmit={(ev) => {
          ev.preventDefault();
          const c = WH.checkAccountName(acct);
          c.ok ? (c.value === target ? scan(c.value) : setTarget(c.value)) : r(c.msg || "Enter an account", "error");
        }}
      >
        <input className="input" value={acct} placeholder="Account to check" autoCapitalize="none" onChange={(ev) => setAcct(ev.target.value.toLowerCase())} />
        <button className="btn primary" type="submit" disabled={running}>
          {running ? <div className="spinner" /> : "Scan"}
        </button>
      </form>
      {!target && <WH_Empty title="Sign in or enter an account" text="Anyone can scan any account. Only the owner can recover items." />}
      {target && (
        <div className="card">
          <div className="row">
            <b>{running ? `Scanning… ${done}/${WHRX.scanners.length}` : all.length ? `Found ${all.length} item${all.length === 1 ? "" : "s"} for ${target}` : `Nothing stuck for ${target}`}</b>
            {!running && <span className="pill good">{WHRX.scanners.length - errs.length} checked</span>}
          </div>
          <div className="progress" style={{ marginTop: 10 }}>
            <i style={{ width: `${(done / WHRX.scanners.length) * 100}%` }} />
          </div>
          {!canAct && all.length > 0 && <div className="warn" style={{ marginBottom: 0 }}>You're viewing {target}. Sign in as that account to recover these.</div>}
          {canAct && batch.length > 1 && !running && (
            <button
              className="btn primary block"
              style={{ marginTop: 12 }}
              onClick={() => ask(`Recover ${Math.min(batch.length, 10)} item(s) at once`, batch.slice(0, 10))}
            >
              Recover the simple ones in one go ({Math.min(batch.length, 10)}{batch.length > 10 ? ` of ${batch.length}` : ""})
            </button>
          )}
        </div>
      )}
      {Object.entries(groups).map(([app, items]) => (
        <div key={app}>
          <h2>{app}</h2>
          {items.map((it) => (
            <div className="card" key={it.s.id + it.key}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ fontWeight: 650, flex: 1 }}>{it.title}</div>
                <span className={`pill ${it.seen ? "good" : ""}`} title={it.seen ? "This action has recent successful calls on mainnet" : "Built from the ABI. No recent mainnet use was found."}>
                  {it.seen ? "Verified" : "Untested"}
                </span>
              </div>
              <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                {it.s.contract} · {it.s.label}
              </div>
              {it.detail && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{it.detail}</div>}
              {(it.actions.length > 0 || it.console) && (
                <div className="wh-chips" style={{ marginTop: 10 }}>
                  {it.actions.map((x) => (
                    <button key={x.label} className={`btn sm ${x.danger ? "" : "primary"}`} onClick={() => ask(x.label, x.acts, it)}>
                      {x.label}
                    </button>
                  ))}
                  {it.console && (
                    <button className="btn sm" onClick={() => WH.nav({ tab: "more", tool: "console", sub: it.console })}>
                      Open in console
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {errs.length > 0 && !running && (
        <div className="card">
          <h3>Couldn't check {errs.length} place(s)</h3>
          <div className="muted" style={{ fontSize: 12 }}>{errs.map((s) => `${s.contract} (${s.label})`).join(", ")}. Usually a busy public node. Scan again in a minute.</div>
        </div>
      )}
      {target && !running && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 650 }}>What is and isn't checked</summary>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Checked: {[...new Set(WHRX.scanners.map((s) => s.contract))].join(", ")}.
          </div>
          <ul className="muted" style={{ fontSize: 12, paddingLeft: 18 }}>
            {RX_NOT_SCANNED.map(([c, d]) => (
              <li key={c}>{d}</li>
            ))}
          </ul>
          <button className="btn sm" onClick={() => WH.nav({ tab: "more", tool: "console" })}>
            Open Contract console
          </button>
        </details>
      )}
      <WH_Confirm open={!!confirm} title={confirm?.title || ""} details={confirm?.details || []} warning={confirm?.warning} busy={busy} onClose={() => !busy && setConfirm(null)} onConfirm={run} />
    </>
  );
}
