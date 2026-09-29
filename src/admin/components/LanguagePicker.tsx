import { availableLanguages, currentLanguage, languageName, setLanguage, t } from "../i18n";

/** The app follows the Shopify admin's language; merchants can pick another one here. */
export function LanguagePicker() {
  const languages = availableLanguages()
    .map((code) => ({ code, name: languageName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <s-select
      label={t("Language")}
      labelAccessibilityVisibility="exclusive"
      icon="language"
      value={currentLanguage()}
      onChange={(event) => void setLanguage(event.currentTarget.value)}
    >
      {languages.map(({ code, name }) => (
        <s-option key={code} value={code}>
          {name}
        </s-option>
      ))}
    </s-select>
  );
}
