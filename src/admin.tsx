import { useEffect, useState } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import DOMPurify from "dompurify";
import { api } from "./api";
import { money } from "./catalog";
import { LockKeyhole, Download, LogOut, KeyRound } from "lucide-react";
export default function Admin() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mfa, setMfa] = useState(false),
    [factors, setFactors] = useState<any[]>([]),
    [enrollment, setEnrollment] = useState<any>(null),
    [tab, setTab] = useState("orders");
  async function refresh() {
    try {
      setData(await api("/admin"));
      setError("");
    } catch {
      setData(null);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const afterLogin = async () => {
    setMfa(true);
    const d = await api("/auth/factors");
    setFactors(d.factors);
  };
  return (
    <section className="admin-page">
      <span className="eyebrow lime-text">FLAYR / BACKOFFICE</span>
      <h1>COMMAND CENTRE.</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <div className="admin-login">
          <div className="notice">
            <LockKeyhole size={22} />
            <p>
              Acesso reservado à equipa. É necessária uma conta autorizada e
              verificação em dois passos. Liga o Supabase para ativar esta área.
            </p>
          </div>
          {!mfa ? (
            <>
              <form
                className="checkout-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  act(async () => {
                    await api("/auth/login", {
                      email: f.get("email"),
                      password: f.get("password"),
                    });
                    await afterLogin();
                  });
                }}
              >
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  Palavra-passe
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                  />
                </label>
                <button className="pill lime" disabled={busy}>
                  Entrar
                </button>
              </form>
              <button
                className="pill outline"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const options = await api("/auth/passkey/start", {});
                    const credential = await startAuthentication({
                      optionsJSON: options.options,
                    });
                    await api("/auth/passkey/verify", {
                      challengeId: options.challenge_id,
                      credential,
                    });
                    await afterLogin();
                  })
                }
              >
                <KeyRound size={17} /> Entrar com passkey
              </button>
            </>
          ) : (
            <>
              <h2>VERIFICAÇÃO TOTP</h2>
              {!factors.length && !enrollment && (
                <button
                  className="pill outline"
                  onClick={() =>
                    act(async () =>
                      setEnrollment(await api("/auth/totp/enroll", {})),
                    )
                  }
                >
                  Configurar autenticador
                </button>
              )}
              {enrollment && (
                <>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(enrollment.qr, {
                        USE_PROFILES: { svg: true, svgFilters: true },
                      }),
                    }}
                  />
                  <p>
                    Chave de configuração: <code>{enrollment.secret}</code>
                  </p>
                </>
              )}
              <form
                className="checkout-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  act(async () => {
                    await api("/auth/totp/verify", {
                      factorId: enrollment?.id || factors[0]?.id,
                      code: f.get("code"),
                    });
                    await refresh();
                  });
                }}
              >
                <label>
                  Código de seis dígitos
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    required
                  />
                </label>
                <button
                  className="pill lime"
                  disabled={busy || (!factors.length && !enrollment)}
                >
                  Verificar e entrar
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="admin-stats">
            <div>
              Encomendas carregadas<strong>{data.orders.length}</strong>
              <small>Últimas 200 encomendas</small>
            </div>
            <div>
              Recebido nestas encomendas
              <strong>
                {money(
                  data.orders
                    .filter((o: any) => ["paid", "shipped"].includes(o.status))
                    .reduce((s: number, o: any) => s + o.amount, 0),
                )}
              </strong>
              <small>Inclui IVA · não é relatório contabilístico</small>
            </div>
            <div>
              Produtos<strong>{data.products.length}</strong>
              <small>Catálogo real</small>
            </div>
          </div>
          <div className="admin-tabs">
            {[
              ["orders", "Encomendas"],
              ["products", "Produtos e stock"],
              ["tax", "Exportar OSS"],
              ["security", "Segurança"],
            ].map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? "selected" : ""}
                onClick={() => setTab(id)}
              >
                {title}
              </button>
            ))}
            <button
              onClick={() =>
                act(async () => {
                  await api("/auth/logout", {});
                  setData(null);
                  setMfa(false);
                })
              }
            >
              <LogOut size={14} />
            </button>
          </div>
          {tab === "orders" && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Encomenda</th>
                  <th>País</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Seguimento</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o: any) => (
                  <tr key={o.id}>
                    <td>
                      {o.id.slice(0, 8)}
                      <small>
                        {new Date(o.created_at).toLocaleDateString("pt-PT")}
                      </small>
                    </td>
                    <td>{o.country}</td>
                    <td>{money(o.amount)}</td>
                    <td>{o.status}</td>
                    <td>
                      {o.status === "paid" ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            act(async () => {
                              await api("/admin/orders/" + o.id + "/ship", {
                                tracking: f.get("tracking"),
                              });
                              await refresh();
                            });
                          }}
                        >
                          <input
                            name="tracking"
                            aria-label="Número de seguimento"
                            required
                            minLength={3}
                          />
                          <button disabled={busy}>Marcar enviada</button>
                        </form>
                      ) : (
                        o.tracking || "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "products" && (
            <NewProduct
              onCreate={(body) =>
                act(async () => {
                  await api("/admin/products", body);
                  await refresh();
                })
              }
            />
          )}
          {tab === "products" &&
            data.products.map((p: any) => (
              <div key={p.id}>
                <h2 style={{ fontSize: 28, margin: "35px 0 15px" }}>
                  {p.name}
                </h2>
                <button
                  className="pill outline"
                  onClick={() =>
                    act(async () => {
                      await api(
                        "/admin/products/" + p.id,
                        { active: !p.active },
                        "PATCH",
                      );
                      await refresh();
                    })
                  }
                >
                  {p.active ? "Arquivar produto" : "Publicar produto"}
                </button>
                <label>
                  Fotografia · PNG, JPEG ou WebP até 8 MB{" "}
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        act(async () => {
                          const response = await fetch(
                            "/api/admin/images/" + p.id,
                            {
                              method: "POST",
                              body: file,
                              headers: { "Content-Type": file.type },
                            },
                          );
                          if (!response.ok)
                            throw new Error(
                              ((await response.json()) as any).error,
                            );
                          await refresh();
                        });
                    }}
                  />
                  Modelo 3D · GLB até 8 MB{" "}
                  <input
                    type="file"
                    accept=".glb"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        act(async () => {
                          const response = await fetch(
                            "/api/admin/models/" + p.id,
                            {
                              method: "POST",
                              body: file,
                              headers: { "Content-Type": "model/gltf-binary" },
                            },
                          );
                          if (!response.ok)
                            throw new Error(
                              ((await response.json()) as any).error,
                            );
                          await refresh();
                        });
                    }}
                  />
                </label>
                <details style={{ margin: "20px 0" }}>
                  <summary>Tradução inglesa</summary>
                  <form
                    className="checkout-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(async () => {
                        await api(
                          "/admin/products/" + p.id,
                          {
                            translations: {
                              en: {
                                description: f.get("description"),
                                tag: f.get("tag"),
                              },
                            },
                          },
                          "PATCH",
                        );
                        await refresh();
                      });
                    }}
                  >
                    <label>
                      Descrição (EN)
                      <textarea
                        name="description"
                        defaultValue={p.translations?.en?.description || ""}
                        maxLength={4000}
                        rows={4}
                      />
                    </label>
                    <label>
                      Texto de destaque (EN)
                      <input
                        name="tag"
                        defaultValue={p.translations?.en?.tag || ""}
                        maxLength={80}
                      />
                    </label>
                    <button className="pill outline" disabled={busy}>
                      Guardar tradução
                    </button>
                  </form>
                </details>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Tamanho</th>
                      <th>Preço (€)</th>
                      <th>Stock disponível</th>
                      <th>Guardar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.variants.map((v: any) => (
                      <VariantRow
                        key={v.id}
                        variant={v}
                        onSave={(price, stock) =>
                          act(async () => {
                            await api(
                              "/admin/variants/" + v.id,
                              { price, stock },
                              "PATCH",
                            );
                            await refresh();
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tab === "tax" && (
            <div>
              <p className="notice">
                Exportação de apoio à reconciliação. Confirma registos OSS,
                taxas, devoluções, datas fiscais e obrigações de faturação com a
                contabilidade antes da declaração.
              </p>
              <form
                className="checkout-form"
                style={{ maxWidth: 400, marginTop: 25 }}
                action="/api/admin/oss"
                method="get"
              >
                <label>
                  Ano
                  <input
                    name="year"
                    type="number"
                    defaultValue={new Date().getFullYear()}
                    min={2026}
                    required
                  />
                </label>
                <label>
                  Trimestre
                  <select name="quarter">
                    <option value="1">1.º trimestre</option>
                    <option value="2">2.º trimestre</option>
                    <option value="3">3.º trimestre</option>
                    <option value="4">4.º trimestre</option>
                  </select>
                </label>
                <button className="pill lime">
                  <Download size={16} /> Exportar CSV
                </button>
              </form>
            </div>
          )}
          {tab === "security" && (
            <>
              <h2 style={{ fontSize: 30, marginBottom: 25 }}>
                PASSKEYS + TOTP
              </h2>
              <button
                className="pill lime"
                onClick={() =>
                  act(async () => {
                    const options = await api(
                      "/auth/passkey/register/start",
                      {},
                    );
                    const credential = await startRegistration({
                      optionsJSON: options.options,
                    });
                    await api("/auth/passkey/register/verify", {
                      challengeId: options.challenge_id,
                      credential,
                    });
                    setError("Passkey registada com sucesso.");
                  })
                }
              >
                Registar uma passkey <KeyRound size={17} />
              </button>
              <p className="muted" style={{ marginTop: 20 }}>
                O código TOTP continua obrigatório após iniciar sessão com uma
                passkey.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
function VariantRow({
  variant: v,
  onSave,
}: {
  variant: any;
  onSave: (p: number, s: number) => void;
}) {
  const [price, setPrice] = useState(v.price / 100),
    [stock, setStock] = useState(v.stock);
  return (
    <tr>
      <td>{v.sku}</td>
      <td>{v.size}</td>
      <td>
        <input
          aria-label={"Preço " + v.sku}
          type="number"
          min=".01"
          step=".01"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </td>
      <td>
        <input
          aria-label={"Stock " + v.sku}
          type="number"
          min="0"
          step="1"
          value={stock}
          onChange={(e) => setStock(Number(e.target.value))}
        />
      </td>
      <td>
        <button onClick={() => onSave(Math.round(price * 100), stock)}>
          Guardar
        </button>
      </td>
    </tr>
  );
}
function NewProduct({
  onCreate,
}: {
  onCreate: (body: unknown) => Promise<void>;
}) {
  return (
    <details style={{ border: "1px solid #444", padding: 22, marginTop: 25 }}>
      <summary style={{ cursor: "pointer" }}>
        + Criar produto e variante
      </summary>
      <form
        className="checkout-form"
        style={{ maxWidth: 650, marginTop: 25 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          await onCreate({
            product: {
              name: f.get("name"),
              slug: f.get("slug"),
              category: f.get("category"),
              description: f.get("description"),
              image: Number(f.get("image")),
              tag: f.get("tag"),
            },
            variants: [
              {
                sku: f.get("sku"),
                size: f.get("size"),
                color: f.get("color"),
                price: Math.round(Number(f.get("price")) * 100),
                stock: Number(f.get("stock")),
              },
            ],
          });
        }}
      >
        <div className="form-grid">
          <label>
            Nome
            <input name="name" required minLength={2} />
          </label>
          <label>
            Identificador URL
            <input name="slug" pattern="[a-z0-9-]+" required />
          </label>
        </div>
        <label>
          Categoria
          <select name="category">
            {[
              "Running",
              "Streetwear",
              "Training",
              "Football",
              "Basketball",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Descrição
          <textarea name="description" required minLength={10} />
        </label>
        <label>
          Texto de destaque
          <input name="tag" required />
        </label>
        <div className="form-grid">
          <label>
            Imagem conceptual (0–7)
            <input
              name="image"
              type="number"
              min={0}
              max={7}
              defaultValue={0}
              required
            />
          </label>
          <label>
            SKU
            <input name="sku" required />
          </label>
          <label>
            Tamanho
            <input name="size" required />
          </label>
          <label>
            Cor
            <input name="color" required />
          </label>
          <label>
            Preço (€)
            <input name="price" type="number" min="0.01" step="0.01" required />
          </label>
          <label>
            Stock
            <input name="stock" type="number" min={0} step={1} required />
          </label>
        </div>
        <p className="muted">
          O produto é criado como rascunho. Revê os dados antes de publicar.
        </p>
        <button className="pill lime">Criar rascunho</button>
      </form>
    </details>
  );
}
