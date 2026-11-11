import assert from "node:assert/strict";
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:8787";
const paths = [
  "/",
  "/shop",
  "/blog",
  "/blog/manifesto",
  "/blog/midnight",
  "/contact",
  "/legal/termos",
  "/legal/envios",
  "/legal/privacidade",
  "/legal/cookies",
  "/legal/contactos",
  "/legal/tamanhos",
  "/legal/resolucao",
  "/product/velocity-01",
  "/checkout",
  "/admin",
  "/payment-status",
  "/favorites",
  "/newsletter/confirm",
];
let checked = 0;
for (const prefix of ["", "/en"])
  for (const path of paths) {
    const response = await fetch(origin + prefix + path),
      html = await response.text();
    assert.equal(response.status, 200, prefix + path);
    assert.equal(
      (html.match(/name="description"/g) || []).length,
      1,
      "one description: " + path,
    );
    assert.equal(
      (html.match(/rel="canonical"/g) || []).length,
      1,
      "one canonical: " + path,
    );
    assert.match(html, /property="og:title"/);
    assert.match(html, /hreflang="en"/);
    assert.ok(response.headers.get("content-security-policy"));
    checked++;
  }
for (const path of [
  "/missing-page",
  "/blog/not-an-article",
  "/en/blog/not-an-article",
  "/product/not-a-product",
  "/en/legal/unknown",
]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 404, path);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  checked++;
}
const config = await (await fetch(origin + "/api/config")).json();
assert.equal(
  config.checkoutReady,
  false,
  "Run this smoke check against the demo environment",
);
assert.equal(config.seller, null);
assert.match(await (await fetch(origin + "/sitemap.xml")).text(), /urlset/);
assert.match(
  await (await fetch(origin + "/robots.txt")).text(),
  /Disallow: \//,
);
console.log(
  `${checked} page/status/SEO checks passed, plus demo config, sitemap and robots. No external transactions were made.`,
);
