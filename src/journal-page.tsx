import Manifesto from "../content/manifesto.mdx";
import Midnight from "../content/midnight.mdx";
import ManifestoEn from "../content/en/manifesto.mdx";
import MidnightEn from "../content/en/midnight.mdx";
import { editorial } from "../shared/seo";
import { t, useLocale, localPath } from "./i18n";
export default function Journal({
  path,
}: {
  path: string;
  navigate: (p: string) => void;
}) {
  const locale = useLocale(),
    slug = path.split("/")[2],
    article = editorial.find((a) => a.slug === slug);
  if (slug) {
    const Content =
      slug === "manifesto"
        ? locale === "en"
          ? ManifestoEn
          : Manifesto
        : locale === "en"
          ? MidnightEn
          : Midnight;
    return (
      <article className="journal-article">
        <a className="text-link" href={localPath("/blog")}>
          {t("← Voltar ao journal")}
        </a>
        {article ? (
          <>
            <div className="article-cover">
              <img
                src={"/images/" + article.image + ".webp"}
                alt={article.title[locale]}
                width="1536"
                height="1024"
              />
            </div>
            <p className="eyebrow lime-text">
              FLAYR JOURNAL · {article.minutes} {t("MIN DE LEITURA")}
            </p>
            <Content />
            <nav className="article-next" aria-label={t("Continuar a ler")}>
              {editorial
                .filter((a) => a.slug !== slug)
                .map((a) => (
                  <a
                    className="text-link"
                    key={a.slug}
                    href={localPath("/blog/" + a.slug)}
                  >
                    {a.title[locale]} ↗
                  </a>
                ))}
            </nav>
          </>
        ) : (
          <>
            <h1>{t("Artigo não encontrado.")}</h1>
            <p>{t("Explora as histórias no journal.")}</p>
          </>
        )}
      </article>
    );
  }
  return (
    <section className="journal-page">
      <span className="eyebrow lime-text">CULTURE / MOVEMENT / PEOPLE</span>
      <h1>THE FLAYR EDIT.</h1>
      <div className="journal-grid">
        {editorial.map((article) => (
          <a
            className="journal-card"
            key={article.slug}
            href={localPath("/blog/" + article.slug)}
          >
            <img
              src={"/images/" + article.image + ".webp"}
              alt={article.title[locale]}
              width="768"
              height="512"
              loading="lazy"
            />
            <span className="eyebrow">
              {article.slug.toUpperCase()} · {article.minutes}{" "}
              {t("MIN DE LEITURA")}
            </span>
            <h2>{article.title[locale]}</h2>
            <p>{article.description[locale]}</p>
            <span className="text-link">{t("Ler história")} ↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
