import { Hono } from "hono";
import { z, ZodError } from "zod";
import Stripe from "stripe";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import {
  db,
  admin,
  redis,
  rateLimit,
  seal,
  unseal,
  csp,
  sameOrigin,
} from "./security";
import { authRoutes } from "./auth-routes";
import type { Env } from "./types";
import { sendEmail, runJobs } from "./jobs";
import { TERMS_VERSION, EU_COUNTRIES } from "../shared/commerce";
import { publicConfig, checkoutReady } from "./config";
import { serveSite } from "./seo";
import { supportRoutes } from "./support";
const app = new Hono<{ Bindings: Env }>();
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", csp);
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (c.req.path.startsWith("/api"))
    c.header("Cache-Control", "private, no-store");
});
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 8 * 1024 * 1024,
    onError: (c) => c.json({ error: "Ficheiro demasiado grande." }, 413),
  }),
);
app.use("/api/*", async (c, next) => {
  if (
    ["POST", "PATCH", "DELETE", "PUT"].includes(c.req.method) &&
    c.req.path !== "/api/stripe/webhook"
  ) {
    if (!sameOrigin(c.req.header("Origin"), c.env.APP_ORIGIN))
      return c.json({ error: "Origem não autorizada." }, 403);
    if (
      !(await rateLimit(
        c,
        c.req.path,
        c.req.path === "/api/assistant"
          ? 6
          : c.req.path.startsWith("/api/auth")
            ? 10
            : 30,
      ))
    )
      return c.json(
        { error: "Demasiados pedidos. Tenta novamente mais tarde." },
        429,
      );
  }
  await next();
});
app.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json({ error: "Dados inválidos. Verifica os campos." }, 400);
  const message = error.message;
  const access = /Autentica|Sessão|TOTP|autorizado/.test(message);
  console.error(
    JSON.stringify({
      event: "request.failed",
      path: c.req.path,
      type: error.name,
    }),
  );
  return c.json(
    {
      error: access
        ? message
        : "Não foi possível concluir o pedido. Tenta novamente mais tarde.",
    },
    access ? 401 : 503,
  );
});
app.get("/api/health", (c) =>
  c.json({ ok: true, commerce: c.env.COMMERCE_ENABLED === "true" }),
);
app.get("/api/config", (c) => c.json(publicConfig(c.env)));
app.route("/api", supportRoutes);
app.get("/api/catalog", async (c) => {
  if (!c.env.SUPABASE_URL || c.env.COMMERCE_ENABLED !== "true")
    return c.json({ products: [], demo: true });
  const { data, error } = await db(c.env)
    .from("products")
    .select("*,variants(*)")
    .eq("active", true);
  if (error) throw error;
  const { data: promotions, error: promoError } = await db(c.env)
    .from("promotions")
    .select("*")
    .lte("starts_at", new Date().toISOString())
    .gt("ends_at", new Date().toISOString());
  if (promoError) throw promoError;
  return c.json({
    products: data
      .map((p) => {
        const variants = [...p.variants].sort(
          (a, b) => a.price - b.price || a.id.localeCompare(b.id),
        );
        const variant = variants[0];
        const promo = promotions?.find(
          (x) =>
            x.variant_id === variant?.id && x.sale_price === variant?.price,
        );
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          description: p.description,
          tag: p.tag,
          translations: p.translations || {},
          variants: variants.map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color,
            price: v.price,
            stock: v.stock,
            priorPrice: promotions?.find(
              (x) => x.variant_id === v.id && x.sale_price === v.price,
            )?.prior_price,
          })),
          image: p.image_url || p.image,
          modelUrl: p.model_url,
          price: variant?.price,
          priorPrice: promo?.prior_price,
        };
      })
      .filter((p) => p.price),
  });
});
app.route("/api/auth", authRoutes);
app.get("/api/campaign", async (c) => {
  if (!c.env.SUPABASE_URL || c.env.COMMERCE_ENABLED !== "true")
    return c.json({ offer: null });
  const { data, error } = await db(c.env)
    .from("promotions")
    .select("*,variants!inner(price,products!inner(slug,name,active))")
    .lte("starts_at", new Date().toISOString())
    .gt("ends_at", new Date().toISOString())
    .eq("variants.products.active", true)
    .order("ends_at")
    .limit(1);
  if (error) throw error;
  const p = data[0];
  return c.json({
    offer:
      p && p.variants.price === p.sale_price && p.sale_price < p.prior_price
        ? {
            id: p.id,
            slug: p.variants.products.slug,
            name: p.variants.products.name,
            price: p.sale_price,
            priorPrice: p.prior_price,
            endsAt: p.ends_at,
          }
        : null,
  });
});
app.post("/api/views", async (c) => {
  const body = z
    .object({ productId: z.string().uuid(), viewer: z.string().uuid() })
    .parse(await c.req.json());
  const r = redis(c.env),
    key = "views:" + body.productId,
    now = Date.now();
  await r.zadd(key, { score: now, member: body.viewer });
  await r.zremrangebyscore(key, 0, now - 90000);
  await r.expire(key, 120);
  return c.json({ count: await r.zcard(key) });
});
app.get("/api/social-proof", async (c) => {
  if (!c.env.SUPABASE_URL || c.env.COMMERCE_ENABLED !== "true")
    return c.json({ proof: null });
  const { data, error } = await db(c.env)
    .from("orders")
    .select("country")
    .in("status", ["paid", "shipped"])
    .gte("created_at", new Date(Date.now() - 3600000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const countries = new Map<string, number>();
  for (const order of data)
    countries.set(order.country, (countries.get(order.country) || 0) + 1);
  const country = [...countries].find(([, count]) => count >= 3)?.[0];
  return c.json({
    proof: country
      ? {
          country: new Intl.DisplayNames(["pt"], { type: "region" }).of(
            country,
          ),
        }
      : null,
  });
});
const checkoutSchema = z.object({
  locale: z.enum(["pt", "en"]).default("pt"),
  idempotencyKey: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid(),
        size: z.string().min(1).max(8),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
  email: z.string().email().max(200),
  address: z.object({
    name: z.string().min(2).max(150),
    line1: z.string().min(4).max(200),
    city: z.string().min(2).max(100),
    postal_code: z.string().min(3).max(20),
    country: z.enum(EU_COUNTRIES),
  }),
  vatId: z.string().max(30).optional(),
  termsAccepted: z.literal(true),
  termsVersion: z.literal(TERMS_VERSION),
});
function stripe(e: Env) {
  return new Stripe(e.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
app.post("/api/checkout", async (c) => {
  const e = c.env;
  if (!checkoutReady(e))
    return c.json(
      { error: "A loja ainda não está disponível para encomendas." },
      503,
    );
  const body = checkoutSchema.parse(await c.req.json());
  const unique = new Set(body.items.map((i) => i.variantId));
  if (unique.size !== body.items.length)
    return c.json({ error: "Artigos duplicados." }, 400);
  let shopper = getCookie(c, "__Host-flayr-shopper");
  if (!shopper) {
    shopper = crypto.randomUUID();
    setCookie(c, "__Host-flayr-shopper", shopper, {
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 86400 * 7,
    });
  }
  const r = redis(e),
    client = db(e),
    payments = stripe(e);
  const scope = "checkout:" + body.idempotencyKey;
  const fingerprint = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const hash = Array.from(new Uint8Array(fingerprint), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const prior = await r.get<{ shopper: string; hash: string }>(scope);
  if (prior && (prior.shopper !== shopper || prior.hash !== hash))
    return c.json(
      { error: "A encomenda mudou. Inicia um novo checkout." },
      409,
    );
  if (!prior) {
    const reserved = await r.set(
      scope,
      { shopper, hash },
      { nx: true, ex: 86400 },
    );
    if (!reserved)
      return c.json({ error: "Pedido em curso. Tenta novamente." }, 409);
  }
  const { data: existing, error: existingError } = await client
    .from("orders")
    .select("*")
    .eq("idempotency_key", body.idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  let order = existing;
  if (!order) {
    const lines = [];
    for (const item of body.items) {
      const { data: v, error } = await client
        .from("variants")
        .select("*,products!inner(name,active)")
        .eq("product_id", item.productId)
        .eq("size", item.size)
        .eq("id", item.variantId)
        .eq("products.active", true)
        .single();
      if (error || !v || v.stock < item.quantity)
        return c.json(
          { error: "Um artigo já não está disponível. Atualiza o saco." },
          409,
        );
      lines.push({
        variant_id: v.id,
        name: v.products.name,
        size: v.size,
        quantity: item.quantity,
        unit_price: v.price,
        tax_code: v.tax_code,
      });
    }
    const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0),
      shipping = subtotal >= 10000 ? 0 : 590;
    const calculation = await payments.tax.calculations.create({
      currency: "eur",
      customer_details: {
        address: {
          line1: body.address.line1,
          city: body.address.city,
          postal_code: body.address.postal_code,
          country: body.address.country,
        },
        address_source: "shipping",
      },
      line_items: lines.map((l) => ({
        amount: l.unit_price * l.quantity,
        quantity: l.quantity,
        reference: l.variant_id,
        tax_behavior: "inclusive",
        tax_code: l.tax_code,
      })),
      shipping_cost: { amount: shipping, tax_behavior: "inclusive" },
    });
    const id = crypto.randomUUID();
    const encrypted = await seal(
      {
        email: body.email,
        address: body.address,
        vatId: body.vatId,
        locale: body.locale,
      },
      e.PII_KEY_V1,
      "order:" + id,
    );
    const { data, error } = await client.rpc("reserve_order", {
      p_order: {
        id,
        idempotency_key: body.idempotencyKey,
        amount: calculation.amount_total,
        tax:
          calculation.tax_amount_inclusive + calculation.tax_amount_exclusive,
        shipping,
        country: body.address.country,
        customer_encrypted: encrypted,
        items: lines,
        tax_calculation: calculation.id,
        terms_version: TERMS_VERSION,
      },
    });
    if (error)
      return c.json(
        { error: "O preço ou stock mudou. Atualiza o saco e tenta novamente." },
        409,
      );
    order = data;
  }
  if (!["pending", "processing"].includes(order.status))
    return c.json(
      { error: "Esta encomenda já foi concluída ou cancelada." },
      409,
    );
  const intent = order.payment_intent
    ? await payments.paymentIntents.retrieve(order.payment_intent)
    : await payments.paymentIntents.create(
        {
          amount: order.amount,
          currency: "eur",
          automatic_payment_methods: { enabled: true },
          metadata: {
            order_id: order.id,
            tax_calculation: order.tax_calculation,
          },
          description: "FLAYR order " + order.id,
        },
        { idempotencyKey: "flayr:" + order.id },
      );
  const { error: updateError } = await client
    .from("orders")
    .update({ payment_intent: intent.id })
    .eq("id", order.id);
  if (updateError) throw updateError;
  await r.set("order-owner:" + intent.id, shopper, { ex: 86400 * 7 });
  return c.json({
    clientSecret: intent.client_secret,
    total: order.amount,
    tax: order.tax,
    shipping: order.shipping,
  });
});
app.post("/api/stripe/webhook", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);
  const payments = stripe(c.env);
  let event: Stripe.Event;
  try {
    event = await payments.webhooks.constructEventAsync(
      await c.req.text(),
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }
  const status = (
    {
      "payment_intent.succeeded": "paid",
      "payment_intent.processing": "processing",
      "payment_intent.canceled": "cancelled",
      "payment_intent.payment_failed": "failed",
    } as Record<string, string>
  )[event.type];
  if (status) {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (!pi.metadata.order_id) return c.json({ received: true });
    const { error } = await db(c.env).rpc("apply_payment_event", {
      p_event: event.id,
      p_order: pi.metadata.order_id,
      p_intent: pi.id,
      p_status: status,
      p_amount: pi.amount,
      p_currency: pi.currency,
    });
    if (error) throw error;
    if (status === "paid" && pi.metadata.tax_calculation)
      await payments.tax.transactions.createFromCalculation(
        { calculation: pi.metadata.tax_calculation, reference: pi.id },
        { idempotencyKey: "tax:" + pi.id },
      );
  }
  return c.json({ received: true });
});
app.get("/api/orders/status", async (c) => {
  const id = z
    .string()
    .regex(/^pi_[a-zA-Z0-9]+$/)
    .parse(c.req.query("payment_intent"));
  const shopper = getCookie(c, "__Host-flayr-shopper");
  if (!shopper || (await redis(c.env).get("order-owner:" + id)) !== shopper)
    return c.json({ error: "Encomenda não encontrada." }, 404);
  const { data, error } = await db(c.env)
    .from("orders")
    .select("status")
    .eq("payment_intent", id)
    .single();
  if (error) throw error;
  return c.json(data);
});
app.post("/api/vat/validate", async (c) => {
  const { vat } = z
    .object({ vat: z.string().regex(/^[A-Z]{2}[A-Z0-9]{2,14}$/) })
    .parse(await c.req.json());
  const response = await fetch(
    "https://ec.europa.eu/taxation_customs/vies/services/checkVatService",
    {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><checkVat xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><countryCode>${vat.slice(0, 2)}</countryCode><vatNumber>${vat.slice(2)}</vatNumber></checkVat></soap:Body></soap:Envelope>`,
      signal: AbortSignal.timeout(8000),
    },
  );
  const xml = await response.text();
  if (!response.ok || !/<(?:\w+:)?valid>/.test(xml))
    return c.json({ valid: null, status: "unavailable" }, 503);
  return c.json({
    valid: /<(?:\w+:)?valid>true<\//.test(xml),
    checkedAt: new Date().toISOString(),
    automaticExemption: false,
  });
});
app.get("/api/admin", async (c) => {
  await admin(c, ["owner", "manager", "support"]);
  const client = db(c.env);
  const [orders, products] = await Promise.all([
    client
      .from("orders")
      .select("id,status,amount,tax,shipping,country,tracking,created_at,items")
      .order("created_at", { ascending: false })
      .limit(200),
    client.from("products").select("*,variants(*)").order("name"),
  ]);
  if (orders.error || products.error) throw orders.error || products.error;
  return c.json({ orders: orders.data, products: products.data });
});
app.post("/api/admin/products", async (c) => {
  const { s } = await admin(c);
  const body = z
    .object({
      product: z.object({
        name: z.string().min(2).max(100),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(100),
        category: z.enum([
          "Running",
          "Streetwear",
          "Training",
          "Football",
          "Basketball",
        ]),
        description: z.string().min(10).max(5000),
        image: z.number().int().min(0).max(7),
        tag: z.string().max(80),
      }),
      variants: z
        .array(
          z.object({
            sku: z.string().min(2).max(80),
            size: z.string().min(1).max(8),
            color: z.string().min(1).max(50),
            price: z.number().int().min(1).max(1000000),
            stock: z.number().int().min(0).max(100000),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(await c.req.json());
  const { data, error } = await db(c.env).rpc("create_product", {
    p_actor: s.userId,
    p_product: body.product,
    p_variants: body.variants,
  });
  if (error) throw error;
  return c.json({ id: data }, 201);
});
app.patch("/api/admin/products/:id", async (c) => {
  const { s } = await admin(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = z
    .object({
      active: z.boolean().optional(),
      translations: z
        .object({
          en: z.object({
            description: z.string().max(4000),
            tag: z.string().max(80),
          }),
        })
        .optional(),
    })
    .refine((b) => b.active !== undefined || b.translations !== undefined)
    .parse(await c.req.json());
  const { error } = await db(c.env).rpc("update_product_content", {
    p_actor: s.userId,
    p_id: id,
    p_patch: body,
  });
  if (error) throw error;
  return c.json({ ok: true });
});
app.patch("/api/admin/variants/:id", async (c) => {
  const { s } = await admin(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const b = z
    .object({
      price: z.number().int().min(1).max(1000000),
      stock: z.number().int().min(0).max(100000),
    })
    .parse(await c.req.json());
  const { error } = await db(c.env).rpc("admin_variant_update", {
    p_actor: s.userId,
    p_id: id,
    p_price: b.price,
    p_stock: b.stock,
  });
  if (error) throw error;
  return c.json({ ok: true });
});
app.post("/api/admin/orders/:id/ship", async (c) => {
  const { s } = await admin(c, ["owner", "manager", "support"]);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { tracking } = z
    .object({ tracking: z.string().min(3).max(120) })
    .parse(await c.req.json());
  const { error } = await db(c.env).rpc("ship_order", {
    p_actor: s.userId,
    p_id: id,
    p_tracking: tracking,
  });
  if (error) throw error;
  return c.json({ ok: true });
});
app.post("/api/admin/images/:id", async (c) => {
  const { s } = await admin(c);
  if (!c.env.MEDIA)
    return c.json({ error: "Armazenamento R2 não configurado." }, 503);
  const id = z.string().uuid().parse(c.req.param("id")),
    buffer = await c.req.arrayBuffer(),
    bytes = new Uint8Array(buffer);
  let ext = "";
  if (
    bytes.length > 12 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    ext = "png";
  else if (
    bytes.length > 12 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    ext = "jpg";
  else if (
    bytes.length > 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    ext = "webp";
  if (!ext || bytes.length > 8 * 1024 * 1024)
    return c.json({ error: "Envia PNG, JPEG ou WebP válido, até 8 MB." }, 400);
  const key = "images/" + crypto.randomUUID() + "." + ext;
  await c.env.MEDIA.put(key, buffer, {
    httpMetadata: {
      contentType: ext === "jpg" ? "image/jpeg" : "image/" + ext,
    },
  });
  const client = db(c.env);
  const { error } = await client
    .from("products")
    .update({ image_url: "/api/media/" + key })
    .eq("id", id);
  if (error) throw error;
  const { error: logError } = await client.from("audit_log").insert({
    actor: s.userId,
    action: "image.uploaded",
    entity_id: id,
    details: { key },
  });
  if (logError) throw logError;
  return c.json({ url: "/api/media/" + key });
});
app.get("/api/media/images/:file", async (c) => {
  const file = z
    .string()
    .regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/)
    .parse(c.req.param("file"));
  if (!c.env.MEDIA) return c.notFound();
  const image = await c.env.MEDIA.get("images/" + file);
  if (!image) return c.notFound();
  return new Response(image.body, {
    headers: {
      "Content-Type":
        image.httpMetadata?.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
app.post("/api/admin/models/:id", async (c) => {
  const { s } = await admin(c);
  if (!c.env.MEDIA)
    return c.json({ error: "Armazenamento R2 não configurado." }, 503);
  const id = z.string().uuid().parse(c.req.param("id"));
  const data = await c.req.arrayBuffer();
  if (
    data.byteLength < 12 ||
    data.byteLength > 8 * 1024 * 1024 ||
    new DataView(data).getUint32(0, true) !== 0x46546c67 ||
    new DataView(data).getUint32(4, true) !== 2 ||
    new DataView(data).getUint32(8, true) !== data.byteLength
  )
    return c.json({ error: "Envia um GLB 2.0 válido, até 8 MB." }, 400);
  const key = "models/" + crypto.randomUUID() + ".glb";
  await c.env.MEDIA.put(key, data, {
    httpMetadata: { contentType: "model/gltf-binary" },
  });
  const client = db(c.env);
  const { error } = await client
    .from("products")
    .update({ model_url: "/api/media/" + key })
    .eq("id", id);
  if (error) throw error;
  const { error: logError } = await client.from("audit_log").insert({
    actor: s.userId,
    action: "model.uploaded",
    entity_id: id,
    details: { key },
  });
  if (logError) throw logError;
  return c.json({ url: "/api/media/" + key });
});
app.get("/api/media/models/:file", async (c) => {
  const file = z
    .string()
    .regex(/^[0-9a-f-]{36}\.glb$/)
    .parse(c.req.param("file"));
  if (!c.env.MEDIA) return c.notFound();
  const object = await c.env.MEDIA.get("models/" + file);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
app.get("/api/admin/oss", async (c) => {
  await admin(c);
  const year = z.coerce
    .number()
    .int()
    .min(2026)
    .max(2100)
    .parse(c.req.query("year"));
  const quarter = z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .parse(c.req.query("quarter"));
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
    end = new Date(Date.UTC(year, quarter * 3, 1));
  const { data, error } = await db(c.env)
    .from("orders")
    .select("id,country,amount,tax,currency,created_at,status")
    .in("status", ["paid", "shipped"])
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at");
  if (error) throw error;
  const csv = [
    "order_id,country,gross_cents,tax_cents,currency,created_at",
    ...data.map((o) =>
      [o.id, o.country, o.amount, o.tax, o.currency, o.created_at].join(","),
    ),
  ].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="flayr-oss-${year}-Q${quarter}.csv"`,
    },
  });
});
app.post("/api/withdrawals", async (c) => {
  const body = z
    .object({
      orderReference: z.string().min(4).max(100),
      locale: z.enum(["pt", "en"]).default("pt"),
      name: z.string().min(2).max(150),
      email: z.string().email(),
      message: z.string().min(5).max(3000),
      confirmed: z.literal(true),
    })
    .parse(await c.req.json());
  const id = crypto.randomUUID(),
    client = db(c.env);
  const payload = await seal(body, c.env.PII_KEY_V1, "withdrawal:" + id);
  const outbox = await seal(
    {
      email: body.email,
      name: body.name,
      message: body.message,
      reference: id,
      receivedAt: new Date().toISOString(),
      locale: body.locale,
    },
    c.env.PII_KEY_V1,
    "outbox",
  );
  const { error } = await client.rpc("submit_withdrawal", {
    p_id: id,
    p_reference: body.orderReference,
    p_payload: payload,
    p_outbox: outbox,
  });
  if (error) throw error;
  return c.json(
    {
      reference: id,
      receivedAt: new Date().toISOString(),
      message: "Declaração recebida. Será enviada confirmação por email.",
    },
    201,
  );
});
app.post("/api/newsletter", async (c) => {
  const { email } = z
    .object({ email: z.string().email().max(200), consent: z.literal(true) })
    .parse(await c.req.json());
  const normalized = email.toLowerCase().trim();
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const token = crypto.randomUUID() + crypto.randomUUID();
  await redis(c.env).set(
    "newsletter:" + token,
    { email: await seal(normalized, c.env.PII_KEY_V1, "newsletter"), hash },
    { ex: 86400 },
  );
  await sendEmail(
    c.env,
    normalized,
    "Confirma a tua subscrição FLAYR",
    `Confirma a tua subscrição neste endereço: ${c.env.APP_ORIGIN}/newsletter/confirm?token=${token}`,
    "newsletter:" + token,
  );
  return c.json({ ok: true });
});
app.get("/api/newsletter/confirm", (c) => {
  const token = z
    .string()
    .regex(/^[a-f0-9-]{72}$/)
    .parse(c.req.query("token"));
  return c.redirect("/newsletter/confirm?token=" + token, 303);
});
app.post("/api/newsletter/confirm", async (c) => {
  const { token, locale } = z
    .object({
      token: z.string().regex(/^[a-f0-9-]{72}$/),
      locale: z.enum(["pt", "en"]).default("pt"),
    })
    .parse(await c.req.json());
  const r = redis(c.env);
  const value = await r.get<any>("newsletter:" + token);
  if (!value) return c.json({ error: "Ligação expirada." }, 410);
  const { error } = await db(c.env).from("newsletter").upsert(
    {
      email_hash: value.hash,
      email_encrypted: value.email,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: "email_hash" },
  );
  if (error) throw error;
  await r.set("unsubscribe:" + token, value.hash, { ex: 86400 * 365 });
  const email = await unseal(value.email, c.env.PII_KEY_V1, "newsletter");
  await sendEmail(
    c.env,
    email,
    "FLAYR newsletter",
    locale === "en"
      ? "Subscription confirmed. Unsubscribe: " +
          c.env.APP_ORIGIN +
          "/en/newsletter/unsubscribe?token=" +
          token
      : "Subscrição confirmada. Cancelar: " +
          c.env.APP_ORIGIN +
          "/newsletter/unsubscribe?token=" +
          token,
    "newsletter-confirm:" + token,
  );
  await r.del("newsletter:" + token);
  return c.json({ ok: true });
});
app.post("/api/newsletter/unsubscribe", async (c) => {
  const { token } = z
    .object({ token: z.string().regex(/^[a-f0-9-]{72}$/) })
    .parse(await c.req.json());
  const r = redis(c.env),
    hash = await r.get<string>("unsubscribe:" + token);
  if (!hash) return c.json({ error: "Ligação expirada." }, 410);
  const { error } = await db(c.env)
    .from("newsletter")
    .delete()
    .eq("email_hash", hash);
  if (error) throw error;
  return c.json({ ok: true });
});
app.get("/api/blog/og", async (c) => {
  const { ImageResponse } = await import("@vercel/og");
  const title = (c.req.query("title") || "MOVE BEYOND LIMITS.").slice(0, 90);
  return new ImageResponse(
    {
      key: null,
      type: "div",
      props: {
        style: {
          background: "#09090b",
          color: "#d6ff38",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          fontSize: 80,
        },
        children: [
          {
            type: "div",
            props: {
              style: { fontSize: 28, color: "#fff", marginBottom: 50 },
              children: "FLAYR / THE JOURNAL",
            },
          },
          { type: "div", props: { children: title } },
        ],
      },
    },
    { width: 1200, height: 630 },
  );
});
app.all("/api/*", (c) => c.json({ error: "Endpoint não encontrado." }, 404));
app.all("*", serveSite);
export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(runJobs(env)),
};
