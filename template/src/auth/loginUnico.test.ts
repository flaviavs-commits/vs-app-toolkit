import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import api, { REFRESH_KEY, TOKEN_KEY } from "./api";
import {
  MEUECOO_FALHOU,
  entrarPeloMeuEcoo,
  temCodigoDoMeuEcoo,
  tirarCodigoDaUrl,
} from "./loginUnico";

/**
 * Login único (B7 do Meu Ecoo): o "Abrir" do Meu Ecoo abre o app com `?meuecoo_codigo=<código de uso
 * único>`. O front tira o código da URL antes de qualquer chamada de rede (ele não fica no histórico nem
 * volta num recarregamento) e o troca por sessão no próprio backend. Sem DOM nos testes: `window` e
 * `localStorage` são simulados, e a chamada passa pelo axios de verdade (com os interceptors) até um
 * adaptador que faz o papel do backend.
 */

const USER = { id: "u1", email: "ana@exemplo.com", nome: "Ana", isMember: true, memberUntil: null };
const SESSAO = { token: "acesso", refreshToken: "refresh", user: USER };
const ROTA = "/api/auth/meu-ecoo";

type Resposta = { status: number; data?: unknown } | "rede";

let atender: (config: InternalAxiosRequestConfig) => Resposta;
const enviadas: InternalAxiosRequestConfig[] = [];
const hrefNoEnvio: string[] = [];
const adaptadorOriginal = api.defaults.adapter;
const reload = vi.fn();
const guardado = new Map<string, string>();
let janela: {
  location: { href: string; reload: () => void };
  history: { state: unknown; replaceState: ReturnType<typeof vi.fn> };
};

const corpoDe = (config: InternalAxiosRequestConfig) => JSON.parse(config.data);

function abrirEm(href: string) {
  janela.location.href = href;
}

beforeEach(() => {
  guardado.clear();
  enviadas.length = 0;
  hrefNoEnvio.length = 0;
  reload.mockReset();
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => guardado.get(chave) ?? null,
    setItem: (chave: string, valor: string) => guardado.set(chave, valor),
    removeItem: (chave: string) => guardado.delete(chave),
  });
  janela = {
    location: { href: "https://app.exemplo/", reload },
    history: {
      state: { idx: 3 },
      // Como o navegador: trocar a entrada do histórico muda o endereço da página.
      replaceState: vi.fn((_estado: unknown, _titulo: string, url: string | URL) => {
        janela.location.href = String(url);
      }),
    },
  };
  vi.stubGlobal("window", janela);
  // Backend padrão: a troca dá certo.
  atender = () => ({ status: 200, data: SESSAO });
  api.defaults.adapter = async (config) => {
    enviadas.push(config);
    hrefNoEnvio.push(janela.location.href);
    const resposta = atender(config);
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
  vi.unstubAllGlobals();
});

describe("temCodigoDoMeuEcoo", () => {
  it("é verdadeiro quando a URL traz o parâmetro, mesmo vazio, e falso sem ele", () => {
    expect(temCodigoDoMeuEcoo()).toBe(false);
    abrirEm("https://app.exemplo/?aba=2");
    expect(temCodigoDoMeuEcoo()).toBe(false);
    abrirEm("https://app.exemplo/?meuecoo_codigo=abc");
    expect(temCodigoDoMeuEcoo()).toBe(true);
    abrirEm("https://app.exemplo/?meuecoo_codigo=");
    expect(temCodigoDoMeuEcoo()).toBe(true);
  });

  it("só olha a leitura: não mexe na URL nem no histórico", () => {
    abrirEm("https://app.exemplo/?meuecoo_codigo=abc");
    temCodigoDoMeuEcoo();
    expect(janela.history.replaceState).not.toHaveBeenCalled();
    expect(janela.location.href).toBe("https://app.exemplo/?meuecoo_codigo=abc");
  });
});

