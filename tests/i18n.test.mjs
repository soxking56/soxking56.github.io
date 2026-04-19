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
