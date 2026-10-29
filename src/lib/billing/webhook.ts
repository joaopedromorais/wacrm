// ============================================================
// JPX CRM — tratamento dos webhooks do Asaas (lógica pura, testável).
//
// Regras:
//   PAYMENT_CONFIRMED / PAYMENT_RECEIVED → conta ativa até
//     vencimento + meses do plano + tolerância (nunca encurta prazo).
//   PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_REQUESTED → past_due (bloqueia).
//   SUBSCRIPTION_DELETED / SUBSCRIPTION_INACTIVATED → só registra:
//     o cliente já pagou até o fim do período e usa até lá.
//   Demais eventos → registrados e ignorados.
//
// Eventos repetidos (o Asaas entrega "at least once") são
// reconhecidos pelo `id` e não reprocessados.
// ============================================================

import { getPlan, periodEndFor } from './plans'

export interface AsaasWebhookPayload {
  id?: string
  event?: string
  payment?: {
    id?: string
    subscription?: string | null
    dueDate?: string
    billingType?: string
    status?: string
  }
  subscription?: {
    id?: string
    status?: string
  }
}

export interface WebhookDeps {
  alreadyProcessed(eventId: string): Promise<boolean>
  planForSubscription(subscriptionId: string): Promise<string | null>
  applyPayment(subscriptionId: string, periodEnd: string, note: string): Promise<string | null>
  setStatus(subscriptionId: string, status: 'past_due', note: string): Promise<string | null>
  record(entry: {
    eventId: string
    event: string
    subscriptionId: string | null
    accountRef: string | null
    outcome: string
    payload: unknown
  }): Promise<void>
}

export type WebhookOutcome =
  | 'duplicate'
  | 'activated'
  | 'blocked'
  | 'subscription_ended'
  | 'unknown_subscription'
  | 'not_subscription_payment'
  | 'ignored'

const PAID = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const REVERSED = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'])
const SUB_ENDED = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])

export async function handleAsaasEvent(
  payload: AsaasWebhookPayload,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const eventId = payload.id
  const event = payload.event
  if (!eventId || !event) throw new Error('Webhook sem id/event')

  if (await deps.alreadyProcessed(eventId)) return 'duplicate'

  const subscriptionId = payload.payment?.subscription ?? payload.subscription?.id ?? null
  let outcome: WebhookOutcome = 'ignored'
  let accountRef: string | null = null

  if (PAID.has(event) || REVERSED.has(event)) {
    if (!subscriptionId) {
      outcome = 'not_subscription_payment'
    } else if (PAID.has(event)) {
      const dueDate = payload.payment?.dueDate
      if (!dueDate) throw new Error('Pagamento sem dueDate')
      const plan = getPlan(await deps.planForSubscription(subscriptionId))
      // Sem plano conhecido, libera 1 mês (o mínimo) — nunca mais que o pago.
      const periodEnd = periodEndFor(dueDate, plan?.months ?? 1)
      const note = `Pago via Asaas (${payload.payment?.billingType ?? '?'}) — cobrança ${payload.payment?.id ?? '?'}`
      accountRef = await deps.applyPayment(subscriptionId, periodEnd, note)
      outcome = accountRef ? 'activated' : 'unknown_subscription'
    } else {
      const note = `${event === 'PAYMENT_REFUNDED' ? 'Estorno' : 'Chargeback'} — cobrança ${payload.payment?.id ?? '?'}`
      accountRef = await deps.setStatus(subscriptionId, 'past_due', note)
      outcome = accountRef ? 'blocked' : 'unknown_subscription'
    }
  } else if (SUB_ENDED.has(event)) {
    outcome = 'subscription_ended'
  }

  await deps.record({ eventId, event, subscriptionId, accountRef, outcome, payload })
  return outcome
}
