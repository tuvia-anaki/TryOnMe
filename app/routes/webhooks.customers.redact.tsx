import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR: customers/redact.
 * Try-on visitors are anonymous browser tokens, never linked to Shopify
 * customer records, so there is nothing customer-scoped to redact.
 * (Shop-wide data is removed via app/uninstalled and shop/redact.)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
