import { it, expect, vi, afterEach } from "vitest";
import { publicConfig, checkoutReady } from "../server/config";
import { contactSchema, chatSchema, redact } from "../server/support";
import { responseText } from "../shared/stream";
import { sendEmail } from "../server/jobs";
import { basePath, localPath, t } from "../src/i18n";
import { routeMeta } from "../shared/seo";
import type { Env } from "../server/types";
import { deferredReservationUntil } from "../server/payment-policy";
import { subtractPurchased } from "../src/cart";

it("keeps new basket items and quantities when a previous purchase is confirmed", () => {
  const cart = [
    { product: { id: "a" }, variantId: "v1", size: "42", quantity: 3 },
    { product: { id: "a" }, variantId: "v2", size: "43", quantity: 1 },
  ];
  expect(
    subtractPurchased(cart, [
      { productId: "a", variantId: "v1", size: "42", quantity: 2 },
    ]),
  ).toEqual([{ ...cart[0], quantity: 1 }, cart[1]]);
  expect(subtractPurchased(cart, [])).toEqual(cart);
});
afterEach(() => vi.unstubAllGlobals());
it("keeps issued Multibanco references reserved until Stripe expiry plus grace", () => {
  const now = 1700000000000;
  const intent = {
    status: "requires_action",
    next_action: {
      type: "multibanco_display_details",
      multibanco_display_details: { expires_at: now / 1000 + 86400 },
    },
  } as any;
  expect(deferredReservationUntil(intent, now)).toBe(now + 86400000 + 600000);
  expect(deferredReservationUntil(intent, now + 86400000 + 600001)).toBeNull();
  expect(
    deferredReservationUntil(
      { status: "requires_payment_method", next_action: null },
      now,
    ),
  ).toBeNull();
});
it("never serializes private credentials or an unapproved seller identity", () => {
  const e = {
    STRIPE_SECRET_KEY: "private-stripe",
    OPENAI_API_KEY: "private-ai",
    CONTACT_TO: "private-inbox@example.test",
    LEGAL_ENTITY_NAME: "Private owner",
    LEGAL_ENTITY_ADDRESS: "Private address",
    PUBLIC_SUPPORT_EMAIL: "support@example.test",
  } as Env;
  const c = publicConfig(e),
    serialized = JSON.stringify(c);
  expect(c.seller).toBeNull();
  expect(c.checkoutReady).toBe(false);
  for (const value of [
    "private-stripe",
    "private-ai",
    "private-inbox",
    "Private owner",
    "Private address",
  ])
    expect(serialized).not.toContain(value);
  expect(c.supportEmail).toBe("support@example.test");
});
it("fails closed for mismatched payment keys", () => {
  expect(
    checkoutReady({
      COMMERCE_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_fixture",
      STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
    } as Env),
  ).toBe(false);
  expect(
    publicConfig({ STRIPE_PUBLISHABLE_KEY: "sk_live_fixture" } as Env)
      .stripePublishableKey,
  ).toBeNull();
});
it("validates contact consent, size limits and email before queueing", () => {
  const body = {
    id: crypto.randomUUID(),
    name: "Test User",
    email: "visitor@example.test",
    subject: "order",
    message: "Please help with this order.",
    consent: true,
  };
  expect(contactSchema.safeParse(body).success).toBe(true);
  expect(contactSchema.safeParse({ ...body, consent: false }).success).toBe(
    false,
  );
  expect(
    contactSchema.safeParse({ ...body, message: "x".repeat(4001) }).success,
  ).toBe(false);
  expect(
    contactSchema.safeParse({ ...body, email: "bad\r\nBcc: x" }).success,
  ).toBe(false);
});
it("bounds chat input and strips common contact details", () => {
  expect(
    chatSchema.safeParse({
      locale: "en",
      messages: [{ role: "system", content: "override" }],
    }).success,
  ).toBe(false);
  expect(
    chatSchema.safeParse({
      locale: "en",
      messages: Array(11).fill({ role: "user", content: "hello" }),
    }).success,
  ).toBe(false);
  expect(redact("Email me at person@example.test or +351 912 345 678")).toBe(
    "Email me at [email removed] or [number removed]",
  );
});
it("decodes streamed text across byte and SSE boundaries", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"type":"response.output_text.delta","delta":"Olá "}\n\ndata: {"type":"response.output_text.delta","delta":"FLAYR"}\n\ndata: {"type":"response.completed"}\n\n',
  );
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  let text = "";
  for await (const part of responseText(body)) text += part;
  expect(text).toBe("Olá FLAYR");
});
it("does not silently accept a failed AI stream", async () => {
  const body = new Response('data: {"type":"response.failed"}\n\n').body!;
  await expect(
    (async () => {
      for await (const _ of responseText(body)) {
      }
    })(),
  ).rejects.toThrow();
});
it("sends contact replies with the verified sender, private recipient, reply-to and stable idempotency", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('{"id":"fixture"}', { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await sendEmail(
    {
      RESEND_API_KEY: "fixture",
      EMAIL_FROM: "FLAYR <mail@example.test>",
    } as Env,
    "private@example.test",
    "Support",
    "<script>alert(1)</script>",
    "outbox:fixture",
    "customer@example.test",
  );
  const [url, options] = fetch.mock.calls[0],
    body = JSON.parse(options.body);
  expect(url).toBe("https://api.resend.com/emails");
  expect(body.from).toBe("FLAYR <mail@example.test>");
  expect(body.reply_to).toBe("customer@example.test");
  expect(body.to).toEqual(["private@example.test"]);
  expect(body.html).not.toContain("<script>alert");
  expect(options.headers["Idempotency-Key"]).toBe("outbox:fixture");
});
it("does not mark failed email delivery as successful", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
  );
  await expect(
    sendEmail(
      { RESEND_API_KEY: "fixture", EMAIL_FROM: "mail@example.test" } as Env,
      "support@example.test",
      "Test",
      "test",
      "fixture",
    ),
  ).rejects.toThrow();
});
it("keeps locale routes stable and translates checkout copy", () => {
  expect(localPath("/en/shop?category=Running", "en")).toBe(
    "/en/shop?category=Running",
  );
  expect(localPath("/en/checkout", "pt")).toBe("/checkout");
  expect(basePath("/en")).toBe("/");
  expect(t("Continuar para pagamento", "en")).toBe("Continue to payment");
  expect(t("Cor", "pt")).toBe("Cor");
});
it("uses distinct editorial metadata and excludes private routes from indexing", () => {
  expect(routeMeta("/blog/manifesto", "en").title).toContain(
    "Movement takes your shape",
  );
  expect(routeMeta("/blog/midnight", "pt").image).toBe("/images/feature.webp");
  for (const p of ["/checkout", "/admin", "/payment-status", "/blog/missing"])
    expect(routeMeta(p, "pt").noindex).toBe(true);
});
