import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const pg = new PGlite();
const product = "00000000-0000-4000-8000-000000000001",
  variant = "00000000-0000-4000-8000-000000000002",
  order = "00000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  await pg.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
  );
  await pg.exec(
    readFileSync(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
  );
  await pg.exec(
    readFileSync(
      new URL("../db/002_launch_audit.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.query(
    "insert into products(id,slug,name,category,description,image,tag,active) values($1,'shoe','Shoe','Running','Test',0,'Test',true)",
    [product],
  );
  await pg.query(
    "insert into variants(id,product_id,sku,size,color,price,stock) values($1,$2,'SKU-1','42','Lime',10000,3)",
    [variant, product],
  );
}, 20000);
afterAll(async () => {
  await pg.close();
});
describe("commerce database invariants", () => {
  it("leases queued support emails once and keeps them private", async () => {
    const id = crypto.randomUUID();
    await pg.query(
      "insert into email_outbox(id,kind,payload_encrypted) values($1,'contact','{}')",
      [id],
    );
    const first = await pg.query<{ id: string; attempts: number }>(
      "select * from claim_emails()",
    );
    expect(first.rows.find((r) => r.id === id)?.attempts).toBe(1);
    const second = await pg.query<{ id: string }>(
      "select * from claim_emails()",
    );
    expect(second.rows.some((r) => r.id === id)).toBe(false);
    const permissions = await pg.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','public.claim_emails()','EXECUTE') allowed",
    );
    expect(permissions.rows[0].allowed).toBe(false);
  });
  it("enables RLS on every application table", async () => {
    const result = await pg.query<{ relname: string }>(
      "select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it("has no public execution permission for privileged operations", async () => {
    const r = await pg.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','public.reserve_order(jsonb)','EXECUTE') as allowed",
    );
    expect(r.rows[0].allowed).toBe(false);
  });
  it("reserves stock once for repeated checkout requests", async () => {
    const payload = {
      id: order,
      idempotency_key: order,
      amount: 20000,
      tax: 3740,
      shipping: 0,
      country: "PT",
      customer_encrypted: { v: 1 },
      items: [{ variant_id: variant, quantity: 2, unit_price: 10000 }],
      tax_calculation: "taxcalc_test",
    };
    await pg.query("select reserve_order($1::jsonb)", [
      JSON.stringify(payload),
    ]);
    await pg.query("select reserve_order($1::jsonb)", [
      JSON.stringify(payload),
    ]);
    const r = await pg.query<{ stock: number }>(
      "select stock from variants where id=$1",
      [variant],
    );
    expect(r.rows[0].stock).toBe(1);
  });
  it("rejects a second order beyond stock and leaves inventory unchanged", async () => {
    const payload = {
      id: "00000000-0000-4000-8000-000000000004",
      idempotency_key: "00000000-0000-4000-8000-000000000004",
      amount: 20000,
      tax: 3740,
      shipping: 0,
      country: "PT",
      customer_encrypted: {},
      items: [{ variant_id: variant, quantity: 2, unit_price: 10000 }],
    };
    await expect(
      pg.query("select reserve_order($1::jsonb)", [JSON.stringify(payload)]),
    ).rejects.toThrow("Stock or price changed");
  });
  it("does not accept mismatched webhook amounts", async () => {
    await expect(
      pg.query(
        "select apply_payment_event('bad',$1,'pi_test','paid',1,'eur')",
        [order],
      ),
    ).rejects.toThrow("Amount mismatch");
  });
  it("fulfills once and ignores late processing or cancellation", async () => {
    await pg.query(
      "select apply_payment_event('evt_1',$1,'pi_test','paid',20000,'eur')",
      [order],
    );
    await pg.query(
      "select apply_payment_event('evt_1',$1,'pi_test','paid',20000,'eur')",
      [order],
    );
    await pg.query(
      "select apply_payment_event('evt_2',$1,'pi_test','processing',20000,'eur')",
      [order],
    );
    await pg.query(
      "select apply_payment_event('evt_3',$1,'pi_test','cancelled',20000,'eur')",
      [order],
    );
    const o = await pg.query<{ status: string }>(
      "select status from orders where id=$1",
      [order],
    );
    expect(o.rows[0].status).toBe("paid");
    const r = await pg.query<{ count: number }>(
      "select count(*)::int as count from email_outbox where kind='receipt'",
    );
    expect(r.rows[0].count).toBe(1);
  });
  it("rejects audit mutation", async () => {
    await expect(
      pg.query("update audit_log set action='tampered'"),
    ).rejects.toThrow("Append-only record");
  });
  it("includes the price carried into the prior 30 day window", async () => {
    await pg.query(
      "insert into price_history(variant_id,price,recorded_at) values($1,8000,'2025-01-01'),($1,12000,'2025-02-20')",
      [variant],
    );
    const r = await pg.query<{ price: number }>(
      "select prior_30_day_price($1,'2025-03-01') as price",
      [variant],
    );
    expect(r.rows[0].price).toBe(8000);
  });
});
