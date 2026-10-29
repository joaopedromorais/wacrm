import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * JPX brand assets. Kept in one file so the rest of the app only
 * references <BrandMark /> / <BrandLogo /> — swapping the brand later
 * means replacing the PNGs in public/brand and this file, nothing else.
 */

export const BRAND_NAME = "JPX CRM";

/** WhatsApp comercial da JPX (formato wa.me: DDI + DDD + número). */
export const SUPPORT_WHATSAPP = "5562993997161";

/** Round JPX symbol — sidebar, compact headers. */
export function BrandMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/jpx-simbolo.png"
      alt={BRAND_NAME}
      width={size}
      height={size}
      priority
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}

/** Full JPX Company lockup (symbol + COMPANY + tagline) — auth screens. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/jpx-logo.png"
      alt={BRAND_NAME}
      width={720}
      height={688}
      priority
      className={cn("mx-auto h-auto w-40", className)}
    />
  );
}
