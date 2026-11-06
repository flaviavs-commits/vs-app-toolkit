// Tema antes da primeira pintura. O index.html carrega este arquivo no <head>, sem módulo, para ele rodar
// antes do app. Fica num arquivo, e não embutido no HTML, porque a CSP do vercel.json bloqueia script
// embutido. Mesmo resultado do aplicarTema de src/lib/tema.ts (tema.test.ts confere); as duas cores são o
// --fundo de cada tema (src/index.css).
(function () {
  var tema = "claro";
  try {
    var pref = localStorage.getItem("{{APP_SLUG}}:tema");
    if (pref === "escuro" || (pref === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches)) tema = "escuro";
  } catch (e) {}
  document.documentElement.setAttribute("data-tema", tema);
  document.documentElement.style.colorScheme = tema === "escuro" ? "dark" : "light";
  var barra = document.querySelector('meta[name="theme-color"]');
  if (barra) barra.content = tema === "escuro" ? "#141412" : "#f6f6f4";
})();
