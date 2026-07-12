// Cloudflare Worker — 사무실 도시락 주문판
// - 정적 파일(public/index.html)은 [assets] 로 서빙
// - /api/data 는 KV(DOSIRAK) 백엔드
// KV 네임스페이스를 변수명 DOSIRAK 로 바인딩해야 클라우드 저장이 됩니다.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/data") {
      return handleData(request, env);
    }
    if (url.pathname === "/api/menu-image") {
      return handleMenuImage(request, env);
    }
    // 그 외 모든 요청은 정적 자산으로
    return env.ASSETS.fetch(request);
  },
};

// ---- 네이버 플레이스(도시락반장) 소식에서 주간 식단표 이미지 찾기 ----
// 결과는 KV(feed:<주월요일>)에 캐시 — 네이버에는 하루 몇 번만 요청이 나감
const PLACE_FEED_URL = "https://m.place.naver.com/restaurant/1011335594/feed";

async function handleMenuImage(request, env) {
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: h });
  const week = new URL(request.url).searchParams.get("week");
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return json({ found: false, error: "week 파라미터가 필요합니다" }, 400);

  const kv = env.DOSIRAK;
  const ck = "feed:" + week;
  if (kv) {
    const cached = await kv.get(ck);
    if (cached) return json(JSON.parse(cached));
  }

  let result;
  try {
    const r = await fetch(PLACE_FEED_URL, { headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "accept-language": "ko-KR,ko;q=0.9",
    } });
    if (!r.ok) throw new Error("naver HTTP " + r.status);
    const hit = pickWeeklyMenu(extractFeeds(await r.text()), week);
    result = hit ? { found: true, url: hit.image, title: hit.title, posted: hit.created } : { found: false };
  } catch (err) {
    result = { found: false, error: String((err && err.message) || err) };
  }

  // 찾으면 12시간 캐시, 못 찾으면 30분 캐시(식단표가 곧 올라올 수 있으니 짧게)
  if (kv) { try { await kv.put(ck, JSON.stringify(result), { expirationTtl: result.found ? 43200 : 1800 }); } catch (e) {} }
  return json(result);
}

// 페이지에 SSR로 박혀 있는 window.__APOLLO_STATE__ JSON에서 Feed 항목들을 추출
function extractFeeds(html) {
  const at = html.indexOf("window.__APOLLO_STATE__");
  if (at < 0) throw new Error("피드 데이터를 찾지 못했습니다");
  const bs = html.indexOf("{", at);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = bs; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const state = JSON.parse(html.slice(bs, end));
  const feeds = [];
  for (const k in state) {
    if (k.indexOf("Feed:") === 0) {
      const f = state[k];
      feeds.push({
        title: f.title || "",
        created: f.createdString || "",
        image: (f.thumbnail && f.thumbnail.url) || (f.media && f.media[0] && f.media[0].thumbnail) || null,
      });
    }
  }
  return feeds;
}

// 제목에 '식단표'가 있고 게시일이 그 주 월요일 근처(-5일~+3일)인 게시물 중 최신 것
// (식당이 매주 토요일쯤 다음 주 식단표를 올리는 패턴)
function pickWeeklyMenu(feeds, week) {
  const p = week.split("-");
  const mon = Date.UTC(+p[0], +p[1] - 1, +p[2]);
  const DAY = 86400000;
  let best = null;
  for (const f of feeds) {
    if (!f.image || f.title.indexOf("식단표") < 0) continue;
    if (!/^\d{8}$/.test(f.created)) continue;
    const t = Date.UTC(+f.created.slice(0, 4), +f.created.slice(4, 6) - 1, +f.created.slice(6, 8));
    const diff = (t - mon) / DAY;
    if (diff < -5 || diff > 3) continue;
    if (!best || t > best._t) { best = f; best._t = t; }
  }
  return best;
}

async function handleData(request, env) {
  const kv = env.DOSIRAK;
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: h });

  if (!kv) {
    return json({ error: "KV 'DOSIRAK'가 연결되지 않았습니다. wrangler.toml 의 kv_namespaces 에 네임스페이스 id 를 채우고 다시 배포하세요." }, 500);
  }

  try {
    // ---- 읽기: 한 주의 전체 데이터 ----
    if (request.method === "GET") {
      const url = new URL(request.url);
      const week = url.searchParams.get("week");
      if (!week) return json({ error: "week 파라미터가 필요합니다" }, 400);

      const config = JSON.parse((await kv.get("config")) || "null");
      const days = JSON.parse((await kv.get("wk:" + week + ":days")) || "null");
      const people = {};
      const list = await kv.list({ prefix: "wk:" + week + ":p:" });
      for (const k of list.keys) {
        const pid = k.name.split(":p:")[1];
        people[pid] = JSON.parse((await kv.get(k.name)) || "null");
      }
      return json({ config, days, week, people });
    }

    // ---- 쓰기 ----
    if (request.method === "POST") {
      const body = await request.json();
      const op = body.op;

      // 개인 선택 저장 (자기 것만 쓰므로 서로 안 덮어씀)
      if (op === "choice") {
        if (!body.week || !body.pid) return json({ error: "week/pid 필요" }, 400);
        await kv.put("wk:" + body.week + ":p:" + body.pid, JSON.stringify({
          choices: body.choices || {}, submitted: !!body.submitted, at: body.at || null,
        }));
        return json({ ok: true });
      }

      // 아래는 관리자 전용 — 저장된 암호가 있으면 검증
      const config = JSON.parse((await kv.get("config")) || "null");
      if (config && config.adminCode && body.adminCode !== config.adminCode) {
        return json({ error: "forbidden" }, 403);
      }

      if (op === "days") { // 이번 주 주문일 설정
        await kv.put("wk:" + body.week + ":days", JSON.stringify(body.days || {}));
        return json({ ok: true });
      }
      if (op === "config") { // 인원/메뉴/예산/암호
        await kv.put("config", JSON.stringify(body.config));
        return json({ ok: true });
      }
      if (op === "fill") { // 미응답자 일괄 처리
        for (const e of (body.entries || [])) {
          await kv.put("wk:" + body.week + ":p:" + e.pid, JSON.stringify({
            choices: e.choices || {}, submitted: !!e.submitted, at: body.at || null,
          }));
        }
        return json({ ok: true });
      }
      return json({ error: "알 수 없는 op" }, 400);
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 500);
  }
}
