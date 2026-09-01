import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../lib/shop.server";

/**
 * GDPR: shop/redact — sent 48h after uninstall.
 * Deletes every remaining record and stored asset for the shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await deleteShopData(shop);
  return new Response();
};
