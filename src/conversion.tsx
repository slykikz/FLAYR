import { useEffect, useState } from "react";
import { X, ArrowUpRight, Eye } from "lucide-react";
import { api } from "./api";
type Offer = {
  id: string;
  slug: string;
  name: string;
  price: number;
  priorPrice: number;
  endsAt: string;
};
export function ExitOffer({ navigate }: { navigate: (url: string) => void }) {
  const [offer, setOffer] = useState<Offer | null>(null),
    [open, setOpen] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    api("/campaign")
      .then((d) => setOffer(d.offer))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!offer) return;
    const onExit = (event: MouseEvent) => {
      if (
        event.clientY > 0 ||
        sessionStorage.getItem("flayr-offer:" + offer.id) ||
        Date.parse(offer.endsAt) <= Date.now()
      )
        return;
      sessionStorage.setItem("flayr-offer:" + offer.id, "seen");
      setOpen(true);
    };
    document.addEventListener("mouseout", onExit);
    return () => document.removeEventListener("mouseout", onExit);
  }, [offer]);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  if (!open || !offer || now >= Date.parse(offer.endsAt)) return null;
  const remaining = Math.max(
      0,
      Math.floor((Date.parse(offer.endsAt) - now) / 1000),
    ),
    hours = Math.floor(remaining / 3600),
    minutes = Math.floor((remaining % 3600) / 60),
    seconds = remaining % 60;
  return (
    <aside className="exit-offer" aria-label="Campanha em curso">
      <button
        className="icon close"
        aria-label="Fechar campanha"
        onClick={() => setOpen(false)}
      >
        <X />
      </button>
      <span className="eyebrow lime-text">UMA CAMPANHA A DESCOBRIR</span>
      <h2>{offer.name}</h2>
      <p>
        Campanha válida até {new Date(offer.endsAt).toLocaleString("pt-PT")}.
      </p>
      <strong>
        {hours}h {minutes}m {seconds}s
      </strong>
      <button
        className="pill lime"
        onClick={() => {
          setOpen(false);
          navigate("/product/" + offer.slug);
        }}
      >
        Ver promoção <ArrowUpRight size={15} />
      </button>
    </aside>
  );
}
export function LiveViewers({ productId }: { productId: string }) {
  const [count, setCount] = useState(0);
  const [consentVersion, setConsentVersion] = useState(0);
  useEffect(() => {
    const update = () => {
      setCount(0);
      setConsentVersion((v) => v + 1);
    };
    window.addEventListener("flayr-consent-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("flayr-consent-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  useEffect(() => {
    let consent;
    try {
      consent = JSON.parse(localStorage.getItem("flayr-consent") || "{}");
    } catch {
      return;
    }
    if (!consent.analytics) return;
    const id = sessionStorage.getItem("flayr-viewer") || crypto.randomUUID();
    sessionStorage.setItem("flayr-viewer", id);
    let cancelled = false;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      api("/views", { productId, viewer: id })
        .then((d) => {
          if (!cancelled) setCount(d.count);
        })
        .catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [productId, consentVersion]);
  return count > 1 ? (
    <p className="live-viewers">
      <Eye size={14} />
      {count} visitantes ativos neste produto
    </p>
  ) : null;
}
export function PurchaseProof() {
  const [proof, setProof] = useState<any>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      api("/social-proof")
        .then((d) => setProof(d.proof))
        .catch(() => {});
    }, 45000);
    return () => clearTimeout(timer);
  }, []);
  if (!proof) return null;
  return (
    <aside className="purchase-proof" role="status">
      <button
        className="icon"
        aria-label="Fechar notificação"
        onClick={() => setProof(null)}
      >
        <X size={14} />
      </button>
      <strong>Um novo movimento.</strong>
      <p>Uma encomenda foi confirmada recentemente em {proof.country}.</p>
    </aside>
  );
}
