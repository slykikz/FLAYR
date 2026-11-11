export const editorial = [
  {
    slug: "manifesto",
    image: "hero",
    title: {
      pt: "O movimento tem a tua forma.",
      en: "Movement takes your shape.",
    },
    description: {
      pt: "Liberdade, expressão pessoal e uma nova perspetiva sobre o movimento.",
      en: "Freedom, personal expression and a new perspective on movement.",
    },
    minutes: 3,
  },
  {
    slug: "midnight",
    image: "feature",
    title: {
      pt: "Midnight 01. Own the night.",
      en: "Midnight 01. Own the night.",
    },
    description: {
      pt: "A inspiração por trás de uma coleção que começa depois de horas.",
      en: "The inspiration behind a collection that begins after hours.",
    },
    minutes: 2,
  },
] as const;
export const staticRoutes = [
  "/",
  "/shop",
  "/blog",
  "/contact",
  "/blog/manifesto",
  "/blog/midnight",
  "/legal/termos",
  "/legal/envios",
  "/legal/privacidade",
  "/legal/cookies",
  "/legal/contactos",
  "/legal/tamanhos",
  "/legal/resolucao",
];
export function routeMeta(
  path: string,
  locale: "pt" | "en",
  product?: { name: string; description: string; image?: number | string },
) {
  const titles: Record<string, [string, string]> = {
    "/": ["O teu ritmo. As tuas regras.", "Your rhythm. Your rules."],
    "/shop": ["A coleção", "The collection"],
    "/blog": ["The FLAYR Journal", "The FLAYR Journal"],
    "/contact": ["Contacta a FLAYR", "Contact FLAYR"],
    "/legal/termos": ["Termos e condições", "Terms and conditions"],
    "/legal/envios": ["Envios e devoluções", "Shipping and returns"],
    "/legal/privacidade": ["Privacidade", "Privacy"],
    "/legal/cookies": ["Cookies", "Cookies"],
    "/legal/contactos": ["Identificação do vendedor", "Seller information"],
    "/legal/tamanhos": ["Guia de tamanhos", "Size guide"],
    "/legal/resolucao": ["Livre resolução", "Withdrawal"],
    "/checkout": ["Checkout", "Checkout"],
    "/favorites": ["Os teus favoritos", "Your favourites"],
    "/payment-status": ["Estado da encomenda", "Order status"],
    "/admin": ["Área da equipa", "Team area"],
  };
  const article = editorial.find((a) => path === "/blog/" + a.slug);
  const title =
    product?.name ||
    article?.title[locale] ||
    titles[path]?.[locale === "pt" ? 0 : 1] ||
    (locale === "pt" ? "Página não encontrada" : "Page not found");
  const description =
    product?.description ||
    article?.description[locale] ||
    (locale === "pt"
      ? "FLAYR. Performance, cultura e expressão pessoal. Explora a coleção e encontra o teu próximo movimento."
      : "FLAYR. Performance, culture and personal expression. Explore the collection and find your next movement.");
  return {
    title: title + " — FLAYR",
    description: description.slice(0, 180),
    image:
      typeof product?.image === "string"
        ? product.image
        : "/images/" + (article?.image || "hero") + ".webp",
    type: article ? "article" : "website",
    noindex: !staticRoutes.includes(path) && !product,
  };
}
