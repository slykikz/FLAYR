import { existsSync, readFileSync } from "node:fs";
const e = { ...process.env };
for (const file of [".dev.vars", ".env"])
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) e[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
const groups = {
  Checkout: [
    "APP_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "PII_KEY_V1",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "LEGAL_ENTITY_NAME",
    "LEGAL_ENTITY_VAT",
    "LEGAL_ENTITY_ADDRESS",
    "LEGAL_ENTITY_EMAIL",
    "LEGAL_ENTITY_PHONE",
    "LEGAL_ENTITY_PHONE_COST",
    "LEGAL_ENTITY_ADR",
  ],
  Contact: [
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "CONTACT_TO",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PII_KEY_V1",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],
  Assistant: [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],
  Admin: [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PII_KEY_V1",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],
};
let failed = false;
for (const [group, keys] of Object.entries(groups)) {
  const missing = keys.filter((k) => !e[k]);
  console.log(
    group +
      ": " +
      (missing.length
        ? "missing " + missing.join(", ")
        : "required variables present; live verification still required"),
  );
  if (missing.length) failed = true;
}
for (const [key, value] of Object.entries({
  COMMERCE_ENABLED: "true",
  PUBLIC_BUSINESS_DETAILS_APPROVED: "true",
  LEGAL_APPROVED_VERSION: "2026-10-21-v2",
}))
  if (e[key] !== value) {
    console.log(key + ": not activated/approved");
    failed = true;
  }
if (e.PII_KEY_V1 && Buffer.from(e.PII_KEY_V1, "base64").length !== 32) {
  console.log("PII_KEY_V1: must contain 32 base64-encoded bytes");
  failed = true;
}
if (
  e.STRIPE_SECRET_KEY &&
  e.STRIPE_PUBLISHABLE_KEY &&
  !(
    (e.STRIPE_SECRET_KEY.startsWith("sk_test_") &&
      e.STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_")) ||
    (e.STRIPE_SECRET_KEY.startsWith("sk_live_") &&
      e.STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_"))
  )
) {
  console.log("Stripe: public and secret keys must have the same mode");
  failed = true;
}
console.log(
  "Secret values were not printed. This checks local configuration only; it does not contact providers.",
);
process.exitCode = failed ? 1 : 0;
