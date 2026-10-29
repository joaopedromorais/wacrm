import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// JPX CRM — trava de assinatura no middleware (migration 900).
// Cenários: conta liberada passa; bloqueada vai para /assinatura nas
// páginas e recebe 402 nas APIs internas; webhook/cron/v1/convites
// nunca são barrados; erro na consulta = bloqueado (falha fechada).

let mockUser: { id: string } | null = null;
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: true,
  error: null,
};
const rpc = vi.fn<(fn: string) => Promise<typeof rpcResult>>(async () => rpcResult);

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: unknown[]) => void } },
  ) => ({
    rpc: (fn: string) => rpc(fn),
    auth: {
      getUser: async () => {
        opts.cookies.setAll([
          { name: "sb-test-auth-token", value: "rotated", options: { path: "/" } },
        ]);
        return { data: { user: mockUser } };
      },
    },
  }),
}));

const { middleware } = await import("./middleware");

const req = (path: string) => new NextRequest(`https://app.test${path}`);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mockUser = { id: "user-1" };
  rpcResult = { data: true, error: null };
  rpc.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("middleware — assinatura JPX", () => {
  it("deixa passar conta ativa no painel", async () => {
    const res = await middleware(req("/inbox"));
    expect(res.headers.get("location")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("my_account_has_access");
  });

  it("manda conta bloqueada para /assinatura mantendo o cookie renovado", async () => {
    rpcResult = { data: false, error: null };
    const res = await middleware(req("/dashboard?tab=x"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/assinatura");
    expect(location.search).toBe("");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("rotated");
  });

  it("responde 402 em API interna para conta bloqueada", async () => {
    rpcResult = { data: false, error: null };
    const res = await middleware(req("/api/whatsapp/send"));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("account_inactive");
  });

  it.each([
    "/api/whatsapp/webhook",
    "/api/automations/cron",
    "/api/flows/cron",
    "/api/v1/messages",
    "/api/invitations/abc/redeem",
  ])("nunca barra %s, mesmo com conta bloqueada", async (path) => {
    rpcResult = { data: false, error: null };
    const res = await middleware(req(path));
    expect(res.status).not.toBe(402);
    expect(res.headers.get("location")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não consulta assinatura na própria /assinatura nem em /join", async () => {
    rpcResult = { data: false, error: null };
    for (const path of ["/assinatura", "/join/abc"]) {
      const res = await middleware(req(path));
      expect(res.headers.get("location")).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falha fechada: erro na consulta bloqueia", async () => {
    rpcResult = { data: null, error: { message: "function does not exist" } };
    const res = await middleware(req("/contacts"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/assinatura");
  });

  it("visitante sem login continua indo para /login, sem consultar assinatura", async () => {
    mockUser = null;
    const res = await middleware(req("/dashboard"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("usuário logado em /login vai para /dashboard (e de lá a trava decide)", async () => {
    rpcResult = { data: false, error: null };
    const res = await middleware(req("/login"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });
});
