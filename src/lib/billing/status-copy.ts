// ============================================================
// JPX CRM — textos da página /assinatura e link do WhatsApp.
// Puro para teste unitário. Textos em pt-BR fixos: a cobrança é uma
// customização JPX para clientes no Brasil.
// ============================================================

export type BillingStatus = 'pending' | 'active' | 'past_due' | 'canceled'

export interface BillingCopy {
  title: string
  description: string
  whatsappIntent: string
}

/**
 * `status` pode vir nulo (conta sem linha em account_billing) e
 * `periodEnd` no passado significa "active" vencido.
 */
export function billingCopy(
  status: BillingStatus | null,
  periodEnd: string | null,
  now: Date = new Date()
): BillingCopy {
  const expired = status === 'active' && periodEnd !== null && new Date(periodEnd) <= now

  if (expired) {
    return {
      title: 'Sua assinatura venceu',
      description:
        'Renove para voltar a usar o JPX CRM. Seus contatos, conversas e configurações continuam guardados.',
      whatsappIntent: 'renovar minha assinatura do JPX CRM',
    }
  }
  if (status === 'past_due') {
    return {
      title: 'Pagamento pendente',
      description:
        'Não identificamos o pagamento da sua assinatura. Fale com a gente para regularizar e liberar o acesso.',
      whatsappIntent: 'regularizar o pagamento do JPX CRM',
    }
  }
  if (status === 'canceled') {
    return {
      title: 'Assinatura cancelada',
      description:
        'Sua assinatura foi cancelada. Para reativar o JPX CRM, fale com a gente pelo WhatsApp.',
      whatsappIntent: 'reativar minha assinatura do JPX CRM',
    }
  }
  return {
    title: 'Sua conta está quase pronta',
    description:
      'Para liberar o JPX CRM, fale com a gente pelo WhatsApp. Assim que o pagamento for confirmado, seu acesso é liberado.',
    whatsappIntent: 'ativar o JPX CRM',
  }
}

/** Link wa.me com a mensagem já preenchida (conta e e-mail para identificar). */
export function whatsappLink(
  phone: string,
  intent: string,
  accountName: string | null,
  email: string | null
): string {
  const parts = [`Olá! Quero ${intent}.`]
  if (accountName) parts.push(`Conta: ${accountName}`)
  if (email) parts.push(`E-mail: ${email}`)
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(parts.join('\n'))}`
}
