// ============================================================
// JPX CRM — regras de caminho do controle de assinatura.
//
// Puro (sem I/O) para o middleware importar e para teste unitário.
// O middleware só aplica a trava a usuários LOGADOS; chamadas
// servidor-a-servidor (webhook da Meta, cron, engine) não têm cookie
// de sessão e nunca chegam aqui como "usuário".
// ============================================================

/** Página para onde vai quem está logado mas sem assinatura ativa. */
export const BILLING_PAGE = '/assinatura'

/**
 * Rotas de API que continuam livres mesmo para uma conta bloqueada.
 *
 *  - webhook da Meta: mensagens dos clientes do cliente nunca podem
 *    se perder por causa de cobrança;
 *  - crons: chamados por agendador externo com segredo próprio;
 *  - /api/v1: autenticada por API key — a trava fica em requireApiKey;
 *  - convites: quem aceita um convite entra numa conta que já paga,
 *    e o fluxo passa por essas rotas antes de mudar de conta;
 *  - cobrança: webhook do gateway e o endpoint de assinar, que é
 *    justamente o caminho de quem está bloqueado.
 */
const EXEMPT_API_PREFIXES = [
  '/api/whatsapp/webhook',
  '/api/automations/cron',
  '/api/flows/cron',
  '/api/v1/',
  '/api/invitations/',
  // cobrança: o webhook do Asaas e o "Assinar" de quem está bloqueado
  '/api/billing/',
] as const

export function isBillingExemptApi(pathname: string): boolean {
  return EXEMPT_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
