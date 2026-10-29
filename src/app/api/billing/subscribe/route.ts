// ============================================================
// POST /api/billing/subscribe — JPX CRM
// body: { plan: 'mensal'|'semestral'|'anual', method: 'PIX'|'CREDIT_CARD', cpfCnpj }
// O preço (lançamento ou cheio) é decidido AQUI, no servidor — nunca
// vem do navegador.
// → { url } da fatura do Asaas. Só dono/admin da conta.
// Liberada no middleware para contas bloqueadas (é o caminho de pagar).
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse, ForbiddenError, UnauthorizedError } from '@/lib/auth/account'
import { accountHasAccess } from '@/lib/billing/access'
import {
  AsaasError,
  createCustomer,
  createSubscription,
  deleteSubscription,
  isAsaasConfigured,
  listSubscriptionPayments,
} from '@/lib/billing/asaas'
import { startSubscription, SubscribeError, type BillingRow } from '@/lib/billing/subscribe'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAsaasConfigured()) {
    return NextResponse.json({ error: 'Pagamento online indisponível. Fale com a JPX pelo WhatsApp.' }, { status: 503 })
  }

  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Só o dono ou um administrador da conta pode assinar.' }, { status: 403 })
    }
    if (err instanceof UnauthorizedError) return toErrorResponse(err)
    return toErrorResponse(err)
  }

  const limit = checkRateLimit(`billing-subscribe:${ctx.userId}`, { limit: 5, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const { data: userData } = await ctx.supabase.auth.getUser()
  const db = supabaseAdmin()

  try {
    const result = await startSubscription(
      {
        accountId: ctx.accountId,
        accountName: ctx.account.name,
        email: userData.user?.email ?? null,
        planId: body.plan,
        method: body.method,
        cpfCnpj: body.cpfCnpj,
      },
      {
        hasAccess: accountHasAccess,
        async launchSeatsTaken() {
          const { data, error } = await db.rpc('jpx_launch_seats_taken')
          if (error) throw error
          return Number(data ?? 0)
        },
        async getBilling(accountId) {
          const { data, error } = await db
            .from('account_billing')
            .select('provider, provider_customer_id, provider_subscription_id, plan, payment_method, launch_price')
            .eq('account_id', accountId)
            .maybeSingle()
          if (error) throw error
          return (data as BillingRow | null) ?? null
        },
        async saveBilling(accountId, patch) {
          const { error } = await db
            .from('account_billing')
            .upsert({ account_id: accountId, ...patch }, { onConflict: 'account_id' })
          if (error) throw error
        },
        createCustomer: (input) => createCustomer(input),
        createSubscription: (input) => createSubscription(input),
        async deleteSubscription(id) {
          try {
            await deleteSubscription(id)
          } catch (err) {
            // Já removida no Asaas: segue o fluxo.
            if (!(err instanceof AsaasError && err.status === 404)) throw err
          }
        },
        listPayments: (id) => listSubscriptionPayments(id),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      },
    )
    return NextResponse.json({ url: result.url })
  } catch (err) {
    if (err instanceof SubscribeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof AsaasError) {
      console.error('[billing/subscribe] Asaas:', err.status, err.message)
      return NextResponse.json(
        { error: `O Asaas recusou a operação: ${err.message}` },
        { status: err.status >= 500 ? 502 : 400 },
      )
    }
    console.error('[billing/subscribe] erro inesperado:', err)
    return NextResponse.json({ error: 'Não foi possível iniciar a assinatura.' }, { status: 500 })
  }
}
