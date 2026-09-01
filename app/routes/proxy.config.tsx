import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { isProductAvailable } from "../lib/shop.server";
import { LIMITS } from "../lib/rate-limit.server";
import { isModelSelectable } from "../lib/ai/registry";
import { maybeRunRetentionSweep } from "../lib/retention.server";

/**
 * GET /apps/tryon/config?product_id=123
 * Public widget configuration: whether try-on is enabled for this product
 * and how the button/modal should look. Never includes secrets.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    maybeRunRetentionSweep();
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.readPerIp,
      scope: "config",
    });

    const settings = shop.settings;
    const widget = shop.widgetSettings;
    const configured = Boolean(
      settings?.provider &&
        settings.model &&
        shop.credentials.some((c) => c.provider === settings.provider) &&
        isModelSelectable(settings.provider as any, settings.model),
    );

    const productId = new URL(request.url).searchParams.get("product_id") ?? "";
    const productEnabled =
      !settings || !productId
        ? true
        : isProductAvailable(settings, productId);

    if (!configured || !productEnabled) {
      return jsonResponse({ enabled: false });
    }

    return jsonResponse(
      {
        enabled: true,
        button: {
          text: widget?.buttonText ?? "Try It On",
          style: widget?.buttonStyle ?? "solid",
          backgroundColor: widget?.backgroundColor ?? "#111111",
          textColor: widget?.textColor ?? "#ffffff",
          borderRadius: widget?.borderRadius ?? 10,
          fullWidth: widget?.fullWidth ?? false,
          iconEnabled: widget?.iconEnabled ?? true,
          hoverAnimation: widget?.hoverAnimation ?? "none",
          size: widget?.buttonSize ?? "medium",
        },
        modal: {
          title: widget?.modalTitle ?? "Try It On",
          subtitle: widget?.modalSubtitle ?? "See how it looks on you",
          backgroundColor: widget?.modalBackgroundColor ?? "#ffffff",
          textColor: widget?.modalTextColor ?? "#111111",
          accentColor: widget?.modalAccentColor ?? "#111111",
          borderRadius: widget?.modalBorderRadius ?? 18,
        },
      },
      200,
    );
  } catch (error) {
    return handleProxyError(error);
  }
};
