// Drops tab data layer. The 2.0 tab read the 20 newest rows of each drop
// table, which are mostly creators' test drops, and filtered that page by exact
// collection name. This scans newest-first in pages of 200 and keeps only drops
// that match the chosen status, so the list shows what people can actually
// claim. Collection search resolves names through the AtomicAssets API.

const WHD = (() => {
  const now = () => Math.floor(Date.now() / 1000);
  function status(r) {
    const st = Number(r.start_time) || 0;
    const et = Number(r.end_time) || 0;
    const max = Number(r.max_claimable ?? r.max ?? 0) || 0;
    const cl = Number(r.current_claimed ?? r.use_count ?? 0) || 0;
    const t = now();
    let key = "live";
    if (r.is_hidden) key = "hidden";
    else if (et && et <= t) key = "ended";
    else if (max && cl >= max) key = "soldout";
    else if (st > t) key = "upcoming";
    return { key, st, et, max, cl };
  }
  function left(sec) {
    const d = sec - now();
    if (d <= 0) return "";
    if (d < 3600) return `${Math.ceil(d / 60)}m`;
    if (d < 86400) return `${Math.floor(d / 3600)}h`;
    return `${Math.floor(d / 86400)}d`;
  }
  const LABEL = { live: "Live", upcoming: "Upcoming", ended: "Ended", soldout: "Sold out", hidden: "Hidden" };

  // filter: "live" | "upcoming" | "all"; tested: require at least one claim (hides test drops)
  function test(filter, tested, cols, text) {
    return (r) => {
      const s = status(r);
      if (s.key === "hidden") return false;
      if (filter === "live" && s.key !== "live") return false;
      if (filter === "upcoming" && s.key !== "upcoming") return false;
      if (tested && filter !== "upcoming" && s.cl === 0) return false;
      if (cols) {
        const c = String(r.collection_name);
        if (!cols.has(c) && !(text && c.includes(text))) return false;
      }
      return true;
    };
  }

  async function scan({ code, table, cursor, keep, want = 20, maxRows = 1200 }) {
    const rows = [];
    let ub = cursor;
    let scanned = 0;
    let more = true;
    while (rows.length < want && scanned < maxRows) {
      const r = await qr({ code, scope: code, table, limit: 200, reverse: !0, ...(ub ? { upper_bound: ub } : {}) });
      const rs = r.rows || [];
      scanned += rs.length;
      rows.push(...rs.filter(keep));
      if (!r.more || !rs.length || !r.next_key) {
        more = false;
        ub = void 0;
        break;
      }
      ub = r.next_key;
    }
    return { rows, cursor: ub, more, scanned };
  }

  async function collections(text) {
    const q = encodeURIComponent(text);
    const [a, b] = await Promise.all([
      to(`/atomicassets/v1/collections?match=${q}&limit=100`).catch(() => ({ data: [] })),
      to(`/atomicassets/v1/collections?search=${q}&limit=100`).catch(() => ({ data: [] })),
    ]);
    const set = new Set([...(a.data || []), ...(b.data || [])].map((c) => c.collection_name));
    if (/^[a-z1-5.]{1,13}$/.test(text)) set.add(text);
    return set;
  }

  return { status, left, LABEL, test, scan, collections };
})();

function WH_DropFilters({ filter, setFilter, tested, setTested, blends, info }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="tabs" style={{ marginBottom: 6 }}>
        {[
          ["live", "Live now"],
          ["upcoming", "Upcoming"],
          ["all", "All recent"],
        ].map(([k, l]) => (
          <button key={k} className={`tab ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
        {filter !== "upcoming" && (
          <button className={`tab ${tested ? "on" : ""}`} onClick={() => setTested(!tested)} title="Hide drops nobody has claimed yet (usually tests)">
            {tested ? "✓ " : ""}Hide unclaimed{blends ? "" : " / test"}
          </button>
        )}
      </div>
      {info && <div className="faint" style={{ fontSize: 11.5 }}>{info}</div>}
    </div>
  );
}

function WH_DropStatus({ row }) {
  const s = WHD.status(row);
  const cls = s.key === "live" ? "good" : s.key === "upcoming" ? "accent" : "";
  const bits = [];
  if (s.max) bits.push(`${s.cl.toLocaleString()} / ${s.max.toLocaleString()} claimed`);
  else if (s.cl) bits.push(`${s.cl.toLocaleString()} claimed`);
  if (s.key === "live" && s.et) bits.push(`ends in ${WHD.left(s.et)}`);
  if (s.key === "upcoming") bits.push(`starts in ${WHD.left(s.st)}`);
  return (
    <div className="row" style={{ justifyContent: "flex-start", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      <span className={`pill ${cls}`}>{WHD.LABEL[s.key]}</span>
      {row.auth_required && <span className="pill" title="Only whitelisted accounts or holders of a required NFT can claim">Whitelist / requirement</span>}
      {bits.length > 0 && <span className="faint" style={{ fontSize: 11.5 }}>{bits.join(" · ")}</span>}
      {s.max > 0 && (
        <div className="progress" style={{ flexBasis: "100%", height: 5 }}>
          <i style={{ width: `${Math.min(100, (s.cl / s.max) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
