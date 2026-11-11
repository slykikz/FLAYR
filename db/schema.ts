import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
export const products = pgTable("products", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().unique().notNull(),
  name: text().notNull(),
  category: text().notNull(),
  description: text().notNull(),
  translations:jsonb().notNull().default({}),
  image: integer().notNull(),
  imageUrl: text("image_url"),
  tag: text().notNull(),
  modelUrl: text("model_url"),
  active: boolean().default(false).notNull(),
});
export const variants = pgTable(
  "variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    sku: text().unique().notNull(),
    size: text().notNull(),
    color: text().notNull(),
    price: integer().notNull(),
    stock: integer().notNull().default(0),
    taxCode: text("tax_code").notNull().default("txcd_99999999"),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);
export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .references(() => variants.id)
      .notNull(),
    price: integer().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("price_history_variant_time_idx").on(t.variantId, t.recordedAt),
  ],
);
export const promotions = pgTable("promotions", {
  id: uuid().primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .references(() => variants.id)
    .notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  priorPrice: integer("prior_price").notNull(),
  salePrice: integer("sale_price").notNull(),
});
export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey(),
    idempotencyKey: uuid("idempotency_key").unique().notNull(),
    status: text().default("pending").notNull(),
    paymentIntent: text("payment_intent").unique(),
    amount: integer().notNull(),
    tax: integer().notNull(),
    shipping: integer().notNull(),
    currency: text().default("eur").notNull(),
    country: text().notNull(),
    customerEncrypted: jsonb("customer_encrypted").notNull(),
    items: jsonb().notNull(),
    taxCalculation: text("tax_calculation"),
    tracking: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    termsVersion: text("terms_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  },
  (t) => [index("orders_status_expiry_idx").on(t.status, t.expiresAt)],
);
export const adminRoles = pgTable("admin_roles", {
  userId: uuid("user_id").primaryKey(),
  role: text().notNull(),
});
export const auditLog = pgTable("audit_log", {
  id: uuid().primaryKey().defaultRandom(),
  actor: uuid(),
  action: text().notNull(),
  entityId: uuid("entity_id"),
  details: jsonb(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const webhookEvents = pgTable("webhook_events", {
  id: text().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const emailOutbox = pgTable("email_outbox", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id),
  kind: text().notNull(),
  payloadEncrypted: jsonb("payload_encrypted"),
  attempts:integer().notNull().default(0),
  nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}).defaultNow().notNull(),
  firstAttemptAt:timestamp("first_attempt_at",{withTimezone:true}),
  leaseUntil:timestamp("lease_until",{withTimezone:true}),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const withdrawals = pgTable("withdrawals", {
  id: uuid().primaryKey().defaultRandom(),
  orderReference: text("order_reference").notNull(),
  payloadEncrypted: jsonb("payload_encrypted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const newsletter = pgTable("newsletter", {
  id: uuid().primaryKey().defaultRandom(),
  emailHash: text("email_hash").unique().notNull(),
  emailEncrypted: jsonb("email_encrypted").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
