import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BillingCopy } from "@/lib/billing/status-copy";
import { cn } from "@/lib/utils";

import { PlanPicker, type LaunchOffer } from "./plan-picker";
import { SignOutButton } from "./sign-out-button";

/** Parte visual de /assinatura (sem acesso a dados). */
export function AssinaturaView({
  copy,
  href,
  accountName,
  email,
  mode,
  needsDocument,
  offer,
}: {
  copy: BillingCopy;
  href: string;
  accountName: string | null;
  email: string | null;
  /**
   * online     — dono/admin com Asaas configurado: escolhe plano e paga
   * whatsapp   — sem Asaas configurado: liberação manual pela JPX
   * ask_owner  — agente/visualizador: só o dono/admin pode assinar
   */
  mode: "online" | "whatsapp" | "ask_owner";
  needsDocument: boolean;
  offer: LaunchOffer;
}) {
  const description =
    mode === "online"
      ? copy.onlineDescription
      : mode === "ask_owner"
        ? "O acesso desta conta está pausado. Peça ao dono ou a um administrador da conta para assinar o JPX CRM."
        : copy.description;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <BrandLogo className="mb-2" />
          <CardTitle className="text-xl text-foreground">{copy.title}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(accountName || email) && (
            <div className="rounded-lg border border-border bg-card-2 px-3 py-2 text-sm">
              {accountName && (
                <p className="font-medium text-foreground">{accountName}</p>
              )}
              {email && (
                <p className="text-muted-foreground">{email}</p>
              )}
            </div>
          )}
          {mode === "online" && <PlanPicker needsDocument={needsDocument} offer={offer} />}
          {mode === "whatsapp" && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "lg" }), "h-10 w-full")}
            >
              <MessageCircle />
              Falar com a JPX no WhatsApp
            </a>
          )}
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full")}
          >
            Já paguei, verificar acesso
          </Link>
          <div className="flex flex-col items-center gap-1 pt-1 text-center">
            {mode !== "whatsapp" && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <MessageCircle className="size-4" />
                Dúvidas? Fale com a JPX no WhatsApp
              </a>
            )}
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
