export interface Env {
  ASSETS: Fetcher;
  MEDIA?: R2Bucket;
  APP_ORIGIN: string;
  COMMERCE_ENABLED: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  PII_KEY_V1: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  LEGAL_ENTITY_NAME: string;
  LEGAL_ENTITY_VAT: string;
  LEGAL_ENTITY_ADDRESS: string;
  LEGAL_ENTITY_EMAIL: string;
  LEGAL_ENTITY_PHONE: string;
  LEGAL_ENTITY_PHONE_COST: string;
  LEGAL_ENTITY_ADR: string;
  LEGAL_APPROVED_VERSION: string;
  STRIPE_PUBLISHABLE_KEY: string;
  PUBLIC_BUSINESS_DETAILS_APPROVED: string;
  PUBLIC_SUPPORT_EMAIL: string;
  CONTACT_TO: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  STORE_SHIPPING_INFO: string;
}
export type Session = {
  access_token: string;
  refresh_token: string;
  userId: string;
  mfa: boolean;
};
