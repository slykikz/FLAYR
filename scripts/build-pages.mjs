import { createServer, loadEnv } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const server = await createServer({ server: { middlewareMode: true } });
const template = await readFile("dist/index.html", "utf8");
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const origin = env.VITE_PUBLIC_ORIGIN || env.PUBLIC_ORIGIN || "";
if (origin && !/^https:\/\/[^/]+$/.test(origin))
  throw new Error(
    "VITE_PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash",
  );
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
try {
  const { staticRoutes, routeMeta, editorial } =
    await server.ssrLoadModule("/shared/seo.ts");
  const { products } = await server.ssrLoadModule("/src/catalog.ts");
  const routes = [
    ...staticRoutes,
    ...products.map((p) => "/product/" + p.slug),
    "/checkout",
    "/favorites",
    "/payment-status",
    "/admin",
  ];
  for (const locale of ["pt", "en"])
    for (const path of routes) {
      const route = (locale === "en" ? "/en" : "") + path,
        product = products.find((p) => path === "/product/" + p.slug);
      const meta = routeMeta(path, locale, product);
      let html = "";
      if (
        path.startsWith("/blog/") ||
        [
          "/legal/termos",
          "/legal/envios",
          "/legal/privacidade",
          "/legal/cookies",
        ].includes(path)
      ) {
        const file = path.split("/").at(-1),
          module = await server.ssrLoadModule(
            "/content/" + (locale === "en" ? "en/" : "") + file + ".mdx",
          );
        html = renderToStaticMarkup(React.createElement(module.default));
      } else if (path === "/blog")
        html = `<h1>The FLAYR Journal</h1>${editorial.map((a) => `<article><h2><a href="${locale === "en" ? "/en" : ""}/blog/${a.slug}">${escape(a.title[locale])}</a></h2><p>${escape(a.description[locale])}</p></article>`).join("")}`;
      else if (path === "/shop")
        html = `<h1>${locale === "en" ? "The collection" : "A coleção"}</h1><p>${locale === "en" ? "Concept collection. Payments disabled." : "Coleção conceptual. Pagamentos desativados."}</p>`;
      else
        html = `<h1>${escape(meta.title.replace(" — FLAYR", ""))}</h1><p>${escape(meta.description)}</p>`;
      const canonical = origin + (route === "/en/" ? "/en" : route);
      const links = origin
        ? `<link rel="canonical" href="${escape(canonical)}"/>${[
            ["pt-PT", ""],
            ["en", "/en"],
            ["x-default", ""],
          ]
            .map(
              ([lang, p]) =>
                `<link rel="alternate" hreflang="${lang}" href="${escape(origin + (p && path === "/" ? "/en" : p + path))}"/>`,
            )
            .join("")}`
        : "";
      const tags = `<meta name="description" content="${escape(meta.description)}"/><meta name="robots" content="noindex,follow"/>${links}<meta property="og:title" content="${escape(meta.title)}"/><meta property="og:description" content="${escape(meta.description)}"/><meta property="og:type" content="${meta.type}"/><meta property="og:image" content="${escape(origin + meta.image)}"/><meta property="og:url" content="${escape(canonical)}"/><meta property="og:locale" content="${locale === "pt" ? "pt_PT" : "en_GB"}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escape(meta.title)}"/><meta name="twitter:description" content="${escape(meta.description)}"/><meta name="twitter:image" content="${escape(origin + meta.image)}"/>`;
      if (locale === "en")
        html = html.replaceAll('href="/legal/', 'href="/en/legal/');
      const page = template
        .replace(
          /<html lang="[^"]+"/,
          `<html lang="${locale === "pt" ? "pt-PT" : "en"}"`,
        )
        .replace(/<title>.*?<\/title>/, `<title>${escape(meta.title)}</title>`)
        .replace(/<meta name="description"[^>]*>/, "")
        .replace("</head>", tags + "</head>")
        .replace(
          '<div id="root"></div>',
          `<div id="root"><nav><a href="${locale === "en" ? "/en/" : "/"}">FLAYR</a> · <a href="${locale === "en" ? "/en" : ""}/shop">${locale === "en" ? "Collection" : "Coleção"}</a> · <a href="${locale === "en" ? "/en" : ""}/blog">Journal</a> · <a href="${locale === "en" ? "/en" : ""}/contact">${locale === "en" ? "Contact" : "Contactos"}</a></nav><main class="legal-page">${html}</main></div>`,
        );
      const folder = "dist" + (route === "/" ? "" : route);
      await mkdir(folder, { recursive: true });
      await writeFile(folder + "/index.html", page);
    }
  // The Worker generates the production sitemap from active database products.
  await writeFile(
    "dist/sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>',
  );
  await writeFile("dist/robots.txt", "User-agent: *\nDisallow: /\n");
  console.log(
    `Prerendered ${routes.length * 2} Portuguese/English routes. Preview stays noindex; the Worker controls production indexing.`,
  );
} finally {
  await server.close();
}
