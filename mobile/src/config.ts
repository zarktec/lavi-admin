export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  appDomain: process.env.EXPO_PUBLIC_APP_DOMAIN ?? "app.tumarca.com",
  shopId: process.env.EXPO_PUBLIC_SHOPIFY_SHOP_ID ?? "",
  clientId: process.env.EXPO_PUBLIC_SHOPIFY_CLIENT_ID ?? "",
  storeDomain: process.env.EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN ?? "",
  storefrontToken: process.env.EXPO_PUBLIC_STOREFRONT_TOKEN ?? "",
  storefrontVersion: "2025-07",
  authScheme: "tumarca",
};
