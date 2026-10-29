import { beforeEach, describe, expect, it, vi } from "vitest";

import { startSubscription, SubscribeError, type BillingRow, type SubscribeDeps } from "./subscribe";

const VALID_CPF = "529.982.247-25";

function makeDeps(billing: BillingRow | null = null) {
  const d = {
    hasAccess: vi.fn(async () => false),
    launchSeatsTaken: vi.fn(async () => 0),
    getBilling: vi.fn(async () => billing),
    saveBilling: vi.fn(async () => {}),
    createCustomer: vi.fn(async () => ({ id: "cus_new" })),
    createSubscription: vi.fn(async () => ({ id: "sub_new" })),
    deleteSubscription: vi.fn(async () => {}),
    listPayments: vi.fn(async (id: string) => [{ status: "PENDING", invoiceUrl: `https://asaas/i/${id}` }]),
    sleep: vi.fn(async () => {}),
  } satisfies SubscribeDeps;
  return d;
}

const input = (over: Record<string, unknown> = {}) => ({
  accountId: "acct-1",
  accountName: "Kani Sushi",
  email: "dono@kani.com",
  planId: "anual",
  method: "PIX",
  cpfCnpj: VALID_CPF,
  ...over,
});

describe("startSubscription", () => {
  let d: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    d = makeDeps();
  });

  it("conta nova: cria cliente e assinatura e devolve a fatura", async () => {
    const res = await startSubscription(input(), d);
    expect(res).toEqual({ url: "https://asaas/i/sub_new", reused: false, launch: true, value: 1147 });
    expect(d.createCustomer).toHaveBeenCalledWith({ name: "Kani Sushi", cpfCnpj: "52998224725", email: "dono@kani.com", externalReference: "acct-1" });
    expect(d.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_new", billingType: "PIX", value: 1147, cycle: "YEARLY", externalReference: "acct-1",
    }));
    // grava a assinatura antes de buscar a fatura
    const saveOrder = d.saveBilling.mock.invocationCallOrder.at(-1)!;
    const listOrder = d.listPayments.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(listOrder);
    expect(d.saveBilling).toHaveBeenLastCalledWith("acct-1", expect.objectContaining({ provider_subscription_id: "sub_new", plan: "anual", payment_method: "PIX", launch_price: true }));
  });

  it("mesma escolha com fatura aberta: reaproveita, sem criar nada", async () => {
    d = makeDeps({ provider: "asaas", provider_customer_id: "cus_1", provider_subscription_id: "sub_1", plan: "anual", payment_method: "PIX" });
    const res = await startSubscription(input({ cpfCnpj: "" }), d);
    expect(res).toMatchObject({ url: "https://asaas/i/sub_1", reused: true });
    expect(d.createSubscription).not.toHaveBeenCalled();
    expect(d.deleteSubscription).not.toHaveBeenCalled();
  });

  it("troca de plano: remove a antiga e cria nova com o mesmo cliente", async () => {
    d = makeDeps({ provider: "asaas", provider_customer_id: "cus_1", provider_subscription_id: "sub_1", plan: "mensal", payment_method: "PIX" });
    await startSubscription(input({ method: "CREDIT_CARD", cpfCnpj: "" }), d);
    expect(d.deleteSubscription).toHaveBeenCalledWith("sub_1");
    expect(d.createCustomer).not.toHaveBeenCalled();
    expect(d.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_1", billingType: "CREDIT_CARD" }));
  });

  it.each([
    [{ planId: "vitalicio" }, "Plano inválido."],
    [{ method: "BOLETO" }, "Forma de pagamento inválida."],
    [{ cpfCnpj: "123.456.789-00" }, "CPF ou CNPJ inválido."],
  ])("valida entrada %o", async (over, msg) => {
    await expect(startSubscription(input(over), d)).rejects.toThrow(msg);
    expect(d.createSubscription).not.toHaveBeenCalled();
  });

  it("conta já ativa: 409", async () => {
    d.hasAccess.mockResolvedValue(true);
    await expect(startSubscription(input(), d)).rejects.toMatchObject({ status: 409 });
  });

  it("fatura ainda não gerada: tenta 3x e avisa", async () => {
    d.listPayments.mockResolvedValue([]);
    const err = await startSubscription(input(), d).catch((e) => e);
    expect(err).toBeInstanceOf(SubscribeError);
    expect(err.status).toBe(502);
    expect(d.listPayments).toHaveBeenCalledTimes(3);
  });

  describe("preço de lançamento", () => {
    it("com vaga: preço de lançamento e conta vira fundadora", async () => {
      d.launchSeatsTaken.mockResolvedValue(49);
      const res = await startSubscription(input({ planId: "mensal" }), d);
      expect(res).toMatchObject({ launch: true, value: 127 });
      expect(d.saveBilling).toHaveBeenLastCalledWith("acct-1", expect.objectContaining({ launch_price: true }));
    });

    it("vagas esgotadas: novo cliente paga preço cheio e não vira fundador", async () => {
      d.launchSeatsTaken.mockResolvedValue(50);
      const res = await startSubscription(input({ planId: "mensal" }), d);
      expect(res).toMatchObject({ launch: false, value: 197 });
      expect(d.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ value: 197 }));
      expect(d.saveBilling).toHaveBeenLastCalledWith("acct-1", expect.objectContaining({ launch_price: false }));
    });

    it("fundador mantém o preço mesmo com vagas esgotadas e ao trocar de plano", async () => {
      d = makeDeps({ provider: "asaas", provider_customer_id: "cus_1", provider_subscription_id: "sub_1", plan: "mensal", payment_method: "PIX", launch_price: true });
      d.launchSeatsTaken.mockResolvedValue(80);
      const res = await startSubscription(input({ planId: "semestral", cpfCnpj: "" }), d);
      expect(res).toMatchObject({ launch: true, value: 647 });
      expect(d.saveBilling).toHaveBeenLastCalledWith("acct-1", expect.objectContaining({ launch_price: true }));
    });
  });
});
