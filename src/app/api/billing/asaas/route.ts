// ============================================================
// POST /api/billing/asaas — webhook do Asaas (JPX CRM).
//
// Configure no Asaas (Integrações → Webhooks):
//   URL:    https://<seu-dominio>/api/billing/asaas
//   Token:  o mesmo valor de ASAAS_WEBHOOK_TOKEN
//   Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_REFUNDED,
//            PAYMENT_CHARGEBACK_REQUESTED, SUBSCRIPTION_DELETED,
//            SUBSCRIPTION_INACTIVATED
//
// Responde 200 para tudo que foi entendido (inclusive eventos
// ignorados), para não travar a fila do Asaas — ela pode ser
// interrompida após 15 falhas seguidas. 500 só quando o banco falha
// (o Asaas tenta de novo).
// ============================================================

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { handleAsaasEvent, type AsaasWebhookPayload, type WebhookDeps } from '@/lib/billing/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tokenMatches(received: string | null, expected: string): boolean {
  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function dbDeps(): WebhookDeps {
  const db = supabaseAdmin()
  return {
    async alreadyProcessed(eventId) {
      const { data, error } = await db
        .from('billing_events')
        .select('event_id')
        .eq('event_id', eventId)
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    async planForSubscription(subscriptionId) {
      const { data, error } = await db
        .from('account_billing')
        .select('plan')
        .eq('provider', 'asaas')
        .eq('provider_subscription_id', subscriptionId)
        .maybeSingle()
      if (error) throw error
      return data?.plan ?? null
    },
    async applyPayment(subscriptionId, periodEnd, note) {
      const { data, error } = await db.rpc('jpx_billing_apply_payment', {
        p_provider: 'asaas',
        p_subscription_id: subscriptionId,
        p_period_end: periodEnd,
        p_note: note,
      })
      if (error) throw error
      return (data as string | null) ?? null
    },
    async setStatus(subscriptionId, status, note) {
      const { data, error } = await db.rpc('jpx_billing_set_status', {
        p_provider: 'asaas',
        p_subscription_id: subscriptionId,
        p_status: status,
        p_note: note,
      })
      if (error) throw error
      return (data as string | null) ?? null
    },
    async record(entry) {
      const { error } = await db.from('billing_events').upsert(
        {
          event_id: entry.eventId,
          provider: 'asaas',
          event: entry.event,
          subscription_id: entry.subscriptionId,
          account_ref: entry.accountRef,
          outcome: entry.outcome,
          payload: entry.payload,
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
      )
      if (error) throw error
    },
  }
}

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected) {
    console.error('[billing/asaas] ASAAS_WEBHOOK_TOKEN não configurado')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (!tokenMatches(request.headers.get('asaas-access-token'), expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: AsaasWebhookPayload
  try {
    payload = (await request.json()) as AsaasWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!payload?.id || !payload?.event) {
    return NextResponse.json({ error: 'missing_id_or_event' }, { status: 400 })
  }

  try {
    const outcome = await handleAsaasEvent(payload, dbDeps())
    if (outcome === 'unknown_subscription') {
      console.warn('[billing/asaas] assinatura sem conta vinculada:', payload.event, payload.id)
    }
    return NextResponse.json({ received: true, outcome })
  } catch (err) {
    console.error('[billing/asaas] falha ao processar', payload.event, payload.id, err)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
