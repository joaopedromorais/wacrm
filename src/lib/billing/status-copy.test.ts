import { describe, expect, it } from "vitest";

import { billingCopy, whatsappLink } from "./status-copy";
import { isBillingExemptApi } from "./paths";

const NOW = new Date("2026-10-29T12:00:00Z");

describe("billingCopy", () => {
  it("conta nova (pending ou sem linha) pede ativação", () => {
    expect(billingCopy("pending", null, NOW).title).toBe("Sua conta está quase pronta");
    expect(billingCopy(null, null, NOW).title).toBe("Sua conta está quase pronta");
  });

  it("active com prazo vencido mostra renovação", () => {
    expect(billingCopy("active", "2026-10-29T11:59:00Z", NOW).title).toBe("Sua assinatura venceu");
  });

  it("past_due e canceled têm mensagens próprias", () => {
    expect(billingCopy("past_due", null, NOW).title).toBe("Pagamento pendente");
    expect(billingCopy("canceled", null, NOW).title).toBe("Assinatura cancelada");
  });
});

describe("whatsappLink", () => {
  it("monta wa.me só com dígitos e mensagem com conta e e-mail", () => {
    const url = new URL(whatsappLink("+55 (62) 99399-7161", "ativar o JPX CRM", "Empresa B", "b@x.com"));
    expect(url.origin + url.pathname).toBe("https://wa.me/5562993997161");
    expect(url.searchParams.get("text")).toBe("Olá! Quero ativar o JPX CRM.\nConta: Empresa B\nE-mail: b@x.com");
  });

  it("omite conta e e-mail ausentes", () => {
    const url = new URL(whatsappLink("5562993997161", "ativar o JPX CRM", null, null));
    expect(url.searchParams.get("text")).toBe("Olá! Quero ativar o JPX CRM.");
  });
});

describe("isBillingExemptApi", () => {
  it.each([
    ["/api/whatsapp/webhook", true],
    ["/api/automations/cron", true],
    ["/api/flows/cron", true],
    ["/api/v1/contacts", true],
    ["/api/invitations/t/peek", true],
    ["/api/whatsapp/send", false],
    ["/api/account/members", false],
    ["/api/v1", false],
    ["/api/billing/asaas", true],
    ["/api/billing/subscribe", true],
  ])("%s → %s", (path, expected) => {
    expect(isBillingExemptApi(path)).toBe(expected);
  });
});
