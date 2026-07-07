import Stripe from "stripe";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" });
}
