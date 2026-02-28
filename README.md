# Club Portal (Single Repo / Single Page)

GitHub Pages로 운영하는 **동아리 포털(디렉토리)** 단일 페이지 사이트입니다.
- UI와 데이터(`data/clubs.json`)가 **한 레포**에 함께 있습니다.
- 동아리 목록은 코드와 분리되어 있어 `data/clubs.json`만 수정해도 자동 반영됩니다.
- “지원하기”는 외부 링크로 연결됩니다(이 사이트에서 지원서를 받지 않음).

## 로컬 실행
브라우저에서 `index.html`을 열어도 대부분 동작하지만, 일부 브라우저는 `fetch()`가 로컬 파일에서 막힐 수 있습니다.
가장 간단한 로컬 서버:

```bash
python -m http.server 8000
```
그리고 `http://localhost:8000` 접속

## 배포 (GitHub Pages)
1. 이 폴더를 GitHub 레포에 업로드(push)
2. `Settings → Pages → Deploy from a branch`
3. Branch: `main`, Folder: `/ (root)` 선택
4. `https://<USERNAME>.github.io/<REPO>/`로 접속

## 데이터 수정
- 파일: `data/clubs.json`
- 형식/규칙: `AI_ADD_CLUB_GUIDE.md` 참고
- PR/푸시 시 JSON Schema 검증: `.github/workflows/validate-clubs-json.yml`

## 설정
`js/config.js`에서 사이트명, 등록요청 링크 등을 바꿀 수 있습니다.
