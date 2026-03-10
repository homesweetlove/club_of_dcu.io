# DCU Club Portal (Static)

대구가톨릭대학교 동아리(및 여러 동아리) 정보를 한눈에 보고, 공식 지원 링크로 이동할 수 있는 **정적(GitHub Pages) 포털**입니다.

## 주요 기능 (정적만 사용)
- PC/태블릿/모바일 반응형
- 검색 자동완성 + 동의어/오타(퍼지) 매칭 + 관련도(가중치) 정렬
- 카테고리/태그 칩 + **패싯 카운트(개수 표시)**
- **그룹 보기**: 학교별 / 카테고리별
- **섹션 접기/펼치기**
- 마감 임박: 데스크톱 카드 + 모바일 리스트(표) 뷰
- 포스터 갤러리: 여러 장 + 썸네일 + 스와이프 + 이전/다음
- 공유/링크 복사
- PWA 설치 + 오프라인 캐시(Service Worker)

## 동아리 데이터
- `data/clubs.json`

## 자동화(GitHub Actions)
> `/.github` 폴더까지 레포에 포함되어야 동작합니다.  
> 웹 업로드에서 `.github`가 누락되면, Git으로 커밋하거나 GitHub에서 폴더 경로를 직접 만들어 업로드하세요.

- `Validate club data` : push/PR 시 `data/clubs.json`과 이미지 경로를 검증
- `Auto close expired recruiting` : 매일 03:00(KST) `recruitEnd` 지난 항목을 `recruiting=false`로 자동 전환 후 커밋

### 로컬에서 검사
```bash
node tools/validate_clubs.mjs
```

### 로컬에서 모집 종료 자동 반영
```bash
node tools/auto_close_recruiting.mjs
```

## 설정
- `js/config.js`에서 `SITE_NAME`, `SUBMIT_LINK`(동아리 등록/수정 요청 링크) 등을 설정하세요.
