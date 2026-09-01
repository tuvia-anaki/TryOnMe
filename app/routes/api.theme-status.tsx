import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getThemeStatus } from "../lib/theme.server";

/**
 * Authenticated JSON endpoint the onboarding page polls to auto-detect
 * whether the app embed / product block have been enabled in the theme.
 *
 * Use Remix's `json()` helper, not `Response.json()`: @remix-run/node installs
 * a Response polyfill without that static method, so it throws at runtime.
 *
 * This is polled every few seconds, so it must never throw — a failure here
 * surfaces as an error boundary over the whole onboarding page. Any problem
 * degrades to "not detected yet" instead.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = { "Cache-Control": "no-store" };

  try {
    const { admin } = await authenticate.admin(request);
    const status = await getThemeStatus(admin);
    return json(status, { headers });
  } catch (error) {
    // Redirects (re-auth) are thrown as Responses — let those through.
    if (error instanceof Response) throw error;
    console.error("Theme status check failed:", (error as Error)?.message);
    return json(
      { embedEnabled: false, blockInstalled: false, themeId: null },
      { headers },
    );
  }
};
