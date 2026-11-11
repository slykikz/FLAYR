import { describe, it, expect } from "vitest";
import { seal, unseal, sameOrigin } from "../server/security";
describe("security boundaries", () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  it("encrypts with fresh nonces and authenticates the field identity", async () => {
    const a = await seal({ email: "test@example.com" }, key, "order:1"),
      b = await seal({ email: "test@example.com" }, key, "order:1");
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toContain("test@example.com");
    expect(await unseal(a, key, "order:1")).toEqual({
      email: "test@example.com",
    });
    await expect(unseal(a, key, "order:2")).rejects.toThrow();
  });
  it("rejects tampered ciphertext", async () => {
    const a = await seal("private", key, "session");
    a.data = (a.data[0] === "A" ? "B" : "A") + a.data.slice(1);
    await expect(unseal(a, key, "session")).rejects.toThrow();
  });
  it("rejects missing, sibling and foreign origins", () => {
    expect(sameOrigin(undefined, "https://flayr.example")).toBe(false);
    expect(sameOrigin("https://evil.example", "https://flayr.example")).toBe(
      false,
    );
    expect(
      sameOrigin("https://shop.flayr.example", "https://flayr.example"),
    ).toBe(false);
    expect(sameOrigin("https://flayr.example", "https://flayr.example")).toBe(
      true,
    );
  });
});
