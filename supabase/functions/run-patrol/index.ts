// 「今すぐ巡回」ボタンから呼ばれる。ログイン中の本人だけが、GitHub Actions の patrol を起動できる。
// GitHub の鍵は Supabase の Secrets（PATROL_GH_TOKEN）にだけ置く。サイト側・リポジトリには入れない。
//
// 呼び方（POST, JSON）
//   { "action": "start" }   巡回を起動する。すでに実行中なら起動しない。
//   { "action": "status" }  いちばん新しい巡回の状態を返す。
// 返り値: { running, started, run: { status, conclusion, created_at } | null }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const REPO = "nori-taka/public-info";
const WORKFLOW = "patrol.yml";
const GH = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ghHeaders = () => ({
  Authorization: `Bearer ${Deno.env.get("PATROL_GH_TOKEN")}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "run-patrol",
});

async function latestRun() {
  const r = await fetch(`${GH}/runs?per_page=1`, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHubから状態を取れませんでした (${r.status})`);
  const j = await r.json();
  const x = j.workflow_runs?.[0];
  return x ? { status: x.status, conclusion: x.conclusion, created_at: x.created_at } : null;
}
const isRunning = (run: { status: string } | null) => !!run && run.status !== "completed";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  // 本人確認: ログイン中のユーザーが OWNER_USER_ID と一致するときだけ通す
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user || data.user.id !== Deno.env.get("OWNER_USER_ID")) return reply({ error: "forbidden" }, 403);

  let action = "status";
  try { action = (await req.json()).action ?? "status"; } catch { /* 本文なしは status 扱い */ }

  try {
    let run = await latestRun();
    if (action === "start" && !isRunning(run)) {
      const r = await fetch(`${GH}/dispatches`, {
        method: "POST", headers: ghHeaders(), body: JSON.stringify({ ref: "main" }),
      });
      if (r.status !== 204) return reply({ error: `起動できませんでした (GitHub ${r.status})` }, 502);
      return reply({ running: true, started: true, run });
    }
    return reply({ running: isRunning(run), started: false, run });
  } catch (e) {
    return reply({ error: String((e as Error).message ?? e) }, 502);
  }
});
