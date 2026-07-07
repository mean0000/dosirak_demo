# 사무실 도시락 주문판

주간 도시락 주문·집계·예산 관리 웹앱. **Cloudflare Workers(정적 자산 + KV)** 로 배포합니다.

## 구성
- `public/index.html` — 프론트엔드 (참여자 주문 화면 + 관리자 화면 내장)
- `worker.js` — Worker 진입점. `/api/data` 는 KV 백엔드, 그 외는 정적 자산 서빙
- `wrangler.toml` — 배포 설정 (assets 디렉터리 + KV 바인딩)

## 배포 (Cloudflare Workers · Git 연동)
1. 이 저장소를 GitHub에 push 한다.
2. Cloudflare 대시보드 → **Workers & Pages → Create application → Import a repository** → `dosirak_demo` 선택.
3. 빌드/배포 설정:
   - **Build command: (비움)**
   - **Deploy command: `npx wrangler deploy`** (기본값 그대로)
4. **Deploy** → `dosirak.<서브도메인>.workers.dev` 로 접속되면 성공. (이 단계까진 데모/로컬 저장)

## 클라우드 저장(KV) 켜기
1. 대시보드 → **Storage & Databases → KV → Create a namespace** (예: `dosirak`).
2. 생성된 네임스페이스의 **ID** 복사.
3. `wrangler.toml` 의 아래 3줄 주석(`#`)을 해제하고 `id` 에 붙여넣기:
   ```toml
   [[kv_namespaces]]
   binding = "DOSIRAK"
   id = "복사한_KV_ID"
   ```
4. commit → `git push` → 자동 재배포. 하단 표시가 **"☁️ 클라우드 저장"** 으로 바뀌면 완료.

이후 코드 수정 후 `main` 에 push 하면 자동 재배포됩니다.

## 저장 모드
- **클라우드**: KV(`DOSIRAK`) 연결 시 — 어느 기기에서든 같은 데이터 공유.
- **데모(로컬)**: KV 미연결/오프라인 시 — 브라우저 `localStorage` 에만 저장.
