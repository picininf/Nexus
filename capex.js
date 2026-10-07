/* ============================================================
   NEXUS FITNESS — capex.js
   CAPEX Guard: regras de cálculo da manutenção das máquinas.
   Só faz contas (uso, vencimento de revisões, garantia, vida
   útil, custos). A tela fica em dashboard.js.
   ============================================================ */

(function (global) {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;

  /* ---------- Datas (sempre "AAAA-MM-DD" no horário local) ---------- */
  function parseDate(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function todayISO() {
    const d = new Date();
    return toISO(d);
  }
  function toISO(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function daysBetween(fromISO, toISOstr) {
    const a = parseDate(fromISO), b = parseDate(toISOstr || todayISO());
    if (!a || !b) return 0;
    return Math.round((b - a) / DAY);
  }
  function addDays(iso, n) {
    const d = parseDate(iso) || new Date();
    d.setDate(d.getDate() + Math.round(n));
    return toISO(d);
  }
  function addMonths(iso, n) {
    const d = parseDate(iso);
    if (!d) return null;
    d.setMonth(d.getMonth() + Number(n || 0));
    return toISO(d);
  }

  /* ---------- Modelos de regras por tipo de máquina ----------
     Baseados em recomendações comuns de manuais de fabricantes.
     O gestor deve ajustar pelo manual do modelo dele. */
  const TEMPLATES = {
    "Esteira": [
      ["Lubrificar lona e prancha", 150, 30, 120],
      ["Verificar correia e alinhamento da lona", 500, 90, 180],
      ["Revisão geral técnica (motor e placa)", 1500, 365, 650],
    ],
    "Bike": [
      ["Ajustar e lubrificar corrente", 250, 60, 70],
      ["Trocar pastilha de freio", 600, 180, 110],
    ],
    "Elíptico": [
      ["Limpeza e lubrificação de articulações", 300, 90, 90],
      ["Verificar rolamentos e correia", 1000, 180, 220],
    ],
    "Musculação": [
      ["Checar cabos de aço e polias", 300, 60, 80],
      ["Lubrificar guias e trilhos", 200, 60, 90],
      ["Trocar cabos de aço (peça de desgaste)", 2000, 730, 520],
    ],
    "Outro": [
      ["Inspeção geral e reaperto", 300, 90, 80],
    ],
  };
  const TIPOS = Object.keys(TEMPLATES);

  /* ---------- Uso ---------- */
  function taxaConfig(m, cfg) {
    const horasDia = Number(cfg.horasDia) || 14;
    const dias = Number(cfg.diasSemana) || 6;
    const fator = Math.min(Math.max(Number(m.fatorUso) || 0.5, 0.05), 1);
    return (horasDia * dias / 7) * fator;
  }

  /* Horas de uso por dia: pelo contador (média das leituras) ou estimada */
  function taxaDiaria(m, cfg) {
    if (m.modoUso === "contador" && m.leituras && m.leituras.length >= 2) {
      const ls = m.leituras;
      const a = ls[0], b = ls[ls.length - 1];
      const dias = daysBetween(a.data, b.data);
      if (dias > 0 && b.horas > a.horas) return (b.horas - a.horas) / dias;
    }
    return taxaConfig(m, cfg);
  }

  /* Horas de uso acumuladas na data informada (padrão: hoje) */
  function horasNaData(m, cfg, iso) {
    iso = iso || todayISO();
    if (m.modoUso === "contador" && m.leituras && m.leituras.length) {
      const ultima = m.leituras[m.leituras.length - 1];
      const dias = daysBetween(ultima.data, iso);
      return Math.max(0, ultima.horas + dias * taxaDiaria(m, cfg));
    }
    const dias = Math.max(0, daysBetween(m.dataCompra, iso));
    return dias * taxaConfig(m, cfg);
  }
  function horasAtuais(m, cfg) {
    return horasNaData(m, cfg, todayISO());
  }

  /* ---------- Regras ---------- */
  function statusRegra(r, m, cfg) {
    const taxa = taxaDiaria(m, cfg);
    const horasDesde = Math.max(0, horasAtuais(m, cfg) - (Number(r.ultimaExecHoras) || 0));
    const diasDesde = Math.max(0, daysBetween(r.ultimaExecData));
    const pH = r.intervaloHoras > 0 ? horasDesde / r.intervaloHoras : 0;
    const pD = r.intervaloDias > 0 ? diasDesde / r.intervaloDias : 0;
    const pct = Math.max(pH, pD);

    const restantes = [];
    if (r.intervaloHoras > 0) restantes.push((r.intervaloHoras - horasDesde) / Math.max(taxa, 0.1));
    if (r.intervaloDias > 0) restantes.push(r.intervaloDias - diasDesde);
    const diasRest = restantes.length ? Math.min.apply(null, restantes) : Infinity;
    const horasRest = r.intervaloHoras > 0 ? r.intervaloHoras - horasDesde : null;

    const limite = (Number(cfg.limiteProxima) || 80) / 100;
    const antecedencia = Number(cfg.antecedenciaDias) || 7;

    let status = "ok";
    if (pct >= 1) status = "urgente";
    else if (pct >= limite || diasRest <= antecedencia) status = "proxima";

    let texto;
    if (status === "urgente") {
      const atraso = Math.max(0, Math.round(-diasRest));
      texto = atraso > 0 ? "Revisão vencida há " + atraso + (atraso === 1 ? " dia" : " dias") : "Revisão vence hoje";
    } else if (status === "proxima") {
      const d = Math.max(0, Math.round(diasRest));
      texto = horasRest !== null && (horasRest / Math.max(taxa, 0.1)) <= diasRest + 0.5
        ? "Revisão próxima (" + Math.max(0, Math.round(horasRest)) + "h de uso)"
        : "Revisão próxima (" + d + (d === 1 ? " dia" : " dias") + ")";
    } else {
      texto = "Em dia";
    }

    return {
      status, pct, texto, horasDesde, diasDesde, horasRest,
      diasRest: Math.round(diasRest),
      venceEm: Number.isFinite(diasRest) ? addDays(todayISO(), diasRest) : null,
    };
  }

  const PESO = { ok: 0, proxima: 1, urgente: 2 };

  function statusMaquina(m, capex) {
    const cfg = capex.config;
    const regras = capex.regras
      .filter((r) => r.maquinaId === m.id)
      .map((r) => ({ regra: r, st: statusRegra(r, m, cfg) }))
      .sort((a, b) => PESO[b.st.status] - PESO[a.st.status] || a.st.diasRest - b.st.diasRest);

    if (m.avaria) {
      return { status: "urgente", texto: "Avaria — máquina parada", regras, pior: regras[0] || null };
    }
    const pior = regras[0] || null;
    if (!pior) return { status: "ok", texto: "Sem regra de revisão", regras, pior: null };
    return { status: pior.st.status, texto: pior.st.texto, regras, pior };
  }

  /* ---------- Garantia, vida útil e valor ---------- */
  function garantia(m) {
    const fim = addMonths(m.dataCompra, m.garantiaMeses);
    if (!fim || !m.garantiaMeses) return { ativa: false, fim: null, diasRest: null };
    const diasRest = daysBetween(todayISO(), fim);
    return { ativa: diasRest >= 0, fim, diasRest };
  }

  function financeiro(m, capex) {
    const idadeAnos = Math.max(0, daysBetween(m.dataCompra) / 365.25);
    const vida = Number(m.vidaUtilAnos) || 0;
    const valorPago = Number(m.valorPago) || 0;
    const valorAtual = vida > 0 ? valorPago * Math.max(0, 1 - idadeAnos / vida) : valorPago;
    const hist = capex.historico.filter((h) => h.maquinaId === m.id);
    const custoTotal = hist.reduce((s, h) => s + (Number(h.custo) || 0), 0);
    const custo12m = hist.filter((h) => daysBetween(h.data) <= 365).reduce((s, h) => s + (Number(h.custo) || 0), 0);
    const corretivo = hist.filter((h) => !isPreventivo(h)).reduce((s, h) => s + (Number(h.custo) || 0), 0);
    return {
      idadeAnos, vidaRestAnos: Math.max(0, vida - idadeAnos), valorPago, valorAtual,
      custoTotal, custo12m, corretivo,
      fimVida: vida > 0 ? addMonths(m.dataCompra, Math.round(vida * 12)) : null,
    };
  }

  function isPreventivo(h) {
    return /preventiva|revis|troca de pe/i.test(h.tipo || "");
  }

  /* Premissa: consertar depois da quebra custa de 3 a 5 vezes mais.
     Usamos o mínimo (3x): cada revisão preventiva evita gastar
     2x o valor dela num conserto emergencial. */
  const FATOR_ECONOMIA = 2;
  function economiaPreventiva(capex) {
    return capex.historico.filter(isPreventivo).reduce((s, h) => s + (Number(h.custo) || 0) * FATOR_ECONOMIA, 0);
  }

  /* ---------- Alertas ---------- */
  function alertas(capex) {
    const lista = [];
    capex.maquinas.forEach((m) => {
      const sm = statusMaquina(m, capex);
      if (m.avaria) {
        lista.push({ nivel: "urgente", maquina: m, regra: null, titulo: "Avaria registrada", texto: "Máquina parada aguardando conserto", ordem: -9999 });
      }
      sm.regras.forEach(({ regra, st }) => {
        if (st.status === "ok") return;
        lista.push({ nivel: st.status, maquina: m, regra, titulo: regra.descricao, texto: st.texto, ordem: st.diasRest });
      });
      const g = garantia(m);
      if (g.ativa && g.diasRest <= 60) {
        lista.push({ nivel: "proxima", maquina: m, regra: null, titulo: "Garantia termina em " + g.diasRest + " dias",
          texto: "Faça uma revisão completa enquanto ainda está coberta", ordem: g.diasRest, garantia: true });
      }
      const f = financeiro(m, capex);
      if (m.vidaUtilAnos && f.vidaRestAnos <= 0) {
        lista.push({ nivel: "proxima", maquina: m, regra: null, titulo: "Vida útil estimada atingida",
          texto: "Planeje a substituição no orçamento (CAPEX)", ordem: 999 });
      }
    });
    return lista.sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || a.ordem - b.ordem);
  }

  /* ---------- Links de aviso (sem servidor) ---------- */
  function whatsappLink(numero, texto) {
    let n = String(numero || "").replace(/\D/g, "");
    if (n && (n.length === 10 || n.length === 11)) n = "55" + n;
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto);
  }
  function mailtoLink(email, assunto, corpo) {
    return "mailto:" + encodeURIComponent(email || "").replace(/%40/g, "@") +
      "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo);
  }

  /* ---------- Normalização de dados antigos/seed ---------- */
  function normalize(capex) {
    capex.config = Object.assign({ horasDia: 15, diasSemana: 6, antecedenciaDias: 7, limiteProxima: 80, email: "", whatsapp: "" }, capex.config || {});
    capex.maquinas = capex.maquinas || [];
    capex.regras = capex.regras || [];
    capex.historico = capex.historico || [];
    capex.os = capex.os || [];
    capex.proximaOS = capex.proximaOS || capex.os.length + 1;
    capex.regras.forEach((r) => {
      if (r.horasAtras !== undefined) {
        const m = capex.maquinas.find((x) => x.id === r.maquinaId);
        r.ultimaExecHoras = m ? Math.max(0, horasAtuais(m, capex.config) - r.horasAtras) : 0;
        delete r.horasAtras;
      }
    });
    capex.maquinas.forEach((m) => { m.leituras = m.leituras || []; });
    return capex;
  }

  global.NexusCapex = {
    TIPOS, TEMPLATES, FATOR_ECONOMIA,
    todayISO, daysBetween, addDays, parseDate,
    taxaDiaria, horasAtuais, horasNaData,
    statusRegra, statusMaquina, garantia, financeiro, isPreventivo,
    economiaPreventiva, alertas, whatsappLink, mailtoLink, normalize,
  };
})(window);
