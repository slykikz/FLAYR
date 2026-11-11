import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createClient } from "@supabase/supabase-js";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import type { Env, Session } from "./types";
export type Ctx = Context<{ Bindings: Env }>;
export function redis(e: Env) {
  return new Redis({
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  });
}
export function db(e: Env) {
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Configuração de dados indisponível.");
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function auth(e: Env) {
  return createClient(e.SUPABASE_URL, e.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      experimental: { passkey: true },
    },
  });
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(secret: string) {
  const raw = bytes(secret);
  if (raw.length !== 32) throw new Error("Invalid PII key");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(value: unknown, secret: string, scope: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(scope) },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { v: 1, iv: b64(iv), data: b64(new Uint8Array(encrypted)) };
}
export async function unseal(
  value: { v: number; iv: string; data: string },
  secret: string,
  scope: string,
) {
  if (value.v !== 1) throw new Error("Unsupported key version");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes(value.iv),
      additionalData: new TextEncoder().encode(scope),
    },
    await key(secret),
    bytes(value.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
export async function rateLimit(c: Ctx, scope: string, limit = 15) {
  if (!c.env.UPSTASH_REDIS_REST_URL)
    throw new Error("Serviço de proteção indisponível.");
  const limiter = new Ratelimit({
    redis: redis(c.env),
    limiter: Ratelimit.slidingWindow(limit, "1 m"),
    prefix: "flayr:rate:" + scope,
    analytics: false,
  });
  const result = await limiter.limit(
    c.req.header("CF-Connecting-IP") || "local",
  );
  return result.success;
}
export async function saveSession(c: Ctx, s: Session) {
  const old = getCookie(c, "__Host-flayr");
  if (old) await redis(c.env).del("session:" + old);
  const id = crypto.randomUUID() + crypto.randomUUID();
  await redis(c.env).set(
    "session:" + id,
    await seal(s, c.env.PII_KEY_V1, "session:" + id),
    { ex: 3600 },
  );
  setCookie(c, "__Host-flayr", id, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 3600,
  });
  return id;
}
export async function session(c: Ctx) {
  const id = getCookie(c, "__Host-flayr");
  if (!id) throw new Error("Autenticação necessária.");
  const encrypted = await redis(c.env).get<any>("session:" + id);
  if (!encrypted) throw new Error("Sessão expirada.");
  const s: Session = await unseal(encrypted, c.env.PII_KEY_V1, "session:" + id);
  const client = auth(c.env);
  const { data, error } = await client.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });
  if (error || !data.session) throw new Error("Sessão inválida.");
  const verified = await client.auth.getUser();
  if (verified.error || verified.data.user?.id !== s.userId)
    throw new Error("Sessão inválida.");
  s.access_token = data.session.access_token;
  s.refresh_token = data.session.refresh_token;
  await redis(c.env).set(
    "session:" + id,
    await seal(s, c.env.PII_KEY_V1, "session:" + id),
    { ex: 3600 },
  );
  return { client, s, id };
}
export async function admin(c: Ctx, roles = ["owner", "manager"]) {
  const current = await session(c);
  if (!current.s.mfa) throw new Error("Verificação TOTP obrigatória.");
  const { data: aal, error: aalError } =
    await current.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || aal?.currentLevel !== "aal2")
    throw new Error("Verificação TOTP obrigatória.");
  const { data, error } = await db(c.env)
    .from("admin_roles")
    .select("role")
    .eq("user_id", current.s.userId)
    .single();
  if (error || !data || !roles.includes(data.role))
    throw new Error("Acesso não autorizado.");
  return current;
}
export async function logout(c: Ctx) {
  const id = getCookie(c, "__Host-flayr");
  try {
    const { client } = await session(c);
    await client.auth.signOut({ scope: "local" });
  } finally {
    if (id) await redis(c.env).del("session:" + id);
    deleteCookie(c, "__Host-flayr", {
      secure: true,
      path: "/",
      sameSite: "Strict",
    });
  }
}
export const csp =
  "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.stripe.com; font-src 'self'; connect-src 'self' https://api.stripe.com https://*.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
export function sameOrigin(origin: string | undefined, expected: string) {
  return !!origin && origin === expected;
}
