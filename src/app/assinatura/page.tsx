import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SUPPORT_WHATSAPP } from "@/components/brand/brand";
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
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let accountName: string | null = null;
  let status: BillingStatus | null = null;
  let periodEnd: string | null = null;

  if (profile?.account_id) {
    const [{ data: account }, { data: billing }] = await Promise.all([
      supabase
        .from("accounts")
        .select("name")
        .eq("id", profile.account_id)
        .maybeSingle(),
      supabase
        .from("account_billing")
        .select("status, current_period_end")
        .eq("account_id", profile.account_id)
        .maybeSingle(),
    ]);
    accountName = account?.name ?? null;
    status = (billing?.status as BillingStatus | undefined) ?? null;
    periodEnd = billing?.current_period_end ?? null;
  }

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
    />
  );
}
