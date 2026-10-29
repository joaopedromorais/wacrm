// ============================================================
// JPX CRM — iniciar/retomar assinatura no Asaas (lógica testável).
//
// 1. Valida plano, forma de pagamento e CPF/CNPJ.
// 2. Mesma escolha de antes e fatura ainda em aberto → devolve a
//    mesma fatura (clicar "Assinar" duas vezes não duplica nada).
// 3. Escolha diferente → remove a assinatura antiga no Asaas (isso
//    apaga só cobranças pendentes/vencidas) e cria uma nova.
// 4. Grava assinatura/plano na conta ANTES de buscar a fatura, para
//    o webhook já encontrar a conta quando o pagamento chegar.
// ============================================================

import { isValidCpfCnpj, onlyDigits } from './document'
import {
  getPlan,
  isPaymentMethod,
  todayInSaoPaulo,
  type PaymentMethod,
  type Plan,
} from './plans'

export class SubscribeError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SubscribeError'
    this.status = status
  }
}

export interface BillingRow {
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  plan: string | null
  payment_method: string | null
}

export interface SubscribeDeps {
  hasAccess(accountId: string): Promise<boolean>
  getBilling(accountId: string): Promise<BillingRow | null>
  saveBilling(accountId: string, patch: Partial<BillingRow>): Promise<void>
  createCustomer(input: { name: string; cpfCnpj: string; email: string | null; externalReference: string }): Promise<{ id: string }>
  createSubscription(input: {
    customer: string
    billingType: PaymentMethod
    value: number
    nextDueDate: string
    cycle: Plan['cycle']
    description: string
    externalReference: string
  }): Promise<{ id: string }>
  deleteSubscription(id: string): Promise<void>
  listPayments(subscriptionId: string): Promise<Array<{ status: string; invoiceUrl: string | null }>>
  sleep(ms: number): Promise<void>
}

export interface SubscribeInput {
  accountId: string
  accountName: string
  email: string | null
  planId: unknown
  method: unknown
  cpfCnpj: unknown
}

const OPEN_STATUSES = new Set(['PENDING', 'OVERDUE'])

function openInvoice(payments: Array<{ status: string; invoiceUrl: string | null }>): string | null {
  return payments.find((p) => OPEN_STATUSES.has(p.status) && p.invoiceUrl)?.invoiceUrl ?? null
}

export async function startSubscription(input: SubscribeInput, deps: SubscribeDeps): Promise<{ url: string; reused: boolean }> {
  const plan = getPlan(input.planId)
  if (!plan) throw new SubscribeError('Plano inválido.')
  if (!isPaymentMethod(input.method)) throw new SubscribeError('Forma de pagamento inválida.')
  const method = input.method

  if (await deps.hasAccess(input.accountId)) {
    throw new SubscribeError('Sua assinatura já está ativa.', 409)
  }

  const billing = await deps.getBilling(input.accountId)
  const sameProvider = billing?.provider === 'asaas'

  // Mesma escolha + fatura aberta → reaproveita.
  if (
    sameProvider &&
    billing?.provider_subscription_id &&
    billing.plan === plan.id &&
    billing.payment_method === method
  ) {
    const url = openInvoice(await deps.listPayments(billing.provider_subscription_id))
    if (url) return { url, reused: true }
  }

  let customerId = sameProvider ? billing?.provider_customer_id ?? null : null
  if (!customerId) {
    const doc = typeof input.cpfCnpj === 'string' ? onlyDigits(input.cpfCnpj) : ''
    if (!isValidCpfCnpj(doc)) throw new SubscribeError('CPF ou CNPJ inválido.')
    const customer = await deps.createCustomer({
      name: input.accountName,
      cpfCnpj: doc,
      email: input.email,
      externalReference: input.accountId,
    })
    customerId = customer.id
    await deps.saveBilling(input.accountId, { provider: 'asaas', provider_customer_id: customerId })
  }

  if (sameProvider && billing?.provider_subscription_id) {
    await deps.deleteSubscription(billing.provider_subscription_id)
  }

  const subscription = await deps.createSubscription({
    customer: customerId,
    billingType: method,
    value: plan.price,
    nextDueDate: todayInSaoPaulo(),
    cycle: plan.cycle,
    description: `JPX CRM — Plano ${plan.name}`,
    externalReference: input.accountId,
  })

  await deps.saveBilling(input.accountId, {
    provider: 'asaas',
    provider_customer_id: customerId,
    provider_subscription_id: subscription.id,
    plan: plan.id,
    payment_method: method,
  })

  // A primeira cobrança costuma existir na hora; tenta mais 2x por segurança.
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = openInvoice(await deps.listPayments(subscription.id))
    if (url) return { url, reused: false }
    await deps.sleep(800)
  }
  throw new SubscribeError('A fatura ainda está sendo gerada. Tente novamente em alguns segundos.', 502)
}
