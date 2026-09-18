type StripeEvent = { id: string; type: string; data: { object: { id: string } } };
type PaymentsStore = { create(input: { providerId: string; status: string }): Promise<void> };

export async function handleStripeEvent(event: StripeEvent, store: PaymentsStore) {
  if (event.type === "payment_intent.succeeded") {
    await store.create({ providerId: event.data.object.id, status: "paid" });
  }
}
