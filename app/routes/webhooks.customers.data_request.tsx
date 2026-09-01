import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR: customers/data_request.
 * We never link try-on data to Shopify customer accounts — visitors are
 * anonymous browser tokens — so there is no customer-identifiable data to
 * return. Acknowledge the webhook.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
