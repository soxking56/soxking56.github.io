# CLAUDE.md — 프로젝트 규칙

## 레포지토리 정보

- **GitHub**: https://github.com/soxking56/soxking56.github.io
- **배포 주소**: https://soxking56.github.io
- **로컬 경로**: `d:\Game\somisoft\translator\soxking56.github.io`
- **브랜치**: `master` (push하면 GitHub Pages 자동 배포, 1~2분 소요)

---

## 작업 완료 후 반드시 해야 할 것

작업이 끝나면 **항상 commit + push**까지 수행한다. push해야 GitHub Pages에 반영된다.

```bash
cd "d:/Game/somisoft/translator/soxking56.github.io"
git add <파일들>
git commit -m "설명"
git push
```

---

## 파일 구조

```
soxking56.github.io/
├── index.html                          # 설치기 UI
├── app.mjs                             # 설치기 메인 로직
├── i18n.mjs                            # UI 문자열 (영어/한국어)
├── config-editor.mjs                   # config 병합/비교 유틸
├── installer-core.mjs                  # 파일 시스템 처리, 게임 폴더 검사
└── live-translator-installer/          # 게임에 설치되는 파일들
    ├── live-translator-loader.js       # 부트스트랩 (SUPPORT_SCRIPTS 순서 중요)
    ├── translator.js                   # 번역 로직 (local/ollama/deepl/none)
    ├── translation-manager.js          # 캐시 + 번역 요청 관리
    ├── text-replacement-addon.js       # 게임 텍스트 후킹 진입점
    ├── look-ahead-prefetcher.js        # 다음 대화 선행 번역 (백그라운드)
    ├── hooks.js                        # RPG Maker 윈도우/텍스트 훅
    ├── window-draw-hooks.js            # drawText 훅
    ├── window-helpers.js               # 윈도우 레지스트리 유틸
    ├── control-code-helpers.js         # RPG Maker 제어문자 처리
    ├── disk-cache.js                   # 번역 디스크 캐시
    ├── logger.js                       # 로거
    ├── translator.json                 # 번역 제공자 설정 기본값
    └── settings.json                   # 게임 설정 기본값
```

---

## 스크립트 로드 순서 (live-translator-loader.js SUPPORT_SCRIPTS)

순서를 바꾸면 의존성이 깨진다. 새 스크립트 추가 시 반드시 의존 관계 확인.

```
translator.js
window-helpers.js
control-code-helpers.js
hooks.js
disk-cache.js
window-draw-hooks.js
translation-manager.js
look-ahead-prefetcher.js   ← translation-manager 이후, text-replacement-addon 이전
text-replacement-addon.js  ← 항상 마지막
```

---

## 번역 제공자

| provider | 엔드포인트 | 설정 섹션 |
|----------|-----------|-----------|
| `local`  | `http://{address}:{port}/api/v1/chat` (LM Studio) | `settings.local` |
| `ollama` | `http://{address}:{port}/api/chat` | `settings.ollama` |
| `deepl`  | `https://api-free.deepl.com/v2/translate` | `settings.deepl` |
| `none`   | 캐시 전용, 외부 요청 없음 | 없음 |

기본 포트: ollama=11434, local=1234

---

## 새 provider 추가 시 수정 파일

1. `live-translator-installer/translator.json` — settings 섹션 추가
2. `live-translator-installer/translator.js` — normalize/translate/stream/validate 구현
3. `live-translator-installer/live-translator-loader.js` — `validateJsonSanity` 분기 추가
4. `live-translator-installer/text-replacement-addon.js` — `USING_LOCAL_PROVIDER` 조건 확인
5. `app.mjs` — FIELDS 배열, buildProviderToggle, renderTranslatorConfig, getSelectedProvider
6. `i18n.mjs` — 영어/한국어 문자열 추가

---

## look-ahead-prefetcher (선행 번역)

- `$gameMap._interpreter` / `$gameTroop._interpreter`의 현재 index 이후 명령을 스캔
- 번역 대상 커맨드 코드: `101`(메시지), `401`(메시지 줄), `102`(선택지), `402`(선택지 분기), `405`(스크롤)
- 이미 캐시된 텍스트는 중복 요청하지 않음
- `settings.json`의 `prefetch` 섹션으로 제어:

```json
"prefetch": {
  "enabled": true,
  "scanDepth": 60,
  "intervalMs": 500
}
```

---

## 코드 규칙

- 모든 플러그인 파일은 즉시 실행 함수 `(() => { 'use strict'; ... })()` 로 감싼다
- 모듈은 `globalScope.LiveTranslatorModules.createXxx = function(options) { ... }` 형태로 등록
- 전역 접근은 항상 `typeof X !== 'undefined'` 가드 사용
- 주석은 WHY가 명확할 때만 작성, 코드 설명 주석은 쓰지 않음

---

## 로컬 개발 서버

```bash
python3 dev-server.py --bind 127.0.0.1 4173
```

`http://127.0.0.1:4173/` — `Cache-Control: no-store` 헤더로 항상 최신 파일 서빙

## 테스트

```bash
node --test tests/*.test.mjs
```
