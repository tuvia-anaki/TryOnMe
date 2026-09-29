import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/BulkAction.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.product-index.selection-action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
