export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  image: number | string;
  tag: string;
  description: string;
  modelUrl?: string;
  translations?: { en?: { description?: string; tag?: string } };
  variants?: {
    id: string;
    size: string;
    stock: number;
    color: string;
    price: number;
    priorPrice?: number;
  }[];
  priorPrice?: number;
};
export const products: Product[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "velocity-01",
    name: "Velocity 01",
    category: "Running",
    price: 13900,
    image: 0,
    tag: "A tua próxima partida",
    description:
      "Uma nova perspetiva sobre o movimento. Malha técnica, linhas fluidas e uma silhueta que te acompanha da cidade ao próximo quilómetro.",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "mono-low",
    name: "Mono Low",
    category: "Streetwear",
    price: 11900,
    image: 1,
    tag: "Essencial, todos os dias",
    description:
      "Forma pura. Atitude sem esforço. Uma silhueta minimalista para o teu ritmo diário.",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "terra-90",
    name: "Terra 90",
    category: "Streetwear",
    price: 12900,
    image: 2,
    tag: "Nova perspetiva",
    description:
      "O espírito retro encontra uma expressão contemporânea. Tons profundos e volumes com personalidade.",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    slug: "trail-form",
    name: "Trail Form",
    category: "Running",
    price: 15900,
    image: 3,
    tag: "Para lá da cidade",
    description:
      "Uma silhueta exploratória inspirada nos caminhos que ainda não conheces.",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    slug: "midnight-01",
    name: "Midnight 01",
    category: "Basketball",
    price: 14900,
    image: 4,
    tag: "Midnight collection",
    description:
      "Presença em campo. Energia em cada detalhe. O primeiro capítulo da coleção Midnight.",
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    slug: "court-classic",
    name: "Court Classic",
    category: "Football",
    price: 9900,
    image: 5,
    tag: "O jogo é teu",
    description:
      "Uma homenagem às origens. Tons naturais e proporções clássicas para dentro e fora do campo.",
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    slug: "form-trainer",
    name: "Form Trainer",
    category: "Training",
    price: 12900,
    image: 6,
    tag: "Foco no próximo passo",
    description:
      "Uma interpretação essencial do treino. Perfil baixo, contraste subtil e liberdade de movimento.",
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    slug: "aero-elite",
    name: "Aero Elite",
    category: "Football",
    price: 17900,
    image: 7,
    tag: "Sem limites",
    description:
      "A velocidade ganha forma. Uma silhueta de performance com uma nova leitura do azul.",
  },
];
export const money = (cents: number) =>
  new Intl.NumberFormat(
    typeof location !== "undefined" && /^\/en(?:\/|$)/.test(location.pathname)
      ? "en-IE"
      : "pt-PT",
    { style: "currency", currency: "EUR" },
  ).format(cents / 100);
export const productStyle = (index: number | string) =>
  typeof index === "string"
    ? {
        backgroundImage: `url("${index}")`,
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : {
        backgroundImage: "url(/images/products.webp)",
        backgroundSize: "400% 200%",
        backgroundPosition: `${((index % 4) * 100) / 3}% ${index < 4 ? 0 : 100}%`,
      };
export const categories = [
  "Todos",
  "Running",
  "Streetwear",
  "Training",
  "Football",
  "Basketball",
];
