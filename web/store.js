// データの読み出し。画面側は window.store だけを使う（保存先の違いはここで吸収）。
//   store.mode                       "demo" | "cloud"
//   store.init()                     起動時。cloud でログイン未了なら { needLogin: true }
//   store.list({kind, org, days, notable, limit})   一覧（本文なし・新しい順）
//   store.search(q, {kind, org})     全文検索（一致した前後つき）
//   store.detail(id)                 1件の本文とメタ
(function () {
  const cfg = window.PI_CONFIG || {};
  const demoMode = new URLSearchParams(location.search).has("demo") || !(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const KIND = { news: "news", bid: "bid", doc: "doc" };

  // ---------- 試運転版（demo-data.json をブラウザ内で絞り込む）----------
  let all = [];
  const inDays = (r, days) => !days || Date.now() - new Date(r.first_seen).getTime() <= days * 86400000;
  const pass = (r, o) =>
    (!o.kind || r.kind === o.kind) && (!o.org || r.org_id === o.org) && (!o.notable || (r.hits || []).length) && inDays(r, o.days);
  const demo = {
    mode: "demo",
    async init() {
      all = await (await fetch("demo-data.json")).json();
      all.sort((a, b) => b.first_seen.localeCompare(a.first_seen));
      return {};
    },
    async list(o) {
      return all.filter((r) => pass(r, o)).slice(0, o.limit || 300).map(({ body, ...rest }) => rest);
    },
    async search(q, o) {
      const lq = q.toLowerCase();
      return all.filter((r) => pass(r, { ...o, days: 0 }) && ((r.title || "") + " " + (r.body || "")).toLowerCase().includes(lq))
        .slice(0, 80).map((r) => {
          const b = r.body || "", i = b.toLowerCase().indexOf(lq);
          return { ...r, body: undefined, snippet: i >= 0 ? b.slice(Math.max(0, i - 40), i + 160) : b.slice(0, 120) };
        });
    },
    async detail(id) { return all.find((r) => r.id === id); },
  };

  // ---------- クラウド版（Supabase。本人だけ読める。定義は supabase/schema.sql）----------
  let sb = null;
  const COLS = "id,kind,org_id,org,label,title,url,first_seen,hits,meta";
  const cloud = {
    mode: "cloud",
    async init() {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
      sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const { data } = await sb.auth.getSession();
      return data.session ? {} : { needLogin: true };
    },
    async sendLoginLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false },
      });
      if (error) throw error;
    },
    async logout() { await sb.auth.signOut(); location.reload(); },
    async list(o) {
      let q = sb.from("pi_items").select(COLS).order("first_seen", { ascending: false }).limit(o.limit || 300);
      if (o.kind) q = q.eq("kind", o.kind);
      if (o.org) q = q.eq("org_id", o.org);
      if (o.notable) q = q.not("hits", "eq", "{}");
      if (o.days) q = q.gte("first_seen", new Date(Date.now() - o.days * 86400000).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async search(q, o) {
      const { data, error } = await sb.rpc("pi_search", {
        q, kinds: o.kind ? [o.kind] : null, orgs: o.org ? [o.org] : null, lim: 80,
      });
      if (error) throw error;
      return data;
    },
    async detail(id) {
      const { data, error } = await sb.from("pi_items").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  };

  window.store = demoMode ? demo : cloud;
})();
