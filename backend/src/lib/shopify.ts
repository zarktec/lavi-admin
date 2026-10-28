import { env, envOpt } from "./env";
import { ApiError } from "./errors";

export interface ShopifyCustomer {
  id: string; // gid://shopify/Customer/123
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export interface DiscountRequest {
  code: string;
  title: string;
  customerGid: string;
  endsAt: Date;
  rewardType: "fixed_amount" | "percentage" | "free_product" | "free_shipping";
  rewardValue: number | null;
  productGid: string | null;
  combinesWith: { productDiscounts: boolean; orderDiscounts: boolean; shippingDiscounts: boolean };
}

/** Superficie de Shopify que usa el backend. En pruebas se sustituye con `setShopify`. */
export interface ShopifyClient {
  /** Identidad de la clienta a partir del token de la Customer Account API. */
  getCustomer(accessToken: string): Promise<ShopifyCustomer>;
  /** Crea un código de descuento de un solo uso restringido a la clienta. Devuelve el id del descuento. */
  createDiscount(req: DiscountRequest): Promise<{ id: string }>;
  deleteDiscount(id: string): Promise<void>;
}

const adminUrl = () => `https://${env("SHOPIFY_SHOP_DOMAIN")}/admin/api/${envOpt("SHOPIFY_API_VERSION", "2025-07")}/graphql.json`;

async function adminGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(adminUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": env("SHOPIFY_ADMIN_TOKEN") },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new ApiError(502, "shopify_unavailable", `Shopify respondió ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) throw new ApiError(502, "shopify_unavailable", `Shopify devolvió errores: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export const toGid = (type: "Product" | "Customer" | "ProductVariant", id: string) =>
  id.startsWith("gid://") ? id : `gid://shopify/${type}/${id}`;


function buildDiscountInput(r: DiscountRequest) {
  const base = {
    title: r.title,
    code: r.code,
    startsAt: new Date().toISOString(),
    endsAt: r.endsAt.toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection: { customers: { add: [r.customerGid] } },
    combinesWith: r.combinesWith,
  };
  if (r.rewardType === "free_shipping") {
    return { kind: "shipping" as const, input: { ...base, destination: { all: true } } };
  }
  const items = r.productGid ? { products: { productsToAdd: [r.productGid] } } : { all: true };
  let value: unknown;
  if (r.rewardType === "fixed_amount") value = { discountAmount: { amount: String(r.rewardValue), appliesOnEachItem: false } };
  else if (r.rewardType === "percentage") value = { percentage: (r.rewardValue ?? 0) / 100 };
  else value = { percentage: 1 }; // free_product: 100% sobre ese producto
  return { kind: "basic" as const, input: { ...base, customerGets: { value, items } } };
}

const realClient: ShopifyClient = {
  async getCustomer(accessToken) {
    const url = `https://shopify.com/${env("SHOPIFY_SHOP_ID")}/account/customer/api/${envOpt("SHOPIFY_API_VERSION", "2025-07")}/graphql`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: accessToken },
      body: JSON.stringify({
        query: "{ customer { id firstName lastName emailAddress { emailAddress } phoneNumber { phoneNumber } } }",
      }),
    });
    if (res.status === 401 || res.status === 403) throw new ApiError(401, "invalid_shopify_token", "Token de Shopify inválido");
    if (!res.ok) throw new ApiError(502, "shopify_unavailable", `Shopify respondió ${res.status}`);
    const json = (await res.json()) as any;
    const c = json?.data?.customer;
    if (!c?.id) throw new ApiError(401, "invalid_shopify_token", "Token de Shopify inválido");
    return {
      id: c.id,
      email: c.emailAddress?.emailAddress ?? null,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      phone: c.phoneNumber?.phoneNumber ?? null,
    };
  },

  async createDiscount(req) {
    const { kind, input } = buildDiscountInput(req);
    const mutation =
      kind === "shipping"
        ? `mutation($d: DiscountCodeFreeShippingInput!) { discountCodeFreeShippingCreate(freeShippingCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message code } } }`
        : `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message code } } }`;
    const data = await adminGraphql<any>(mutation, { d: input });
    const payload = kind === "shipping" ? data.discountCodeFreeShippingCreate : data.discountCodeBasicCreate;
    const errors = payload?.userErrors ?? [];
    if (errors.some((e: any) => e.code === "TAKEN")) {
      // Reintento de un canje a medias: el código ya existe, recuperamos su id.
      const found = await adminGraphql<any>(
        `query($code: String!) { codeDiscountNodeByCode(code: $code) { id } }`,
        { code: req.code },
      );
      if (found.codeDiscountNodeByCode?.id) return { id: found.codeDiscountNodeByCode.id };
    }
    if (errors.length || !payload?.codeDiscountNode?.id) {
      throw new ApiError(502, "shopify_discount_failed", `No se pudo crear el descuento: ${JSON.stringify(errors)}`);
    }
    return { id: payload.codeDiscountNode.id };
  },

  async deleteDiscount(id) {
    await adminGraphql(`mutation($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { message } } }`, { id });
  },
};

let client: ShopifyClient = realClient;
export const shopify = new Proxy({} as ShopifyClient, {
  get: (_t, prop: keyof ShopifyClient) => client[prop],
});
export const setShopify = (c: ShopifyClient | null) => {
  client = c ?? realClient;
};
