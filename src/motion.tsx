import { useEffect, useState } from "react";
import { Pause, Play, ArrowUpRight } from "lucide-react";
import { t, localPath } from "./i18n";
export function Announcement({ demo }: { demo: boolean }) {
  const [hidden, setHidden] = useState(false),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    let previous = window.scrollY;
    const scroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - previous) > 4 || y < 60) {
        setHidden(y > 60 && y > previous);
        previous = y;
      }
    };
    document.addEventListener("scroll", scroll, {
      passive: true,
      capture: true,
    });
    return () => {
      document.removeEventListener("scroll", scroll, true);
    };
  }, []);
  const message = t(
    demo
      ? "COLEÇÃO CONCEITO — DESCOBRE O UNIVERSO FLAYR"
      : "PORTES GRÁTIS A PARTIR DE 100 €",
  );
  return (
    <aside
      className={
        "announcement-ticker" +
        (hidden ? " ticker-hidden" : "") +
        (paused ? " ticker-paused" : "")
      }
      aria-label={t("Novidades")}
    >
      <a href={localPath("/shop")} className="ticker-window">
        <span className="ticker-track">
          {[0, 1].map((n) => (
            <span
              key={n}
              className="ticker-copy"
              aria-hidden={n === 1 ? true : undefined}
            >
              <span>{message}</span>
              <span className="ticker-separator" aria-hidden="true">
                ✳
              </span>
              <span>{t("O TEU RITMO. AS TUAS REGRAS.")}</span>
              <ArrowUpRight size={15} />
            </span>
          ))}
        </span>
      </a>
      <button
        className="ticker-control"
        onClick={() => setPaused(!paused)}
        aria-label={t(paused ? "Retomar animação" : "Pausar animação")}
        aria-pressed={paused}
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
    </aside>
  );
}
export function useReveal(path: string) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            observer.unobserve(e.target);
          }
      },
      { threshold: 0.08 },
    );
    const nodes = document.querySelectorAll(
      ".campaign-card,.manifesto,.section-heading,.feature,.journal-card",
    );
    nodes.forEach((n) => {
      n.classList.add("reveal");
      observer.observe(n);
    });
    return () => {
      observer.disconnect();
      nodes.forEach((n) => n.classList.remove("reveal"));
    };
  }, [path]);
}
