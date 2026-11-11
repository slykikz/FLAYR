import type { Ctx } from "./security";
import { db } from "./security";
import { routeMeta, staticRoutes } from "../shared/seo";
import { products as demoProducts } from "../src/catalog";
import { t, localPath } from "../src/i18n";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function serveSite(c: Ctx) {
  const url = new URL(c.req.url),
    locale = /^\/en(?:\/|$)/.test(url.pathname) ? "en" : "pt";
  let path = url.pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  const origin = new URL(c.env.APP_ORIGIN).origin,
    live = c.env.COMMERCE_ENABLED === "true";
  if (path === "/robots.txt")
    return c.text(
      live
        ? `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`
        : "User-agent: *\nDisallow: /\n",
    );
  if (path === "/sitemap.xml") {
    let products: { slug: string }[] = [];
    if (live) {
      const result = await db(c.env)
        .from("products")
        .select("slug")
        .eq("active", true);
      if (result.error) throw result.error;
      products = result.data;
    }
    const routes = live
      ? [...staticRoutes, ...products.map((p) => "/product/" + p.slug)]
      : [];
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${routes.flatMap((p) => ["", "/en"].map((prefix) => `<url><loc>${escape(origin + localPath(p, prefix ? "en" : "pt"))}</loc><xhtml:link rel="alternate" hreflang="pt-PT" href="${escape(origin + p)}"/><xhtml:link rel="alternate" hreflang="en" href="${escape(origin + localPath(p, "en"))}"/><xhtml:link rel="alternate" hreflang="x-default" href="${escape(origin + p)}"/></url>`)).join("")}</urlset>`,
      200,
      { "Content-Type": "application/xml; charset=utf-8" },
    );
  }
  if (/\.[a-z0-9]{2,8}$/i.test(path)) return c.env.ASSETS.fetch(c.req.raw);
  if (path.length > 1 && path.endsWith("/"))
    return c.redirect(
      (locale === "en" ? "/en" : "") + path.slice(0, -1) + url.search,
      308,
    );
  let product: any;
  if (path.startsWith("/product/")) {
    const slug = path.slice(9);
    if (live) {
      const { data, error } = await db(c.env)
        .from("products")
        .select("name,description,image_url,translations")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      product = data
        ? {
            ...data,
            image: data.image_url,
            description:
              locale === "en"
                ? data.translations?.en?.description || data.description
                : data.description,
          }
        : undefined;
    } else {
      const found = demoProducts.find((p) => p.slug === slug);
      product = found
        ? { ...found, description: t(found.description, locale) }
        : undefined;
    }
  }
  const known =
    staticRoutes.includes(path) ||
    [
      "/favorites",
      "/checkout",
      "/payment-status",
      "/admin",
      "/newsletter/confirm",
      "/newsletter/unsubscribe",
    ].includes(path) ||
    !!product;
  const meta = routeMeta(path, locale, product),
    canonical = origin + localPath(path, locale);
  const noindex = !live || meta.noindex || !known;
  let catalog: { slug: string; name: string; description: string }[] = [];
  if (live && path === "/shop") {
    const result = await db(c.env)
      .from("products")
      .select("slug,name,description")
      .eq("active", true)
      .limit(200);
    if (result.error) throw result.error;
    catalog = result.data;
  }
  const target = new URL(c.req.url);
  target.pathname = known ? url.pathname : "/";
  target.search = "";
  const response = await c.env.ASSETS.fetch(new Request(target, c.req.raw));
  if (!response.headers.get("Content-Type")?.includes("text/html"))
    return response;
  const image = new URL(meta.image, origin).href;
  const tags = `<meta name="description" content="${escape(meta.description)}"/><meta name="robots" content="${noindex ? "noindex,follow" : "index,follow"}"/><link rel="canonical" href="${escape(canonical)}"/><meta property="og:title" content="${escape(meta.title)}"/><meta property="og:description" content="${escape(meta.description)}"/><meta property="og:url" content="${escape(canonical)}"/><meta property="og:image" content="${escape(image)}"/><meta property="og:type" content="${meta.type}"/><meta property="og:site_name" content="FLAYR"/><meta property="og:locale" content="${locale === "en" ? "en_GB" : "pt_PT"}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escape(meta.title)}"/><meta name="twitter:description" content="${escape(meta.description)}"/><meta name="twitter:image" content="${escape(image)}"/>${[
    ["pt-PT", ""],
    ["en", "/en"],
    ["x-default", ""],
  ]
    .map(
      ([lang, prefix]) =>
        `<link rel="alternate" hreflang="${lang}" href="${escape(origin + localPath(path, prefix ? "en" : "pt"))}"/>`,
    )
    .join("")}`;
  const rewritten = new HTMLRewriter()
    .on("title", {
      element: (e) => {
        e.setInnerContent(meta.title);
      },
    })
    .on("html", {
      element: (e) => {
        e.setAttribute("lang", locale === "pt" ? "pt-PT" : "en");
      },
    })
    .on(
      'meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],link[rel="alternate"],script[type="application/ld+json"]',
      {
        element: (e) => {
          e.remove();
        },
      },
    )
    .on("head", {
      element: (e) => {
        e.append(tags, { html: true });
      },
    })
    .on("#root", {
      element: (e) => {
        if (!known)
          e.setInnerContent(
            `<main><h1>${locale === "en" ? "Page not found" : "Página não encontrada"}</h1><a href="${locale === "en" ? "/en/" : "/"}">FLAYR</a></main>`,
            { html: true },
          );
        else if (product)
          e.setInnerContent(
            `<main><h1>${escape(product.name)}</h1><p>${escape(product.description)}</p></main>`,
            { html: true },
          );
        else if (live && path === "/shop")
          e.setInnerContent(
            `<main><h1>${locale === "en" ? "The collection" : "A coleção"}</h1>${catalog.map((p) => `<article><h2><a href="${locale === "en" ? "/en" : ""}/product/${encodeURIComponent(p.slug)}">${escape(p.name)}</a></h2><p>${escape(p.description)}</p></article>`).join("")}</main>`,
            { html: true },
          );
      },
    })
    .transform(response);
  const headers = new Headers(rewritten.headers);
  headers.set("X-Robots-Tag", noindex ? "noindex,follow" : "index,follow");
  headers.set("Cache-Control", "no-cache");
  return new Response(rewritten.body, { status: known ? 200 : 404, headers });
}
