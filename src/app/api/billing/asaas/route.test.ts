import { beforeEach, describe, expect, it, vi } from "vitest";

const handleAsaasEvent = vi.fn();
vi.mock("@/lib/billing/webhook", () => ({ handleAsaasEvent: (...a: unknown[]) => handleAsaasEvent(...a) }));
vi.mock("@/lib/flows/admin-client", () => ({ supabaseAdmin: () => ({}) }));

const { POST } = await import("./route");

const TOKEN = "t".repeat(40);
const req = (body: unknown, token?: string) =>
  new Request("https://crm.test/api/billing/asaas", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "asaas-access-token": token } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
  handleAsaasEvent.mockReset();
  handleAsaasEvent.mockResolvedValue("activated");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/billing/asaas", () => {
  it("sem token configurado: 503 (falha fechada)", async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    expect((await POST(req({ id: "e", event: "X" }, TOKEN))).status).toBe(503);
  });

  it.each([undefined, "errado", TOKEN + "x"])("token %s: 401", async (token) => {
    const res = await POST(req({ id: "e", event: "X" }, token));
    expect(res.status).toBe(401);
    expect(handleAsaasEvent).not.toHaveBeenCalled();
  });

  it("token certo: processa e responde 200", async () => {
    const res = await POST(req({ id: "evt_1", event: "PAYMENT_RECEIVED" }, TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "activated" });
  });

  it("JSON inválido ou sem id/event: 400", async () => {
    expect((await POST(req("{nope", TOKEN))).status).toBe(400);
    expect((await POST(req({ event: "X" }, TOKEN))).status).toBe(400);
  });

  it("falha no banco: 500 para o Asaas tentar de novo", async () => {
    handleAsaasEvent.mockRejectedValue(new Error("db"));
    expect((await POST(req({ id: "evt_1", event: "PAYMENT_RECEIVED" }, TOKEN))).status).toBe(500);
  });
});
