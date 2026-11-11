import React, { useEffect, useState, useRef, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Search,
  ShoppingBag,
  Heart,
  Menu,
  X,
  Plus,
  Minus,
  Check,
  ChevronDown,
  Globe,
  Truck,
  ShieldCheck,
  RotateCcw,
  Box,
  SlidersHorizontal,
} from "lucide-react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./styles.css";
import {
  products as demoProducts,
  Product,
  money,
  productStyle,
  categories,
} from "./catalog";
import {
  useLocale,
  getLocale,
  setLocale,
  t,
  localPath,
  basePath,
} from "./i18n";
import { Announcement, useReveal } from "./motion";
import Assistant from "./assistant";
import { Seo } from "./seo";
import { subtractPurchased, type PurchasedLine } from "./cart";
import { api } from "./api";
import { ExitOffer, LiveViewers, PurchaseProof } from "./conversion";
const Viewer = lazy(() => import("./viewer"));
const Checkout = lazy(() => import("./checkout"));
const Admin = lazy(() => import("./admin"));
const Legal = lazy(() => import("./legal"));
const Newsletter = lazy(() => import("./newsletter"));
const Contact = lazy(() => import("./contact"));
const Journal = lazy(() => import("./journal"));
export type CartLine = {
  product: Product;
  size: string;
  quantity: number;
  variantId?: string;
  color?: string;
};
function useLocation() {
  const [path, setPath] = useState(
    basePath(location.pathname) + location.search,
  );
  useEffect(() => {
    const fn = () => setPath(basePath(location.pathname) + location.search);
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  const go = (url: string) => {
    history.pushState(null, "", localPath(url));
    setPath(url);
    window.scrollTo(0, 0);
  };
  return { path, go };
}
function Modal({
  children,
  onClose,
  label,
  drawer = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement;
    el?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? "dialog drawer" : "dialog"}
      aria-label={label}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <button className="icon close" aria-label="Fechar" onClick={onClose}>
          <X />
        </button>
        {children}
      </div>
    </dialog>
  );
}
function App() {
  const locale = useLocale();
  const { path, go } = useLocation();
  useReveal(path);
  const [products, setProducts] = useState(demoProducts);
  const [isDemo, setDemo] = useState(true);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("flayr-bag") || "[]");
      return Array.isArray(saved)
        ? saved
            .filter(
              (l) =>
                l?.product?.id &&
                typeof l.product.price === "number" &&
                typeof l.size === "string" &&
                Number.isInteger(l.quantity) &&
                l.quantity > 0 &&
                l.quantity <= 10,
            )
            .slice(0, 20)
        : [];
    } catch {
      return [];
    }
  });
  const [bag, setBag] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("flayr-favorites") || "[]");
      return Array.isArray(saved)
        ? saved.filter((x) => typeof x === "string").slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  const [cookie, setCookie] = useState(
    () => !localStorage.getItem("flayr-consent"),
  );
  const [consentSettings, setConsentSettings] = useState(false);
  const [newsletter, setNewsletter] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    api("/catalog")
      .then((data) => {
        if (Array.isArray(data.products) && !data.demo) {
          setProducts(data.products);
          setDemo(false);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    localStorage.setItem("flayr-bag", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    localStorage.setItem("flayr-favorites", JSON.stringify(favorites));
  }, [favorites]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const total = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const count = cart.reduce((s, l) => s + l.quantity, 0);
  const notify = (text: string) => setToast(text);
  const add = (product: Product, size: string, variantId?: string) => {
    const variant = product.variants?.find((v) => v.id === variantId);
    if (!isDemo && (!variant || variant.stock < 1)) {
      notify(t("Escolhe uma variante disponível."));
      return;
    }
    const selected = variant
      ? { ...product, price: variant.price, priorPrice: variant.priorPrice }
      : product;
    setCart((prev) => {
      const existing = prev.find(
        (l) =>
          l.product.id === product.id &&
          l.size === size &&
          l.variantId === variantId,
      );
      return existing
        ? prev.map((l) =>
            l === existing
              ? { ...l, quantity: Math.min(l.quantity + 1, 10) }
              : l,
          )
        : [
            ...prev,
            {
              product: selected,
              size,
              quantity: 1,
              variantId,
              color: variant?.color,
            },
          ];
    });
    setBag(true);
  };
  const fav = (id: string) =>
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const navigate = (url: string) => {
    setMenu(false);
    setSearch(false);
    setBag(false);
    go(url);
  };
  const consent = (allowed: boolean) => {
    localStorage.setItem(
      "flayr-consent",
      JSON.stringify({
        version: 1,
        analytics: allowed,
        marketing: allowed,
        at: new Date().toISOString(),
      }),
    );
    window.dispatchEvent(new Event("flayr-consent-change"));
    setCookie(false);
    setConsentSettings(false);
  };
  const shop = (cat = "Todos") =>
    navigate(
      "/shop" + (cat === "Todos" ? "" : "?category=" + encodeURIComponent(cat)),
    );
  const section = path.split("?")[0];
  const activeProduct = products.find((p) => section === "/product/" + p.slug);
  const footerLinks = [
    ["Explorar", "Running", "Streetwear", "Training", "Football", "Basketball"],
    [
      "Apoio",
      "Envios e devoluções",
      "Guia de tamanhos",
      "Resolver contrato",
      "Contactos",
    ],
    ["FLAYR", "O nosso manifesto", "Journal", "Privacidade", "Cookies"],
  ];
  return (
    <>
      <Seo path={path} product={activeProduct} demo={isDemo} />
      <a className="skip" href="#main">
        Saltar para o conteúdo
      </a>
      <div className="utility">
        <span>BUILT FOR MOVEMENT. MADE FOR YOU.</span>
        <div>
          <button onClick={() => navigate("/contact")}>Ajuda</button>
          <i />
          <button onClick={() => navigate("/admin")}>Área da equipa</button>
          <i />
          <span>{locale.toUpperCase()} / EUR</span>
        </div>
      </div>
      <header className="header bg-zinc-950/80 backdrop-blur-md">
        <button
          className="wordmark"
          aria-label="FLAYR início"
          onClick={() => navigate("/")}
        >
          FLAYR<span>®</span>
        </button>
        <nav aria-label="Navegação principal">
          <button onClick={() => shop()}>Novidades</button>
          <button onClick={() => shop("Running")}>Running</button>
          <button onClick={() => shop("Streetwear")}>Streetwear</button>
          <button onClick={() => shop("Training")}>Training</button>
          <button onClick={() => shop("Football")}>Football</button>
          <button className="lime-text" onClick={() => navigate("/blog")}>
            The FLAYR edit <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-actions">
          <label className="language-switch">
            <Globe size={15} />
            <span className="sr-only">{t("Idioma")}</span>
            <select
              aria-label={t("Idioma")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as "pt" | "en")}
            >
              <option value="pt">PT</option>
              <option value="en">EN</option>
            </select>
          </label>
          <button
            className="search-trigger"
            aria-label="Pesquisar"
            onClick={() => setSearch(true)}
          >
            <Search size={17} />
            <span>Pesquisar</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="icon"
            aria-label="Favoritos"
            onClick={() => navigate("/favorites")}
          >
            <Heart size={21} />
            {favorites.length > 0 && <b className="dot" />}
          </button>
          <button
            className="icon"
            aria-label={`Saco, ${count} artigos`}
            onClick={() => setBag(true)}
          >
            <ShoppingBag size={21} />
            {count > 0 && <b className="badge">{count}</b>}
          </button>
          <button
            className="icon mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <Announcement demo={isDemo} />
      <main id="main">
        {section === "/" && (
          <>
            <section className="hero">
              <img
                src="/images/hero.webp"
                alt="Quatro atletas em movimento, numa campanha FLAYR de treino e corrida"
                fetchPriority="high"
              />
              <div className="hero-index">
                <span>01 / 04 — THE MOVEMENT COLLECTION</span>
                <span>
                  EST. 2026 <span className="small-cross">✳</span>
                </span>
              </div>
            </section>
            <section className="hero-copy">
              <div className="eyebrow">
                <span className="pulse-dot" /> O TEU RITMO. AS TUAS REGRAS.
              </div>
              <h1>
                MOVE BEYOND <em>LIMITS.</em>
              </h1>
              <p>
                Não nascemos para ficar parados. Encontra a tua próxima versão.
              </p>
              <div className="button-row">
                <button className="pill lime" onClick={() => shop()}>
                  Comprar agora <ArrowUpRight size={16} />
                </button>
                <button
                  className="pill outline"
                  onClick={() =>
                    document
                      .getElementById("collections")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Explorar a coleção
                </button>
              </div>
            </section>
            <section className="collections" id="collections">
              <div className="section-line">
                <span>ENCONTRA O TEU MOVIMENTO</span>
                <span>PERFORMANCE / CULTURE / EVERYDAY</span>
              </div>
              <div className="bento">
                {[
                  {
                    category: "Running",
                    tag: "URBAN RUNNING",
                    name: "A CIDADE É A TUA PISTA.",
                    sub: "Velocity 01. Cada dia, mais longe.",
                    position: "0% 0%",
                  },
                  {
                    category: "Streetwear",
                    tag: "THE EVERYDAY EDIT",
                    name: "ATITUDE EM CADA PASSO.",
                    sub: "Novos tons. A mesma autenticidade.",
                    position: "100% 0%",
                  },
                  {
                    category: "Training",
                    tag: "HIGH-PERFORMANCE",
                    name: "FEITO PARA IR ALÉM.",
                    sub: "O teu próximo nível começa aqui.",
                    position: "0% 100%",
                  },
                  {
                    category: "Football",
                    tag: "THE BEAUTIFUL GAME",
                    name: "IMPOSSÍVEL DE CONTER.",
                    sub: "Aero Elite. Liberta o teu jogo.",
                    position: "100% 100%",
                  },
                ].map((c, i) => (
                  <article
                    className={"campaign campaign-" + i}
                    key={c.category}
                  >
                    <div
                      className="campaign-image"
                      role="img"
                      aria-label={c.category + " — campanha FLAYR"}
                      style={{ backgroundPosition: c.position }}
                    />
                    <div className="campaign-shade" />
                    <div className="campaign-number">
                      0{i + 1} <ArrowUpRight size={18} />
                    </div>
                    <div className="campaign-copy">
                      <span className="eyebrow">{c.tag}</span>
                      <h2>{c.name}</h2>
                      <p>{c.sub}</p>
                      <button
                        className="pill white"
                        onClick={() => shop(c.category)}
                      >
                        Explorar {c.category} <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="feature">
              <img
                src="/images/feature.webp"
                loading="lazy"
                alt="Atleta de basquetebol com sapatilhas lima num campo iluminado à noite"
              />
              <div className="feature-copy">
                <span className="eyebrow lime-text">AFTER HOURS. ALL IN.</span>
                <h2>
                  MIDNIGHT 01.
                  <br />
                  <em>OWN THE NIGHT.</em>
                </h2>
                <p>Quando as luzes baixam, o teu jogo sobe.</p>
                <div className="button-row">
                  <button
                    className="pill lime"
                    onClick={() => navigate("/product/midnight-01")}
                  >
                    Descobrir o drop <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="pill outline"
                    onClick={() => navigate("/blog/midnight")}
                  >
                    A história
                  </button>
                </div>
              </div>
              <span className="feature-corner">FLAYR BASKETBALL / 001</span>
            </section>
            <section className="icons-section">
              <div className="eyebrow">NOVA ENERGIA. FUTUROS CLÁSSICOS.</div>
              <h2>
                ENCONTRA OS TEUS <em>ÍCONES.</em>
              </h2>
              <div className="icons-grid">
                {products.map((p) => (
                  <button
                    className="icon-product"
                    key={p.id}
                    onClick={() => navigate("/product/" + p.slug)}
                  >
                    <div className="shoe-image" style={productStyle(p.image)} />
                    <strong>{p.name}</strong>
                    <span>
                      {p.category} <ArrowUpRight size={12} />
                    </span>
                  </button>
                ))}
              </div>
              <button className="text-link" onClick={() => shop()}>
                Ver toda a coleção <ArrowRight size={16} />
              </button>
            </section>
            <section className="manifesto">
              <span className="eyebrow">THIS IS FLAYR.</span>
              <p>
                O movimento não tem uma só forma.
                <br />
                Tem a <em>tua.</em>
              </p>
              <button
                className="circle-button"
                onClick={() => navigate("/blog/manifesto")}
                aria-label="Ler manifesto"
              >
                <ArrowUpRight size={32} />
              </button>
            </section>
          </>
        )}
        {(section === "/shop" || section === "/favorites") && (
          <Catalog
            products={products}
            favorites={favorites}
            fav={fav}
            navigate={navigate}
            path={path}
          />
        )}
        {activeProduct && (
          <ProductPage
            key={activeProduct.id}
            product={activeProduct}
            onAdd={add}
            fav={() => fav(activeProduct.id)}
            favorite={favorites.includes(activeProduct.id)}
            isDemo={isDemo}
          />
        )}
        {section === "/checkout" && (
          <Suspense fallback={<Loading />}>
            <Checkout
              cart={cart}
              total={total}
              isDemo={isDemo}
              onBack={() => shop()}
            />
          </Suspense>
        )}
        {section === "/payment-status" && (
          <PaymentStatus
            clearCart={(purchased) =>
              setCart((current) => subtractPurchased(current, purchased))
            }
          />
        )}
        {section === "/contact" && (
          <Suspense fallback={<Loading />}>
            <Contact />
          </Suspense>
        )}
        {section.startsWith("/newsletter/") && (
          <Suspense fallback={<Loading />}>
            <Newsletter unsubscribe={section === "/newsletter/unsubscribe"} />
          </Suspense>
        )}
        {section === "/admin" && (
          <Suspense fallback={<Loading />}>
            <Admin />
          </Suspense>
        )}
        {section.startsWith("/legal/") && (
          <Suspense fallback={<Loading />}>
            <Legal
              page={section.split("/")[2]}
              cookieSettings={() => {
                setCookie(true);
                setConsentSettings(true);
              }}
            />
          </Suspense>
        )}
        {(section === "/blog" || section.startsWith("/blog/")) && (
          <Suspense fallback={<Loading />}>
            <Journal path={section} navigate={navigate} />
          </Suspense>
        )}
        {![
          "/",
          "/shop",
          "/favorites",
          "/contact",
          "/checkout",
          "/payment-status",
          "/admin",
        ].includes(section) &&
          !activeProduct &&
          !section.startsWith("/legal/") &&
          !(section === "/blog" || section.startsWith("/blog/")) &&
          !section.startsWith("/newsletter/") && (
            <div className="empty-page">
              <h1>Fora de pista.</h1>
              <p>Esta página não existe.</p>
              <button className="pill lime" onClick={() => navigate("/")}>
                Voltar ao início
              </button>
            </div>
          )}
      </main>
      <footer>
        <section className="newsletter">
          <div>
            <span className="eyebrow lime-text">STAY IN MOTION.</span>
            <h2>O PRÓXIMO PASSO É TEU.</h2>
            <p>Novos drops, histórias e inspiração. No teu email.</p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setNewsletterMessage("A enviar…");
              try {
                await api("/newsletter", { email: newsletter, consent: true });
                setNewsletterMessage(
                  "Verifica o teu email para confirmar a subscrição.",
                );
                setNewsletter("");
              } catch (err) {
                setNewsletterMessage((err as Error).message);
              }
            }}
          >
            <div className="email-field">
              <input
                aria-label="O teu email"
                type="email"
                required
                value={newsletter}
                onChange={(e) => setNewsletter(e.target.value)}
                placeholder="O teu endereço de email"
              />
              <button aria-label="Subscrever newsletter">
                <ArrowRight size={24} />
              </button>
            </div>
            <label className="consent-check">
              <input type="checkbox" required /> Quero receber novidades e li a
              política de privacidade.
            </label>
            <p className="form-note" role="status">
              {newsletterMessage}
            </p>
          </form>
        </section>
        <div className="footer-main">
          <div className="footer-brand">
            <button className="wordmark" onClick={() => navigate("/")}>
              FLAYR<span>®</span>
            </button>
            <p>Move beyond limits.</p>
            <span className="eyebrow">LISBON MINDSET. EVERYWHERE ENERGY.</span>
          </div>
          {footerLinks.map((column) => (
            <div className="footer-column" key={column[0]}>
              <h3>{column[0]}</h3>
              {column.slice(1).map((link) => (
                <button
                  key={link}
                  onClick={() => {
                    if (categories.includes(link)) shop(link);
                    else
                      navigate(
                        (
                          {
                            "Envios e devoluções": "/legal/envios",
                            "Guia de tamanhos": "/legal/tamanhos",
                            "Resolver contrato": "/legal/resolucao",
                            Contactos: "/contact",
                            "O nosso manifesto": "/blog/manifesto",
                            Journal: "/blog",
                            Privacidade: "/legal/privacidade",
                            Cookies: "/legal/cookies",
                          } as Record<string, string>
                        )[link],
                      );
                  }}
                >
                  {link}
                </button>
              ))}
            </div>
          ))}
          <div className="footer-column">
            <h3>
              Portugal <Globe size={14} />
            </h3>
            <span>Português / EUR €</span>
            <a
              href="https://www.livroreclamacoes.pt/"
              target="_blank"
              rel="noreferrer"
            >
              Livro de Reclamações <ArrowUpRight size={12} />
            </a>
            <button onClick={() => navigate("/legal/contactos")}>
              Resolução de litígios
            </button>
          </div>
        </div>
        <div className="legal-identity">
          {isDemo ? (
            "Loja de demonstração. Produtos e imagens conceptuais. Pagamentos reais desativados. Identificação do vendedor e entidade RAL pendentes de configuração."
          ) : (
            <SellerIdentity />
          )}
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} FLAYR. Todos os direitos reservados.
          </span>
          <div>
            <button onClick={() => navigate("/legal/termos")}>
              Termos e condições
            </button>
            <button onClick={() => navigate("/legal/privacidade")}>
              Privacidade
            </button>
            <button
              onClick={() => {
                setCookie(true);
                setConsentSettings(true);
              }}
            >
              Preferências de cookies
            </button>
          </div>
          <span className="payment-wordmarks">VISA　 mastercard</span>
        </div>
      </footer>
      {section !== "/admin" && <Assistant />}
      {bag && (
        <Modal label="O teu saco" drawer onClose={() => setBag(false)}>
          <div className="drawer-head">
            <span className="eyebrow">O TEU PRÓXIMO MOVIMENTO</span>
            <h2>
              O TEU SACO <sup>({count})</sup>
            </h2>
          </div>
          {cart.length ? (
            <>
              <div className="shipping-progress">
                <Truck size={17} />
                <span>
                  {total >= 10000
                    ? isDemo
                      ? "Portes de demonstração: grátis."
                      : "Portes grátis nesta encomenda."
                    : `Faltam ${money(10000 - total)} para portes grátis.`}
                </span>
                <progress value={Math.min(total, 10000)} max={10000} />
              </div>
              <div className="cart-lines">
                {cart.map((l, i) => (
                  <div
                    className="cart-line"
                    key={l.variantId || l.product.id + l.size}
                  >
                    <div
                      className="cart-image"
                      style={productStyle(l.product.image)}
                    />
                    <div>
                      <h3>{l.product.name}</h3>
                      <p>
                        {l.product.category} · EU {l.size}{" "}
                        {l.color && " · " + l.color}
                      </p>
                      <strong>{money(l.product.price * l.quantity)}</strong>
                      <div className="quantity">
                        <button
                          aria-label={"Reduzir " + l.product.name}
                          onClick={() =>
                            setCart((prev) =>
                              prev.flatMap((item, n) =>
                                n !== i
                                  ? [item]
                                  : item.quantity > 1
                                    ? [{ ...item, quantity: item.quantity - 1 }]
                                    : [],
                              ),
                            )
                          }
                        >
                          <Minus size={12} />
                        </button>
                        <span>{l.quantity}</span>
                        <button
                          aria-label={"Aumentar " + l.product.name}
                          disabled={l.quantity >= 10}
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((item, n) =>
                                n === i
                                  ? {
                                      ...item,
                                      quantity: Math.min(10, item.quantity + 1),
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <button
                      className="icon"
                      aria-label={"Remover " + l.product.name}
                      onClick={() =>
                        setCart((prev) => prev.filter((_, n) => n !== i))
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <a className="cross-sell" href={localPath("/shop")}>
                {t("Descobrir mais peças")} <ArrowUpRight size={18} />
              </a>
              <div className="cart-summary">
                <div>
                  <span>Subtotal</span>
                  <strong>{money(total)}</strong>
                </div>
                <p>IVA e portes confirmados no checkout.</p>
                <button
                  className="pill lime full"
                  onClick={() => navigate("/checkout")}
                >
                  Continuar para checkout <ArrowRight size={17} />
                </button>
                <button className="text-link" onClick={() => setBag(false)}>
                  Continuar a explorar
                </button>
              </div>
            </>
          ) : (
            <div className="empty-bag">
              <ShoppingBag size={42} />
              <h3>À espera do teu próximo passo.</h3>
              <p>Descobre os teus novos essenciais.</p>
              <button className="pill lime" onClick={() => shop()}>
                Explorar coleção
              </button>
            </div>
          )}
        </Modal>
      )}
      {search && (
        <Modal label="Pesquisar produtos" onClose={() => setSearch(false)}>
          <h2>O QUE TE MOVE?</h2>
          <div className="search-field">
            <Search />
            <input
              autoFocus
              placeholder="Pesquisa produtos, categorias…"
              aria-label="Pesquisar produtos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="search-results">
            {products
              .filter((p) =>
                (p.name + " " + p.category)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate("/product/" + p.slug)}
                >
                  <div className="cart-image" style={productStyle(p.image)} />
                  <span>
                    {p.name}
                    <small>{p.category}</small>
                  </span>
                  <span>{money(p.price)}</span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            {!products.some((p) =>
              (p.name + " " + p.category)
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && <p>Não encontrámos resultados. Experimenta “Running”.</p>}
          </div>
        </Modal>
      )}
      {menu && (
        <Modal label="Menu" drawer onClose={() => setMenu(false)}>
          <h2>EXPLORAR</h2>
          {categories.map((c) => (
            <button className="mobile-nav-link" key={c} onClick={() => shop(c)}>
              {c}
              <ArrowUpRight />
            </button>
          ))}
          <button className="mobile-nav-link" onClick={() => navigate("/blog")}>
            Journal <ArrowUpRight />
          </button>
        </Modal>
      )}
      {cookie && (
        <aside className="cookie-banner" aria-label="Preferências de cookies">
          <div>
            <span className="eyebrow">A TUA PRIVACIDADE, A TUA ESCOLHA.</span>
            <p>
              Usamos armazenamento essencial para o saco e as tuas preferências.
              {consentSettings
                ? " Podes permitir ou recusar categorias opcionais. Não existem serviços de rastreio opcionais ativos nesta demonstração."
                : " Cookies opcionais só com o teu consentimento."}{" "}
              <button onClick={() => navigate("/legal/cookies")}>
                Saber mais
              </button>
            </p>
          </div>
          <div className="cookie-actions">
            <button onClick={() => consent(false)}>Rejeitar opcionais</button>
            <button onClick={() => consent(true)}>Aceitar opcionais</button>
            <button
              className="settings"
              onClick={() => setConsentSettings(!consentSettings)}
            >
              Personalizar
            </button>
          </div>
        </aside>
      )}
      <ExitOffer navigate={navigate} />
      <PurchaseProof />
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </>
  );
}
function Catalog({
  products,
  favorites,
  fav,
  navigate,
  path,
}: {
  products: Product[];
  favorites: string[];
  fav: (id: string) => void;
  navigate: (p: string) => void;
  path: string;
}) {
  const current =
    new URLSearchParams(path.split("?")[1]).get("category") || "Todos";
  const [sort, setSort] = useState("featured");
  let shown = products.filter(
    (p) =>
      (current === "Todos" || p.category === current) &&
      (!path.startsWith("/favorites") || favorites.includes(p.id)),
  );
  if (sort === "low") shown = [...shown].sort((a, b) => a.price - b.price);
  if (sort === "high") shown = [...shown].sort((a, b) => b.price - a.price);
  return (
    <section className="catalog-page">
      <div className="eyebrow">FLAYR / THE MOVEMENT COLLECTION</div>
      <h1>
        {path.startsWith("/favorites")
          ? "OS TEUS FAVORITOS."
          : current === "Todos"
            ? "O TEU PRÓXIMO PASSO."
            : current.toUpperCase() + "."}
      </h1>
      <div className="catalog-toolbar">
        <div className="filters">
          {categories.map((c) => (
            <button
              key={c}
              className={c === current ? "selected" : ""}
              onClick={() =>
                navigate("/shop" + (c === "Todos" ? "" : "?category=" + c))
              }
            >
              {c}
            </button>
          ))}
        </div>
        <label>
          <SlidersHorizontal size={15} />
          <select
            aria-label="Ordenar produtos"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="featured">Em destaque</option>
            <option value="low">Preço: menor primeiro</option>
            <option value="high">Preço: maior primeiro</option>
          </select>
        </label>
      </div>
      <p className="muted">{shown.length} artigos</p>
      <div className="product-grid">
        {shown.map((p) => (
          <article className="product-card" key={p.id}>
            <button
              className="product-visual"
              onClick={() => navigate("/product/" + p.slug)}
              aria-label={"Ver " + p.name}
            >
              <div className="shoe-image" style={productStyle(p.image)} />
              <span>
                DESCOBRIR <ArrowUpRight size={15} />
              </span>
            </button>
            <button
              className={
                "icon favorite " + (favorites.includes(p.id) ? "active" : "")
              }
              aria-label={"Guardar " + p.name}
              onClick={() => fav(p.id)}
            >
              <Heart
                size={19}
                fill={favorites.includes(p.id) ? "currentColor" : "none"}
              />
            </button>
            <div className="product-info">
              <div>
                <span className="lime-text">
                  {getLocale() === "en"
                    ? p.translations?.en?.tag || t(p.tag)
                    : p.tag}
                </span>
                <h2>{p.name}</h2>
                <p>{p.category}</p>
              </div>
              <strong>{money(p.price)}</strong>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="empty-page">
          <Heart size={36} />
          <h2>Ainda sem favoritos.</h2>
          <p>Guarda as peças que mais te inspiram.</p>
        </div>
      )}
    </section>
  );
}
function ProductPage({
  product: p,
  onAdd,
  fav,
  favorite,
  isDemo,
}: {
  product: Product;
  onAdd: (p: Product, size: string, variantId?: string) => void;
  fav: () => void;
  favorite: boolean;
  isDemo: boolean;
}) {
  const [size, setSize] = useState("");
  const [selectedColor, setSelectedColor] = useState(
    p.variants?.[0]?.color || "",
  );
  const selectedVariant = p.variants?.find(
    (v) => v.size === size && v.color === selectedColor,
  );
  const displayPrice = selectedVariant?.price ?? p.price;
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(false);
  const [color, setColor] = useState("#d6ff38");
  const [texture, setTexture] = useState<"mesh" | "smooth">("mesh");
  const sizes = p.variants?.length
    ? [
        ...new Set(
          p.variants
            .filter((v) => v.color === selectedColor)
            .map((v) => v.size),
        ),
      ]
    : ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];
  const add = () => {
    if (!size) {
      setError("Escolhe o teu tamanho para continuar.");
      return;
    }
    if (p.variants?.length && (!selectedVariant || selectedVariant.stock < 1)) {
      setError(t("Escolhe uma variante disponível."));
      return;
    }
    onAdd(p, size, selectedVariant?.id);
  };
  return (
    <section className="product-page">
      <div className="product-gallery">
        {viewer ? (
          <Suspense fallback={<Loading />}>
            <Viewer modelUrl={p.modelUrl} color={color} texture={texture} />
          </Suspense>
        ) : (
          <div
            className="large-shoe"
            role="img"
            aria-label={p.name}
            style={productStyle(p.image)}
          />
        )}
        <button
          className="viewer-toggle pill outline"
          onClick={() => setViewer(!viewer)}
        >
          <Box size={17} />
          {viewer ? "Ver fotografia" : "Explorar em 3D"}
        </button>
        {viewer && (
          <div className="viewer-controls">
            <span>
              {p.modelUrl
                ? "Arrasta para rodar · scroll para ampliar"
                : "Modelo conceptual · arrasta para rodar"}
            </span>
            <div>
              {["#d6ff38", "#ddd9ce", "#7a2438", "#171719"].map((c) => (
                <button
                  key={c}
                  aria-label={"Cor " + c}
                  aria-pressed={color === c}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <select
              aria-label="Acabamento 3D"
              value={texture}
              onChange={(e) => setTexture(e.target.value as any)}
            >
              <option value="mesh">Malha</option>
              <option value="smooth">Liso</option>
            </select>
          </div>
        )}
      </div>
      <div className="product-detail">
        <span className="eyebrow lime-text">
          {getLocale() === "en" ? p.translations?.en?.tag || t(p.tag) : p.tag}
        </span>
        <h1>{p.name}</h1>
        <p className="muted">
          Sapatilhas de {p.category.toLowerCase()} · Unissexo
        </p>
        <div className="detail-price">
          {money(displayPrice)}
          {selectedVariant?.priorPrice && (
            <small>
              Preço mais baixo nos 30 dias anteriores à promoção:{" "}
              {money(selectedVariant?.priorPrice)}
            </small>
          )}
        </div>
        <p>
          {getLocale() === "en"
            ? p.translations?.en?.description || t(p.description)
            : p.description}
        </p>
        <LiveViewers productId={p.id} />
        {!!p.variants?.length && (
          <label className="variant-color">
            {t("Cor")}
            <select
              value={selectedColor}
              onChange={(e) => {
                setSelectedColor(e.target.value);
                setSize("");
              }}
            >
              {[...new Set(p.variants.map((v) => v.color))].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="size-label">
          <strong>Seleciona o teu tamanho</strong>
          <a href="/legal/tamanhos">Guia de tamanhos</a>
        </div>
        <div className="sizes">
          {sizes.map((s) => (
            <button
              key={s}
              className={size === s ? "selected" : ""}
              disabled={
                p.variants?.length
                  ? !p.variants.some(
                      (v) =>
                        v.size === s &&
                        v.color === selectedColor &&
                        v.stock > 0,
                    )
                  : false
              }
              onClick={() => {
                setSize(s);
                setError("");
              }}
            >
              EU {s}
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="add-row">
          <button className="pill lime full" onClick={add}>
            Adicionar ao saco <ShoppingBag size={18} />
          </button>
          <button
            className="heart-button"
            aria-label="Guardar favorito"
            onClick={fav}
          >
            <Heart fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>
        {isDemo && (
          <p className="demo-note">
            Produto conceptual. Preço e tamanhos de demonstração.
          </p>
        )}
        <div className="product-benefits">
          <span>
            <Truck />
            Portes calculados no checkout
          </span>
          <span>
            <RotateCcw />
            14 dias para livre resolução
          </span>
          <span>
            <ShieldCheck />
            Pagamento através da Stripe
          </span>
        </div>
        <details open>
          <summary>
            Design e detalhes <Plus size={14} />
          </summary>
          <p>
            {isDemo
              ? "Esta coleção explora a linguagem visual da FLAYR. Materiais, características técnicas e instruções de cuidado finais serão confirmados na ficha do produto comercial."
              : p.description}
          </p>
        </details>
        <details>
          <summary>
            Envios e devoluções <Plus size={14} />
          </summary>
          <p>
            Consulta custos, prazos e o formulário de livre resolução na nossa{" "}
            <a href="/legal/envios">política de envios e devoluções</a>.
          </p>
        </details>
      </div>
      <div className="sticky-add">
        <div>
          <strong>{p.name}</strong>
          <span>
            {money(displayPrice)}
            {size ? " · EU " + size : ""}
          </span>
        </div>
        <button className="pill lime" onClick={add}>
          Adicionar ao saco <Plus size={16} />
        </button>
      </div>
    </section>
  );
}
function SellerIdentity() {
  const [data, setData] = useState<any>();
  useEffect(() => {
    api("/config")
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    <span>
      {data?.seller?.name} · NIF {data?.seller?.vat} · {data?.seller?.address} ·{" "}
      {data?.seller?.phone} ({data?.seller?.phoneCost}) · RAL:{" "}
      {data?.seller?.adr}
    </span>
  );
}
function PaymentStatus({
  clearCart,
}: {
  clearCart: (purchased: PurchasedLine[]) => void;
}) {
  const [state, setState] = useState("A verificar o estado da encomenda…");
  const clear = useRef(clearCart);
  clear.current = clearCart;
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id =
      params.get("payment_intent") ||
      sessionStorage.getItem("flayr-payment-intent") ||
      "";
    if (id) sessionStorage.setItem("flayr-payment-intent", id);
    if (params.has("payment_intent_client_secret")) {
      params.delete("payment_intent_client_secret");
      history.replaceState(
        null,
        "",
        location.pathname + "?" + params.toString(),
      );
    }
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      attempts = 0;
    async function poll() {
      try {
        const d = await api(
          "/orders/status?payment_intent=" + encodeURIComponent(id),
        );
        if (stopped) return;
        if (["paid", "shipped"].includes(d.status)) {
          const snapshotKey = "flayr-purchase:" + id;
          const snapshot = sessionStorage.getItem(snapshotKey);
          if (snapshot) {
            try {
              const purchased = JSON.parse(snapshot);
              if (Array.isArray(purchased)) clear.current(purchased);
            } catch {}
            sessionStorage.removeItem(snapshotKey);
          }
          setState("Pagamento confirmado. Obrigado por escolheres a FLAYR.");
          return;
        }
        if (d.status === "cancelled") {
          setState("A encomenda foi cancelada. O pagamento não foi concluído.");
          return;
        }
        setState(
          "O pagamento está a ser processado. A confirmação será enviada por email.",
        );
        if (++attempts < 12) timer = setTimeout(poll, 3000);
      } catch {
        if (!stopped)
          setState(
            "Não foi possível confirmar agora. Não repitas o pagamento; verifica o teu email ou contacta o apoio.",
          );
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="empty-page">
      <ShieldCheck size={40} />
      <h1>{t("O TEU PRÓXIMO PASSO.")}</h1>
      <p role="status">{t(state)}</p>
      <a className="pill outline" href={localPath("/contact")}>
        {t("Falar com a equipa")}
      </a>
    </div>
  );
}
export function Loading() {
  return <div className="loading">A preparar o teu próximo movimento…</div>;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
