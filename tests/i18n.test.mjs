import assert from "node:assert/strict";
import test from "node:test";

import {
  createTranslator,
  detectPreferredLocale,
  resolveLocale,
} from "../i18n.mjs";

test("detectPreferredLocale prefers Korean when navigator.languages includes ko", () => {
  const locale = detectPreferredLocale({
    languages: ["ko-KR", "en-US"],
    language: "en-US",
  });

  assert.equal(locale, "ko");
});

test("detectPreferredLocale falls back to English for unsupported languages", () => {
  const locale = detectPreferredLocale({
    languages: ["ja-JP"],
    language: "ja-JP",
  });

  assert.equal(locale, "en");
  assert.equal(resolveLocale("fr-FR"), "en");
});

test("createTranslator returns translated copy and interpolates placeholders", () => {
  const t = createTranslator("ko-KR");

  assert.equal(t("button.install"), "설치");
  assert.equal(t("button.reinstall"), "재설치");
  assert.equal(
    t("log.installComplete", { count: 3, path: "js/plugins/live-translator" }),
    "설치가 완료되었습니다. 플러그인 파일 3개를 기록하고 js/plugins/live-translator를 업데이트했습니다.",
  );
});

test("createTranslator includes cache-only provider copy", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(
    en("config.section.noneSettings.note"),
    "Disables new translation requests and uses translation-cache.log.",
  );
  assert.equal(
    en("provider.none.tooltip"),
    "Disable new translation requests and use only translation-cache.log.",
  );
  assert.equal(
    ko("config.section.noneSettings.note"),
    "새 번역 요청을 비활성화하고 translation-cache.log만 사용합니다.",
  );
});

test("createTranslator includes reinstall save reminder localization", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(
    en("config.status.reinstallPreserved"),
    "Action required: click Save Config now. Reinstall restored the files on disk, and your preserved session settings are not written back yet.",
  );
  assert.equal(
    ko("config.status.reinstallPreserved"),
    "작업 필요: 지금 설정 저장을 클릭하세요. 재설치로 디스크의 설정 파일이 복원되었고, 보존된 세션 설정은 아직 다시 저장되지 않았습니다.",
  );
});
