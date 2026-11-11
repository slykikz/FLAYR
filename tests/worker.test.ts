import { it, expect } from "vitest";
import worker from "../server/index";
import type { Env } from "../server/types";
const env = {
  APP_ORIGIN: "https://flayr.example",
  COMMERCE_ENABLED: "false",
} as Env;
it("rejects cross-origin writes before touching any integration", async () => {
  const response = await worker.fetch(
    new Request("https://flayr.example/api/checkout", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(403);
});
it("reports demo state without credentials", async () => {
  const response = await worker.fetch(
    new Request("https://flayr.example/api/health"),
    env,
    {} as ExecutionContext,
  );
  expect(await response.json()).toEqual({ ok: true, commerce: false });
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("does not reveal catalogue or admin data when unconfigured", async () => {
  const response = await worker.fetch(
    new Request("https://flayr.example/api/catalog"),
    env,
    {} as ExecutionContext,
  );
  expect(await response.json()).toEqual({ products: [], demo: true });
  const admin = await worker.fetch(
    new Request("https://flayr.example/api/admin"),
    env,
    {} as ExecutionContext,
  );
  expect(admin.status).toBe(401);
});
