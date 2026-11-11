import { useState, useEffect } from "react";
import Terms from "../content/termos.mdx";
import Shipping from "../content/envios.mdx";
import Privacy from "../content/privacidade.mdx";
import Cookies from "../content/cookies.mdx";
import { api } from "./api";
import TermsEn from "../content/en/termos.mdx";
import ShippingEn from "../content/en/envios.mdx";
import PrivacyEn from "../content/en/privacidade.mdx";
import CookiesEn from "../content/en/cookies.mdx";
import { useLocale } from "./i18n";
export default function Legal({
  page,
  cookieSettings,
}: {
  page: string;
  cookieSettings: () => void;
}) {
  const [seller, setSeller] = useState<any>();
  const locale = useLocale();
  const TermsContent = locale === "en" ? TermsEn : Terms,
    ShippingContent = locale === "en" ? ShippingEn : Shipping,
    PrivacyContent = locale === "en" ? PrivacyEn : Privacy,
    CookiesContent = locale === "en" ? CookiesEn : Cookies;
  useEffect(() => {
    api("/config")
      .then((d) => setSeller(d.seller))
      .catch(() => {});
  }, []);
  return (
    <article className="legal-page">
      <span className="eyebrow lime-text">FLAYR / INFORMAÇÃO E APOIO</span>
      {["termos", "envios", "privacidade", "cookies"].includes(page) && (
        <p className="notice">
          Minuta para configuração. Os campos entre colchetes devem ser
          preenchidos com dados reais e os textos validados antes de abrir a
          loja.
        </p>
      )}
      {page === "termos" ? (
        <TermsContent />
      ) : page === "envios" ? (
        <ShippingContent />
      ) : page === "privacidade" ? (
        <PrivacyContent />
      ) : page === "cookies" ? (
        <>
          <CookiesContent />
          <button className="pill outline" onClick={cookieSettings}>
            Alterar preferências
          </button>
        </>
      ) : page === "contactos" ? (
        <>
          <h1>Estamos por aqui.</h1>
          <h2>Identificação do vendedor</h2>
          <p>
            {seller?.name || "[Denominação social]"}
            <br />
            NIF: {seller?.vat || "[NIF da empresa]"}
            <br />
            {seller?.address || "[Morada física completa]"}
          </p>
          <h2>Apoio ao cliente</h2>
          <p>
            {seller?.email || "[Email de apoio]"}
            <br />
            {seller?.phone || "[Número de telefone]"} —{" "}
            {seller?.phoneCost ||
              "[Chamada para a rede fixa nacional OU rede móvel nacional, conforme a linha]"}
          </p>
          <h2>Resolução alternativa de litígios</h2>
          <p>
            {seller?.adr ||
              "[Entidade RAL competente, morada, website e âmbito territorial a confirmar antes do lançamento]"}
          </p>
          <p>
            <a
              href="https://www.livroreclamacoes.pt/"
              target="_blank"
              rel="noreferrer"
            >
              Livro de Reclamações Eletrónico
            </a>
          </p>
        </>
      ) : page === "tamanhos" ? (
        <>
          <h1>Encontra o teu tamanho.</h1>
          <p>
            Mede o pé do calcanhar ao dedo mais comprido, em pé, e compara com a
            tabela específica do produto.
          </p>
          <p className="notice">
            A coleção apresentada é conceptual. A tabela de medidas definitiva
            será disponibilizada após os testes de ajuste dos produtos. Os
            tamanhos da demonstração não garantem correspondência com medidas
            reais.
          </p>
        </>
      ) : page === "resolucao" ? (
        <Withdrawal />
      ) : (
        <>
          <h1>Página não encontrada.</h1>
          <a href="/">Voltar ao início</a>
        </>
      )}
    </article>
  );
}
function Withdrawal() {
  const locale = useLocale();
  const [review, setReview] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <h1>Resolver contrato.</h1>
      <p>
        Podes comunicar aqui a tua decisão de exercer o direito de livre
        resolução. Esta funcionalidade não limita os outros meios indicados nos
        termos.
      </p>
      {receipt ? (
        <>
          <h2>Declaração recebida</h2>
          <p>
            Referência: {receipt.reference}
            <br />
            Data: {receipt.receivedAt}
          </p>
          <p>{receipt.message}</p>
          <button className="pill outline" onClick={() => window.print()}>
            Guardar comprovativo
          </button>
        </>
      ) : review ? (
        <>
          <h2>Confirma a tua declaração</h2>
          <p>
            {review.name} · {review.email}
            <br />
            Encomenda: {review.orderReference}
          </p>
          <p>{review.message}</p>
          <div className="button-row">
            <button className="pill outline" onClick={() => setReview(null)}>
              Corrigir
            </button>
            <button
              className="pill lime"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setReceipt(
                    await api("/withdrawals", {
                      ...review,
                      locale,
                      confirmed: true,
                    }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar resolução
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setReview(Object.fromEntries(f));
          }}
        >
          <label>
            Nome completo
            <input name="name" required minLength={2} />
          </label>
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Referência da encomenda
            <input name="orderReference" required minLength={4} />
          </label>
          <label>
            Declaração
            <textarea
              name="message"
              rows={5}
              required
              defaultValue="Comunico que pretendo resolver o contrato de compra dos bens da encomenda identificada acima."
            />
          </label>
          <button className="pill lime">Rever declaração</button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
