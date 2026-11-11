import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import api, { REFRESH_KEY, TOKEN_KEY, type AuthUser } from "./api";
import { AuthProvider, useAuth } from "./AuthContext";
import AvisoContaAberta from "./AvisoContaAberta";
import { MEUECOO_FALHOU } from "./loginUnico";

/**
 * Aparelho compartilhado: a Ana deixou a sessão dela aberta e a Bia clica "Abrir" no Meu Ecoo. Se o
 * código não vale (vencido, já usado, Meu Ecoo fora), o app entra pela sessão guardada; o aviso diz de
 * quem é a conta e oferece sair (decisão de 11/11/2026). Roda o AuthProvider de verdade, sem DOM: a
 * sonda não desenha nada, só guarda o estado do login e o aviso que o app mostraria; o backend é um
 * adaptador do axios, como em loginUnico.test.ts.
 */

const ANA: AuthUser = { id: "a", email: "ana@exemplo.com", nome: "Ana", isMember: true, memberUntil: null };
const BIA: AuthUser = { id: "b", email: "bia@exemplo.com", nome: "Bia", isMember: true, memberUntil: null };

type Resposta = { status: number; data?: unknown };

/** Quem o backend reconhece por JWT (GET /api/auth/me). */
let contas: Record<string, AuthUser>;
let trocaDoCodigo: Resposta;
const enviadas: InternalAxiosRequestConfig[] = [];
const adaptadorOriginal = api.defaults.adapter;
const guardado = new Map<string, string>();
let janela: {
  location: { href: string; reload: () => void };
  history: { state: unknown; replaceState: (estado: unknown, titulo: string, url: string | URL) => void };
  HTMLIFrameElement: unknown;
};
let raiz: Root | null = null;
let tela: { auth: ReturnType<typeof useAuth>; aviso: ReactNode };

const chamadasDe = (url: string) => enviadas.filter((c) => c.url === url);

function Sonda() {
  // O aviso é desenhado aqui dentro, com o mesmo contexto do app: os botões chamam as ações de verdade.
  tela = { auth: useAuth(), aviso: AvisoContaAberta() };
  return null;
}

function guardarSessaoDa(user: AuthUser) {
  guardado.set(TOKEN_KEY, `acesso-${user.id}`);
  guardado.set(REFRESH_KEY, `refresh-${user.id}`);
  contas[`acesso-${user.id}`] = user;
}

async function abrirApp(href = janela.location.href) {
  janela.location.href = href;
  // React sem DOM: como a sonda não desenha nada, um contêiner de mentira basta.
  const ouvintes = { addEventListener() {}, removeEventListener() {} };
  const conteiner = { ...ouvintes, nodeType: 1, tagName: "DIV", nodeName: "DIV", ownerDocument: { ...ouvintes, nodeType: 9 } };
  raiz = createRoot(conteiner as unknown as Element);
  await act(async () => {
    raiz?.render(
      <AuthProvider>
        <Sonda />
      </AuthProvider>,
    );
  });
}

async function fecharApp() {
  await act(async () => raiz?.unmount());
  raiz = null;
}

/** Acha no aviso o botão com esse texto e o aciona, como um clique. */
async function clicar(texto: string) {
  const achar = (no: ReactNode): { onClick: () => void } | null => {
    if (Array.isArray(no)) return no.map(achar).find(Boolean) ?? null;
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(no)) return null;
    if (no.props.children === texto && no.props.onClick) return no.props as { onClick: () => void };
    return achar(no.props.children);
  };
  const botao = achar(tela.aviso);
  if (!botao) throw new Error(`botão "${texto}" não está na tela`);
  await act(async () => botao.onClick());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  guardado.clear();
  enviadas.length = 0;
  contas = {};
  trocaDoCodigo = { status: 401, data: { error: "Código inválido ou expirado." } };
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => guardado.get(chave) ?? null,
    setItem: (chave: string, valor: string) => guardado.set(chave, valor),
    removeItem: (chave: string) => guardado.delete(chave),
  });
  janela = {
    location: { href: "https://app.exemplo/", reload: vi.fn() },
    history: {
      state: null,
      replaceState: (_estado, _titulo, url) => {
        janela.location.href = String(url);
      },
    },
    HTMLIFrameElement: class {},
  };
  vi.stubGlobal("window", janela);
  api.defaults.adapter = async (config) => {
    enviadas.push(config);
    let resposta: Resposta = { status: 404 };
    if (config.url === "/api/auth/meu-ecoo") resposta = trocaDoCodigo;
    if (config.url === "/api/auth/login") resposta = { status: 200, data: { token: "acesso-b", refreshToken: "refresh-b", user: BIA } };
    if (config.url === "/api/auth/logout") resposta = { status: 204 };
    if (config.url === "/api/auth/me") {
      const conta = contas[String(config.headers.Authorization).replace("Bearer ", "")];
      resposta = conta ? { status: 200, data: conta } : { status: 403, data: { error: "Sem acesso." } };
    }
    const res: AxiosResponse = { status: resposta.status, statusText: "", data: resposta.data ?? {}, headers: {}, config };
    if (res.status >= 400) throw new AxiosError("falhou", AxiosError.ERR_BAD_REQUEST, config, null, res);
    return res;
  };
});

afterEach(async () => {
  await fecharApp();
  api.defaults.adapter = adaptadorOriginal;
  vi.unstubAllGlobals();
});

