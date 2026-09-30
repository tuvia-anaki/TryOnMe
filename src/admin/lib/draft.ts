import { useEffect, useState } from "preact/hooks";
import type { AppSettings } from "../../shared/settings";
import { loadAppContext, saveSettings } from "../api/settings";
import { t } from "../i18n";
import { toast, useAsync, useSaveBar } from "./hooks";

/**
 * Editing the shop settings: a draft, Shopify's save bar while it differs
 * from what's saved, and one save for everything on the page.
 */
export function useSettingsDraft(saveBarId: string) {
  const context = useAsync(() => loadAppContext(), []);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!context.data) return;
    setDraft(context.data.settings);
    setSaved(context.data.settings);
  }, [context.data]);

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async (extra?: (settings: AppSettings) => AppSettings): Promise<boolean> => {
    if (!context.data || !draft || saving) return false;
    setSaving(true);
    try {
      const next = { ...draft, admin: { ...draft.admin, settingsSaved: true } };
      const clean = await saveSettings(context.data, extra ? extra(next) : next);
      setDraft(clean);
      setSaved(clean);
      toast(t("Settings saved"));
      return true;
    } catch (error) {
      toast((error as Error).message, true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDraft(saved);

  /** Change one group of settings: patch("split", { enabled: true }). */
  function patch<K extends keyof AppSettings>(section: K, values: AppSettings[K] extends object ? Partial<AppSettings[K]> : AppSettings[K]): void {
    setDraft((current) => {
      if (!current) return current;
      const before = current[section];
      const next = before && typeof before === "object" && !Array.isArray(before) ? { ...before, ...(values as object) } : values;
      return { ...current, [section]: next } as AppSettings;
    });
  }

  useSaveBar(saveBarId, dirty, saving, { onSave: () => void save(), onDiscard: discard }, { save: t("Save"), discard: t("Discard") });

  return { context, draft, dirty, saving, save, discard, patch, setDraft };
}