describe("tirarCodigoDaUrl", () => {
  it("devolve o código e tira só esse parâmetro: os outros e o hash ficam", () => {
    abrirEm("https://app.exemplo/painel?aba=2&meuecoo_codigo=abc123&x=1#meta");
    expect(tirarCodigoDaUrl()).toBe("abc123");
    expect(janela.location.href).toBe("https://app.exemplo/painel?aba=2&x=1#meta");
  });

  it("troca a entrada do histórico mantendo o estado da página, sem criar outra entrada", () => {
    abrirEm("https://app.exemplo/?meuecoo_codigo=abc");
    tirarCodigoDaUrl();
    expect(janela.history.replaceState).toHaveBeenCalledTimes(1);
    const [estado, titulo] = janela.history.replaceState.mock.calls[0];
    expect(estado).toBe(janela.history.state);
    expect(titulo).toBe("");
  });

  it("sem o parâmetro devolve null e não toca no histórico", () => {
    abrirEm("https://app.exemplo/?aba=2");
    expect(tirarCodigoDaUrl()).toBeNull();
    expect(janela.history.replaceState).not.toHaveBeenCalled();
  });
});

describe("entrarPeloMeuEcoo", () => {
  it("sem código na URL não chama o backend", async () => {
    expect(await entrarPeloMeuEcoo()).toBeNull();
    expect(enviadas).toHaveLength(0);
  });

  it("troca o código no backend e devolve a sessão, sem guardá-la (quem guarda é o provedor de login)", async () => {
    abrirEm("https://app.exemplo/?meuecoo_codigo=c0d1g0");

    expect(await entrarPeloMeuEcoo()).toEqual({ sessao: SESSAO });
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0].method).toBe("post");
    expect(enviadas[0].url).toBe(ROTA);
    expect(corpoDe(enviadas[0])).toEqual({ codigo: "c0d1g0" });
    expect(guardado.size).toBe(0);
  });

  it("tira o código da URL antes de a requisição sair", async () => {
    abrirEm("https://app.exemplo/?meuecoo_codigo=c0d1g0&aba=2");

    await entrarPeloMeuEcoo();

    expect(hrefNoEnvio).toEqual(["https://app.exemplo/?aba=2"]);
  });

  it("código em branco: segue o caminho de sempre, sem chamada, com a URL já limpa", async () => {
    abrirEm("https://app.exemplo/?meuecoo_codigo=%20%20");

    expect(await entrarPeloMeuEcoo()).toBeNull();
    expect(enviadas).toHaveLength(0);
    expect(janela.location.href).toBe("https://app.exemplo/");
  });

  it("código recusado (inválido, usado ou vencido): falhou, sem tentar renovar nem derrubar a sessão guardada", async () => {
    guardado.set(TOKEN_KEY, "acesso-guardado");
    guardado.set(REFRESH_KEY, "refresh-guardado");
    atender = () => ({ status: 401, data: { error: "Código inválido ou expirado." } });
    abrirEm("https://app.exemplo/?meuecoo_codigo=velho");

    expect(await entrarPeloMeuEcoo()).toEqual({ falhou: true });

    // O 401 desta rota é tentativa recusada, não sessão expirada: nada de renovação, de recarregar
    // a página (o código ia junto) nem de apagar o que a pessoa já tinha guardado.
    expect(enviadas).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
    expect(guardado.get(TOKEN_KEY)).toBe("acesso-guardado");
    expect(guardado.get(REFRESH_KEY)).toBe("refresh-guardado");
  });

  it("backend fora do ar ou sem rede: falhou, sem erro solto", async () => {
    abrirEm("https://app.exemplo/?meuecoo_codigo=c0d1g0");
    atender = () => ({ status: 502, data: { error: "Serviço de autenticação indisponível." } });
    expect(await entrarPeloMeuEcoo()).toEqual({ falhou: true });

    abrirEm("https://app.exemplo/?meuecoo_codigo=c0d1g0");
    atender = () => "rede";
    expect(await entrarPeloMeuEcoo()).toEqual({ falhou: true });
  });

  it("o aviso que a tela de login mostra diz o que fazer", () => {
    expect(MEUECOO_FALHOU).toBe("Não foi possível entrar direto pelo Meu Ecoo. Entre com e-mail e senha.");
  });
});
