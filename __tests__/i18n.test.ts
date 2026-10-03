import { describe, expect, it } from "vitest";
import { createI18n, isLocale, LOCALES, resolveLocale } from "../lib/i18n";
import ptBR from "../lib/i18n/pt-BR.json";
import zhTW from "../lib/i18n/zh-TW.json";

const catalogs = { "pt-BR": ptBR, "zh-TW": zhTW } as const;

describe("interface translations", () => {
  it("defaults to Brazilian Portuguese for absent or unsupported preferences", () => {
    for (const value of [undefined, null, "", "fr", "pt", "pt-PT", "zh-CN", "../zh-TW"]) {
      expect(resolveLocale(value)).toBe("pt-BR");
    }
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("zh-TW")).toBe("zh-TW");
  });

  it("offers Portuguese first, then English and Traditional Chinese", () => {
    expect(LOCALES).toEqual(["pt-BR", "en", "zh-TW"]);
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(isLocale("pt")).toBe(false);
  });

  it("renders every interface language from the same keys", () => {
    expect(createI18n("pt-BR").t("Campaigns")).toBe("Campanhas");
    expect(createI18n("en").t("Campaigns")).toBe("Campaigns");
    expect(createI18n("zh-TW").t("Campaigns")).toBe("自動回覆活動");
  });

  it("keeps the Portuguese and Chinese catalogs on the same key set", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(zhTW).sort());
  });

  it("allows sentence order to differ between languages", () => {
    const values = { count: 2 };
    expect(createI18n("en").t("{count} connected accounts", values)).toBe(
      "2 connected accounts",
    );
    expect(createI18n("zh-TW").t("{count} connected accounts", values)).toBe(
      "已連接 2 個帳號",
    );
    expect(createI18n("pt-BR").t("{count} connected accounts", values)).toBe(
      "2 contas conectadas",
    );
  });

  it("preserves interpolation values verbatim, including user content and zero", () => {
    const { t } = createI18n("zh-TW");
    expect(t("Hello, {name}!", { name: "{count} <b>Alex</b> $&" })).toBe(
      "你好，{count} <b>Alex</b> $&！",
    );
    expect(t("{count} campaigns", { count: 0 })).toBe("0 個活動");
    const pt = createI18n("pt-BR").t;
    expect(pt("Hello, {name}!", { name: "{count} <b>Alex</b> $&" })).toBe(
      "Olá, {count} <b>Alex</b> $&!",
    );
    expect(pt("{count} campaigns", { count: 0 })).toBe("0 campanhas");
  });

  it("translates display labels without changing stored codes or unknown values", () => {
    const codes = ["SENT", "OWNER", "active", "CUSTOM_STATUS"];
    expect(codes.map(createI18n("zh-TW").label)).toEqual([
      "已傳送",
      "擁有者",
      "啟用中",
      "CUSTOM_STATUS",
    ]);
    expect(codes).toEqual(["SENT", "OWNER", "active", "CUSTOM_STATUS"]);
    expect(createI18n("zh-TW").label("toString")).toBe("toString");
    expect(createI18n("zh-TW").label("__proto__")).toBe("__proto__");
    expect(codes.map(createI18n("pt-BR").label)).toEqual([
      "Enviada",
      "Proprietário",
      "Ativa",
      "CUSTOM_STATUS",
    ]);
  });

  it("translates weekday labels into Portuguese", () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    expect(days.map(createI18n("pt-BR").label)).toEqual([
      "Seg",
      "Ter",
      "Qua",
      "Qui",
      "Sex",
      "Sáb",
      "Dom",
    ]);
  });

  it("has complete, plain-text translations with matching interpolation fields", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [source, translation] of Object.entries(catalog)) {
        const where = `${locale}: ${source}`;
        expect(translation.trim(), where).not.toBe("");
        expect(placeholders(translation), where).toEqual(placeholders(source));
        expect(source, where).not.toMatch(/&(?:[a-z]+|#\d+);/i);
        expect(translation, where).not.toMatch(/&(?:[a-z]+|#\d+);|<[a-z/]/i);
      }
    }
  });
});
