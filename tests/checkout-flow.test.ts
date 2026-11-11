import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { Env } from "../server/types";
import { TERMS_VERSION } from "../shared/commerce";
const fixture = vi.hoisted(() => ({
  cache: new Map<string, any>(),
  orders: [] as any[],
  filters: [] as any[],
  contacts: [] as any[],
  stock: 3,
  tax: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
  rpc: vi.fn(),
}));
const product = "00000000-0000-4000-8000-000000000001",
  variant = "00000000-0000-4000-8000-000000000002";
vi.mock("../server/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/security")>();
  return {
    ...actual,
    rateLimit: async () => true,
    redis: () => ({
      get: async (k: string) => fixture.cache.get(k),
      set: async (k: string, v: any, options: any) => {
        if (options?.nx && fixture.cache.has(k)) return null;
        fixture.cache.set(k, v);
        return "OK";
      },
      del: async (k: string) => fixture.cache.delete(k),
    }),
    db: () => ({
      rpc: fixture.rpc,
      from: (table: string) => {
        const filters: Record<string, any> = {};
        let update: any;
        const chain: any = {
          select: () => chain,
          eq: (k: string, v: any) => {
            filters[k] = v;
            return chain;
          },
          update: (v: any) => {
            update = v;
            return chain;
          },
          maybeSingle: async () => ({
            data: fixture.orders.find(
              (o) => o.idempotency_key === filters.idempotency_key,
            ),
            error: null,
          }),
          single: async () => {
            fixture.filters.push({ ...filters });
            return table === "variants" &&
              filters.id === variant &&
              filters.product_id === product
              ? {
                  data: {
                    id: variant,
                    size: "42",
                    color: "Lime",
                    price: 12500,
                    stock: fixture.stock,
                    tax_code: "txcd_99999999",
                    products: { name: "Fixture shoe", active: true },
                  },
                  error: null,
                }
              : { data: null, error: { message: "not found" } };
          },
          insert: async (v: any) => {
            const duplicate = fixture.contacts.some((x) => x.id === v.id);
            if (!duplicate) fixture.contacts.push(v);
            return { error: duplicate ? { code: "23505" } : null };
          },
          then: (resolve: any) => {
            if (update) {
              const order = fixture.orders.find((o) => o.id === filters.id);
              if (order) Object.assign(order, update);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
        return chain;
      },
    }),
  };
});
vi.mock("stripe", () => ({
  default: class Stripe {
    static createFetchHttpClient() {
      return {};
    }
    paymentIntents = { create: fixture.create, retrieve: fixture.retrieve };
    tax = { calculations: { create: fixture.tax } };
  },
}));
import worker from "../server/index";
const env = {
  APP_ORIGIN: "https://flayr.example",
  COMMERCE_ENABLED: "true",
  PUBLIC_BUSINESS_DETAILS_APPROVED: "true",
  LEGAL_APPROVED_VERSION: TERMS_VERSION,
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  SUPABASE_URL: "https://db.example.test",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "fixture",
  PII_KEY_V1: btoa("x".repeat(32)),
  RESEND_API_KEY: "fixture",
  EMAIL_FROM: "FLAYR <mail@example.test>",
  CONTACT_TO: "private@example.test",
  LEGAL_ENTITY_NAME: "Business",
  LEGAL_ENTITY_VAT: "Business tax",
  LEGAL_ENTITY_ADDRESS: "Business address",
  LEGAL_ENTITY_EMAIL: "support@example.test",
  LEGAL_ENTITY_PHONE: "Business phone",
  LEGAL_ENTITY_PHONE_COST: "Standard rate",
  LEGAL_ENTITY_ADR: "ADR",
} as Env;
const payload = () => ({
  idempotencyKey: crypto.randomUUID(),
  items: [{ productId: product, variantId: variant, size: "42", quantity: 1 }],
  email: "customer@example.test",
  address: {
    name: "Test Customer",
    line1: "Example address 1",
    city: "Lisboa",
    postal_code: "1000-001",
    country: "PT",
  },
  termsAccepted: true,
  termsVersion: TERMS_VERSION,
});
const post = (path: string, body: any, cookie = "", bindings = env) =>
  worker.fetch(
    new Request("https://flayr.example/api" + path, {
      method: "POST",
      headers: {
        Origin: env.APP_ORIGIN,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    }),
    bindings,
    {} as ExecutionContext,
  );
beforeEach(() => {
  fixture.cache.clear();
  fixture.orders = [];
  fixture.filters = [];
  fixture.contacts = [];
  fixture.stock = 3;
  vi.clearAllMocks();
  fixture.tax.mockResolvedValue({
    id: "taxcalc_fixture",
    amount_total: 12500,
    tax_amount_inclusive: 2337,
    tax_amount_exclusive: 0,
  });
  fixture.create.mockResolvedValue({
    id: "pi_fixture",
    client_secret: "pi_fixture_secret_fixture",
  });
  fixture.retrieve.mockResolvedValue({
    id: "pi_fixture",
    client_secret: "pi_fixture_secret_fixture",
  });
  fixture.rpc.mockImplementation(async (name: string, { p_order }: any) => {
    if (name === "reserve_order") {
      const order = { ...p_order, status: "pending" };
      fixture.orders.push(order);
      return { data: order, error: null };
    }
    return { data: null, error: null };
  });
});
afterEach(() => vi.unstubAllGlobals());
it("creates a server-priced payment and reuses the same reservation on a retry", async () => {
  const body = payload();
  const first = await post("/checkout", { ...body, total: 1 });
  expect(first.status).toBe(200);
  const json: any = await first.json();
  expect(json.total).toBe(12500);
  expect(json.shipping).toBe(0);
  const cookie = first.headers.get("set-cookie")!.split(";")[0];
  expect(first.headers.get("set-cookie")).toContain("HttpOnly");
  expect(first.headers.get("set-cookie")).toContain("SameSite=Strict");
  const second = await post("/checkout", body, cookie);
  expect(second.status).toBe(200);
  expect(fixture.orders).toHaveLength(1);
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.retrieve).toHaveBeenCalledTimes(1);
  expect(fixture.filters[0].id).toBe(variant);
  expect(fixture.orders[0].items[0].unit_price).toBe(12500);
  expect(JSON.stringify(fixture.orders[0])).not.toContain(
    "customer@example.test",
  );
  expect(fixture.create.mock.calls[0][0].automatic_payment_methods).toEqual({
    enabled: true,
  });
});
it("rejects changed checkout details under the same key and another browser claiming it", async () => {
  const body = payload(),
    first = await post("/checkout", body),
    cookie = first.headers.get("set-cookie")!.split(";")[0];
  expect(
    (await post("/checkout", { ...body, email: "other@example.test" }, cookie))
      .status,
  ).toBe(409);
  expect((await post("/checkout", body)).status).toBe(409);
});
it("rejects ambiguous, unavailable and duplicate variants before calling Stripe", async () => {
  const body = payload();
  const { variantId, ...oldItem } = body.items[0];
  expect((await post("/checkout", { ...body, items: [oldItem] })).status).toBe(
    400,
  );
  expect(
    (
      await post("/checkout", {
        ...payload(),
        items: [body.items[0], body.items[0]],
      })
    ).status,
  ).toBe(400);
  fixture.stock = 0;
  expect((await post("/checkout", payload())).status).toBe(409);
  expect(fixture.tax).not.toHaveBeenCalled();
  expect(fixture.create).not.toHaveBeenCalled();
});
it("refuses order status for an unrelated shopper", async () => {
  fixture.cache.set("order-owner:pi_fixture", "owner");
  const response = await worker.fetch(
    new Request(
      "https://flayr.example/api/orders/status?payment_intent=pi_fixture",
      { headers: { Cookie: "__Host-flayr-shopper=someone-else" } },
    ),
    env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(404);
});
it("queues one encrypted contact message for repeated submissions", async () => {
  const body = {
    id: crypto.randomUUID(),
    name: "Test Customer",
    email: "customer@example.test",
    subject: "order",
    message: "Please help with this order.",
    consent: true,
    locale: "en",
  };
  expect((await post("/contact", body)).status).toBe(202);
  expect((await post("/contact", body)).status).toBe(202);
  expect(fixture.contacts).toHaveLength(1);
  expect(JSON.stringify(fixture.contacts)).not.toContain(body.email);
  expect(
    (
      await post("/contact", {
        ...body,
        id: crypto.randomUUID(),
        website: "spam",
      })
    ).status,
  ).toBe(202);
  expect(fixture.contacts).toHaveLength(1);
});
it("streams the AI answer without forwarding private seller data or unverified order details", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        'data: {"type":"response.output_text.delta","delta":"Hello FLAYR"}\n\ndata: {"type":"response.completed"}\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const response = await post(
    "/assistant",
    {
      locale: "en",
      messages: [
        { role: "user", content: "Contact person@example.test about my order" },
      ],
      paymentIntent: "pi_unverified",
    },
    "",
    {
      ...env,
      COMMERCE_ENABLED: "false",
      OPENAI_API_KEY: "private-ai",
      OPENAI_MODEL: "configured-model",
    },
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("Hello FLAYR");
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.store).toBe(false);
  expect(body.input[0].content).not.toContain("person@example.test");
  expect(body.instructions).toContain('"verifiedOrder":null');
  expect(body.instructions).not.toContain("Business address");
  expect(body.instructions).not.toContain("private-ai");
});
