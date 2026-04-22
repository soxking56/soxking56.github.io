# 작업 흐름 메모

## 레포지토리 정보

- **GitHub**: https://github.com/soxking56/soxking56.github.io
- **배포 주소**: https://soxking56.github.io
- **로컬 경로**: `d:\Game\somisoft\translator\soxking56.github.io`
- **브랜치**: `master` (push하면 GitHub Pages 자동 배포)

---

## 변경 후 반영 (push까지 한 번에)

```bash
cd "d:/Game/somisoft/translator/soxking56.github.io"
git add -A
git commit -m "변경 내용 설명"
git push
```

push 후 GitHub Actions가 자동으로 GitHub Pages에 배포함. 반영까지 1~2분 소요.

---

## 주요 파일 구조

```
soxking56.github.io/
├── index.html                          # 설치기 UI
├── app.mjs                             # 설치기 메인 로직 (provider UI, config 편집기)
├── i18n.mjs                            # UI 문자열 (영어/한국어)
├── config-editor.mjs                   # config 병합/비교 유틸
└── live-translator-installer/          # 게임에 실제로 설치되는 파일들
    ├── translator.json                 # 번역 제공자 설정 기본값
    ├── translator.js                   # 번역 로직 (local / ollama / deepl / none)
    ├── live-translator-loader.js       # 게임 기동 시 부트스트랩
    ├── text-replacement-addon.js       # 게임 텍스트 후킹
    ├── translation-manager.js          # 캐시 + 번역 요청 관리
    ├── settings.json                   # 게임 설정 기본값
    ├── hooks.js                        # RPG Maker 훅
    ├── logger.js                       # 로거
    ├── disk-cache.js                   # 디스크 캐시
    ├── control-code-helpers.js         # 제어문자 처리
    ├── window-draw-hooks.js            # 윈도우 드로우 훅
    ├── window-helpers.js               # 윈도우 유틸
    └── installer.ps1 / installer.sh    # 설치 스크립트
```

---

## 번역 제공자 (translator.json → provider)

| provider | 설명 | 설정 섹션 |
|----------|------|-----------|
| `local`  | LM Studio 호환 서버 (`/api/v1/chat`) | `settings.local` |
| `ollama` | Ollama 서버 (`/api/chat`) | `settings.ollama` |
| `deepl`  | DeepL API | `settings.deepl` |
| `none`   | 캐시 전용 (새 번역 요청 없음) | 없음 |

### ollama 기본 포트: 11434 / local 기본 포트: 1234

---

## provider 추가 시 수정해야 할 파일

1. `live-translator-installer/translator.json` — settings 섹션 추가
2. `live-translator-installer/translator.js` — normalize, translate, stream, validate 함수 추가
3. `live-translator-installer/live-translator-loader.js` — validateJsonSanity 분기 추가
4. `live-translator-installer/text-replacement-addon.js` — USING_LOCAL_PROVIDER 조건 확인
5. `app.mjs` — FIELDS 배열, buildProviderToggle, renderTranslatorConfig, getSelectedProvider
6. `i18n.mjs` — 영어/한국어 문자열 추가
