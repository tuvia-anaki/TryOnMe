import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getThemeStatus } from "../lib/theme.server";

/**
 * Authenticated JSON endpoint the onboarding page polls to auto-detect
 * whether the app embed / product block have been enabled in the theme.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const status = await getThemeStatus(admin);
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
};
