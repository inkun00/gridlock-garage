# 그리드락 개러지

독자 브랜드의 3D 슬라이딩 차량 퍼즐 웹 게임 프로토타입입니다.

## 실행

현재 버전은 빌드 도구 없이 동작하는 정적 웹 앱입니다.

```powershell
# 이 폴더를 정적 서버로 서빙한 뒤 브라우저에서 접속
# 예: http://127.0.0.1:4173/
```

`index.html`은 Three.js를 CDN import map으로 불러옵니다. 추후 Node 환경이 준비되면 Vite 기반 프로젝트로 쉽게 전환할 수 있도록 `src/main.js`에 게임 로직을 분리했습니다.

## Vercel 배포

정적 사이트로 배포됩니다. Vercel 토큰이 준비된 환경에서는 아래 스크립트를 사용할 수 있습니다.

```powershell
$env:VERCEL_TOKEN="..."
$env:VERCEL_PROJECT="gridlock-garage"
node scripts/deploy-vercel.mjs
```

팀 계정으로 배포할 때는 `$env:VERCEL_TEAM_ID`도 함께 지정합니다.

## 포함된 기능

- 3D 보드와 장난감 자동차 스타일 차량 렌더링
- 1-100 스테이지 선택
- 난이도 구간 표시
- 차량 드래그 이동
- 시간 및 이동 횟수 측정
- 클리어 판정
- 되돌리기, 재시작, 다음 스테이지
- 스테이지별 로컬 리더보드 Top 50

## 주요 파일

- `PRD.md`: 제품 요구사항 문서
- `index.html`: 앱 진입점
- `styles.css`: 반응형 UI 스타일
- `src/main.js`: 3D 렌더링과 게임 로직
