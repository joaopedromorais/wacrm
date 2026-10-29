// ============================================================
// JPX CRM — textos da página /assinatura e link do WhatsApp.
// Puro para teste unitário. Textos em pt-BR fixos: a cobrança é uma
// customização JPX para clientes no Brasil.
// ============================================================

export type BillingStatus = 'pending' | 'active' | 'past_due' | 'canceled'

export interface BillingCopy {
  title: string
  /** Texto quando a liberação é manual (WhatsApp). */
  description: string
  /** Texto quando dá para assinar online (Asaas). */
  onlineDescription: string
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
      onlineDescription:
        'Renove abaixo para voltar a usar o JPX CRM. Seus contatos, conversas e configurações continuam guardados.',
      whatsappIntent: 'renovar minha assinatura do JPX CRM',
    }
  }
  if (status === 'past_due') {
    return {
      title: 'Pagamento pendente',
      description:
        'Não identificamos o pagamento da sua assinatura. Fale com a gente para regularizar e liberar o acesso.',
      onlineDescription:
        'Não identificamos o pagamento da sua assinatura. Escolha um plano abaixo para regularizar e liberar o acesso na hora.',
      whatsappIntent: 'regularizar o pagamento do JPX CRM',
    }
  }
  if (status === 'canceled') {
    return {
      title: 'Assinatura cancelada',
      description:
        'Sua assinatura foi cancelada. Para reativar o JPX CRM, fale com a gente pelo WhatsApp.',
      onlineDescription: 'Sua assinatura foi cancelada. Escolha um plano abaixo para reativar o JPX CRM.',
      whatsappIntent: 'reativar minha assinatura do JPX CRM',
    }
  }
  return {
    title: 'Sua conta está quase pronta',
    description:
      'Para liberar o JPX CRM, fale com a gente pelo WhatsApp. Assim que o pagamento for confirmado, seu acesso é liberado.',
    onlineDescription:
      'Escolha seu plano e pague por Pix ou cartão. O acesso é liberado assim que o pagamento for confirmado.',
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
