import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SUPPORT_WHATSAPP } from "@/components/brand/brand";
import { isAsaasConfigured } from "@/lib/billing/asaas";
import { LAUNCH, launchApplies } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { createClient } from "@/lib/supabase/server";
import {
  billingCopy,
  whatsappLink,
  type BillingStatus,
} from "@/lib/billing/status-copy";

import { AssinaturaView } from "./view";

// JPX CRM — tela para conta logada sem assinatura ativa.
// O middleware manda para cá; aqui também conferimos de novo para
// quem chegar direto pela URL.

export const metadata: Metadata = {
  title: "Assinatura",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AssinaturaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hasAccess } = await supabase.rpc("my_account_has_access");
  if (hasAccess === true) redirect("/dashboard");

  // RLS: o usuário só enxerga o próprio profile e a própria conta.
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id, account_role")
    .eq("user_id", user.id)
    .maybeSingle();

  let accountName: string | null = null;
  let status: BillingStatus | null = null;
  let periodEnd: string | null = null;
  let hasCustomer = false;
  let founder = false;

  if (profile?.account_id) {
    const [{ data: account }, { data: billing }] = await Promise.all([
      supabase
        .from("accounts")
        .select("name")
        .eq("id", profile.account_id)
        .maybeSingle(),
      supabase
        .from("account_billing")
        .select("status, current_period_end, provider_customer_id, launch_price")
        .eq("account_id", profile.account_id)
        .maybeSingle(),
    ]);
    accountName = account?.name ?? null;
    status = (billing?.status as BillingStatus | undefined) ?? null;
    periodEnd = billing?.current_period_end ?? null;
    hasCustomer = Boolean(billing?.provider_customer_id);
    founder = billing?.launch_price === true;
  }

  const canSubscribe =
    profile?.account_role === "owner" || profile?.account_role === "admin";
  const mode = !isAsaasConfigured()
    ? "whatsapp"
    : canSubscribe
      ? "online"
      : "ask_owner";

  // Vagas de lançamento: só faz sentido consultar no modo online.
  let seatsTaken = 0;
  if (mode === "online" && LAUNCH.enabled && !founder) {
    const { data, error } = await supabaseAdmin().rpc("jpx_launch_seats_taken");
    if (error) console.error("[assinatura] jpx_launch_seats_taken falhou:", error.message);
    seatsTaken = Number(data ?? 0);
  }
  const launch = launchApplies(founder, seatsTaken);
  const offer = {
    launch,
    founder,
    remaining: launch && !founder ? Math.max(LAUNCH.seats - seatsTaken, 0) : null,
  };

  const copy = billingCopy(status, periodEnd);
  const href = whatsappLink(
    SUPPORT_WHATSAPP,
    copy.whatsappIntent,
    accountName,
    user.email ?? null,
  );

  return (
    <AssinaturaView
      copy={copy}
      href={href}
      accountName={accountName}
      email={user.email ?? null}
      mode={mode}
      needsDocument={!hasCustomer}
      offer={offer}
    />
  );
}
