"use client";

import { useState } from "react";
import { CreditCard, Loader2, QrCode, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  LAUNCH,
  PLANS,
  formatBRL,
  monthlyEquivalent,
  priceFor,
  savingsPercent,
  type PaymentMethod,
  type PlanId,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export interface LaunchOffer {
  /** Esta conta paga preço de lançamento agora? */
  launch: boolean;
  /** Já é fundadora (preço garantido)? */
  founder: boolean;
  /** Vagas restantes (null quando não se aplica). */
  remaining: number | null;
}

/**
 * Escolha de plano + forma de pagamento → fatura do Asaas.
 * Os preços aqui são só exibição: o valor cobrado é decidido no
 * servidor (/api/billing/subscribe) com a mesma regra.
 */
export function PlanPicker({
  needsDocument,
  offer,
}: {
  needsDocument: boolean;
  offer: LaunchOffer;
}) {
  const launch = offer.launch;
  const [plan, setPlan] = useState<PlanId>("anual");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method, cpfCnpj: doc }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Não foi possível abrir o pagamento. Tente novamente.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Sem conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {launch && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary-soft px-3 py-2 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-foreground">
            {offer.founder ? (
              <>
                <span className="font-semibold">Preço de fundador garantido</span>
                <span className="text-muted-foreground"> enquanto você for assinante.</span>
              </>
            ) : (
              <>
                <span className="font-semibold">Preço de lançamento</span>
                <span className="text-muted-foreground">
                  {" "}para os {LAUNCH.seats} primeiros clientes
                  {offer.remaining !== null && ` — restam ${offer.remaining}`}. Garantido enquanto você for assinante.
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <div role="radiogroup" aria-label="Plano" className="flex flex-col gap-2">
        {PLANS.map((p) => {
          const active = p.id === plan;
          const savings = savingsPercent(p, launch);
          const per = p.months === 1 ? "/mês" : p.months === 6 ? "/semestre" : "/ano";
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPlan(p.id)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary bg-primary-soft" : "border-border bg-card-2 hover:border-primary/50",
              )}
            >
              <span className="flex flex-col">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                  {p.name}
                  {savings > 0 && (
                    <span className="whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                      Economize {savings}%
                    </span>
                  )}
                </span>
                {p.months > 1 && (
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(monthlyEquivalent(p, launch))}/mês
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end pl-2 text-right">
                {launch && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatBRL(p.price)}
                  </span>
                )}
                <span className="text-sm font-semibold text-foreground">
                  {formatBRL(priceFor(p, launch))}
                  <span className="font-normal text-muted-foreground">{per}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2">
        {([
          ["PIX", "Pix", QrCode],
          ["CREDIT_CARD", "Cartão", CreditCard],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => setMethod(value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              method === value
                ? "border-primary bg-primary-soft text-foreground"
                : "border-border bg-card-2 text-muted-foreground hover:border-primary/50",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {needsDocument && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">CPF ou CNPJ de quem paga</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={doc}
            onChange={(e) => setDoc(e.target.value.replace(/[^\d./-]/g, "").slice(0, 18))}
            placeholder="000.000.000-00"
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={subscribe}
        disabled={busy || (needsDocument && doc.replace(/\D/g, "").length < 11)}
        className={cn(buttonVariants({ size: "lg" }), "h-10 w-full")}
      >
        {busy && <Loader2 className="animate-spin" />}
        {busy ? "Abrindo pagamento…" : "Assinar e pagar"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Pagamento seguro pelo Asaas.{" "}
        {method === "PIX"
          ? "No Pix, você recebe uma fatura a cada renovação."
          : "No cartão, a renovação é automática."}
      </p>
    </div>
  );
}
