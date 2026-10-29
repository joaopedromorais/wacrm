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

import { SignOutButton } from "./sign-out-button";

/** Parte visual de /assinatura (sem acesso a dados). */
export function AssinaturaView({
  copy,
  href,
  accountName,
  email,
}: {
  copy: BillingCopy;
  href: string;
  accountName: string | null;
  email: string | null;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <BrandLogo className="mb-2" />
          <CardTitle className="text-xl text-foreground">{copy.title}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {copy.description}
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
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg" }), "h-10 w-full")}
          >
            <MessageCircle />
            Falar com a JPX no WhatsApp
          </a>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full")}
          >
            Já paguei, verificar acesso
          </Link>
          <div className="pt-1 text-center">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
