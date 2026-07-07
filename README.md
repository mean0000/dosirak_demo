# 사무실 도시락 주문판

주간 도시락 주문·집계·예산 관리 웹앱. Cloudflare Pages + Functions 로 배포합니다.

## 구성
- `index.html` — 프론트엔드 (참여자 주문 화면 + 관리자 화면 내장)
- `functions/api/data.js` — `/api/data` 백엔드 (Cloudflare Pages Function, **KV** 사용)

## 배포 (Cloudflare Pages · Git 연동)
1. 이 저장소를 GitHub에 push 한다.
2. Cloudflare 대시보드 → **Workers & Pages → Create → Pages → Connect to Git** → 이 저장소 선택.
3. 빌드 설정:
   - Framework preset: **None**
   - Build command: **(비움)**
   - Build output directory: **`/`**
4. 첫 배포 후 **Settings → Functions → KV namespace bindings** 에서
   변수명 **`DOSIRAK`** 로 KV 네임스페이스를 연결하고 **재배포**한다.
   - KV 네임스페이스는 미리 **Workers & Pages → KV** 에서 하나 생성해 둔다.

이후 `main` 브랜치에 push 하면 자동으로 재배포됩니다.

## 저장 모드
- **클라우드**: KV(`DOSIRAK`) 연결 시 — 어느 기기에서든 같은 데이터 공유.
- **데모(로컬)**: KV 미연결/오프라인 시 — 브라우저 `localStorage` 에만 저장.
