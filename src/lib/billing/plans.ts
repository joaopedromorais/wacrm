// ============================================================
// JPX CRM — planos de assinatura.
//
// ÚNICO lugar para mudar preço/nome. Valores em reais.
// Ao mudar um preço, assinaturas já criadas no Asaas continuam com
// o valor antigo (é o comportamento do gateway); só as novas usam o
// valor daqui.
// ============================================================

export type PlanId = 'mensal' | 'semestral' | 'anual'
export type AsaasCycle = 'MONTHLY' | 'SEMIANNUALLY' | 'YEARLY'
export type PaymentMethod = 'PIX' | 'CREDIT_CARD'

export interface Plan {
  id: PlanId
  name: string
  /** Valor cobrado por ciclo. */
  price: number
  months: number
  cycle: AsaasCycle
  highlight?: string
}

export const PLANS: readonly Plan[] = [
  { id: 'mensal', name: 'Mensal', price: 197, months: 1, cycle: 'MONTHLY' },
  { id: 'semestral', name: 'Semestral', price: 997, months: 6, cycle: 'SEMIANNUALLY', highlight: 'Economize 15%' },
  { id: 'anual', name: 'Anual', price: 1797, months: 12, cycle: 'YEARLY', highlight: 'Economize 24%' },
] as const

/** Dias de tolerância depois do vencimento antes de bloquear. */
export const GRACE_DAYS = 3

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['PIX', 'CREDIT_CARD']

export function getPlan(id: unknown): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}

/** Valor por mês, para exibir ("R$ 149,75/mês"). */
export function monthlyEquivalent(plan: Plan): number {
  return Math.round((plan.price / plan.months) * 100) / 100
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Hoje no fuso de São Paulo, formato YYYY-MM-DD (o Asaas usa datas sem hora). */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Fim do acesso pago: vencimento da cobrança + meses do plano +
 * tolerância, às 23:59:59 de São Paulo. Meses somados "no calendário"
 * (31/01 + 1 mês = 28 ou 29/02).
 */
export function periodEndFor(dueDate: string, months: number, graceDays: number = GRACE_DAYS): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate)
  if (!m) throw new Error(`Data inválida: ${dueDate}`)
  const year = Number(m[1])
  const monthIndex = Number(m[2]) - 1 + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const targetMonth = ((monthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(Number(m[3]), lastDay)
  const base = new Date(Date.UTC(targetYear, targetMonth, day))
  base.setUTCDate(base.getUTCDate() + graceDays)
  const iso = base.toISOString().slice(0, 10)
  return `${iso}T23:59:59-03:00`
}
