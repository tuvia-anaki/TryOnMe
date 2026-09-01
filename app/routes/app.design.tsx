import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Card,
  Checkbox,
  InlineGrid,
  Page,
  RangeSlider,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const widget = await prisma.widgetSettings.findUniqueOrThrow({
    where: { shopId: shop.id },
  });
  return { widget };
};

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HOVER_ANIMATIONS = ["none", "darken", "lift", "grow"] as const;
const BUTTON_SIZES = ["small", "medium", "large"] as const;

/** Shared with the storefront button CSS — keep the two in sync. */
const SIZE_STYLES: Record<string, { padding: string; fontSize: number }> = {
  small: { padding: "10px 18px", fontSize: 13 },
  medium: { padding: "14px 26px", fontSize: 15 },
  large: { padding: "17px 32px", fontSize: 17 },
};

function hexOr(value: unknown, fallback: string): string {
  return HEX_PATTERN.test(String(value)) ? String(value) : fallback;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const form = await request.formData();

  const buttonText = String(form.get("buttonText") ?? "Try It On").slice(0, 40) || "Try It On";
  const buttonStyle = form.get("buttonStyle") === "outline" ? "outline" : "solid";
  const hoverAnimation = HOVER_ANIMATIONS.includes(form.get("hoverAnimation") as any)
    ? String(form.get("hoverAnimation"))
    : "none";
  const buttonSize = BUTTON_SIZES.includes(form.get("buttonSize") as any)
    ? String(form.get("buttonSize"))
    : "medium";
  const backgroundColor = hexOr(form.get("backgroundColor"), "#111111");
  const textColor = hexOr(form.get("textColor"), "#ffffff");
  const borderRadius = Math.min(30, Math.max(0, Number(form.get("borderRadius")) || 0));
  const fullWidth = form.get("fullWidth") === "true";
  const iconEnabled = form.get("iconEnabled") === "true";

  await prisma.widgetSettings.update({
    where: { shopId: shop.id },
    data: {
      buttonText,
      buttonStyle,
      hoverAnimation,
      buttonSize,
      backgroundColor,
      textColor,
      borderRadius,
      fullWidth,
      iconEnabled,
    },
  });

  return { ok: true };
};

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      autoComplete="off"
      prefix={
        <input
          type="color"
          value={HEX_PATTERN.test(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 24, height: 24, border: "none", padding: 0, background: "none" }}
        />
      }
    />
  );
}

export default function Design() {
  const { widget } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [buttonText, setButtonText] = useState(widget.buttonText);
  const [buttonStyle, setButtonStyle] = useState(widget.buttonStyle);
  const [hoverAnimation, setHoverAnimation] = useState(widget.hoverAnimation);
  const [buttonSize, setButtonSize] = useState(widget.buttonSize);
  const [backgroundColor, setBackgroundColor] = useState(widget.backgroundColor);
  const [textColor, setTextColor] = useState(widget.textColor);
  const [borderRadius, setBorderRadius] = useState(widget.borderRadius);
  const [fullWidth, setFullWidth] = useState(widget.fullWidth);
  const [iconEnabled, setIconEnabled] = useState(widget.iconEnabled);

  const saving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Design saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const save = () => {
    fetcher.submit(
      {
        buttonText,
        buttonStyle,
        hoverAnimation,
        buttonSize,
        backgroundColor,
        textColor,
        borderRadius: String(borderRadius),
        fullWidth: String(fullWidth),
        iconEnabled: String(iconEnabled),
      },
      { method: "post" },
    );
  };

  const hoverStyles: Record<string, React.CSSProperties> = {
    none: {},
    darken: { filter: "brightness(0.82)" },
    lift: { transform: "translateY(-2px)", boxShadow: "0 6px 16px rgba(0,0,0,0.16)" },
    grow: { transform: "scale(1.045)" },
  };
  const [previewHover, setPreviewHover] = useState(false);

  const previewButton = (
    <button
      type="button"
      onMouseEnter={() => setPreviewHover(true)}
      onMouseLeave={() => setPreviewHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: fullWidth ? "100%" : undefined,
        padding: (SIZE_STYLES[buttonSize] ?? SIZE_STYLES.medium).padding,
        fontSize: (SIZE_STYLES[buttonSize] ?? SIZE_STYLES.medium).fontSize,
        fontWeight: 600,
        cursor: "default",
        border: `1.5px solid ${backgroundColor}`,
        borderRadius,
        background: buttonStyle === "outline" ? "transparent" : backgroundColor,
        color: buttonStyle === "outline" ? backgroundColor : textColor,
        fontFamily: "inherit",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease",
        ...(previewHover ? hoverStyles[hoverAnimation] ?? {} : {}),
      }}
    >
      {iconEnabled && (
        <span style={{ fontSize: "1.05em", lineHeight: 1 }} aria-hidden="true">
          ✦
        </span>
      )}
      <span>{buttonText || "Try It On"}</span>
    </button>
  );

  return (
    <Page
      title="Design"
      primaryAction={{ content: "Save", onAction: save, loading: saving }}
    >
      <TitleBar title="Design" />
      <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Button
              </Text>
              <TextField
                label="Button text"
                value={buttonText}
                onChange={setButtonText}
                autoComplete="off"
                maxLength={40}
              />
              <InlineGrid columns={2} gap="300">
                <Select
                  label="Button style"
                  options={[
                    { label: "Solid", value: "solid" },
                    { label: "Outline", value: "outline" },
                  ]}
                  value={buttonStyle}
                  onChange={setButtonStyle}
                />
                <Select
                  label="Hover animation"
                  options={[
                    { label: "None", value: "none" },
                    { label: "Darken", value: "darken" },
                    { label: "Lift", value: "lift" },
                    { label: "Grow", value: "grow" },
                  ]}
                  value={hoverAnimation}
                  onChange={setHoverAnimation}
                />
              </InlineGrid>
              <InlineGrid columns={2} gap="300">
                <ColorField
                  label="Background color"
                  value={backgroundColor}
                  fallback="#111111"
                  onChange={setBackgroundColor}
                />
                <ColorField
                  label="Text color"
                  value={textColor}
                  fallback="#ffffff"
                  onChange={setTextColor}
                />
              </InlineGrid>
              <RangeSlider
                label={`Border radius: ${borderRadius}px`}
                min={0}
                max={30}
                value={borderRadius}
                onChange={(v) => setBorderRadius(typeof v === "number" ? v : v[0])}
              />
              <InlineGrid columns={2} gap="300">
                <Select
                  label="Button size"
                  options={[
                    { label: "Small", value: "small" },
                    { label: "Medium", value: "medium" },
                    { label: "Large", value: "large" },
                  ]}
                  value={buttonSize}
                  onChange={setButtonSize}
                />
                <Select
                  label="Button width"
                  options={[
                    { label: "Auto", value: "auto" },
                    { label: "Full width", value: "full" },
                  ]}
                  value={fullWidth ? "full" : "auto"}
                  onChange={(v) => setFullWidth(v === "full")}
                />
              </InlineGrid>
              <Checkbox label="Show ✦ icon" checked={iconEnabled} onChange={setIconEnabled} />
            </BlockStack>
          </Card>

        </BlockStack>

        <BlockStack gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Button preview
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Hover it to preview the animation.
              </Text>
              <Box background="bg-surface-secondary" padding="500" borderRadius="300">
                <div style={{ display: "flex", justifyContent: "center" }}>{previewButton}</div>
              </Box>
            </BlockStack>
          </Card>
        </BlockStack>
      </InlineGrid>
    </Page>
  );
}
