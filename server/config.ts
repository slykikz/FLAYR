import type { Env } from "./types";
import { TERMS_VERSION } from "../shared/commerce";

export function checkoutReady(e: Env) {
  const matchingKeys =
    (e.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
      e.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")) ||
    (e.STRIPE_SECRET_KEY?.startsWith("sk_live_") &&
      e.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_"));
  return (
    e.COMMERCE_ENABLED === "true" &&
    e.PUBLIC_BUSINESS_DETAILS_APPROVED === "true" &&
    e.LEGAL_APPROVED_VERSION === TERMS_VERSION &&
    !!matchingKeys &&
    [
      e.SUPABASE_URL,
      e.SUPABASE_SERVICE_ROLE_KEY,
      e.UPSTASH_REDIS_REST_URL,
      e.UPSTASH_REDIS_REST_TOKEN,
      e.PII_KEY_V1,
      e.STRIPE_WEBHOOK_SECRET,
      e.RESEND_API_KEY,
      e.EMAIL_FROM,
      e.LEGAL_ENTITY_NAME,
      e.LEGAL_ENTITY_VAT,
      e.LEGAL_ENTITY_ADDRESS,
      e.LEGAL_ENTITY_EMAIL,
      e.LEGAL_ENTITY_PHONE,
      e.LEGAL_ENTITY_PHONE_COST,
      e.LEGAL_ENTITY_ADR,
    ].every(Boolean)
  );
}
export function publicConfig(e: Env) {
  // Deliberate allowlist: account owner, credentials and private inbox never leave the server.
  return {
    commerce: e.COMMERCE_ENABLED === "true",
    checkoutReady: checkoutReady(e),
    paymentMode: e.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
      ? "test"
      : "live",
    stripePublishableKey: /^pk_(test|live)_/.test(
      e.STRIPE_PUBLISHABLE_KEY || "",
    )
      ? e.STRIPE_PUBLISHABLE_KEY
      : null,
    contactReady: !!(
      e.RESEND_API_KEY &&
      e.EMAIL_FROM &&
      e.CONTACT_TO &&
      e.SUPABASE_URL &&
      e.SUPABASE_SERVICE_ROLE_KEY &&
      e.PII_KEY_V1 &&
      e.UPSTASH_REDIS_REST_URL &&
      e.UPSTASH_REDIS_REST_TOKEN
    ),
    assistantReady: !!(
      e.OPENAI_API_KEY &&
      e.OPENAI_MODEL &&
      e.UPSTASH_REDIS_REST_URL &&
      e.UPSTASH_REDIS_REST_TOKEN
    ),
    supportEmail: e.PUBLIC_SUPPORT_EMAIL || null,
    seller:
      e.PUBLIC_BUSINESS_DETAILS_APPROVED === "true"
        ? {
            name: e.LEGAL_ENTITY_NAME,
            vat: e.LEGAL_ENTITY_VAT,
            address: e.LEGAL_ENTITY_ADDRESS,
            email: e.LEGAL_ENTITY_EMAIL,
            phone: e.LEGAL_ENTITY_PHONE,
            phoneCost: e.LEGAL_ENTITY_PHONE_COST,
            adr: e.LEGAL_ENTITY_ADR,
          }
        : null,
  };
}
