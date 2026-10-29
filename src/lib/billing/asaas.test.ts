import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AsaasError, createSubscription, deleteSubscription, listSubscriptionPayments } from "./asaas";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.ASAAS_API_KEY = "test-key";
  delete process.env.ASAAS_API_URL;
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("cliente Asaas", () => {
  it("usa sandbox por padrão, header access_token e User-Agent", async () => {
    fetchMock.mockResolvedValue(ok({ id: "sub_1" }));
    await createSubscription({
      customer: "cus_1", billingType: "PIX", value: 197, nextDueDate: "2026-10-29",
      cycle: "MONTHLY", description: "JPX CRM — Plano Mensal", externalReference: "acct-1",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-sandbox.asaas.com/v3/subscriptions");
    expect(init.method).toBe("POST");
    expect(init.headers.access_token).toBe("test-key");
    expect(init.headers["User-Agent"]).toBeTruthy();
    expect(JSON.parse(init.body)).toMatchObject({ billingType: "PIX", cycle: "MONTHLY", value: 197 });
  });

  it("respeita ASAAS_API_URL (produção) sem barra dupla", async () => {
    process.env.ASAAS_API_URL = "https://api.asaas.com/v3/";
    fetchMock.mockResolvedValue(ok({ data: [{ id: "pay_1", status: "PENDING", dueDate: "2026-10-29", invoiceUrl: "u" }] }));
    const payments = await listSubscriptionPayments("sub_1");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.asaas.com/v3/subscriptions/sub_1/payments");
    expect(payments[0].invoiceUrl).toBe("u");
  });

  it("transforma erro do Asaas em AsaasError com a descrição", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: "invalid_cpfCnpj", description: "CPF inválido" }] }), { status: 400 }));
    const err = await deleteSubscription("sub_1").catch((e) => e);
    expect(err).toBeInstanceOf(AsaasError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("CPF inválido");
  });

  it("sem chave configurada não chama a API", async () => {
    delete process.env.ASAAS_API_KEY;
    await expect(listSubscriptionPayments("sub_1")).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
