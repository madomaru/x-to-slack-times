// fetch_x_to_logs.mjs
import fetch from "node-fetch";

/**
 * Inputs: start_time / end_time (ISO8601, UTC) を指定すると期間で取得
 * 未指定なら直近の投稿（max_results=10）だけ取ってログに表示
 */
const BEARER = process.env.X_BEARER_TOKEN;
const USER_ID = process.env.X_USER_ID || process.env.INPUT_X_USER_ID; // どちらでも
const START = process.env.INPUT_START_TIME || process.env.START_TIME || ""; // 例: 2025-06-01T00:00:00Z
const END   = process.env.INPUT_END_TIME   || process.env.END_TIME   || "";
const LIMIT = Number(process.env.INPUT_LIMIT || 100); // 1実行の上限件数（ページング合算）

if (!BEARER || !USER_ID) {
  console.error("Missing X_BEARER_TOKEN or X_USER_ID.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${BEARER}` };

function buildUrl(pagination_token = "") {
  const url = new URL(`https://api.twitter.com/2/users/${USER_ID}/tweets`);
  // 期間指定（省略可）
  if (START) url.searchParams.set("start_time", START);
  if (END)   url.searchParams.set("end_time", END);
  url.searchParams.set("max_results", "100"); // 1ページ最大
  url.searchParams.set("tweet.fields", "created_at,public_metrics");
  if (pagination_token) url.searchParams.set("pagination_token", pagination_token);
  return url.toString();
}

function oneLine(text = "") {
  // ログ崩れ防止（改行/タブをスペースに）
  return text.replace(/\s+/g, " ").trim();
}

async function main() {
  let next = "";
  let got = 0;
  let page = 0;

  console.log("=== X API fetch start ===");
  console.log(`USER_ID=${USER_ID}`);
  if (START || END) console.log(`WINDOW: ${START || "-"} → ${END || "-"}`);

  while (true) {
    page++;
    const url = buildUrl(next);
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      console.warn(`[WARN] 429 Too Many Requests. Stop this run and try later.`);
      break;
    }
    if (!res.ok) {
      const text = await res.text();
      console.error(`[ERROR] ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
      process.exitCode = 1;
      break;
    }
    const json = await res.json();
    const items = json.data || [];
    const meta  = json.meta || {};
    console.log(`-- page ${page} : ${items.length} items`);

    for (const t of items) {
      got++;
      // ログに見やすく整形
      const when = t.created_at || "";
      const txt  = oneLine(t.text || "");
      const url  = `https://x.com/i/web/status/${t.id}`;
      const pm   = t.public_metrics || {};
      console.log(`[${got}] ${when} ♥${pm.like_count ?? 0} 🔁${pm.retweet_count ?? 0} 🔁(qt)${pm.quote_count ?? 0} 💬${pm.reply_count ?? 0}`);
      console.log(`     ${url}`);
      console.log(`     ${txt}`);
    }

    // 終了判定
    if (!meta.next_token) break;
    if (got >= LIMIT) {
      console.log(`Reached LIMIT=${LIMIT}.`);
      break;
    }
    next = meta.next_token;
  }

  console.log(`=== X API fetch done. total=${got} ===`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});