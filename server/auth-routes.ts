import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./types";
import { auth, admin, session, saveSession, logout, redis } from "./security";
export const authRoutes = new Hono<{ Bindings: Env }>();
authRoutes.post("/login", async (c) => {
  const body = z
    .object({ email: z.string().email(), password: z.string().min(8).max(200) })
    .parse(await c.req.json());
  const client = auth(c.env);
  const { data, error } = await client.auth.signInWithPassword(body);
  if (error || !data.session || !data.user)
    return c.json({ error: "Credenciais inválidas." }, 401);
  await saveSession(c, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    userId: data.user.id,
    mfa: false,
  });
  return c.json({ needsMfa: true });
});
authRoutes.get("/factors", async (c) => {
  const { client } = await session(c);
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  return c.json({
    factors: data.totp
      .filter((f) => f.status === "verified")
      .map((f) => ({ id: f.id, friendly_name: f.friendly_name })),
  });
});
authRoutes.post("/totp/enroll", async (c) => {
  const { client } = await session(c);
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "FLAYR Admin",
  });
  if (error) throw error;
  return c.json({
    id: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
  });
});
authRoutes.post("/totp/verify", async (c) => {
  const body = z
    .object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) })
    .parse(await c.req.json());
  const { client, s } = await session(c);
  const { data, error } = await client.auth.mfa.challengeAndVerify(body);
  if (error) return c.json({ error: "Código inválido ou expirado." }, 401);
  await saveSession(c, {
    ...s,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    mfa: true,
  });
  return c.json({ ok: true });
});
authRoutes.post("/logout", async (c) => {
  await logout(c);
  return c.json({ ok: true });
});
authRoutes.post("/passkey/start", async (c) => {
  const { data, error } = await auth(c.env).auth.passkey.startAuthentication();
  if (error) throw error;
  return c.json(data);
});
authRoutes.post("/passkey/verify", async (c) => {
  const body = z
    .object({ challengeId: z.string().max(200), credential: z.any() })
    .parse(await c.req.json());
  const { data, error } = await auth(c.env).auth.passkey.verifyAuthentication(
    body,
  );
  if (error || !data.session || !data.user)
    return c.json({ error: "Não foi possível validar a passkey." }, 401);
  await saveSession(c, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    userId: data.user.id,
    mfa: false,
  });
  return c.json({ needsMfa: true });
});
authRoutes.post("/passkey/register/start", async (c) => {
  const { client } = await admin(c);
  const { data, error } = await client.auth.passkey.startRegistration();
  if (error) throw error;
  return c.json(data);
});
authRoutes.post("/passkey/register/verify", async (c) => {
  const { client } = await admin(c);
  const body = z
    .object({ challengeId: z.string().max(200), credential: z.any() })
    .parse(await c.req.json());
  const { error } = await client.auth.passkey.verifyRegistration(body);
  if (error) throw error;
  return c.json({ ok: true });
});