describe("login único com a sessão de outra pessoa aberta no aparelho", () => {
  it("código aceito: entra na conta do código, sem aviso", async () => {
    guardarSessaoDa(ANA);
    contas["acesso-b"] = BIA;
    trocaDoCodigo = { status: 200, data: { token: "acesso-b", refreshToken: "refresh-b", user: BIA } };

    await abrirApp("https://app.exemplo/?meuecoo_codigo=c0d1g0");

    expect(tela.auth.isLoggedIn).toBe(true);
    expect(tela.auth.user?.email).toBe("bia@exemplo.com");
    expect(tela.aviso).toBeNull();
  });

  it("código recusado e nenhuma sessão guardada: tela de entrar com o aviso de sempre; quem entra depois não vê aviso de conta", async () => {
    await abrirApp("https://app.exemplo/?meuecoo_codigo=velho");

    expect(tela.auth.isLoggedIn).toBe(false);
    expect(tela.auth.error).toBe(MEUECOO_FALHOU);
    expect(tela.aviso).toBeNull();

    contas["acesso-b"] = BIA;
    await act(async () => tela.auth.login("bia@exemplo.com", "senha"));

    expect(tela.auth.user?.email).toBe("bia@exemplo.com");
    expect(tela.aviso).toBeNull();
  });

  it("código recusado e a sessão guardada também recusada pelo servidor: tela de entrar com o aviso de sempre", async () => {
    guardado.set(TOKEN_KEY, "acesso-sem-conta");

    await abrirApp("https://app.exemplo/?meuecoo_codigo=velho");

    expect(tela.auth.isLoggedIn).toBe(false);
    expect(tela.auth.error).toBe(MEUECOO_FALHOU);
    expect(tela.aviso).toBeNull();
  });

  it.each([
    ["o e-mail", ANA, "Não foi possível entrar direto pelo Meu Ecoo. Você está na conta ana@exemplo.com, que já estava aberta neste aparelho."],
    ["o nome, sem e-mail", { ...ANA, email: "" }, "Não foi possível entrar direto pelo Meu Ecoo. Você está na conta Ana, que já estava aberta neste aparelho."],
    ["só o aviso, sem e-mail nem nome", { ...ANA, email: "", nome: "" }, "Não foi possível entrar direto pelo Meu Ecoo. Você está na conta que já estava aberta neste aparelho."],
  ])("código recusado com a sessão guardada: entra nela e avisa de quem é a conta (%s)", async (_caso, conta, texto) => {
    guardarSessaoDa(conta);

    await abrirApp("https://app.exemplo/?meuecoo_codigo=velho");

    expect(tela.auth.isLoggedIn).toBe(true);
    expect(tela.auth.user).toEqual(conta);
    const html = renderToStaticMarkup(tela.aviso as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain(texto);
    expect(html).toContain('<button type="button"');
    expect(html.match(/<button type="button"/g)).toHaveLength(2);
    expect(html).toContain("Sair e entrar com a minha conta");
    expect(html).toContain("Continuar nesta conta");
  });

  it("Meu Ecoo fora do ar com a sessão guardada: também avisa", async () => {
    guardarSessaoDa(ANA);
    trocaDoCodigo = { status: 502, data: { error: "Serviço de autenticação indisponível." } };

    await abrirApp("https://app.exemplo/?meuecoo_codigo=c0d1g0");

    expect(tela.auth.user?.email).toBe("ana@exemplo.com");
    expect(renderToStaticMarkup(tela.aviso as ReactElement)).toContain("Você está na conta ana@exemplo.com");
  });

  it("sem código: entra pela sessão guardada, sem aviso", async () => {
    guardarSessaoDa(ANA);

    await abrirApp("https://app.exemplo/");

    expect(tela.auth.user?.email).toBe("ana@exemplo.com");
    expect(tela.aviso).toBeNull();
  });

  it("o aviso vive só na memória: recarregar a página não o traz de volta", async () => {
    guardarSessaoDa(ANA);
    await abrirApp("https://app.exemplo/?meuecoo_codigo=velho");
    expect(tela.aviso).not.toBeNull();

    await fecharApp();
    await abrirApp();

    expect(tela.auth.user?.email).toBe("ana@exemplo.com");
    expect(tela.aviso).toBeNull();
  });

  it("Continuar nesta conta: só esconde o aviso", async () => {
    guardarSessaoDa(ANA);
    await abrirApp("https://app.exemplo/?meuecoo_codigo=velho");

    await clicar("Continuar nesta conta");

    expect(tela.aviso).toBeNull();
    expect(tela.auth.isLoggedIn).toBe(true);
    expect(tela.auth.user?.email).toBe("ana@exemplo.com");
    expect(guardado.get(TOKEN_KEY)).toBe("acesso-a");
    expect(chamadasDe("/api/auth/logout")).toHaveLength(0);
  });

  it("Sair e entrar com a minha conta: sai como o Sair do app e leva à tela de entrar, sem o aviso do código", async () => {
    guardarSessaoDa(ANA);
    await abrirApp("https://app.exemplo/?meuecoo_codigo=velho");

    await clicar("Sair e entrar com a minha conta");

    expect(tela.auth.isLoggedIn).toBe(false);
    expect(tela.auth.error).toBeNull();
    expect(tela.aviso).toBeNull();
    expect(guardado.has(TOKEN_KEY)).toBe(false);
    expect(guardado.has(REFRESH_KEY)).toBe(false);
    expect(chamadasDe("/api/auth/logout")).toHaveLength(1);
    expect(JSON.parse(chamadasDe("/api/auth/logout")[0].data)).toEqual({ refreshToken: "refresh-a" });

    contas["acesso-b"] = BIA;
    await act(async () => tela.auth.login("bia@exemplo.com", "senha"));

    expect(tela.auth.user?.email).toBe("bia@exemplo.com");
    expect(tela.aviso).toBeNull();
  });
});
