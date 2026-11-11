import { useEffect } from "react";
import { useLocale, localPath, t } from "./i18n";
import { routeMeta } from "../shared/seo";
import type { Product } from "./catalog";
export function Seo({
  path,
  product,
  demo,
}: {
  path: string;
  product?: Product;
  demo: boolean;
}) {
  const locale = useLocale();
  useEffect(() => {
    const clean = path.split("?")[0],
      meta = routeMeta(
        clean,
        locale,
        product
          ? {
              ...product,
              description:
                locale === "en"
                  ? product.translations?.en?.description ||
                    t(product.description, locale)
                  : product.description,
            }
          : undefined,
      );
    const origin = import.meta.env.VITE_PUBLIC_ORIGIN || location.origin;
    const canonical = origin + localPath(clean, locale);
    document.title = meta.title;
    document.documentElement.lang = locale === "pt" ? "pt-PT" : "en";
    function tag(key: string, value: string, property = false) {
      const attr = property ? "property" : "name";
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    }
    function link(rel: string, href: string, language?: string) {
      const selector = `link[rel="${rel}"]${language ? `[hreflang="${language}"]` : ""}`;
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        if (language) el.setAttribute("hreflang", language);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    }
    tag("description", meta.description);
    tag("robots", meta.noindex || demo ? "noindex,follow" : "index,follow");
    for (const [k, v] of Object.entries({
      "og:title": meta.title,
      "og:description": meta.description,
      "og:url": canonical,
      "og:image": new URL(meta.image, origin).href,
      "og:type": meta.type,
      "og:site_name": "FLAYR",
      "og:locale": locale === "pt" ? "pt_PT" : "en_GB",
    }))
      tag(k, v, true);
    tag("twitter:card", "summary_large_image");
    tag("twitter:title", meta.title);
    tag("twitter:description", meta.description);
    tag("twitter:image", new URL(meta.image, origin).href);
    link("canonical", canonical);
    link("alternate", origin + localPath(clean, "pt"), "pt-PT");
    link("alternate", origin + localPath(clean, "en"), "en");
    link("alternate", origin + localPath(clean, "pt"), "x-default");
  }, [path, product, demo, locale]);
  return null;
}
