// ============================================================
// Cliente mínimo da API v3 do Asaas (só o que o JPX CRM usa).
//
// Variáveis de ambiente (servidor):
//   ASAAS_API_KEY        — chave da API (sandbox ou produção)
//   ASAAS_API_URL        — base da API. Padrão: sandbox
//                          (https://api-sandbox.asaas.com/v3).
//                          Produção: https://api.asaas.com/v3
//   ASAAS_WEBHOOK_TOKEN  — token configurado no webhook do Asaas
//                          (header asaas-access-token). Não use a
//                          chave da API aqui.
// ============================================================

import type { AsaasCycle, PaymentMethod } from './plans'

export const ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3'

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY)
}

export class AsaasError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AsaasError'
    this.status = status
  }
}

async function asaasFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = process.env.ASAAS_API_KEY
  if (!apiKey) throw new AsaasError('ASAAS_API_KEY não configurada', 503)
  const base = (process.env.ASAAS_API_URL || ASAAS_SANDBOX_URL).replace(/\/+$/, '')

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'JPX-CRM/1.0',
      access_token: apiKey,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })

  const body = (await res.json().catch(() => null)) as
    | (T & { errors?: Array<{ description?: string }> })
    | null

  if (!res.ok) {
    const detail = body?.errors?.map((e) => e.description).filter(Boolean).join('; ')
    throw new AsaasError(detail || `Asaas respondeu ${res.status}`, res.status)
  }
  return body as T
}

export interface AsaasCustomer {
  id: string
}

export function createCustomer(input: {
  name: string
  cpfCnpj: string
  email?: string | null
  externalReference: string
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email ?? undefined,
      externalReference: input.externalReference,
    }),
  })
}

export interface AsaasSubscription {
  id: string
  status?: string
}

export function createSubscription(input: {
  customer: string
  billingType: PaymentMethod
  value: number
  nextDueDate: string
  cycle: AsaasCycle
  description: string
  externalReference: string
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteSubscription(id: string): Promise<{ deleted: boolean; id: string }> {
  return asaasFetch(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface AsaasPayment {
  id: string
  status: string
  dueDate: string
  invoiceUrl: string | null
}

export async function listSubscriptionPayments(id: string): Promise<AsaasPayment[]> {
  const res = await asaasFetch<{ data?: AsaasPayment[] }>(
    `/subscriptions/${encodeURIComponent(id)}/payments`,
  )
  return res.data ?? []
}
