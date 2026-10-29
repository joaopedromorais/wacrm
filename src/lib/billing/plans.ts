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
  /** Preço cheio por ciclo (depois que as vagas de lançamento acabam). */
  price: number
  /** Preço de lançamento por ciclo (fundadores). */
  launchPrice: number
  months: number
  cycle: AsaasCycle
}

export const PLANS: readonly Plan[] = [
  { id: 'mensal', name: 'Mensal', price: 197, launchPrice: 127, months: 1, cycle: 'MONTHLY' },
  { id: 'semestral', name: 'Semestral', price: 997, launchPrice: 647, months: 6, cycle: 'SEMIANNUALLY' },
  { id: 'anual', name: 'Anual', price: 1797, launchPrice: 1147, months: 12, cycle: 'YEARLY' },
] as const

/**
 * Preço de lançamento: vale para as primeiras `seats` contas que
 * PAGAREM. Quem entrou como fundador mantém o preço de lançamento
 * enquanto for assinante (inclusive ao trocar de plano).
 * Para encerrar o lançamento antes: enabled = false.
 */
export const LAUNCH = { enabled: true, seats: 50 } as const

/** A conta paga preço de lançamento? */
export function launchApplies(isFounder: boolean, seatsTaken: number): boolean {
  return LAUNCH.enabled && (isFounder || seatsTaken < LAUNCH.seats)
}

export function priceFor(plan: Plan, launch: boolean): number {
  return launch ? plan.launchPrice : plan.price
}

/** Economia (%) frente a pagar o mensal da mesma tabela pelo mesmo período. */
export function savingsPercent(plan: Plan, launch: boolean): number {
  const monthly = PLANS.find((p) => p.id === 'mensal')!
  const base = priceFor(monthly, launch) * plan.months
  return Math.floor((1 - priceFor(plan, launch) / base) * 100)
}

/** Dias de tolerância depois do vencimento antes de bloquear. */
export const GRACE_DAYS = 3

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['PIX', 'CREDIT_CARD']

export function getPlan(id: unknown): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}

/** Valor por mês, para exibir ("R$ 95,58/mês"). */
export function monthlyEquivalent(plan: Plan, launch = false): number {
  return Math.round((priceFor(plan, launch) / plan.months) * 100) / 100
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
