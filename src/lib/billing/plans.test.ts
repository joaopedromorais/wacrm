import { describe, expect, it } from "vitest";

import { isValidCpfCnpj } from "./document";
import {
  getPlan,
  LAUNCH,
  launchApplies,
  monthlyEquivalent,
  periodEndFor,
  PLANS,
  priceFor,
  savingsPercent,
  todayInSaoPaulo,
} from "./plans";

describe("periodEndFor", () => {
  it("mensal: vencimento + 1 mês + 3 dias, fim do dia em SP", () => {
    expect(periodEndFor("2026-10-29", 1)).toBe("2026-12-02T23:59:59-03:00");
  });
  it("31/01 + 1 mês cai no último dia de fevereiro (ano bissexto)", () => {
    expect(periodEndFor("2028-01-31", 1, 0)).toBe("2028-02-29T23:59:59-03:00");
  });
  it("semestral e anual atravessam o ano", () => {
    expect(periodEndFor("2026-10-29", 6, 0)).toBe("2027-04-29T23:59:59-03:00");
    expect(periodEndFor("2026-12-31", 12, 3)).toBe("2028-01-03T23:59:59-03:00");
  });
  it("recusa data malformada", () => {
    expect(() => periodEndFor("29/10/2026", 1)).toThrow();
  });
});

describe("planos", () => {
  it("têm ciclos do Asaas coerentes com os meses", () => {
    const cycles = Object.fromEntries(PLANS.map((p) => [p.id, [p.cycle, p.months]]));
    expect(cycles).toEqual({ mensal: ["MONTHLY", 1], semestral: ["SEMIANNUALLY", 6], anual: ["YEARLY", 12] });
  });
  it("getPlan aceita só ids conhecidos", () => {
    expect(getPlan("anual")?.price).toBeGreaterThan(0);
    expect(getPlan("vitalicio")).toBeNull();
    expect(getPlan(undefined)).toBeNull();
  });
  it.each([true, false])("planos longos saem mais baratos por mês (lançamento=%s)", (launch) => {
    const [m, s, a] = PLANS.map((p) => monthlyEquivalent(p, launch));
    expect(s).toBeLessThan(m);
    expect(a).toBeLessThan(s);
  });

  it("lançamento sempre mais barato que o preço cheio", () => {
    for (const p of PLANS) expect(p.launchPrice).toBeLessThan(p.price);
  });

  it("preços de lançamento e selos de economia", () => {
    expect(PLANS.map((p) => priceFor(p, true))).toEqual([127, 647, 1147]);
    expect(PLANS.map((p) => savingsPercent(p, true))).toEqual([0, 15, 24]);
    expect(PLANS.map((p) => savingsPercent(p, false))).toEqual([0, 15, 23]);
  });
});

describe("todayInSaoPaulo", () => {
  it("usa o fuso de SP (02:00 UTC ainda é o dia anterior)", () => {
    expect(todayInSaoPaulo(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
  });
});

describe("isValidCpfCnpj", () => {
  it.each([
    ["529.982.247-25", true],
    ["52998224725", true],
    ["529.982.247-24", false],
    ["111.111.111-11", false],
    ["11.222.333/0001-81", true],
    ["11.222.333/0001-80", false],
    ["00000000000000", false],
    ["123", false],
  ])("%s → %s", (doc, ok) => {
    expect(isValidCpfCnpj(doc)).toBe(ok);
  });
});

describe("launchApplies", () => {
  it("vale até a última vaga e depois só para fundadores", () => {
    expect(launchApplies(false, 0)).toBe(true);
    expect(launchApplies(false, LAUNCH.seats - 1)).toBe(true);
    expect(launchApplies(false, LAUNCH.seats)).toBe(false);
    expect(launchApplies(true, LAUNCH.seats + 10)).toBe(true);
  });
});
