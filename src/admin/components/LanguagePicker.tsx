import { availableLanguages, currentLanguage, languageName, setLanguage, t } from "../i18n";
import { Dropdown } from "./Dropdown";

/** The app follows the Shopify admin's language; merchants can pick another one here. */
export function LanguagePicker() {
  const languages = availableLanguages()
    .map((code) => ({ value: code, label: languageName(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return <Dropdown label={t("Language")} labelHidden value={currentLanguage()} options={languages} onChange={(code) => void setLanguage(code)} />;
}
