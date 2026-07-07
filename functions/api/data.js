// Cloudflare Pages Function — 도시락 주문 데이터 저장소 (KV 사용)
// 경로: /api/data
// KV 네임스페이스를 변수 이름 DOSIRAK 로 바인딩해야 합니다.

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.DOSIRAK;
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: h });

  if (!kv) {
    return json({ error: "KV 'DOSIRAK'가 연결되지 않았습니다. Cloudflare 대시보드 → 프로젝트 → Settings → Functions → KV namespace bindings 에서 변수명 DOSIRAK 로 네임스페이스를 연결한 뒤 다시 배포하세요." }, 500);
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
          choices: body.choices || {}, submitted: !!body.submitted, at: body.at || null
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
            choices: e.choices || {}, submitted: !!e.submitted, at: body.at || null
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
