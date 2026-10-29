import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleAsaasEvent, type WebhookDeps } from "./webhook";

function deps() {
  const d = {
    alreadyProcessed: vi.fn(async () => false),
    planForSubscription: vi.fn(async () => "anual" as string | null),
    applyPayment: vi.fn(async () => "acct-1" as string | null),
    setStatus: vi.fn(async () => "acct-1" as string | null),
    record: vi.fn(async () => {}),
  } satisfies WebhookDeps;
  return d;
}

const paid = (event = "PAYMENT_RECEIVED") => ({
  id: "evt_1",
  event,
  payment: { id: "pay_1", subscription: "sub_1", dueDate: "2026-10-29", billingType: "PIX", status: "RECEIVED" },
});

describe("handleAsaasEvent", () => {
  let d: ReturnType<typeof deps>;
  beforeEach(() => {
    d = deps();
  });

  it.each(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])("%s libera pelo período do plano", async (event) => {
    expect(await handleAsaasEvent(paid(event), d)).toBe("activated");
    expect(d.applyPayment).toHaveBeenCalledWith("sub_1", "2027-11-01T23:59:59-03:00", expect.stringContaining("pay_1"));
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1", outcome: "activated", accountRef: "acct-1" }));
  });

  it("evento repetido não reprocessa nem regrava", async () => {
    d.alreadyProcessed.mockResolvedValue(true);
    expect(await handleAsaasEvent(paid(), d)).toBe("duplicate");
    expect(d.applyPayment).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it("plano desconhecido libera só 1 mês", async () => {
    d.planForSubscription.mockResolvedValue(null);
    await handleAsaasEvent(paid(), d);
    expect(d.applyPayment).toHaveBeenCalledWith("sub_1", "2026-12-02T23:59:59-03:00", expect.any(String));
  });

  it("assinatura sem conta vinculada é registrada como desconhecida", async () => {
    d.applyPayment.mockResolvedValue(null);
    expect(await handleAsaasEvent(paid(), d)).toBe("unknown_subscription");
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unknown_subscription" }));
  });

  it("pagamento avulso (sem assinatura) é ignorado", async () => {
    const p = paid();
    p.payment.subscription = null as unknown as string;
    expect(await handleAsaasEvent(p, d)).toBe("not_subscription_payment");
    expect(d.applyPayment).not.toHaveBeenCalled();
  });

  it.each(["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"])("%s bloqueia (past_due)", async (event) => {
    expect(await handleAsaasEvent(paid(event), d)).toBe("blocked");
    expect(d.setStatus).toHaveBeenCalledWith("sub_1", "past_due", expect.any(String));
  });

  it("assinatura removida só registra (acesso vai até o fim do período pago)", async () => {
    const out = await handleAsaasEvent({ id: "evt_2", event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }, d);
    expect(out).toBe("subscription_ended");
    expect(d.setStatus).not.toHaveBeenCalled();
    expect(d.applyPayment).not.toHaveBeenCalled();
  });

  it("outros eventos são ignorados mas registrados", async () => {
    expect(await handleAsaasEvent({ id: "evt_3", event: "PAYMENT_CREATED", payment: { subscription: "sub_1" } }, d)).toBe("ignored");
    expect(d.record).toHaveBeenCalledOnce();
  });

  it("erro do banco propaga (o Asaas tenta de novo)", async () => {
    d.applyPayment.mockRejectedValue(new Error("db down"));
    await expect(handleAsaasEvent(paid(), d)).rejects.toThrow("db down");
    expect(d.record).not.toHaveBeenCalled();
  });
});
