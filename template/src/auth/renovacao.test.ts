import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import api, {
  REFRESH_KEY,
  TOKEN_KEY,
  aoRenovarSessao,
  guardarSessao,
  loginUser,
  loginWithGoogle,
  sairDaSessao,
  sessaoRecusada,
} from "./api";

/**
 * Sessão curta com renovação: o JWT de acesso dura minutos e o refresh token, guardado ao lado,
 * o renova. Num 401 fora das rotas de login o interceptor renova uma vez por vez (as requisições
 * que falharam juntas dividem a mesma renovação), grava o par novo e repete a original uma vez.
 * Sem DOM nos testes: `window` e `localStorage` são simulados, e as chamadas passam pelo axios de
 * verdade (com os interceptors) até um adaptador que faz o papel do backend.
 */

const USER = { id: "u1", email: "ana@exemplo.com", nome: "Ana", isMember: true, memberUntil: null };
const PAR_NOVO = { token: "acesso-novo", refreshToken: "refresh-novo", user: USER };

type Resposta = { status: number; data?: unknown } | "rede";

let atender: (config: InternalAxiosRequestConfig) => Resposta | Promise<Resposta>;
const enviadas: InternalAxiosRequestConfig[] = [];
const adaptadorOriginal = api.defaults.adapter;
const reload = vi.fn();
const guardado = new Map<string, string>();

/** O que o backend aceita como JWT de acesso agora. */
let acessoValido = "acesso-novo";

const chamadasDe = (url: string) => enviadas.filter((c) => c.url === url);
const corpoDe = (config: InternalAxiosRequestConfig) => JSON.parse(config.data);

function abrirSessao(token = "acesso-vencido", refresh = "refresh-1") {
  guardado.set(TOKEN_KEY, token);
  if (refresh) guardado.set(REFRESH_KEY, refresh);
}

beforeEach(() => {
  guardado.clear();
  enviadas.length = 0;
  reload.mockReset();
  acessoValido = "acesso-novo";
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => guardado.get(chave) ?? null,
    setItem: (chave: string, valor: string) => guardado.set(chave, valor),
    removeItem: (chave: string) => guardado.delete(chave),
  });
  vi.stubGlobal("window", { location: { href: "https://app.exemplo/", reload } });
  // Backend padrão: a API só aceita o JWT novo e a renovação sempre dá certo.
  atender = (config) => {
    if (config.url === "/api/auth/refresh") return { status: 200, data: PAR_NOVO };
    if (config.url === "/api/auth/logout") return { status: 204 };
    return config.headers.Authorization === `Bearer ${acessoValido}`
      ? { status: 200, data: { ok: true } }
      : { status: 401, data: { error: "Sessão expirada — faça login novamente" } };
  };
  api.defaults.adapter = async (config) => {
    enviadas.push(config);
    const resposta = await atender(config);
    if (resposta === "rede") {
      throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
    }
    const res: AxiosResponse = {
      status: resposta.status,
      statusText: "",
      data: resposta.data ?? {},
      headers: {},
      config,
    };
    if (res.status >= 400) {
      throw new AxiosError("falhou", AxiosError.ERR_BAD_REQUEST, config, null, res);
    }
    return res;
  };
});

