/* ============================================================
   NEXUS FITNESS — dashboard.js
   Telas do painel: visão geral, CAPEX Guard, parque de
   máquinas, ordens de serviço, histórico, Smart Buying e
   configurações. Os dados ficam no navegador (auth.js).
   ============================================================ */

(function () {
  "use strict";

  const userId = NexusAuth.requireAuth();
  if (!userId) return;

  const C = NexusCapex;
  const $ = (id) => document.getElementById(id);

  /* ==========================================================
     UTILITÁRIOS
     ========================================================== */

  function h(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function brl(n) {
    return "R$ " + Math.round(Number(n) || 0).toLocaleString("pt-BR");
  }
  function dataBR(iso) {
    const d = C.parseDate(iso);
    return d ? d.toLocaleDateString("pt-BR") : "—";
  }
  function horas(n) {
    return Math.round(Number(n) || 0).toLocaleString("pt-BR") + " h";
  }
  function discountForCount(n) {
    return Math.min(5 + n * 0.75, 32);
  }

  const toastEl = $("toast");
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  /* Dados atuais (com migração de contas antigas sem CAPEX Guard) */
  function current() {
    const data = NexusAuth.getCurrent();
    if (data && data.account && !data.account.capex) {
      NexusAuth.updateAccount(userId, (acc) => {
        acc.capex = NexusAuth.seedCapex();
        delete acc.equipamentos;
      });
      return NexusAuth.getCurrent();
    }
    return data;
  }
  function capex() {
    return C.normalize(current().account.capex);
  }
  /* Altera a conta e redesenha tudo */
  function save(fn) {
    NexusAuth.updateAccount(userId, (acc) => {
      C.normalize(acc.capex);
      fn(acc, acc.capex);
    });
    renderAll();
  }

  const maqById = (cx, id) => cx.maquinas.find((m) => m.id === id);
  const nivelLabel = { urgente: "Urgente", proxima: "Revisão próxima", ok: "Em dia" };

  /* ==========================================================
     NAVEGAÇÃO
     ========================================================== */

  let currentView = "visao-geral";

  function goToView(view) {
    currentView = view;
    document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    document.querySelectorAll(".view-section").forEach((s) => s.classList.toggle("active", s.id === "view-" + view));
    if (view === "historico") renderCharts();
    window.scrollTo({ top: 0 });
    try { sessionStorage.setItem("nx_view", view); } catch (e) {}
  }

  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => goToView(b.dataset.view)));
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (g) goToView(g.dataset.goto);
  });

  /* ==========================================================
     MENSAGENS DE ALERTA (WhatsApp / e-mail)
     ========================================================== */

  function alertMessage(m, titulo, texto) {
    const { account } = current();
    return "Nexus Fitness | CAPEX Guard\n" +
      "Academia: " + account.academia + "\n" +
      "Máquina: " + m.nome + (m.marca ? " (" + m.marca + " " + (m.modelo || "") + ")" : "") + "\n" +
      "Serviço: " + titulo + "\n" +
      "Situação: " + texto + "\n" +
      "Data do aviso: " + new Date().toLocaleDateString("pt-BR");
  }
  function contactButtons(m, titulo, texto) {
    const cfg = capex().config;
    const msg = alertMessage(m, titulo, texto);
    const wa = C.whatsappLink(cfg.whatsapp, msg);
    const mail = C.mailtoLink(cfg.email, "[CAPEX Guard] " + m.nome + ": " + titulo, msg);
    return `
      <a class="icon-btn wa" href="${h(wa)}" target="_blank" rel="noopener" title="Avisar por WhatsApp" aria-label="Avisar por WhatsApp">${ICON_WA}</a>
      <a class="icon-btn" href="${h(mail)}" title="Avisar por e-mail" aria-label="Avisar por e-mail">${ICON_MAIL}</a>`;
  }
  const ICON_WA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>';
  const ICON_MAIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

  /* ==========================================================
     VISÃO GERAL
     ========================================================== */

  function renderOverview() {
    const { user, account } = current();
    const cx = capex();
    const status = cx.maquinas.map((m) => ({ m, s: C.statusMaquina(m, cx) }));
    const count = (st) => status.filter((x) => x.s.status === st).length;
    const osAbertas = cx.os.filter((o) => o.status !== "Concluída").length;
    const poupancaHub = account.hub.historico.reduce((s, x) => s + (Number(x.economia) || 0), 0);

    $("dash-sub").textContent = account.academia + " · manutenção das máquinas e compras coletivas";
    $("kpi-economia").textContent = brl(C.economiaPreventiva(cx));
    $("kpi-hub").textContent = brl(poupancaHub);
    $("kpi-urgentes").textContent = count("urgente");
    $("kpi-proximas").textContent = count("proxima");
    $("kpi-emdia").textContent = count("ok");
    $("kpi-os").textContent = osAbertas;

    const ordem = { urgente: 0, proxima: 1, ok: 2 };
    $("overview-machines").innerHTML = status
      .sort((a, b) => ordem[a.s.status] - ordem[b.s.status])
      .map(({ m, s }) => `
        <div class="machine-card ${s.status}">
          <button class="link-reset m-name" data-act="detalhe" data-id="${m.id}" style="background:none;border:0;cursor:pointer;color:#fff;font-weight:600">${h(m.nome)}</button>
          <span class="m-status">${h(s.texto)}</span>
          <div class="m-actions">${contactButtons(m, m.avaria ? "Avaria registrada" : s.pior ? s.pior.regra.descricao : "Situação da máquina", s.texto)}</div>
        </div>`).join("") +
      `<button class="machine-card add" data-new="maquina" aria-label="Cadastrar máquina">+</button>`;

    const al = C.alertas(cx).slice(0, 4);
    $("overview-alerts").innerHTML = al.length ? al.map(alertHTML).join("") :
      '<div class="empty">Nenhum alerta. Todas as máquinas estão em dia.</div>';

    const hist = cx.historico.slice().sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 5);
    $("overview-history").innerHTML = hist.length ? `
      <table class="data compact"><thead><tr><th>Máquina</th><th>Serviço</th><th>Custo</th><th>Data</th></tr></thead><tbody>
      ${hist.map((x) => {
        const m = maqById(cx, x.maquinaId);
        return `<tr><td>${h(m ? m.nome : "Máquina removida")}</td><td>${h(x.tipo)}<span class="sub">${h(x.responsavel)}</span></td>
          <td class="num">${brl(x.custo)}</td><td>${dataBR(x.data)}</td></tr>`;
      }).join("")}</tbody></table>` : '<div class="empty">Nenhum serviço registrado ainda.</div>';

    /* Hub resumo */
    const n = account.hub.academiasNoPedido;
    const disc = discountForCount(n);
    $("ov-hub-bar").style.width = Math.min(100, (n / 40) * 100) + "%";
    $("ov-hub-count").textContent = n;
    $("ov-hub-discount").textContent = disc.toFixed(0) + "%";
    const ins = account.hub.insumos[0];
    $("ov-hub-compare").innerHTML = ins ? `
      <div class="box retail">${h(ins.nome)}<span class="hint" style="display:block">Varejo</span><b>${brl(ins.varejo)}</b></div>
      <span class="arrow" aria-hidden="true" style="color:var(--text-2)">→</span>
      <div class="box hub">Nexus Hub<span class="hint" style="display:block">Preço coletivo</span><b>${brl(ins.varejo * (1 - disc / 100))}</b></div>` : "";
    $("ov-hub-table").innerHTML = account.hub.insumos.length ? `
      <table class="data compact"><thead><tr><th>Insumo</th><th>Varejo</th><th>Nexus Hub</th></tr></thead><tbody>
      ${account.hub.insumos.slice(0, 5).map((i) => `<tr><td>${h(i.nome)}</td><td class="muted num"><s>${brl(i.varejo)}</s></td>
        <td class="c-neon num">${brl(i.varejo * (1 - disc / 100))}</td></tr>`).join("")}</tbody></table>` : "";

    /* Topo e badges */
    $("topnav-user-name").textContent = user.nome;
    $("avatar").textContent = (user.nome || "G").trim().charAt(0).toUpperCase();
    const urg = C.alertas(cx).filter((a) => a.nivel === "urgente").length;
    const totalAl = C.alertas(cx).length;
    const bc = $("badge-capex");
    bc.hidden = totalAl === 0;
    bc.textContent = totalAl;
    bc.classList.toggle("orange", urg === 0);
    const bo = $("badge-os");
    bo.hidden = osAbertas === 0;
    bo.textContent = osAbertas;
  }

  function alertHTML(a) {
    const cx = capex();
    const osAberta = a.regra && cx.os.find((o) => o.regraId === a.regra.id && o.status !== "Concluída");
    const osAvaria = !a.regra && a.titulo === "Avaria registrada" &&
      cx.os.find((o) => o.maquinaId === a.maquina.id && o.tipo === "Corretiva" && o.status !== "Concluída");
    const os = osAberta || osAvaria;
    let acoes = contactButtons(a.maquina, a.titulo, a.texto);
    if (os) {
      acoes += `<button class="btn btn-plain btn-sm" data-goto="os">OS nº ${os.numero} ${h(os.status.toLowerCase())}</button>`;
    } else if (a.regra) {
      acoes += `<button class="btn btn-ghost btn-sm" data-act="os-da-regra" data-id="${a.regra.id}">Abrir OS</button>
        <button class="btn btn-plain btn-sm" data-act="feito-regra" data-id="${a.regra.id}">Já foi feito</button>`;
    } else if (a.titulo === "Avaria registrada") {
      acoes += `<button class="btn btn-ghost btn-sm" data-act="os-avaria" data-id="${a.maquina.id}">Abrir OS</button>`;
    }
    return `
      <div class="alert-item ${a.nivel}">
        <span class="badge ${a.nivel}">${nivelLabel[a.nivel]}</span>
        <div class="a-text"><b>${h(a.maquina.nome)}</b> · ${h(a.titulo)}<small>${h(a.texto)}</small></div>
        <div class="a-actions">${acoes}</div>
      </div>`;
  }

  /* ==========================================================
     CAPEX GUARD (alertas + regras)
     ========================================================== */

  function renderCapex() {
    const cx = capex();
    const al = C.alertas(cx);
    $("capex-alert-sub").textContent = al.length
      ? al.length + (al.length === 1 ? " alerta ativo" : " alertas ativos") + ". O aviso dispara " + cx.config.antecedenciaDias + " dias antes ou ao chegar a " + cx.config.limiteProxima + "% do intervalo."
      : "Revisões vencidas, próximas e máquinas com avaria";
    $("capex-alerts").innerHTML = al.length ? al.map(alertHTML).join("") :
      '<div class="empty">Nenhum alerta. Todas as máquinas estão em dia.</div>';

    const rows = cx.regras.map((r) => {
      const m = maqById(cx, r.maquinaId);
      if (!m) return null;
      return { r, m, st: C.statusRegra(r, m, cx.config) };
    }).filter(Boolean).sort((a, b) => b.st.pct - a.st.pct);

    $("capex-rules").innerHTML = rows.length ? `
      <table class="data"><thead><tr><th>Máquina</th><th>Serviço</th><th>Intervalo</th><th>Última vez</th><th>Progresso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${rows.map(({ r, m, st }) => `
        <tr>
          <td>${h(m.nome)}</td>
          <td>${h(r.descricao)}<span class="sub">custo estimado ${brl(r.custoEstimado)}</span></td>
          <td>${r.intervaloHoras ? horas(r.intervaloHoras) : ""}${r.intervaloHoras && r.intervaloDias ? " ou " : ""}${r.intervaloDias ? r.intervaloDias + " dias" : ""}</td>
          <td>${dataBR(r.ultimaExecData)}<span class="sub">${horas(st.horasDesde)} de uso desde então</span></td>
          <td><div class="meter" title="${Math.round(st.pct * 100)}%"><i class="${st.status}" style="width:${Math.min(100, st.pct * 100)}%"></i></div></td>
          <td><span class="badge ${st.status}">${h(st.texto)}</span></td>
          <td class="actions">
            <button class="btn btn-plain btn-sm" data-act="feito-regra" data-id="${r.id}">Registrar feito</button>
            <button class="btn btn-plain btn-sm" data-act="editar-regra" data-id="${r.id}">Editar</button>
          </td>
        </tr>`).join("")}</tbody></table>` :
      '<div class="empty">Nenhuma regra cadastrada. Cadastre uma máquina para criar as regras padrão.</div>';
  }

  /* ==========================================================
     PARQUE DE MÁQUINAS
     ========================================================== */

  function renderMaquinas() {
    const cx = capex();
    $("machines-table").innerHTML = cx.maquinas.length ? `
      <table class="data"><thead><tr><th>Máquina</th><th>Tipo</th><th>Uso</th><th>Próxima revisão</th><th>Garantia</th><th>Valor atual</th><th></th></tr></thead><tbody>
      ${cx.maquinas.map((m) => {
        const s = C.statusMaquina(m, cx);
        const g = C.garantia(m);
        const f = C.financeiro(m, cx);
        const uso = m.modoUso === "contador"
          ? `${horas(C.horasAtuais(m, cx.config))}<span class="sub">contador · leitura ${m.leituras.length ? dataBR(m.leituras[m.leituras.length - 1].data) : "—"}</span>`
          : `${horas(C.horasAtuais(m, cx.config))}<span class="sub">estimado · ${C.taxaDiaria(m, cx.config).toFixed(1)} h/dia</span>`;
        return `<tr>
          <td><b>${h(m.nome)}</b><span class="sub">${h([m.marca, m.modelo].filter(Boolean).join(" ")) || "—"}</span></td>
          <td>${h(m.tipo)}</td>
          <td>${uso}</td>
          <td><span class="badge ${s.status}">${h(s.texto)}</span></td>
          <td>${g.fim ? (g.ativa ? `<span class="c-green">até ${dataBR(g.fim)}</span>` : `<span class="muted">vencida</span>`) : "—"}</td>
          <td class="num">${brl(f.valorAtual)}<span class="sub">pago ${brl(f.valorPago)}</span></td>
          <td class="actions">
            <button class="btn btn-ghost btn-sm" data-act="detalhe" data-id="${m.id}">Detalhes</button>
            ${m.modoUso === "contador" ? `<button class="btn btn-plain btn-sm" data-act="leitura" data-id="${m.id}">Leitura</button>` : ""}
            <button class="btn btn-plain btn-sm" data-act="editar-maquina" data-id="${m.id}">Editar</button>
          </td>
        </tr>`;
      }).join("")}</tbody></table>` :
      '<div class="empty">Nenhuma máquina cadastrada ainda.</div>';
  }

  /* ==========================================================
     ORDENS DE SERVIÇO
     ========================================================== */

  let osFiltro = "abertas";
  $("os-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    osFiltro = b.dataset.f;
    $("os-filter").querySelectorAll("button").forEach((x) => {
      x.className = "btn btn-sm " + (x.dataset.f === osFiltro ? "btn-ghost" : "btn-plain");
    });
    renderOS();
  });

  const prioClass = { Urgente: "urgente", Alta: "proxima", Média: "neon", Baixa: "neutro" };
  const statusClass = { Aberta: "proxima", "Em andamento": "neon", Concluída: "ok" };

  function renderOS() {
    const cx = capex();
    let lista = cx.os.slice().sort((a, b) => b.numero - a.numero);
    if (osFiltro === "abertas") lista = lista.filter((o) => o.status !== "Concluída");
    $("os-table").innerHTML = lista.length ? `
      <table class="data"><thead><tr><th>Nº</th><th>Máquina</th><th>Serviço</th><th>Prioridade</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>
      ${lista.map((o) => {
        const m = maqById(cx, o.maquinaId);
        const atrasada = o.status !== "Concluída" && o.prazo && C.daysBetween(o.prazo) > 0;
        return `<tr>
          <td class="num">#${o.numero}</td>
          <td>${h(m ? m.nome : "Máquina removida")}<span class="sub">${h(o.tipo)}</span></td>
          <td>${h(o.descricao)}</td>
          <td><span class="badge ${prioClass[o.prioridade] || "neutro"}">${h(o.prioridade)}</span></td>
          <td>${h(o.responsavel || "—")}</td>
          <td>${dataBR(o.prazo)}${atrasada ? '<span class="sub c-red">atrasada</span>' : ""}</td>
          <td><span class="badge ${statusClass[o.status] || "neutro"}">${h(o.status)}</span>${o.status === "Concluída" ? `<span class="sub">${dataBR(o.concluidaEm)} · ${brl(o.custo)}</span>` : ""}</td>
          <td class="actions">
            ${o.status === "Aberta" ? `<button class="btn btn-plain btn-sm" data-act="os-iniciar" data-id="${o.id}">Iniciar</button>` : ""}
            ${o.status !== "Concluída" ? `<button class="btn btn-primary btn-sm" data-act="os-concluir" data-id="${o.id}">Concluir</button>
              <button class="btn btn-plain btn-sm" data-act="os-editar" data-id="${o.id}">Editar</button>` : ""}
            <button class="btn btn-plain btn-sm" data-act="os-imprimir" data-id="${o.id}">Imprimir</button>
          </td>
        </tr>`;
      }).join("")}</tbody></table>` :
      `<div class="empty">${osFiltro === "abertas" ? "Nenhuma OS em aberto." : "Nenhuma OS registrada."}</div>`;
  }

  /* ==========================================================
     HISTÓRICO E CUSTOS
     ========================================================== */

  function renderHistorico() {
    const cx = capex();
    const filtro = $("hist-filter");
    const sel = filtro.value || "todas";
    filtro.innerHTML = `<option value="todas">Todas as máquinas</option>` +
      cx.maquinas.map((m) => `<option value="${m.id}">${h(m.nome)}</option>`).join("");
    filtro.value = cx.maquinas.some((m) => m.id === sel) ? sel : "todas";

    const total = cx.historico.reduce((s, x) => s + (Number(x.custo) || 0), 0);
    const prev = cx.historico.filter(C.isPreventivo).reduce((s, x) => s + (Number(x.custo) || 0), 0);
    const corr = total - prev;
    const capexTotal = cx.maquinas.reduce((s, m) => s + (Number(m.valorPago) || 0), 0);
    $("cost-kpis").innerHTML = `
      <div class="card kpi-big"><div class="kpi-label">Gasto total com manutenção</div><div class="kpi-value">${brl(total)}</div><div class="kpi-note">preventiva ${brl(prev)} · corretiva ${brl(corr)}</div></div>
      <div class="card glow kpi-big"><div class="kpi-label">Economia preventiva estimada</div><div class="kpi-value">${brl(C.economiaPreventiva(cx))}</div><div class="kpi-note">conserto após quebra custa 3 a 5x mais; usamos 3x</div></div>
      <div class="card kpi-big"><div class="kpi-label">Investimento em máquinas (CAPEX)</div><div class="kpi-value">${brl(capexTotal)}</div><div class="kpi-note">manutenção = ${capexTotal ? ((total / capexTotal) * 100).toFixed(1) : 0}% do valor pago</div></div>`;

    let lista = cx.historico.slice().sort((a, b) => (a.data < b.data ? 1 : -1));
    if (filtro.value !== "todas") lista = lista.filter((x) => x.maquinaId === filtro.value);
    $("history-table").innerHTML = lista.length ? `
      <table class="data"><thead><tr><th>Data</th><th>Máquina</th><th>Tipo</th><th>Descrição</th><th>Custo</th><th>Quem fez</th><th></th></tr></thead><tbody>
      ${lista.map((x) => {
        const m = maqById(cx, x.maquinaId);
        return `<tr><td>${dataBR(x.data)}</td><td>${h(m ? m.nome : "Máquina removida")}</td>
          <td><span class="badge ${C.isPreventivo(x) ? "ok" : "urgente"}">${h(x.tipo)}</span></td>
          <td>${h(x.descricao)}${x.osNumero ? `<span class="sub">OS nº ${x.osNumero}</span>` : ""}</td>
          <td class="num">${brl(x.custo)}</td><td>${h(x.responsavel)}</td>
          <td class="actions"><button class="btn btn-danger btn-sm" data-act="hist-remover" data-id="${x.id}">Remover</button></td></tr>`;
      }).join("")}</tbody></table>` : '<div class="empty">Nenhum registro.</div>';

    if (currentView === "historico") renderCharts();
  }
  $("hist-filter").addEventListener("change", renderHistorico);

  let custosChart = null, economiaChart = null;

  function renderCharts() {
    if (typeof Chart === "undefined") {
      document.querySelectorAll(".chart-box").forEach((el) => {
        el.innerHTML = '<div class="empty">Os gráficos precisam de internet para carregar.</div>';
      });
      return;
    }
    const cx = capex();
    const { account } = current();
    Chart.defaults.font.family = "Inter, sans-serif";
    Chart.defaults.color = "#94A3B8";
    const grid = "#1E293B";

    const labels = cx.maquinas.map((m) => m.nome);
    const soma = (m, prev) => cx.historico.filter((x) => x.maquinaId === m.id && C.isPreventivo(x) === prev)
      .reduce((s, x) => s + (Number(x.custo) || 0), 0);
    const dPrev = cx.maquinas.map((m) => soma(m, true));
    const dCorr = cx.maquinas.map((m) => soma(m, false));

    if (!custosChart) {
      custosChart = new Chart($("chart-custos"), {
        type: "bar",
        data: { labels, datasets: [
          { label: "Preventiva", data: dPrev, backgroundColor: "#34C759", borderRadius: 4, maxBarThickness: 34 },
          { label: "Corretiva", data: dCorr, backgroundColor: "#FF3B30", borderRadius: 4, maxBarThickness: 34 },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + brl(c.parsed.y) } } },
          scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 30 } },
            y: { stacked: true, grid: { color: grid }, ticks: { callback: (v) => "R$ " + v } } },
        },
      });
    } else {
      custosChart.data.labels = labels;
      custosChart.data.datasets[0].data = dPrev;
      custosChart.data.datasets[1].data = dCorr;
      custosChart.update("none");
    }

    const hist = account.hub.historico.slice().reverse();
    if (!economiaChart) {
      economiaChart = new Chart($("chart-economia"), {
        type: "line",
        data: { labels: hist.map((x) => x.data), datasets: [{
          label: "Economia", data: hist.map((x) => x.economia), borderColor: "#00F2FE",
          backgroundColor: "rgba(0, 242, 254, 0.12)", fill: true, tension: 0.35, pointBackgroundColor: "#00F2FE",
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => brl(c.parsed.y) + " economizados" } } },
          scales: { x: { grid: { display: false } }, y: { grid: { color: grid }, ticks: { callback: (v) => "R$ " + v } } },
        },
      });
    } else {
      economiaChart.data.labels = hist.map((x) => x.data);
      economiaChart.data.datasets[0].data = hist.map((x) => x.economia);
      economiaChart.update("none");
    }
  }

  /* ==========================================================
     MODAL GENÉRICO
     ========================================================== */

  const modal = $("modal");
  const modalForm = $("modal-form");
  let modalSubmit = null;

  function openModal({ title, body, submitLabel, onSubmit, extra }) {
    $("modal-title").textContent = title;
    $("modal-body").innerHTML = body;
    $("modal-error").classList.remove("show");
    $("modal-foot").innerHTML = (extra || "") +
      `<button type="button" class="btn btn-plain" data-close>${submitLabel ? "Cancelar" : "Fechar"}</button>` +
      (submitLabel ? `<button type="submit" class="btn btn-primary">${h(submitLabel)}</button>` : "");
    modalSubmit = onSubmit || null;
    modal.classList.add("open");
    const first = modal.querySelector("input:not([type=hidden]):not([disabled]), select, textarea");
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() {
    modal.classList.remove("open");
    modalSubmit = null;
  }
  $("modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) closeModal(); });
  modalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!modalSubmit) return closeModal();
    const fd = Object.fromEntries(new FormData(modalForm).entries());
    const err = modalSubmit(fd);
    if (err) {
      $("modal-error").textContent = err;
      $("modal-error").classList.add("show");
      return;
    }
    closeModal();
  });

  /* Helpers de campos */
  function input(name, label, value, attrs, hint) {
    return `<div class="field"><label for="f-${name}">${label}</label>
      <input id="f-${name}" name="${name}" value="${h(value == null ? "" : value)}" ${attrs || 'type="text"'}>
      ${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  }
  function select(name, label, options, value, hint) {
    return `<div class="field"><label for="f-${name}">${label}</label>
      <select id="f-${name}" name="${name}">${options.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return `<option value="${h(v)}" ${String(v) === String(value) ? "selected" : ""}>${h(t)}</option>`;
      }).join("")}</select>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  }
  function textarea(name, label, value) {
    return `<div class="field"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${h(value || "")}</textarea></div>`;
  }
  const num = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(",", ".")));

  /* ==========================================================
     FORMULÁRIO: MÁQUINA
     ========================================================== */

  function formMaquina(id) {
    const cx = capex();
    const m = id ? maqById(cx, id) : null;
    const v = m || { tipo: "Esteira", dataCompra: C.todayISO(), vidaUtilAnos: 8, garantiaMeses: 12, modoUso: "estimado", fatorUso: 0.5 };
    const ultima = m && m.leituras.length ? m.leituras[m.leituras.length - 1].horas : 0;

    openModal({
      title: m ? "Editar máquina" : "Cadastrar máquina",
      submitLabel: m ? "Salvar" : "Cadastrar",
      extra: m ? `<button type="button" class="btn btn-danger" data-act="remover-maquina" data-id="${m.id}" style="margin-right:auto">Remover máquina</button>` : "",
      body: `
        <fieldset><legend>Equipamento</legend><div class="form-grid">
          ${input("nome", "Nome no painel", v.nome, 'type="text" required placeholder="Ex: Esteira 03"')}
          ${select("tipo", "Tipo", C.TIPOS, v.tipo)}
          ${input("marca", "Marca", v.marca)}
          ${input("modelo", "Modelo", v.modelo)}
          ${input("serie", "Nº de série (opcional)", v.serie)}
        </div></fieldset>
        <fieldset><legend>Compra, garantia e vida útil</legend><div class="form-grid">
          ${input("dataCompra", "Data de compra", v.dataCompra, 'type="date" required')}
          ${input("valorPago", "Valor pago (R$)", v.valorPago, 'type="number" min="0" step="0.01" required')}
          ${input("vidaUtilAnos", "Vida útil estimada (anos)", v.vidaUtilAnos, 'type="number" min="1" max="40" step="0.5" required')}
          ${input("garantiaMeses", "Garantia (meses)", v.garantiaMeses, 'type="number" min="0" max="120" step="1"')}
        </div></fieldset>
        <fieldset><legend>Registro de uso</legend><div class="form-grid">
          ${select("modoUso", "Como medir o uso", [["estimado", "Estimativa (horário e movimento)"], ["contador", "Contador / horímetro da máquina"]], v.modoUso)}
          ${input("fatorUso", "Movimento da máquina (%)", Math.round((v.fatorUso || 0.5) * 100), 'type="number" min="5" max="100" step="5"', "Parte do horário de funcionamento em que ela fica em uso")}
          ${input("contador", "Leitura atual do contador (h)", m ? Math.round(ultima) : "", 'type="number" min="0" step="1"', "Só para quem usa contador")}
        </div></fieldset>
        ${m ? "" : `<label class="tog"><span>Criar as regras de revisão padrão para este tipo (dá para editar depois)</span><input type="checkbox" name="criarRegras" checked></label>`}
      `,
      onSubmit(fd) {
        if (!fd.nome.trim()) return "Informe o nome da máquina.";
        if (!fd.dataCompra) return "Informe a data de compra.";
        const valor = num(fd.valorPago), vida = num(fd.vidaUtilAnos);
        if (!(valor >= 0)) return "Informe o valor pago.";
        if (!(vida > 0)) return "Informe a vida útil em anos.";
        const cont = num(fd.contador);
        if (fd.modoUso === "contador" && !(cont >= 0)) return "Informe a leitura atual do contador.";

        const dados = {
          nome: fd.nome.trim(), tipo: fd.tipo, marca: fd.marca.trim(), modelo: fd.modelo.trim(), serie: fd.serie.trim(),
          dataCompra: fd.dataCompra, valorPago: valor, vidaUtilAnos: vida, garantiaMeses: num(fd.garantiaMeses) || 0,
          modoUso: fd.modoUso, fatorUso: Math.min(1, Math.max(0.05, (num(fd.fatorUso) || 50) / 100)),
        };
        save((acc, cx) => {
          let alvo = m ? maqById(cx, m.id) : null;
          if (alvo) {
            Object.assign(alvo, dados);
          } else {
            alvo = Object.assign({ id: NexusAuth.uid("mq"), leituras: [], avaria: false }, dados);
            cx.maquinas.push(alvo);
          }
          if (dados.modoUso === "contador" && cont >= 0) {
            const last = alvo.leituras[alvo.leituras.length - 1];
            if (!last || Math.round(last.horas) !== Math.round(cont)) {
              alvo.leituras = alvo.leituras.filter((l) => l.data !== C.todayISO());
              alvo.leituras.push({ data: C.todayISO(), horas: cont });
            }
          }
          if (!m && fd.criarRegras) {
            const base = C.horasAtuais(alvo, cx.config);
            (C.TEMPLATES[alvo.tipo] || C.TEMPLATES.Outro).forEach(([descricao, ih, idias, custo]) => {
              cx.regras.push({ id: NexusAuth.uid("rg"), maquinaId: alvo.id, descricao, intervaloHoras: ih, intervaloDias: idias,
                custoEstimado: custo, ultimaExecHoras: base, ultimaExecData: C.todayISO() });
            });
          }
        });
        toast(m ? "Máquina atualizada." : dados.nome + " cadastrada no parque.");
      },
    });
  }

  /* ==========================================================
     FORMULÁRIO: REGRA DE REVISÃO
     ========================================================== */

  function formRegra(id, maquinaId) {
    const cx = capex();
    if (!cx.maquinas.length) return toast("Cadastre uma máquina primeiro.");
    const r = id ? cx.regras.find((x) => x.id === id) : null;
    const v = r || { maquinaId: maquinaId || cx.maquinas[0].id, intervaloHoras: 300, intervaloDias: 90, custoEstimado: 100, ultimaExecData: C.todayISO() };
    openModal({
      title: r ? "Editar regra de revisão" : "Nova regra de revisão",
      submitLabel: "Salvar",
      extra: r ? `<button type="button" class="btn btn-danger" data-act="remover-regra" data-id="${r.id}" style="margin-right:auto">Remover regra</button>` : "",
      body: `
        <div class="form-grid">
          ${select("maquinaId", "Máquina", cx.maquinas.map((m) => [m.id, m.nome]), v.maquinaId)}
          ${input("descricao", "Serviço", v.descricao, 'type="text" required placeholder="Ex: Lubrificar esteira"')}
          ${input("intervaloHoras", "A cada quantas horas de uso", v.intervaloHoras, 'type="number" min="0" step="1"', "0 = não usar horas")}
          ${input("intervaloDias", "Ou a cada quantos dias", v.intervaloDias, 'type="number" min="0" step="1"', "0 = não usar tempo")}
          ${input("custoEstimado", "Custo estimado (R$)", v.custoEstimado, 'type="number" min="0" step="0.01"')}
          ${input("ultimaExecData", "Última vez que foi feito", v.ultimaExecData, 'type="date" required')}
        </div>
        <p class="hint">Use o intervalo do manual do fabricante. Vale o que vencer primeiro: horas de uso ou dias.</p>`,
      onSubmit(fd) {
        const ih = num(fd.intervaloHoras) || 0, idias = num(fd.intervaloDias) || 0;
        if (!fd.descricao.trim()) return "Descreva o serviço.";
        if (ih <= 0 && idias <= 0) return "Informe o intervalo em horas, em dias ou nos dois.";
        if (!fd.ultimaExecData) return "Informe quando foi feito pela última vez.";
        save((acc, cx2) => {
          const m = maqById(cx2, fd.maquinaId);
          const execH = m ? C.horasNaData(m, cx2.config, fd.ultimaExecData) : 0;
          const dados = { maquinaId: fd.maquinaId, descricao: fd.descricao.trim(), intervaloHoras: ih, intervaloDias: idias,
            custoEstimado: num(fd.custoEstimado) || 0 };
          const alvo = r && cx2.regras.find((x) => x.id === r.id);
          if (alvo) {
            const mudouData = alvo.ultimaExecData !== fd.ultimaExecData || alvo.maquinaId !== fd.maquinaId;
            Object.assign(alvo, dados);
            if (mudouData) { alvo.ultimaExecData = fd.ultimaExecData; alvo.ultimaExecHoras = execH; }
          } else {
            cx2.regras.push(Object.assign({ id: NexusAuth.uid("rg"), ultimaExecData: fd.ultimaExecData, ultimaExecHoras: execH }, dados));
          }
        });
        toast("Regra de revisão salva.");
      },
    });
  }

  /* ==========================================================
     FORMULÁRIO: ORDEM DE SERVIÇO
     ========================================================== */

  function formOS(id, preset) {
    const cx = capex();
    if (!cx.maquinas.length) return toast("Cadastre uma máquina primeiro.");
    const o = id ? cx.os.find((x) => x.id === id) : null;
    const v = o || Object.assign({ maquinaId: cx.maquinas[0].id, tipo: "Preventiva", prioridade: "Média", prazo: C.addDays(C.todayISO(), 3), regraId: "" }, preset || {});
    const regrasOpts = [["", "Nenhuma (serviço avulso)"]].concat(cx.regras.map((r) => {
      const m = maqById(cx, r.maquinaId);
      return [r.id, (m ? m.nome : "?") + " · " + r.descricao];
    }));
    openModal({
      title: o ? "Editar OS nº " + o.numero : "Nova ordem de serviço",
      submitLabel: o ? "Salvar" : "Abrir OS",
      extra: o ? `<button type="button" class="btn btn-danger" data-act="os-cancelar" data-id="${o.id}" style="margin-right:auto">Excluir OS</button>` : "",
      body: `
        <div class="form-grid">
          ${select("maquinaId", "Máquina", cx.maquinas.map((m) => [m.id, m.nome]), v.maquinaId)}
          ${select("tipo", "Tipo", ["Preventiva", "Corretiva"], v.tipo)}
          ${select("prioridade", "Prioridade", ["Baixa", "Média", "Alta", "Urgente"], v.prioridade)}
          ${input("prazo", "Prazo", v.prazo, 'type="date"')}
          ${input("responsavel", "Responsável (técnico ou empresa)", v.responsavel, 'type="text" placeholder="Ex: TecFit Assistência"')}
          ${select("regraId", "Regra de revisão ligada", regrasOpts, v.regraId || "", "Ao concluir, a revisão desta regra é zerada")}
        </div>
        ${textarea("descricao", "O que deve ser feito", v.descricao)}`,
      onSubmit(fd) {
        if (!fd.descricao.trim()) return "Descreva o serviço.";
        const regra = fd.regraId && cx.regras.find((r) => r.id === fd.regraId);
        if (regra && regra.maquinaId !== fd.maquinaId) return "A regra escolhida é de outra máquina.";
        let numero;
        save((acc, cx2) => {
          const dados = { maquinaId: fd.maquinaId, tipo: fd.tipo, prioridade: fd.prioridade, prazo: fd.prazo,
            responsavel: fd.responsavel.trim(), regraId: fd.regraId || null, descricao: fd.descricao.trim() };
          const alvo = o && cx2.os.find((x) => x.id === o.id);
          if (alvo) {
            Object.assign(alvo, dados);
            numero = alvo.numero;
          } else {
            numero = cx2.proximaOS++;
            cx2.os.push(Object.assign({ id: NexusAuth.uid("os"), numero, abertaEm: C.todayISO(), status: "Aberta", custo: 0, concluidaEm: null }, dados));
          }
        });
        toast(o ? "OS nº " + numero + " atualizada." : "OS nº " + numero + " aberta.");
      },
    });
  }

  function formConcluirOS(id) {
    const cx = capex();
    const o = cx.os.find((x) => x.id === id);
    if (!o) return;
    const m = maqById(cx, o.maquinaId);
    const regra = o.regraId && cx.regras.find((r) => r.id === o.regraId);
    openModal({
      title: "Concluir OS nº " + o.numero,
      submitLabel: "Concluir e registrar",
      body: `
        <p style="margin-bottom:14px">${h(m ? m.nome : "")} · ${h(o.descricao)}</p>
        <div class="form-grid">
          ${input("data", "Data da conclusão", C.todayISO(), 'type="date" required')}
          ${input("custo", "Quanto custou (R$)", regra ? regra.custoEstimado : "", 'type="number" min="0" step="0.01" required')}
          ${input("responsavel", "Quem fez", o.responsavel, 'type="text" required')}
          ${select("tipoHist", "Registrar no histórico como", ["Revisão preventiva", "Conserto", "Troca de peça"], o.tipo === "Corretiva" ? "Conserto" : "Revisão preventiva")}
        </div>
        ${textarea("obs", "Observações (opcional)", "")}
        ${m && m.modoUso === "contador" ? input("contador", "Leitura do contador agora (opcional)", "", 'type="number" min="0" step="1"') : ""}`,
      onSubmit(fd) {
        const custo = num(fd.custo);
        if (!(custo >= 0)) return "Informe o custo (pode ser 0).";
        if (!fd.responsavel.trim()) return "Informe quem fez o serviço.";
        save((acc, cx2) => {
          const os = cx2.os.find((x) => x.id === id);
          const mq = maqById(cx2, os.maquinaId);
          if (mq && fd.contador && num(fd.contador) >= 0) {
            mq.leituras.push({ data: fd.data, horas: num(fd.contador) });
            mq.leituras.sort((a, b) => (a.data < b.data ? -1 : 1));
          }
          os.status = "Concluída";
          os.concluidaEm = fd.data;
          os.custo = custo;
          os.responsavel = fd.responsavel.trim();
          cx2.historico.push({ id: NexusAuth.uid("hs"), maquinaId: os.maquinaId, data: fd.data, tipo: fd.tipoHist,
            descricao: os.descricao + (fd.obs ? " — " + fd.obs.trim() : ""), custo, responsavel: os.responsavel, osId: os.id, osNumero: os.numero });
          const rg = os.regraId && cx2.regras.find((r) => r.id === os.regraId);
          if (rg && mq) { rg.ultimaExecData = fd.data; rg.ultimaExecHoras = C.horasNaData(mq, cx2.config, fd.data); }
          if (mq && os.tipo === "Corretiva") mq.avaria = false;
          acc.alertasResolvidos = (acc.alertasResolvidos || 0) + 1;
        });
        toast("OS nº " + o.numero + " concluída e registrada no histórico.");
      },
    });
  }

  function imprimirOS(id) {
    const cx = capex();
    const { account } = current();
    const o = cx.os.find((x) => x.id === id);
    if (!o) return;
    const m = maqById(cx, o.maquinaId) || {};
    const w = window.open("", "_blank");
    if (!w) return toast("Permita pop-ups para imprimir a OS.");
    const linha = (k, val) => `<tr><th>${k}</th><td>${h(val || "—")}</td></tr>`;
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS nº ${o.numero} — ${h(account.academia)}</title>
      <style>body{font:14px/1.5 Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}th{width:32%;background:#f2f2f2}.ass{display:flex;gap:40px;margin-top:60px}
      .ass div{flex:1;border-top:1px solid #333;padding-top:6px;text-align:center}</style></head><body>
      <h1>Ordem de serviço nº ${o.numero}</h1><div>${h(account.academia)} · emitida em ${new Date().toLocaleDateString("pt-BR")}</div>
      <table>
        ${linha("Máquina", m.nome)}${linha("Marca / modelo", [m.marca, m.modelo].filter(Boolean).join(" "))}${linha("Nº de série", m.serie)}
        ${linha("Tipo de serviço", o.tipo)}${linha("Prioridade", o.prioridade)}${linha("Aberta em", dataBR(o.abertaEm))}${linha("Prazo", dataBR(o.prazo))}
        ${linha("Responsável", o.responsavel)}${linha("Status", o.status)}${linha("O que deve ser feito", o.descricao)}
        ${o.status === "Concluída" ? linha("Concluída em", dataBR(o.concluidaEm)) + linha("Custo", brl(o.custo)) : linha("Custo", "")}
        ${linha("Observações do técnico", " ")}
      </table>
      <div class="ass"><div>Responsável técnico</div><div>Gestor da academia</div></div>
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }

  /* ==========================================================
     FORMULÁRIO: HISTÓRICO (conserto/revisão avulsa)
     ========================================================== */

  function formHistorico(preset) {
    const cx = capex();
    if (!cx.maquinas.length) return toast("Cadastre uma máquina primeiro.");
    const v = Object.assign({ maquinaId: cx.maquinas[0].id, data: C.todayISO(), tipo: "Revisão preventiva", regraId: "" }, preset || {});
    const regrasOpts = [["", "Nenhuma"]].concat(cx.regras.map((r) => {
      const m = maqById(cx, r.maquinaId);
      return [r.id, (m ? m.nome : "?") + " · " + r.descricao];
    }));
    openModal({
      title: "Registrar serviço feito",
      submitLabel: "Registrar",
      body: `
        <div class="form-grid">
          ${select("maquinaId", "Máquina", cx.maquinas.map((m) => [m.id, m.nome]), v.maquinaId)}
          ${input("data", "Data", v.data, 'type="date" required')}
          ${select("tipo", "Tipo", ["Revisão preventiva", "Conserto", "Troca de peça"], v.tipo)}
          ${input("custo", "Quanto custou (R$)", v.custo, 'type="number" min="0" step="0.01" required')}
          ${input("responsavel", "Quem fez", v.responsavel, 'type="text" required placeholder="Técnico ou empresa"')}
          ${select("regraId", "Zerar a regra de revisão", regrasOpts, v.regraId || "", "Escolha se este serviço cumpre uma regra")}
        </div>
        ${textarea("descricao", "Descrição", v.descricao)}`,
      onSubmit(fd) {
        const custo = num(fd.custo);
        if (!(custo >= 0)) return "Informe o custo (pode ser 0).";
        if (!fd.responsavel.trim()) return "Informe quem fez.";
        const regra = fd.regraId && cx.regras.find((r) => r.id === fd.regraId);
        if (regra && regra.maquinaId !== fd.maquinaId) return "A regra escolhida é de outra máquina.";
        save((acc, cx2) => {
          cx2.historico.push({ id: NexusAuth.uid("hs"), maquinaId: fd.maquinaId, data: fd.data, tipo: fd.tipo,
            descricao: fd.descricao.trim() || (regra ? regra.descricao : fd.tipo), custo, responsavel: fd.responsavel.trim(), osId: null });
          const rg = fd.regraId && cx2.regras.find((r) => r.id === fd.regraId);
          const mq = maqById(cx2, fd.maquinaId);
          if (rg && mq) { rg.ultimaExecData = fd.data; rg.ultimaExecHoras = C.horasNaData(mq, cx2.config, fd.data); }
          if (mq && fd.tipo === "Conserto") mq.avaria = false;
        });
        toast("Serviço registrado no histórico.");
      },
    });
  }

  /* ==========================================================
     FORMULÁRIO: LEITURA DO CONTADOR
     ========================================================== */

  function formLeitura(id) {
    const cx = capex();
    const m = maqById(cx, id);
    if (!m) return;
    const last = m.leituras[m.leituras.length - 1];
    openModal({
      title: "Leitura do contador — " + m.nome,
      submitLabel: "Salvar leitura",
      body: `
        <p style="margin-bottom:14px">Última leitura: ${last ? horas(last.horas) + " em " + dataBR(last.data) : "nenhuma"}</p>
        <div class="form-grid">
          ${input("data", "Data", C.todayISO(), 'type="date" required')}
          ${input("horas", "Horas no contador", "", 'type="number" min="0" step="1" required')}
        </div>`,
      onSubmit(fd) {
        const hrs = num(fd.horas);
        if (!(hrs >= 0)) return "Informe as horas do contador.";
        if (last && fd.data >= last.data && hrs < last.horas) return "A leitura não pode ser menor que a anterior (" + horas(last.horas) + ").";
        save((acc, cx2) => {
          const mq = maqById(cx2, id);
          mq.leituras = mq.leituras.filter((l) => l.data !== fd.data);
          mq.leituras.push({ data: fd.data, horas: hrs });
          mq.leituras.sort((a, b) => (a.data < b.data ? -1 : 1));
        });
        toast("Leitura registrada.");
      },
    });
  }

  /* ==========================================================
     DETALHES DA MÁQUINA
     ========================================================== */

  function detalheMaquina(id) {
    const cx = capex();
    const m = maqById(cx, id);
    if (!m) return;
    const s = C.statusMaquina(m, cx);
    const g = C.garantia(m);
    const f = C.financeiro(m, cx);
    const taxa = C.taxaDiaria(m, cx.config);

    const insights = [];
    if (m.avaria) insights.push(["bad", "Máquina com avaria registrada. Abra ou conclua a OS corretiva para liberar."]);
    if (g.ativa && g.diasRest <= 60) insights.push(["warn", `A garantia termina em ${g.diasRest} dias (${dataBR(g.fim)}). Faça uma revisão completa enquanto está coberta.`]);
    if (f.vidaRestAnos <= 0) insights.push(["bad", "A vida útil estimada já foi atingida. Inclua a troca no orçamento de investimentos."]);
    else if (f.vidaRestAnos <= 1) insights.push(["warn", `Restam ${f.vidaRestAnos.toFixed(1)} ano(s) de vida útil estimada. Comece a planejar a substituição.`]);
    if (f.valorAtual > 0 && f.custo12m > f.valorAtual * 0.5) insights.push(["bad", `Nos últimos 12 meses a manutenção custou ${brl(f.custo12m)}, mais da metade do valor atual da máquina (${brl(f.valorAtual)}). Avalie trocar em vez de consertar.`]);
    if (!insights.length) insights.push(["good", "Máquina saudável: dentro da vida útil e com custo de manutenção controlado."]);

    const hist = cx.historico.filter((x) => x.maquinaId === m.id).sort((a, b) => (a.data < b.data ? 1 : -1));

    openModal({
      title: m.nome,
      extra: `
        <button type="button" class="btn btn-danger" data-act="avaria" data-id="${m.id}" style="margin-right:auto">${m.avaria ? "Avaria registrada" : "Registrar avaria"}</button>
        ${m.modoUso === "contador" ? `<button type="button" class="btn btn-plain" data-act="leitura" data-id="${m.id}">Leitura</button>` : ""}
        <button type="button" class="btn btn-plain" data-act="nova-regra-maq" data-id="${m.id}">+ Regra</button>
        <button type="button" class="btn btn-plain" data-act="editar-maquina" data-id="${m.id}">Editar</button>
        <button type="button" class="btn btn-ghost" data-act="os-maquina" data-id="${m.id}">Nova OS</button>`,
      body: `
        <p style="margin:-10px 0 16px">${h([m.tipo, m.marca, m.modelo].filter(Boolean).join(" · "))}${m.serie ? " · série " + h(m.serie) : ""} &nbsp; <span class="badge ${s.status}">${h(s.texto)}</span></p>
        <div class="detail-grid">
          <div class="detail"><span>Comprada em</span><b>${dataBR(m.dataCompra)}</b></div>
          <div class="detail"><span>Valor pago</span><b>${brl(f.valorPago)}</b></div>
          <div class="detail"><span>Valor atual (depreciado)</span><b>${brl(f.valorAtual)}</b></div>
          <div class="detail"><span>Vida útil restante</span><b>${f.vidaRestAnos.toFixed(1)} anos</b></div>
          <div class="detail"><span>Garantia</span><b class="${g.ativa ? "c-green" : "muted"}">${g.fim ? (g.ativa ? "até " + dataBR(g.fim) : "vencida") : "—"}</b></div>
          <div class="detail"><span>Uso acumulado</span><b>${horas(C.horasAtuais(m, cx.config))}</b></div>
          <div class="detail"><span>Uso médio</span><b>${taxa.toFixed(1)} h/dia</b></div>
          <div class="detail"><span>Manutenção (total)</span><b>${brl(f.custoTotal)}</b></div>
        </div>
        ${insights.map(([c, t]) => `<div class="insight ${c}">${h(t)}</div>`).join("")}
        <h3 style="font-size:14px;margin:18px 0 8px">Regras de revisão</h3>
        <div class="table-wrap">${s.regras.length ? `<table class="data"><tbody>${s.regras.map(({ regra, st }) => `
          <tr><td>${h(regra.descricao)}<span class="sub">a cada ${[regra.intervaloHoras ? horas(regra.intervaloHoras) : "", regra.intervaloDias ? regra.intervaloDias + " dias" : ""].filter(Boolean).join(" ou ")}</span></td>
          <td><span class="badge ${st.status}">${h(st.texto)}</span></td>
          <td class="actions"><button type="button" class="btn btn-plain btn-sm" data-act="editar-regra" data-id="${regra.id}">Editar</button></td></tr>`).join("")}</tbody></table>`
          : '<div class="empty">Sem regras. Adicione uma com "+ Regra".</div>'}</div>
        <h3 style="font-size:14px;margin:18px 0 8px">Histórico</h3>
        <div class="table-wrap">${hist.length ? `<table class="data"><tbody>${hist.map((x) => `
          <tr><td>${dataBR(x.data)}</td><td>${h(x.tipo)}<span class="sub">${h(x.descricao)}</span></td><td class="num">${brl(x.custo)}</td><td>${h(x.responsavel)}</td></tr>`).join("")}</tbody></table>`
          : '<div class="empty">Nenhum serviço registrado.</div>'}</div>`,
    });
  }

  /* ==========================================================
     AÇÕES (delegação de cliques)
     ========================================================== */

  document.addEventListener("click", (e) => {
    const nb = e.target.closest("[data-new]");
    if (nb) {
      const t = nb.dataset.new;
      if (t === "maquina") formMaquina();
      if (t === "regra") formRegra();
      if (t === "os") formOS();
      if (t === "historico") formHistorico();
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id;
    const cx = capex();

    switch (b.dataset.act) {
      case "detalhe": detalheMaquina(id); break;
      case "editar-maquina": formMaquina(id); break;
      case "leitura": formLeitura(id); break;
      case "editar-regra": formRegra(id); break;
      case "nova-regra-maq": formRegra(null, id); break;
      case "os-maquina": formOS(null, { maquinaId: id }); break;
      case "os-editar": formOS(id); break;
      case "os-concluir": formConcluirOS(id); break;
      case "os-imprimir": imprimirOS(id); break;
      case "os-iniciar":
        save((acc, cx2) => { const o = cx2.os.find((x) => x.id === id); if (o) o.status = "Em andamento"; });
        toast("OS em andamento.");
        break;
      case "os-cancelar":
        if (!confirm("Excluir esta OS? Ela não vai para o histórico.")) return;
        save((acc, cx2) => { cx2.os = cx2.os.filter((x) => x.id !== id); });
        closeModal();
        toast("OS excluída.");
        break;
      case "os-da-regra": {
        const r = cx.regras.find((x) => x.id === id);
        if (!r) return;
        const m = maqById(cx, r.maquinaId);
        const st = C.statusRegra(r, m, cx.config);
        formOS(null, { maquinaId: r.maquinaId, regraId: r.id, tipo: "Preventiva", descricao: r.descricao,
          prioridade: st.status === "urgente" ? "Alta" : "Média", prazo: C.addDays(C.todayISO(), st.status === "urgente" ? 1 : Math.max(1, Math.min(st.diasRest, 7))) });
        break;
      }
      case "feito-regra": {
        const r = cx.regras.find((x) => x.id === id);
        if (r) formHistorico({ maquinaId: r.maquinaId, regraId: r.id, descricao: r.descricao, custo: r.custoEstimado, tipo: "Revisão preventiva" });
        break;
      }
      case "avaria": {
        const m = maqById(cx, id);
        if (!m) return;
        if (!m.avaria) save((acc, cx2) => { maqById(cx2, id).avaria = true; });
        formOS(null, { maquinaId: id, tipo: "Corretiva", prioridade: "Urgente", prazo: C.todayISO(), descricao: "Avaria: " });
        break;
      }
      case "os-avaria":
        formOS(null, { maquinaId: id, tipo: "Corretiva", prioridade: "Urgente", prazo: C.todayISO(), descricao: "Avaria: " });
        break;
      case "remover-maquina": {
        const m = maqById(cx, id);
        if (!m || !confirm(`Remover "${m.nome}"? As regras e OS abertas dela também saem. O histórico de custos fica guardado.`)) return;
        save((acc, cx2) => {
          cx2.maquinas = cx2.maquinas.filter((x) => x.id !== id);
          cx2.regras = cx2.regras.filter((x) => x.maquinaId !== id);
          cx2.os = cx2.os.filter((x) => x.maquinaId !== id || x.status === "Concluída");
        });
        closeModal();
        toast("Máquina removida.");
        break;
      }
      case "remover-regra":
        if (!confirm("Remover esta regra de revisão?")) return;
        save((acc, cx2) => { cx2.regras = cx2.regras.filter((x) => x.id !== id); });
        closeModal();
        toast("Regra removida.");
        break;
      case "hist-remover":
        if (!confirm("Remover este registro do histórico?")) return;
        save((acc, cx2) => { cx2.historico = cx2.historico.filter((x) => x.id !== id); });
        toast("Registro removido.");
        break;
    }
  });

  /* Resumo geral por WhatsApp / e-mail */
  function resumoTexto() {
    const cx = capex();
    const { account } = current();
    const al = C.alertas(cx);
    if (!al.length) return "Nexus Fitness | CAPEX Guard\n" + account.academia + ": todas as máquinas estão em dia.";
    return "Nexus Fitness | CAPEX Guard\nAcademia: " + account.academia + "\n" + al.length + " alerta(s) em " +
      new Date().toLocaleDateString("pt-BR") + ":\n\n" +
      al.map((a) => "• [" + nivelLabel[a.nivel] + "] " + a.maquina.nome + ": " + a.titulo + " (" + a.texto + ")").join("\n");
  }
  $("send-summary-wa").addEventListener("click", () => {
    window.open(C.whatsappLink(capex().config.whatsapp, resumoTexto()), "_blank", "noopener");
  });
  $("send-summary-mail").addEventListener("click", () => {
    window.location.href = C.mailtoLink(capex().config.email, "[CAPEX Guard] Resumo de manutenção", resumoTexto());
  });

  /* ==========================================================
     SMART BUYING (hub de suprimentos)
     ========================================================== */

  const hubSlider = $("hub-slider");
  let editingInsumoId = null;

  function renderHub() {
    const { account } = current();
    const n = account.hub.academiasNoPedido;
    hubSlider.value = n;
    $("hub-count").textContent = n;
    const disc = discountForCount(n);

    $("insumo-list").innerHTML = account.hub.insumos.length ? `
      <table class="data"><thead><tr><th>Insumo</th><th>Varejo</th><th>Preço no hub</th><th>Economia</th><th></th></tr></thead><tbody>
      ${account.hub.insumos.map((item) => {
        const hub = item.varejo * (1 - disc / 100);
        if (editingInsumoId === item.id) {
          return `<tr data-id="${item.id}">
            <td><input class="insumo-edit-input" data-field="nome" value="${h(item.nome)}"></td>
            <td><input class="insumo-edit-input" type="number" min="0" step="1" data-field="varejo" value="${item.varejo}"></td>
            <td class="c-neon num">${brl(hub)}</td><td class="c-green">-${brl(item.varejo - hub)}</td>
            <td class="actions"><button class="btn btn-primary btn-sm" data-ins="save" data-id="${item.id}">Salvar</button>
              <button class="btn btn-plain btn-sm" data-ins="cancel">Cancelar</button></td></tr>`;
        }
        return `<tr><td>${h(item.nome)}</td><td class="muted num">${brl(item.varejo)}</td>
          <td class="c-neon num">${brl(hub)}</td><td class="c-green">-${brl(item.varejo - hub)}</td>
          <td class="actions"><button class="btn btn-plain btn-sm" data-ins="edit" data-id="${item.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-ins="delete" data-id="${item.id}">Remover</button></td></tr>`;
      }).join("")}</tbody></table>` : '<div class="empty">Nenhum insumo no pedido.</div>';

    $("hub-history").innerHTML = account.hub.historico.map((x) => `
      <div class="history-item"><span>${h(x.data)} — pedido coletivo</span><span class="econ">economia de ${brl(x.economia)}</span></div>`).join("") ||
      '<div class="empty">Nenhum pedido registrado.</div>';
  }

  hubSlider.addEventListener("input", () => {
    NexusAuth.updateAccount(userId, (acc) => { acc.hub.academiasNoPedido = Number(hubSlider.value); });
    renderHub();
    renderOverview();
  });

  $("registrar-pedido-btn").addEventListener("click", () => {
    NexusAuth.updateAccount(userId, (acc) => {
      const disc = discountForCount(acc.hub.academiasNoPedido);
      const varejo = acc.hub.insumos.reduce((s, i) => s + i.varejo, 0);
      const total = varejo * (1 - disc / 100);
      acc.hub.historico.unshift({ data: new Date().toLocaleDateString("pt-BR"), valor: Math.round(total), economia: Math.round(varejo - total) });
      acc.hub.historico = acc.hub.historico.slice(0, 12);
    });
    renderAll();
    toast("Pedido coletivo registrado no histórico.");
  });

  $("insumo-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ins]");
    if (!b) return;
    const id = b.dataset.id;
    const act = b.dataset.ins;
    if (act === "edit") { editingInsumoId = id; return renderHub(); }
    if (act === "cancel") { editingInsumoId = null; return renderHub(); }
    if (act === "delete") {
      const item = current().account.hub.insumos.find((i) => i.id === id);
      if (!confirm(`Remover "${item ? item.nome : "este item"}" do hub?`)) return;
      NexusAuth.updateAccount(userId, (acc) => { acc.hub.insumos = acc.hub.insumos.filter((i) => i.id !== id); });
      renderAll();
      return toast("Insumo removido.");
    }
    if (act === "save") {
      const row = b.closest("tr");
      const nome = row.querySelector('[data-field="nome"]').value.trim();
      const varejo = Number(row.querySelector('[data-field="varejo"]').value);
      if (!nome) return toast("Informe um nome para o insumo.");
      if (!Number.isFinite(varejo) || varejo <= 0) return toast("Informe um preço de varejo válido.");
      NexusAuth.updateAccount(userId, (acc) => {
        const it = acc.hub.insumos.find((i) => i.id === id);
        if (it) { it.nome = nome; it.varejo = varejo; }
      });
      editingInsumoId = null;
      renderAll();
      toast("Insumo atualizado.");
    }
  });

  $("toggle-add-insumo").addEventListener("click", () => $("add-insumo-form").classList.toggle("show"));
  $("add-insumo-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("new-insumo-nome").value.trim();
    const varejo = Number($("new-insumo-varejo").value);
    if (!nome || !Number.isFinite(varejo) || varejo <= 0) return toast("Preencha nome e preço de varejo válidos.");
    NexusAuth.updateAccount(userId, (acc) => { acc.hub.insumos.push({ id: NexusAuth.uid("ins"), nome, varejo }); });
    e.target.reset();
    e.target.classList.remove("show");
    renderAll();
    toast(nome + " adicionado ao hub.");
  });

  /* ==========================================================
     CONFIGURAÇÕES
     ========================================================== */

  function renderSettings() {
    const { user, account } = current();
    const cfg = capex().config;
    $("cfg-academia").value = account.academia;
    $("cfg-nome").value = user.nome;
    $("cfg-email").value = user.email;
    $("cfg-plano").textContent = account.plano;
    $("cfg-horas").value = cfg.horasDia;
    $("cfg-dias").value = cfg.diasSemana;
    $("cfg-antecedencia").value = cfg.antecedenciaDias;
    $("cfg-limite").value = cfg.limiteProxima;
    $("cfg-alert-email").value = cfg.email;
    $("cfg-alert-wa").value = cfg.whatsapp;
    $("sidebar-user-name").textContent = user.nome;
    $("sidebar-user-academia").textContent = account.academia;
  }

  $("save-settings-btn").addEventListener("click", () => {
    const academia = $("cfg-academia").value.trim();
    const nome = $("cfg-nome").value.trim();
    if (!academia || !nome) return toast("Preencha o nome da academia e o seu nome.");
    const horasDia = Math.min(24, Math.max(1, Number($("cfg-horas").value) || 15));
    const diasSemana = Math.min(7, Math.max(1, Math.round(Number($("cfg-dias").value) || 6)));
    NexusAuth.updateUser(userId, (u) => { u.nome = nome; });
    save((acc, cx) => {
      acc.academia = academia;
      /* Mantém as revisões estimadas no mesmo ponto quando muda o horário */
      const antes = {};
      cx.regras.forEach((r) => {
        const m = maqById(cx, r.maquinaId);
        if (m && m.modoUso !== "contador") antes[r.id] = C.horasAtuais(m, cx.config) - r.ultimaExecHoras;
      });
      Object.assign(cx.config, {
        horasDia, diasSemana,
        antecedenciaDias: Math.min(60, Math.max(1, Math.round(Number($("cfg-antecedencia").value) || 7))),
        limiteProxima: Math.min(99, Math.max(50, Math.round(Number($("cfg-limite").value) || 80))),
        email: $("cfg-alert-email").value.trim(),
        whatsapp: $("cfg-alert-wa").value.trim(),
      });
      cx.regras.forEach((r) => {
        const m = maqById(cx, r.maquinaId);
        if (m && antes[r.id] !== undefined) r.ultimaExecHoras = C.horasAtuais(m, cx.config) - antes[r.id];
      });
    });
    toast("Configurações salvas.");
  });

  $("export-btn").addEventListener("click", () => {
    const { account } = current();
    const blob = new Blob([JSON.stringify(account, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-backup-" + C.todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !data.capex || !data.hub) throw new Error();
        if (!confirm("Substituir os dados atuais por este backup?")) return;
        NexusAuth.updateAccount(userId, (acc) => { Object.keys(acc).forEach((k) => delete acc[k]); Object.assign(acc, data); });
        renderAll();
        toast("Backup importado.");
      } catch (err) {
        toast("Arquivo inválido. Use um backup exportado pelo Nexus.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  $("reset-data-btn").addEventListener("click", () => {
    if (!confirm("Isso apaga suas alterações e volta aos dados de demonstração. Continuar?")) return;
    NexusAuth.resetDemoData(userId);
    editingInsumoId = null;
    renderAll();
    toast("Dados de demonstração restaurados.");
  });

  function doLogout() {
    NexusAuth.logout();
    window.location.href = "index.html";
  }
  $("logout-btn").addEventListener("click", doLogout);
  $("logout-btn-2").addEventListener("click", doLogout);

  /* ==========================================================
     BOOT
     ========================================================== */

  function renderAll() {
    renderOverview();
    renderCapex();
    renderMaquinas();
    renderOS();
    renderHistorico();
    renderHub();
    renderSettings();
  }

  /* Salva a normalização inicial (converte dados de exemplo) */
  save(() => {});
  let start = "visao-geral";
  try { start = sessionStorage.getItem("nx_view") || start; } catch (e) {}
  if (!document.getElementById("view-" + start)) start = "visao-geral";
  goToView(start);

  /* Recalcula a cada minuto (o uso estimado cresce com o tempo) */
  setInterval(() => { if (!modal.classList.contains("open")) renderAll(); }, 60000);
})();
