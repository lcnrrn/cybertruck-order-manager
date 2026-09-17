# 사이버트럭 주문 관리

3D 프린트 Cybertruck 악세서리 판매용 **모바일 우선** 주문 관리 웹앱입니다.  
Apple 미리알림의 한 줄 메모를 대체하며, 데이터는 브라우저 `localStorage`에만 저장됩니다 (서버 없음).

## 기능

- 주문 목록 · 상태 필터(대기 / 제작중 / 완료) · 이름·연락처 검색
- 추가 / 수정 / 삭제 · 우선순위 표시
- **주소 + 연락처 한 번에 복사** (우체국 택배 붙여넣기용, 두 줄) → 「복사됨」 토스트
- **문자(SMS)** `sms:` 링크 · 「제작 완료」「발송 안내」 짧은 한국어 템플릿
- **네이버 폼 Excel(.xlsx)/CSV 가져오기** (설문 답변 컬럼 자동 매핑)
- 미리알림 스타일 **붙여넣기 가져오기** (best-effort 파싱)
- PWA: iPhone 홈 화면 추가 가능 · 다크 테마 · 큰 터치 영역

## 로컬 실행

```bash
cd cybertruck-order-manager
npm install
npm run dev
```

브라우저에서 표시되는 주소(보통 `http://localhost:5173/cybertruck-order-manager/`)로 접속합니다.

미리보기(빌드 결과):

```bash
npm run build
npm run preview
```

## 프로덕션 빌드

```bash
npm install
npm run build
```

결과물은 `dist/` 폴더입니다.

## 배포

### GitHub Pages

1. 이 저장소를 GitHub에 푸시합니다. (`https://github.com/lcnrrn/cybertruck-order-manager` 권장)
2. `vite.config.ts`의 `base`가 `/cybertruck-order-manager/` 인지 확인합니다.  
   (저장소 이름이 다르면 base·manifest의 `start_url`/`scope`를 맞춰 주세요.)
3. GitHub → Settings → Pages → Source를 **GitHub Actions** 또는 **Deploy from branch**로 설정합니다.
4. 간단 방법: `dist` 내용을 `gh-pages` 브랜치에 올립니다.

예시 (로컬에서 Pages용 브랜치):

```bash
npm run build
npx gh-pages -d dist
```

또는 Actions로 `npm ci && npm run build` 후 `actions/deploy-pages`로 `dist`를 배포합니다.

배포 URL 예: `https://lcnrrn.github.io/cybertruck-order-manager/`

### 기타 정적 호스트 (Netlify / Cloudflare Pages / Vercel 등)

- 빌드 명령: `npm run build`
- 출력 디렉터리: `dist`
- **루트 경로**에 올릴 경우 `vite.config.ts`의 `base`를 `'/'`로 바꾸고, PWA manifest의 `start_url`/`scope`도 `'/'`로 맞춘 뒤 다시 빌드하세요.

## iPhone 홈 화면에 추가

1. Safari로 배포된(또는 로컬) 사이트 접속
2. 공유 버튼 → **홈 화면에 추가**
3. 이름 확인 후 추가 → 앱처럼 전체 화면으로 실행됩니다

> 데이터는 **기기·브라우저마다** 따로 저장됩니다. 기기 변경·캐시 삭제 시 주문이 사라질 수 있으니, 중요하면 붙여넣기 내보내기(복사)로 백업하세요.


## 네이버 폼 Excel 가져오기

1. 앱 상단 **가져오기** → **네이버 폼 Excel** 탭
2. 네이버 폼 설문 답변 내보내기 `.xlsx`(또는 `.csv`) 선택
3. 미리보기 건수 확인 후 **가져오기**

매핑: `성 함(*)`→이름, `카페 닉네임(*)`→그룹(+이름 접두), `연락처(*)`→전화, `주 소(*)`→주소,
옵션 열(거치대·클립·MAT 등)과 `택배비용(*)`·요청 메모 → `items` (` / ` 구분). 상태 기본값 `대기`.
실제 고객 PII는 샘플 시드에 넣지 않습니다.

## 미리알림 붙여넣기 형식 예시

```
김민수 - 사이드미러 커버 / 서울시 강남구 테헤란로 123 01012345678
이서연 / 휠캡 4개 / 부산 해운대구 … / 010-9876-5432
```

한 줄 = 한 주문. 이름·주문·주소·전화번호를 `-` `/` `|` 등으로 구분하면 됩니다.

## 기술 스택

- Vite + React + TypeScript
- `vite-plugin-pwa` (서비스 워커 · 웹 매니페스트)
- 의존성 최소화 · 백엔드 없음

## 라이선스

개인/판매 운영용. 샘플 주문은 **허구 데이터**입니다.
