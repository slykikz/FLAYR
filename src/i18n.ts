import { useSyncExternalStore } from "react";
import en from "./locales/en.json";
export type Locale = "pt" | "en";
export const basePath = (path: string) =>
  path.replace(/^\/en(?=\/|\?|$)/, "") || "/";
export const getLocale = (): Locale =>
  typeof location !== "undefined" && /^\/en(?:\/|$)/.test(location.pathname)
    ? "en"
    : "pt";
const subscribe = (fn: () => void) => {
  window.addEventListener("popstate", fn);
  return () => window.removeEventListener("popstate", fn);
};
export const useLocale = () =>
  useSyncExternalStore(subscribe, getLocale, () => "pt" as Locale);
export const localPath = (path: string, locale: Locale = getLocale()) =>
  path.startsWith("/") && !path.startsWith("//")
    ? locale === "en"
      ? "/en" + (basePath(path) === "/" ? "" : basePath(path))
      : basePath(path)
    : path;
export function t(text: string, locale: Locale = getLocale()): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (locale !== "en") return text;
  const translated = (en as Record<string, string>)[normalized];
  if (translated)
    return (
      (text.match(/^\s*/)?.[0] || "") +
      translated +
      (text.match(/\s*$/)?.[0] || "")
    );
  const patterns: [RegExp, string][] = [
    [/^Saco, (\d+) artigos$/, "Bag, $1 items"],
    [/^Faltam (.+) para portes grátis\.$/, "Spend $1 more for free shipping."],
    [
      /^Encomendar com obrigação de pagar (.+)$/,
      "Place order with obligation to pay $1",
    ],
    [/^(Reduzir|Aumentar|Remover|Guardar|Ver|Cor|Preço) (.+)$/, ""],
    [/^(.+) — campanha FLAYR$/, "$1 — FLAYR campaign"],
  ];
  for (const [pattern, replacement] of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (replacement) return text.replace(pattern, replacement);
      const verbs: Record<string, string> = {
        Reduzir: "Decrease",
        Aumentar: "Increase",
        Remover: "Remove",
        Guardar: "Save",
        Ver: "View",
        Cor: "Colour",
        Preço: "Price",
      };
      return verbs[match[1]] + " " + match[2];
    }
  }
  return text;
}
export function setLocale(locale: Locale) {
  const params = new URLSearchParams(location.search);
  // Payment credentials must never be copied to another URL or analytics event.
  params.delete("payment_intent_client_secret");
  const query = params.toString();
  history.replaceState(
    null,
    "",
    localPath(location.pathname, locale) +
      (query ? "?" + query : "") +
      location.hash,
  );
  document.documentElement.lang = locale === "pt" ? "pt-PT" : "en";
  window.dispatchEvent(new PopStateEvent("popstate"));
}
