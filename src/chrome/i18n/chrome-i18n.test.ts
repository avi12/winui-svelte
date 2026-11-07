import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.i18n over in-memory _locales files: placeholders, the fallback chain,
// predefined names, detection, and the navigator and Intl defaults.

const { ChromeI18n } = await import("./chrome-i18n.ts");
const { installLanguageDefaults } = await import("./language-defaults.ts");

const FILES = new Map([
  ["app/manifest.json", "{\"default_locale\": \"en\"}"],
  ["app/_locales/en/messages.json", JSON.stringify({
    hello: {
      message: "Hello"
    },
    greet: {
      message: "Hi $1, you have $COUNT$ items, $$5",
      placeholders: {
        count: {
          content: "$2"
        }
      }
    },
    onlyEnglish: {
      message: "English only"
    },
    mixed: {
      message: "mixed"
    }
  })],
  ["app/_locales/pt/messages.json", JSON.stringify({
    hello: {
      message: "Ola"
    }
  })],
  ["app/_locales/pt_BR/messages.json", JSON.stringify({
    hello: {
      message: "Oi"
    }
  })]
]);

function made({ uiLanguage, acceptLanguages = [uiLanguage] }: {
  uiLanguage: string;
  acceptLanguages?: string[];
}) {
  return new ChromeI18n({
    root: "app",
    extensionId: "ext",
    uiLanguage,
    readText: file => FILES.get(file.replaceAll("\\", "/")),
    acceptLanguages
  });
}

test("falls back from exact locale to language to the default locale", () => {
  assert.equal(made({ uiLanguage: "pt-BR" }).getMessage("hello"), "Oi");
  assert.equal(made({ uiLanguage: "pt-PT" }).getMessage("hello"), "Ola");
  assert.equal(made({ uiLanguage: "fr-FR" }).getMessage("hello"), "Hello");
  assert.equal(made({ uiLanguage: "pt-BR" }).getMessage("onlyEnglish"), "English only");
  assert.equal(made({ uiLanguage: "en" }).getMessage("nothing"), "");
});

test("names match without case", () => {
  assert.equal(made({ uiLanguage: "en" }).getMessage("MIXED"), "mixed");
});

test("fills $1, $NAME$ and $$", () => {
  const i18n = made({ uiLanguage: "en" });
  assert.equal(i18n.getMessage("greet", ["Ann", "3"]), "Hi Ann, you have 3 items, $5");
  assert.equal(i18n.getMessage("greet", "Bob"), "Hi Bob, you have  items, $5");
});

test("predefined names", () => {
  const i18n = made({ uiLanguage: "he-IL" });
  assert.equal(i18n.getMessage("@@ui_locale"), "he_IL");
  assert.equal(i18n.getMessage("@@bidi_dir"), "rtl");
  assert.equal(i18n.getMessage("@@bidi_reversed_dir"), "ltr");
  assert.equal(i18n.getMessage("@@bidi_start_edge"), "right");
  assert.equal(i18n.getMessage("@@bidi_end_edge"), "left");
  assert.equal(i18n.getMessage("@@extension_id"), "ext");
  assert.equal(made({ uiLanguage: "en-US" }).getMessage("@@bidi_dir"), "ltr");
});

test("languages and detection", async () => {
  const i18n = made({
    uiLanguage: "en-US",
    acceptLanguages: ["en-US", "he"]
  });
  assert.equal(i18n.getUILanguage(), "en-US");
  assert.deepEqual(await i18n.getAcceptLanguages(), ["en-US", "he"]);
  const hebrew = await i18n.detectLanguage("שלום עולם");
  assert.deepEqual(hebrew.languages[0], {
    language: "he",
    percentage: 100
  });
  assert.equal(hebrew.isReliable, true);
  assert.equal((await i18n.detectLanguage("hello")).languages[0]?.language, "und");
});

test("a malformed messages.json throws", () => {
  const i18n = new ChromeI18n({
    root: "app",
    uiLanguage: "en",
    defaultLocale: "en",
    readText: () => "{\"a\": 1}"
  });
  assert.throws(() => i18n.getMessage("a"));
});

test("navigator and Intl follow the source until uninstalled", () => {
  const before = new Intl.NumberFormat().resolvedOptions().locale;
  const uninstall = installLanguageDefaults(
    made({
      uiLanguage: "de-DE",
      acceptLanguages: ["de-DE", "en"]
    })
  );
  try {
    assert.equal(navigator.language, "de-DE");
    assert.deepEqual([...navigator.languages], ["de-DE", "en"]);
    assert.equal(new Intl.NumberFormat().resolvedOptions().locale, "de-DE");
    assert.equal(Intl.DateTimeFormat().resolvedOptions().locale, "de-DE");
    assert.equal(new Intl.NumberFormat("en-US").resolvedOptions().locale, "en-US");
    assert.equal((1234.5).toLocaleString(), "1.234,5");
    assert.ok(new Intl.NumberFormat() instanceof Intl.NumberFormat);
  } finally {
    uninstall();
  }

  assert.equal(new Intl.NumberFormat().resolvedOptions().locale, before);
});
