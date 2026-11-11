import React from "react";
import { render } from "@react-email/render";
import Stripe from "stripe";
import { db, unseal } from "./security";
import type { Env } from "./types";
import { deferredReservationUntil } from "./payment-policy";
export function TransactionalEmail({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <html lang="pt">
      <body
        style={{
          background: "#f4f4f3",
          fontFamily: "Arial,sans-serif",
          padding: 32,
          color: "#18181b",
        }}
      >
        <main
          style={{
            maxWidth: 600,
            margin: "auto",
            background: "#fff",
            padding: 40,
          }}
        >
          <h1 style={{ fontSize: 36, fontStyle: "italic" }}>FLAYR</h1>
          <h2>{title}</h2>
          <p style={{ lineHeight: 1.8, whiteSpace: "pre-line" }}>{message}</p>
          <p>Move beyond limits.</p>
        </main>
      </body>
    </html>
  );
}
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  message: string,
  key: string,
  replyTo?: string,
) {
  const html = await render(
    <TransactionalEmail title={subject} message={message} />,
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      reply_to: replyTo || env.PUBLIC_SUPPORT_EMAIL || undefined,
      to: [to],
      subject,
      html,
      text: message,
    }),
  });
  if (!response.ok) throw new Error("Email delivery failed");
}
export async function runJobs(env: Env) {
  if (!env.SUPABASE_URL) return;
  const client = db(env);
  if (env.STRIPE_SECRET_KEY && env.COMMERCE_ENABLED === "true") {
    const payments = new Stripe(env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const { data: expired, error } = await client
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .limit(50);
    if (error) throw error;
    for (const order of expired || []) {
      try {
        let intent = order.payment_intent
          ? await payments.paymentIntents.retrieve(order.payment_intent)
          : await payments.paymentIntents.create(
              {
                amount: order.amount,
                currency: "eur",
                automatic_payment_methods: { enabled: true },
                metadata: {
                  order_id: order.id,
                  tax_calculation: order.tax_calculation,
                },
                description: "FLAYR order " + order.id,
              },
              { idempotencyKey: "flayr:" + order.id },
            );
        if (["processing", "succeeded"].includes(intent.status)) {
          const reconciled = await client.rpc("apply_payment_event", {
            p_event: "reconcile:" + intent.id + ":" + intent.status,
            p_order: order.id,
            p_intent: intent.id,
            p_status: intent.status === "succeeded" ? "paid" : "processing",
            p_amount: intent.amount,
            p_currency: intent.currency,
          });
          if (reconciled.error) throw reconciled.error;
          if (intent.status === "succeeded" && intent.metadata.tax_calculation)
            await payments.tax.transactions.createFromCalculation(
              {
                calculation: intent.metadata.tax_calculation,
                reference: intent.id,
              },
              { idempotencyKey: "tax:" + intent.id },
            );
          continue;
        }
        const deferred = deferredReservationUntil(intent);
        if (deferred) {
          const result = await client
            .from("orders")
            .update({ expires_at: new Date(deferred).toISOString() })
            .eq("id", order.id);
          if (result.error) throw result.error;
          continue;
        }
        if (intent.status !== "canceled")
          intent = await payments.paymentIntents.cancel(intent.id);
        const result = await client.rpc("apply_payment_event", {
          p_event: "expiry:" + order.id,
          p_order: order.id,
          p_intent: intent.id,
          p_status: "cancelled",
          p_amount: order.amount,
          p_currency: order.currency,
        });
        if (result.error) throw result.error;
      } catch {
        console.error("Reservation reconciliation requires retry");
      }
    }
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  const { data: outbox, error: outboxError } = await client.rpc("claim_emails");
  if (outboxError) throw outboxError;
  for (const item of outbox || []) {
    try {
      let to = "",
        title = "",
        message = "",
        replyTo: string | undefined;
      if (item.kind === "contact") {
        const payload = await unseal(
          item.payload_encrypted,
          env.PII_KEY_V1,
          "contact:" + item.id,
        );
        if (!env.CONTACT_TO)
          throw new Error("Contact delivery is unconfigured");
        to = env.CONTACT_TO;
        replyTo = payload.email;
        title = "FLAYR support · " + payload.subject;
        message = `Reference: ${item.id}\nName: ${payload.name}\nEmail: ${payload.email}\nLanguage: ${payload.locale}\n\n${payload.message}`;
      } else if (item.kind === "withdrawal") {
        const payload = await unseal(
          item.payload_encrypted,
          env.PII_KEY_V1,
          "outbox",
        );
        to = payload.email;
        title = "Recebemos a tua declaração de livre resolução";
        message = `Referência: ${payload.reference}\nRecebida em: ${payload.receivedAt}\nDeclaração: ${payload.message}\nO apoio irá acompanhar o pedido.`;
        if (payload.locale === "en") {
          title = "We received your withdrawal declaration";
          message = `Reference: ${payload.reference}\nReceived: ${payload.receivedAt}\nDeclaration: ${payload.message}\nOur support team will follow up.`;
        }
      } else {
        const { data: order, error: orderError } = await client
          .from("orders")
          .select("*")
          .eq("id", item.order_id)
          .single();
        if (orderError) throw orderError;
        const customer = await unseal(
          order.customer_encrypted,
          env.PII_KEY_V1,
          "order:" + order.id,
        );
        to = customer.email;
        title =
          item.kind === "shipping"
            ? "A tua encomenda foi enviada"
            : "Pagamento recebido — FLAYR";
        message = `Encomenda: ${order.id}\nTotal: ${(order.amount / 100).toFixed(2)} EUR\n${item.kind === "shipping" ? "Seguimento: " + order.tracking : "Recebemos o teu pagamento. Esta mensagem não substitui a fatura fiscal."}\nConsulta os termos e a livre resolução: ${env.APP_ORIGIN}/legal/envios`;
        if (customer.locale === "en") {
          title =
            item.kind === "shipping"
              ? "Your order has shipped"
              : "Payment received — FLAYR";
          message = `Order: ${order.id}\nTotal: ${(order.amount / 100).toFixed(2)} EUR\n${item.kind === "shipping" ? "Tracking: " + order.tracking : "We received your payment. This message is not a tax invoice."}\nShipping and withdrawal information: ${env.APP_ORIGIN}/en/legal/envios`;
        }
      }
      await sendEmail(env, to, title, message, "outbox:" + item.id, replyTo);
      const { error: markError } = await client
        .from("email_outbox")
        .update({ sent_at: new Date().toISOString(), lease_until: null })
        .eq("id", item.id);
      if (markError) throw markError;
    } catch {
      console.error("Outbox delivery requires retry");
    }
  }
}
