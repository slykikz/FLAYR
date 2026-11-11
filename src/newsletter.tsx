import { useState } from "react";
import { api } from "./api";
import { t, localPath, useLocale } from "./i18n";
export default function Newsletter({ unsubscribe }: { unsubscribe: boolean }) {
  const locale = useLocale(),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const token = new URLSearchParams(location.search).get("token");
  return (
    <section className="empty-page">
      <span className="eyebrow lime-text">FLAYR / NEWSLETTER</span>
      <h1>{t(unsubscribe ? "Cancelar subscrição" : "Confirmar subscrição")}</h1>
      {done ? (
        <p role="status">
          {t(unsubscribe ? "Subscrição cancelada." : "Subscrição confirmada.")}
        </p>
      ) : (
        <>
          <p>
            {t(
              unsubscribe
                ? "Confirma que pretendes deixar de receber a newsletter."
                : "Confirma que pretendes receber novidades da FLAYR por email.",
            )}
          </p>
          <button
            className="pill lime"
            disabled={busy || !token}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(
                  "/newsletter/" + (unsubscribe ? "unsubscribe" : "confirm"),
                  { token, locale },
                );
                setDone(true);
                history.replaceState(null, "", location.pathname);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(
              busy
                ? "A processar…"
                : unsubscribe
                  ? "Cancelar subscrição"
                  : "Confirmar subscrição",
            )}
          </button>
          {error && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}
        </>
      )}
      <a className="text-link" href={localPath("/")}>
        {t("Voltar ao início")}
      </a>
    </section>
  );
}
