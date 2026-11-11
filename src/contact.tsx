import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Mail, Check } from "lucide-react";
import { api } from "./api";
import { t, useLocale, localPath } from "./i18n";
export default function Contact() {
  const locale = useLocale(),
    [config, setConfig] = useState<any>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  const submission = useRef({ body: "", id: crypto.randomUUID() });
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch(() => setConfig({ contactReady: false }));
  }, []);
  return (
    <section className="contact-page">
      <div className="contact-intro">
        <span className="eyebrow lime-text">FLAYR / SUPPORT STUDIO</span>
        <h1>{t("VAMOS FALAR.")}</h1>
        <p>
          {t(
            "Uma dúvida sobre a coleção, uma encomenda ou o teu próximo passo? Estamos por aqui.",
          )}
        </p>
        <nav className="support-links" aria-label={t("Informação de apoio")}>
          <a href={localPath("/legal/envios")}>
            {t("Envios e devoluções")} <ArrowUpRight size={17} />
          </a>
          <a href={localPath("/legal/resolucao")}>
            {t("Resolver contrato")} <ArrowUpRight size={17} />
          </a>
          <a href={localPath("/legal/contactos")}>
            {t("Identificação do vendedor")} <ArrowUpRight size={17} />
          </a>
        </nav>
        {config?.supportEmail && (
          <a className="support-mail" href={"mailto:" + config.supportEmail}>
            <Mail size={18} />
            {config.supportEmail}
          </a>
        )}
      </div>
      <div className="contact-panel">
        {reference ? (
          <div role="status">
            <Check size={32} />
            <h2>{t("MENSAGEM RECEBIDA.")}</h2>
            <p>{t("O teu pedido ficou registado para a equipa de apoio.")}</p>
            <small>
              {t("Referência")}: {reference}
            </small>
            <button className="text-link" onClick={() => setReference("")}>
              {t("Enviar outra mensagem")}
            </button>
          </div>
        ) : (
          <form
            className="checkout-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              const body = {
                name: f.get("name"),
                email: f.get("email"),
                subject: f.get("subject"),
                message: f.get("message"),
                consent: f.get("consent") === "on",
                website: f.get("website"),
                locale,
              };
              const fingerprint = JSON.stringify(body);
              if (fingerprint !== submission.current.body)
                submission.current = {
                  body: fingerprint,
                  id: crypto.randomUUID(),
                };
              try {
                const r = await api("/contact", {
                  ...body,
                  id: submission.current.id,
                });
                setReference(r.reference);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {config && !config.contactReady && (
              <p className="notice">
                {t("O formulário está temporariamente indisponível.")}
              </p>
            )}
            <label>
              {t("Nome")}
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={200}
              />
            </label>
            <label>
              {t("Assunto")}
              <select name="subject">
                <option value="product">{t("Produtos e tamanhos")}</option>
                <option value="order">{t("A minha encomenda")}</option>
                <option value="shipping">{t("Envios e devoluções")}</option>
                <option value="other">{t("Outro assunto")}</option>
              </select>
            </label>
            <label>
              {t("Mensagem")}
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={4000}
                rows={6}
              />
            </label>
            <label className="honeypot" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="consent-check">
              <input type="checkbox" name="consent" required />
              <span>
                {t(
                  "Li a política de privacidade para o tratamento deste pedido.",
                )}{" "}
                <a href={localPath("/legal/privacidade")}>{t("Privacidade")}</a>
              </span>
            </label>
            {error && (
              <p className="error" role="alert">
                {t(error)}
              </p>
            )}
            <button
              className="pill lime"
              disabled={busy || !config?.contactReady}
            >
              {t(busy ? "A enviar…" : "Enviar mensagem")}
              <ArrowUpRight size={17} />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
