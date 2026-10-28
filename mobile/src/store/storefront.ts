import { config } from "../config";

export interface Product {
  id: string;
  title: string;
  description: string;
  image: string | null;
  variants: { id: string; title: string; price: string; currency: string; available: boolean }[];
}

export interface CartLine {
  variantId: string;
  quantity: number;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!config.storeDomain || !config.storefrontToken) throw new Error("Falta configurar EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN y EXPO_PUBLIC_STOREFRONT_TOKEN");
  const res = await fetch(`https://${config.storeDomain}/api/${config.storefrontVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": config.storefrontToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`La tienda respondió ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "Error de la tienda");
  return json.data as T;
}

export async function listProducts(): Promise<Product[]> {
  const data = await gql<any>(`{ products(first: 30) { nodes { id title description featuredImage { url }
    variants(first: 10) { nodes { id title availableForSale price { amount currencyCode } } } } } }`);
  return data.products.nodes.map((p: any) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    image: p.featuredImage?.url ?? null,
    variants: p.variants.nodes.map((v: any) => ({ id: v.id, title: v.title, price: v.price.amount, currency: v.price.currencyCode, available: v.availableForSale })),
  }));
}

/** Crea el carrito con los datos de la clienta y el código de canje ya aplicado; devuelve la URL de pago. */
export async function createCheckout(lines: CartLine[], buyer: { email?: string | null; phone?: string | null }, discountCode?: string | null) {
  const data = await gql<any>(
    `mutation($input: CartInput!) { cartCreate(input: $input) { cart { id checkoutUrl discountCodes { code applicable } }
      userErrors { field message } } }`,
    {
      input: {
        lines: lines.map((l) => ({ merchandiseId: l.variantId, quantity: l.quantity })),
        buyerIdentity: { ...(buyer.email ? { email: buyer.email } : {}), ...(buyer.phone ? { phoneNumber: buyer.phone } : {}) },
        discountCodes: discountCode ? [discountCode] : [],
      },
    },
  );
  const out = data.cartCreate;
  if (out.userErrors?.length) throw new Error(out.userErrors[0].message);
  const applied = discountCode ? (out.cart.discountCodes as { code: string; applicable: boolean }[]).some((c) => c.applicable) : null;
  return { checkoutUrl: out.cart.checkoutUrl as string, discountApplied: applied };
}

export const formatPrice = (amount: string, currency: string) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