afterEach(() => {
  api.defaults.adapter = adaptadorOriginal;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("401 com refresh token guardado", () => {
  it("renova, grava o par novo e repete a requisição original com o JWT novo, sem recarregar", async () => {
    abrirSessao();

    const res = await api.get("/api/dados");

    expect(res.data).toEqual({ ok: true });
    expect(chamadasDe("/api/auth/refresh")).toHaveLength(1);
    expect(corpoDe(chamadasDe("/api/auth/refresh")[0])).toEqual({ refreshToken: "refresh-1" });
    const dados = chamadasDe("/api/dados");
    expect(dados).toHaveLength(2);
    expect(dados[0].headers.Authorization).toBe("Bearer acesso-vencido");
    expect(dados[1].headers.Authorization).toBe("Bearer acesso-novo");
    expect(guardado.get(TOKEN_KEY)).toBe("acesso-novo");
    expect(guardado.get(REFRESH_KEY)).toBe("refresh-novo");
    expect(reload).not.toHaveBeenCalled();
  });

  it("requisições que falham juntas dividem uma única renovação", async () => {
    abrirSessao();

    const respostas = await Promise.all([api.get("/api/dados"), api.get("/api/dados"), api.get("/api/dados")]);

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(chamadasDe("/api/auth/refresh")).toHaveLength(1);
    expect(chamadasDe("/api/dados")).toHaveLength(6);
  });

  it("requisição que perdeu a corrida (outra aba já renovou) só repete, sem gastar outra renovação", async () => {
    abrirSessao();
    atender = (config) => {
      if (config.headers.Authorization === "Bearer acesso-vencido") {
        // Enquanto esta requisição voltava com 401, outra aba gravou o par novo.
        guardado.set(TOKEN_KEY, "acesso-novo");
        guardado.set(REFRESH_KEY, "refresh-novo");
        return { status: 401 };
      }
      return { status: 200, data: { ok: true } };
    };

    const res = await api.get("/api/dados");

    expect(res.status).toBe(200);
    expect(chamadasDe("/api/auth/refresh")).toHaveLength(0);
    expect(chamadasDe("/api/dados")[1].headers.Authorization).toBe("Bearer acesso-novo");
  });

  it("repete a original uma vez só: se o JWT novo também for recusado, a sessão acaba", async () => {
    abrirSessao();
    acessoValido = "outro-jwt-que-ninguem-tem";

    await expect(api.get("/api/dados")).rejects.toBeInstanceOf(AxiosError);

    expect(chamadasDe("/api/auth/refresh")).toHaveLength(1);
    expect(chamadasDe("/api/dados")).toHaveLength(2);
    expect(guardado.has(TOKEN_KEY)).toBe(false);
    expect(guardado.has(REFRESH_KEY)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, { code: "SESSAO_INVALIDA" }],
    [401, { code: "SESSAO_EXPIRADA" }],
    [403, { error: "Conta desativada. Fale com o suporte." }],
  ])("renovação recusada (%i): limpa a sessão, volta ao login e devolve o 401 original", async (status, data) => {
    abrirSessao();
    atender = (config) =>
      config.url === "/api/auth/refresh" ? { status, data } : { status: 401, data: { error: "expirou" } };

    const erro = await api.get("/api/dados").catch((e) => e);

    expect(erro.response.status).toBe(401);
    expect(erro.config.url).toBe("/api/dados");
    expect(guardado.has(TOKEN_KEY)).toBe(false);
    expect(guardado.has(REFRESH_KEY)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(chamadasDe("/api/auth/refresh")).toHaveLength(1);
  });

  it.each([
    ["rede caída", "rede" as const],
    ["500", { status: 500 }],
    ["502", { status: 502, data: { error: "Erro de configuração do serviço. Contate o suporte." } }],
    ["503", { status: 503, data: { code: "RENOVACAO_INDISPONIVEL" } }],
  ])("renovação indisponível (%s): não derruba a sessão e devolve o erro original", async (_caso, falha) => {
    abrirSessao();
    atender = (config) => (config.url === "/api/auth/refresh" ? falha : { status: 401, data: { error: "expirou" } });

    const erro = await api.get("/api/dados").catch((e) => e);

    expect(erro.response.status).toBe(401);
    expect(guardado.get(TOKEN_KEY)).toBe("acesso-vencido");
    expect(guardado.get(REFRESH_KEY)).toBe("refresh-1");
    expect(reload).not.toHaveBeenCalled();
  });

  it("depois de uma renovação indisponível, a próxima requisição tenta renovar de novo", async () => {
    abrirSessao();
    let refreshOk = false;
    atender = (config) => {
      if (config.url === "/api/auth/refresh") return refreshOk ? { status: 200, data: PAR_NOVO } : { status: 503 };
      return config.headers.Authorization === "Bearer acesso-novo" ? { status: 200 } : { status: 401 };
    };

    await expect(api.get("/api/dados")).rejects.toBeInstanceOf(AxiosError);
    refreshOk = true;

    expect((await api.get("/api/dados")).status).toBe(200);
    expect(chamadasDe("/api/auth/refresh")).toHaveLength(2);
  });
});

describe("409 RENOVACAO_EM_ANDAMENTO (outra aba renovando junto)", () => {
  const emAndamento = { status: 409, data: { code: "RENOVACAO_EM_ANDAMENTO" } };

  it("relê o armazenamento: se a outra aba gravou o par novo, repete a renovação uma vez com o refresh dela", async () => {
    vi.useFakeTimers();
    abrirSessao();
    atender = (config) => {
      if (config.url !== "/api/auth/refresh") {
        return config.headers.Authorization === "Bearer acesso-novo" ? { status: 200, data: { ok: true } } : { status: 401 };
      }
      if (corpoDe(config).refreshToken === "refresh-1") {
        setTimeout(() => guardado.set(REFRESH_KEY, "refresh-da-outra-aba"), 600); // a outra aba grava depois do 409
        return emAndamento;
      }
      return { status: 200, data: PAR_NOVO };
    };

    const resultado = api.get("/api/dados");
    await vi.advanceTimersByTimeAsync(2000);

    expect((await resultado).status).toBe(200);
    expect(chamadasDe("/api/auth/refresh").map((c) => corpoDe(c).refreshToken)).toEqual([
      "refresh-1",
      "refresh-da-outra-aba",
    ]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("se o refresh não mudou, trata como sessão expirada", async () => {
    vi.useFakeTimers();
    abrirSessao();
    atender = (config) => (config.url === "/api/auth/refresh" ? emAndamento : { status: 401 });

    const resultado = api.get("/api/dados").catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);

    expect((await resultado).response.status).toBe(401);
    expect(chamadasDe("/api/auth/refresh")).toHaveLength(1);
    expect(guardado.has(TOKEN_KEY)).toBe(false);
    expect(guardado.has(REFRESH_KEY)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("repete a renovação uma vez só: um segundo 409 encerra a sessão", async () => {
    vi.useFakeTimers();
    abrirSessao();
    atender = (config) => {
      if (config.url !== "/api/auth/refresh") return { status: 401 };
      setTimeout(() => guardado.set(REFRESH_KEY, `refresh-${enviadas.length}`), 100);
      return emAndamento;
    };

    const resultado = api.get("/api/dados").catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    await resultado;

    expect(chamadasDe("/api/auth/refresh")).toHaveLength(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("sessão sem refresh token (emitida antes da mudança)", () => {
  it("um 401 continua encerrando a sessão, sem tentar renovar", async () => {
    abrirSessao("acesso-antigo", "");

    await expect(api.get("/api/dados")).rejects.toBeInstanceOf(AxiosError);

    expect(chamadasDe("/api/auth/refresh")).toHaveLength(0);
    expect(guardado.has(TOKEN_KEY)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("rotas que não renovam", () => {
  it.each([
    ["senha errada", () => loginUser("ana@exemplo.com", "errada")],
    ["Google recusado", () => loginWithGoogle("id-token-recusado")],
    ["renovação recusada", () => api.post("/api/auth/refresh", { refreshToken: "x" })],
    ["saída recusada", () => api.post("/api/auth/logout", { refreshToken: "x" })],
  ])("401 em %s: nem renova, nem apaga a sessão guardada, nem recarrega", async (_caso, chamar) => {
    abrirSessao();
    atender = () => ({ status: 401, data: { error: "Credenciais inválidas" } });

    await expect(chamar()).rejects.toBeInstanceOf(AxiosError);

    expect(enviadas).toHaveLength(1);
    expect(guardado.get(TOKEN_KEY)).toBe("acesso-vencido");
    expect(guardado.get(REFRESH_KEY)).toBe("refresh-1");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("guardar a sessão", () => {
  const LOGIN = { token: "jwt", refreshToken: "refresh-do-login", user: USER };

  it("guarda o refresh token ao lado do JWT", () => {
    guardarSessao(LOGIN);

    expect(guardado.get(TOKEN_KEY)).toBe("jwt");
    expect(guardado.get(REFRESH_KEY)).toBe("refresh-do-login");
  });

  it("backend ainda sem refresh token: guarda só o JWT e descarta um refresh antigo", () => {
    guardado.set(REFRESH_KEY, "refresh-de-outra-sessao");

    guardarSessao({ token: "jwt", user: USER });

    expect(guardado.get(TOKEN_KEY)).toBe("jwt");
    expect(guardado.has(REFRESH_KEY)).toBe(false);
  });
});

describe("avisar a tela da renovação", () => {
  it("quem observa recebe o usuário atualizado (assinatura e nome) a cada renovação", async () => {
    abrirSessao();
    const usuarioNovo = { ...USER, isMember: false };
    atender = (config) =>
      config.url === "/api/auth/refresh"
        ? { status: 200, data: { ...PAR_NOVO, user: usuarioNovo } }
        : config.headers.Authorization === "Bearer acesso-novo"
          ? { status: 200 }
          : { status: 401 };
    const ouvinte = vi.fn();
    const parar = aoRenovarSessao(ouvinte);

    await api.get("/api/dados");
    expect(ouvinte).toHaveBeenCalledExactlyOnceWith(usuarioNovo);

    parar();
    abrirSessao();
    await api.get("/api/dados");
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});

describe("sair", () => {
  it("revoga a família no backend com o refresh token e limpa o armazenamento", async () => {
    abrirSessao("acesso", "refresh-1");

    sairDaSessao();

    expect(guardado.has(TOKEN_KEY)).toBe(false);
    expect(guardado.has(REFRESH_KEY)).toBe(false);
    await vi.waitFor(() => expect(chamadasDe("/api/auth/logout")).toHaveLength(1));
    expect(corpoDe(chamadasDe("/api/auth/logout")[0])).toEqual({ refreshToken: "refresh-1" });
    expect(reload).not.toHaveBeenCalled();
  });

  it("backend fora do ar não trava a saída nem deixa erro solto", async () => {
    abrirSessao();
    atender = () => "rede";

    expect(() => sairDaSessao()).not.toThrow();

    expect(guardado.size).toBe(0);
    await vi.waitFor(() => expect(chamadasDe("/api/auth/logout")).toHaveLength(1));
  });

  it("sessão antiga, sem refresh token: só limpa, sem chamar o backend", () => {
    abrirSessao("acesso-antigo", "");

    sairDaSessao();

    expect(guardado.size).toBe(0);
    expect(enviadas).toHaveLength(0);
  });
});

describe("sessaoRecusada (o que o bootstrap pode apagar)", () => {
  const erroHttp = (status: number) =>
    new AxiosError("falhou", AxiosError.ERR_BAD_REQUEST, undefined, null, {
      status,
      statusText: "",
      data: {},
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    });

  it("403 e 404 (conta sem acesso ou apagada) apagam; rede caída, 5xx e o 401 já tratado pelo interceptor não", () => {
    expect(sessaoRecusada(erroHttp(404))).toBe(true);
    expect(sessaoRecusada(erroHttp(403))).toBe(true);
    expect(sessaoRecusada(erroHttp(401))).toBe(false);
    expect(sessaoRecusada(erroHttp(500))).toBe(false);
    expect(sessaoRecusada(erroHttp(503))).toBe(false);
    expect(sessaoRecusada(new AxiosError("Network Error", AxiosError.ERR_NETWORK))).toBe(false);
    expect(sessaoRecusada(new Error("qualquer"))).toBe(false);
    expect(sessaoRecusada(undefined)).toBe(false);
  });
});
