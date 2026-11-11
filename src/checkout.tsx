import { useState, useMemo, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Product, money } from "./catalog";
import { api } from "./api";
import { TERMS_VERSION, EU_COUNTRIES } from "../shared/commerce";
import { useLocale, localPath, t } from "./i18n";
import type { CartLine } from "./main";
function PaymentForm({ amount }: { amount: number }) {
  const stripe = useStripe(),
    elements = useElements();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false);
  return (
    <form
      className="checkout-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements || !accepted) return;
        setBusy(true);
        try {
          const result = await stripe.confirmPayment({
            elements,
            confirmParams: {
              return_url: location.origin + localPath("/payment-status"),
            },
          });
          if (result.error)
            setError(
              result.error.message || "Não foi possível confirmar o pagamento.",
            );
        } catch {
          setError(t("Não foi possível confirmar o pagamento."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <PaymentElement />
      <label className="consent-check">
        <input
          type="checkbox"
          checked={accepted}
          required
          onChange={(e) => setAccepted(e.target.checked)}
        />{" "}
        Li e aceito os termos e condições e a informação sobre livre resolução.
      </label>
      <p className="error" role="alert">
        {error}
      </p>
      <button disabled={!stripe || busy || !accepted} className="pill lime">
        {busy
          ? "A processar…"
          : `Encomendar com obrigação de pagar ${money(amount)}`}{" "}
        <LockKeyhole size={15} />
      </button>
    </form>
  );
}
export default function Checkout({
  cart,
  total,
  isDemo,
  onBack,
}: {
  cart: CartLine[];
  total: number;
  isDemo: boolean;
  onBack: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [payment, setPayment] = useState<{
      clientSecret: string;
      total: number;
      tax: number;
      shipping: number;
    } | null>(null);
  const locale = useLocale();
  const [config, setConfig] = useState<any>();
  const request = useRef({ body: "", key: crypto.randomUUID() });
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch(() => setConfig({ checkoutReady: false }));
  }, []);
  const stripePromise = useMemo(
    () =>
      config?.stripePublishableKey
        ? loadStripe(config.stripePublishableKey)
        : null,
    [config?.stripePublishableKey],
  );
  if (!cart.length)
    return (
      <div className="empty-page">
        <h1>O TEU SACO ESTÁ VAZIO.</h1>
        <button className="pill lime" onClick={onBack}>
          Explorar coleção
        </button>
      </div>
    );
  return (
    <section className="checkout-page">
      <button className="text-link" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar à coleção
      </button>
      <h1>O PRÓXIMO PASSO.</h1>
      <div className="checkout-layout">
        <div>
          {isDemo && (
            <div className="notice">
              Estás a explorar uma loja de demonstração. Os pagamentos estão
              desativados e não será feita qualquer cobrança.
            </div>
          )}
          {!isDemo && config && !config.checkoutReady && (
            <p className="notice">
              {t(
                "Os pagamentos estão temporariamente indisponíveis. Contacta o apoio.",
              )}
            </p>
          )}
          {config?.paymentMode === "test" && (
            <p className="notice">
              {t("Modo de teste Stripe. Usa apenas dados de teste.")}
            </p>
          )}
          {payment && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: payment.clientSecret,
                locale,
                appearance: {
                  theme: "night",
                  variables: {
                    colorPrimary: "#d6ff38",
                    colorBackground: "#18181b",
                    borderRadius: "4px",
                  },
                },
              }}
            >
              <PaymentForm amount={payment.total} />
            </Elements>
          ) : (
            <form
              className="checkout-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                if (isDemo || !stripePromise || !config?.checkoutReady) {
                  setError(
                    "Checkout real ainda indisponível. É necessário configurar o vendedor, o catálogo e os pagamentos.",
                  );
                  return;
                }
                setBusy(true);
                const form = new FormData(e.currentTarget);
                try {
                  const body = {
                    locale,
                    items: cart.map((l) => ({
                      productId: l.product.id,
                      variantId: l.variantId,
                      size: l.size,
                      quantity: l.quantity,
                    })),
                    email: form.get("email"),
                    address: {
                      name: form.get("name"),
                      line1: form.get("line1"),
                      city: form.get("city"),
                      postal_code: form.get("postal"),
                      country: form.get("country"),
                    },
                    vatId: form.get("vat") || undefined,
                    termsAccepted: form.get("terms") === "on",
                    termsVersion: TERMS_VERSION,
                  };
                  const fingerprint = JSON.stringify(body);
                  if (request.current.body !== fingerprint)
                    request.current = {
                      body: fingerprint,
                      key: crypto.randomUUID(),
                    };
                  const result = await api("/checkout", {
                    ...body,
                    idempotencyKey: request.current.key,
                  });
                  if (result.clientSecret) {
                    const intent = result.clientSecret.split("_secret_")[0];
                    sessionStorage.setItem("flayr-payment-intent", intent);
                    sessionStorage.setItem(
                      "flayr-purchase:" + intent,
                      JSON.stringify(body.items),
                    );
                  }
                  setPayment(result);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 style={{ fontSize: 28, marginTop: 25 }}>1. OS TEUS DADOS</h2>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Nome completo
                <input name="name" autoComplete="name" required />
              </label>
              <label>
                Morada
                <input name="line1" autoComplete="address-line1" required />
              </label>
              <div className="form-grid">
                <label>
                  Cidade
                  <input name="city" autoComplete="address-level2" required />
                </label>
                <label>
                  Código postal
                  <input name="postal" autoComplete="postal-code" required />
                </label>
              </div>
              <label>
                País
                <select name="country" defaultValue="PT">
                  {EU_COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {new Intl.DisplayNames(
                        [locale === "pt" ? "pt-PT" : "en"],
                        { type: "region" },
                      ).of(country)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                NIF / número de IVA (opcional)
                <input name="vat" placeholder="PT123456789" />
              </label>
              <p className="muted" style={{ fontSize: 11, lineHeight: 1.8 }}>
                Os métodos disponíveis dependem do país, moeda e elegibilidade.
                IVA e portes finais serão apresentados antes do pagamento.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <label className="consent-check">
                <input type="checkbox" name="terms" required /> Li e aceito os
                termos e condições e a informação de livre resolução. Versão{" "}
                {TERMS_VERSION}.
              </label>
              <button
                className="pill lime"
                disabled={busy || isDemo || !config?.checkoutReady}
              >
                {busy ? "A calcular…" : "Continuar para pagamento"}{" "}
                <LockKeyhole size={15} />
              </button>
            </form>
          )}
        </div>
        <aside className="order-review">
          <h2>O TEU SACO</h2>
          {cart.map((l) => (
            <div
              className="review-line"
              key={l.variantId || l.product.id + l.size}
            >
              <span>
                {l.product.name}
                <small>
                  EU {l.size} · Quantidade {l.quantity}
                </small>
              </span>
              <span>{money(l.product.price * l.quantity)}</span>
            </div>
          ))}
          <div className="review-line">
            <span>Portes</span>
            <span>{payment ? money(payment.shipping) : "A calcular"}</span>
          </div>
          <div className="review-line">
            <strong>{payment ? "Total" : "Subtotal indicativo"}</strong>
            <strong>{money(payment?.total || total)}</strong>
          </div>
          {payment && <p>IVA incluído: {money(payment.tax)}</p>}
          <p>
            Pagamentos seguros através da Stripe. Os dados do cartão são
            tratados diretamente pelo prestador de pagamentos.
          </p>
          <a className="text-link" href={localPath("/legal/termos")}>
            Termos e condições
          </a>
        </aside>
      </div>
    </section>
  );
}
