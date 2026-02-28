# AI_ADD_CLUB_GUIDE.md
이 레포는 GitHub Pages로 운영되는 **동아리 포털(디렉토리)** 단일 페이지 사이트입니다.

- 사이트 화면(HTML/CSS/JS)은 되도록 안정적으로 유지합니다.
- 동아리 목록은 `data/clubs.json`만 수정해도 자동 반영되도록 설계되어 있습니다.
- AI는 **이 문서의 규칙을 따라 `data/clubs.json`을 추가/수정**해야 합니다.

---

## 0) 목표
- 새 동아리 추가 / 기존 동아리 수정 / 모집 상태 업데이트를 **일관된 규칙**으로 수행
- 결과물은 사람이 그대로 커밋/PR 할 수 있어야 함

---

## 1) 작업 대상
- **대상 파일:** `data/clubs.json`
- **형식:** JSON Array(배열) 최상위
- **들여쓰기:** 공백 2칸
- **정렬:** 문서 하단 “정렬 규칙”을 따름

---

## 2) 사용자에게 받아야 할 정보(입력)
AI는 아래 항목을 사용자에게 요청해 수집합니다. (누락 시 추가 질문)

**[필수]**
1) `school` 학교명
2) `name` 동아리명
3) `categories` 카테고리(1개 이상)
4) `oneLine` 한 줄 소개
5) `applyUrl` 지원 링크(구글폼/지원페이지/오픈채팅 등)
6) `recruiting` 모집 여부(true/false)
7) `recruitEnd` 모집 마감일(모집중이면 필수, YYYY-MM-DD)

**[권장]**
- `tags` 태그
- `description` 상세 소개
- `activityTime` 활동 빈도
- `location` 활동 장소
- `contactUrl` 문의 링크(인스타/오픈채팅/메일 등)
- `logo`, `images` (리포 내 이미지 경로)

---

## 3) 산출물 출력 규칙(중요)
AI는 결과를 아래 중 하나로만 출력합니다.

1) **Unified diff 패치**(권장) — `data/clubs.json` 변경점만 diff로 제시  
또는  
2) **갱신된 `data/clubs.json` 전체 내용**을 JSON만 출력(설명 문장 금지)

마지막에 아주 짧게 체크리스트만 덧붙일 수 있습니다:
- 중복 점검 결과
- URL/날짜 형식 검증 결과
- 스키마 위반 여부

---

## 4) 필드 스키마(요약)
각 동아리는 아래 객체 형태입니다.

### 4.1 필수 필드
- `id` (string): 고유 식별자(아래 ID 규칙 준수)
- `school` (string)
- `name` (string)
- `categories` (string[])
- `oneLine` (string)
- `recruiting` (boolean)
- `recruitEnd` (string|null) : YYYY-MM-DD
- `applyUrl` (string) : https:// 또는 mailto:
- `contactUrl` (string) : https:// 또는 mailto: (권장이나 현재 UI에서는 없으면 비워도 됨)

### 4.2 선택 필드
- `tags` (string[])
- `description` (string)
- `activityTime` (string)
- `location` (string)
- `logo` (string) : 예) `./assets/logos/<id>.png`
- `images` (string[])

### 4.3 필드 순서(가능하면 유지)
1) id
2) school
3) name
4) categories
5) tags
6) oneLine
7) description
8) activityTime
9) location
10) recruiting
11) recruitEnd
12) applyUrl
13) contactUrl
14) logo
15) images

---

## 5) ID 생성 규칙(중요)
형식: `schoolSlug__nameSlug`

- 소문자 권장
- 공백은 `-`
- 특수문자는 제거(허용: 영문/숫자/하이픈/언더스코어)
- 예: `snu__ai-lab`, `khu__laha`
- 중복이면 `-2`, `-3` suffix

---

## 6) 중복/수정 판단(중요)
새로 추가하기 전에 반드시 중복 검사:
- (school이 같고) name이 동일/유사(공백/특수문자 차이 무시)

처리:
- 기존이 있으면 **추가가 아니라 수정**
- 사용자가 “동일명 다른 동아리”라고 명확히 말하면 새 항목 추가 가능

---

## 7) 모집 상태/마감일 규칙
- recruiting=true 이면 recruitEnd는 YYYY-MM-DD로 필수
- 마감일이 ‘미정’인데 모집중이면:
  - recruitEnd는 null 허용
  - tags에 "마감미정" 또는 "상시모집" 중 하나를 반드시 넣기

---

## 8) 정렬 규칙(파일 전체)
`data/clubs.json` 배열은 아래 우선순위로 정렬합니다.
1) recruiting=true 먼저
2) recruitEnd 빠른 순(날짜가 있는 항목 먼저, null은 뒤)
3) school 오름차순
4) name 오름차순

---

## 9) 최종 검증 체크리스트(AI는 반드시 수행)
- [ ] JSON 문법 오류 없음
- [ ] 필수 필드 누락 없음
- [ ] URL 형식(https:// 또는 mailto:) 확인
- [ ] recruitEnd 날짜 형식 YYYY-MM-DD 확인(또는 null+태그 규칙)
- [ ] 중복 동아리 검사 완료
- [ ] 정렬 규칙 적용 완료
