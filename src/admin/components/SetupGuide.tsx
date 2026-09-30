import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n";

/** Shopify's setup guide pattern; steps tick themselves as the merchant completes them. */

export interface SetupStep {
  key: string;
  title: string;
  done: boolean;
  content: ComponentChildren;
  image?: string;
}

function Step(props: { step: SetupStep; open: boolean; onToggle: () => void }) {
  const { step } = props;
  return (
    <s-box>
      <s-clickable onClick={props.onToggle} padding="small" borderRadius="base" accessibilityLabel={step.title}>
        <s-grid gridTemplateColumns="auto 1fr auto" gap="small" alignItems="center">
          {step.done ? <s-icon type="check-circle-filled" tone="success" /> : <s-icon type="circle-dashed" color="subdued" />}
          <s-text type={props.open ? "strong" : "generic"}>{step.title}</s-text>
          <s-icon type={props.open ? "chevron-up" : "chevron-down"} color="subdued" />
        </s-grid>
      </s-clickable>
      <s-box padding="small" paddingBlockStart="none" display={props.open ? "auto" : "none"}>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-grid gridTemplateColumns={step.image ? "@container (inline-size <= 460px) 1fr, 1fr auto" : "1fr"} gap="base" alignItems="center">
            <s-stack direction="block" gap="small-300">
              {step.content}
            </s-stack>
            {step.image && (
              <s-box maxInlineSize="96px" maxBlockSize="96px">
                <s-image src={step.image} alt="" accessibilityRole="presentation" />
              </s-box>
            )}
          </s-grid>
        </s-box>
      </s-box>
    </s-box>
  );
}

export function SetupGuide(props: { steps: SetupStep[]; ready: boolean; intro: string; doneIntro: string; onDismiss: () => void }) {
  const done = props.steps.filter((step) => step.done).length;
  const total = props.steps.length;
  const allDone = done === total;
  const firstOpen = props.steps.find((step) => !step.done)?.key ?? null;
  const [open, setOpen] = useState<string | null>(firstOpen);
  const [expanded, setExpanded] = useState(true);

  // Once the checks finish, open the first unfinished step (and fold a finished guide).
  useEffect(() => {
    if (!props.ready) return;
    setOpen(firstOpen);
    if (allDone) setExpanded(false);
  }, [props.ready]);

  return (
    <s-section>
      <s-grid gap="small">
        <s-grid gap="small-200">
          <s-grid gridTemplateColumns="1fr auto auto" gap="small-300" alignItems="center">
            <s-heading>{t("Setup guide")}</s-heading>
            <s-button variant="tertiary" tone="neutral" icon="x" accessibilityLabel={t("Dismiss setup guide")} onClick={props.onDismiss} />
            <s-button
              variant="tertiary"
              tone="neutral"
              icon={expanded ? "chevron-up" : "chevron-down"}
              accessibilityLabel={t("Show or hide the setup guide")}
              onClick={() => setExpanded(!expanded)}
            />
          </s-grid>
          <s-paragraph>{allDone ? props.doneIntro : props.intro}</s-paragraph>
          <s-grid gridTemplateColumns="auto 1fr" gap="base" alignItems="center">
            <s-text color="subdued">{t("{done} of {total} tasks complete", { done, total })}</s-text>
            {/* Not <s-progress>: at 0 it shows its "loading" animation. */}
            <div class={`vc-progress${allDone ? " is-done" : ""}`} role="progressbar" aria-label={t("Setup progress")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
              <span style={{ width: `${(done / total) * 100}%` }} />
            </div>
          </s-grid>
        </s-grid>
        <s-box borderRadius="base" border="base" background="base" display={expanded ? "auto" : "none"}>
          {props.steps.map((step, index) => (
            <s-box key={step.key}>
              {index > 0 && <s-divider />}
              <Step step={step} open={open === step.key} onToggle={() => setOpen(open === step.key ? null : step.key)} />
            </s-box>
          ))}
        </s-box>
      </s-grid>
    </s-section>
  );
}
