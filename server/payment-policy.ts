import type Stripe from "stripe";
// An issued Multibanco reference remains payable beyond a cart's two-hour hold.
// Preserve stock until the provider's reference expiry, including a grace period.
export function deferredReservationUntil(
  intent: Pick<Stripe.PaymentIntent, "status" | "next_action">,
  now = Date.now(),
): number | null {
  if (
    intent.status === "requires_action" &&
    intent.next_action?.type === "multibanco_display_details"
  ) {
    const expires = intent.next_action.multibanco_display_details?.expires_at;
    if (!expires) return now + 86400000;
    const deadline = expires * 1000 + 600000;
    return deadline > now ? deadline : null;
  }
  return null;
}
