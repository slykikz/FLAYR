import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ArrowUp, Square } from "lucide-react";
import { t, useLocale, localPath } from "./i18n";
import { api } from "./api";
type Message = { role: "user" | "assistant"; content: string };
export default function Assistant() {
  const locale = useLocale(),
    [open, setOpen] = useState(false),
    [ready, setReady] = useState<boolean>(),
    [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null),
    field = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (open) {
      api("/config")
        .then((c) => setReady(c.assistantReady))
        .catch(() => setReady(false));
      field.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
  function close() {
    setOpen(false);
    controller.current?.abort();
    trigger.current?.focus();
  }
  async function send() {
    if (!input.trim() || busy || !ready) return;
    const history = [
      ...messages,
      { role: "user" as const, content: input.trim() },
    ].slice(-9);
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 50000);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: abort.signal,
        body: JSON.stringify({
          locale,
          messages: history
            .filter((m) => m.content)
            .map((m) => ({ ...m, content: m.content.slice(0, 1500) })),
          paymentIntent:
            sessionStorage.getItem("flayr-payment-intent") || undefined,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(
          "O assistente está temporariamente indisponível. Contacta o apoio.",
        );
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        answer += done
          ? decoder.decode()
          : decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: answer }]);
        if (done) break;
      }
    } catch (err) {
      if (!abort.signal.aborted) setError((err as Error).message);
      else setError("Resposta interrompida. Podes tentar novamente.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <>
      <button
        ref={trigger}
        className="assistant-trigger"
        aria-label={t("Abrir assistente")}
        aria-expanded={open}
        aria-controls="flayr-assistant"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MessageCircle size={21} />
        <span>{t("Apoio")}</span>
      </button>
      {open && (
        <section
          id="flayr-assistant"
          role="dialog"
          aria-modal="false"
          aria-label={t("Assistente FLAYR")}
          className="assistant-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <header>
            <div>
              <span className="eyebrow lime-text">FLAYR ASSIST</span>
              <h2>{t("O QUE TE MOVE?")}</h2>
            </div>
            <button className="icon" onClick={close} aria-label={t("Fechar")}>
              <X />
            </button>
          </header>
          <p className="assistant-disclosure">
            {t(
              "Assistente de IA. Pode cometer erros. Não partilhes dados pessoais ou de pagamento. As mensagens são processadas pela OpenAI.",
            )}{" "}
            <a href={localPath("/legal/privacidade")}>{t("Privacidade")}</a>
          </p>
          <div
            className="assistant-messages"
            role="log"
            aria-label={t("Conversa")}
            aria-live="polite"
            aria-busy={busy}
          >
            {!messages.length && (
              <p>
                {t(
                  "Posso ajudar com produtos, envios e informações da loja. Para acompanhar uma compra, usa o mesmo navegador do checkout.",
                )}
              </p>
            )}
            {messages.map((m, i) => (
              <p className={"chat-" + m.role} key={i}>
                {m.content || t("A pensar…")}
              </p>
            ))}
            <div ref={end} />
          </div>
          {ready === false && (
            <p className="notice">
              {t(
                "O assistente está temporariamente indisponível. Contacta o apoio.",
              )}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={field}
              aria-label={t("A tua pergunta")}
              placeholder={t("A tua pergunta")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1500}
              disabled={ready === false}
            />
            {busy ? (
              <button
                type="button"
                aria-label={t("Parar resposta")}
                onClick={() => controller.current?.abort()}
              >
                <Square size={17} />
              </button>
            ) : (
              <button
                disabled={!ready || !input.trim()}
                aria-label={t("Enviar mensagem")}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </form>
          <a className="text-link" href={localPath("/contact")}>
            {t("Falar com a equipa")}
          </a>
        </section>
      )}
    </>
  );
}
