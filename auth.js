/* ============================================================
   NEXUS FITNESS — auth.js
   Simulação de autenticação e banco de dados 100% no navegador
   (localStorage), apenas para fins de demonstração em feira de
   ciências. Nenhum dado é enviado a um servidor.
   ============================================================ */

(function (global) {
  "use strict";

  const DB_KEY = "nexus_fitness_db_v1";
  const SESSION_KEY = "nexus_fitness_session_v1";

  function nowISO() {
    return new Date().toISOString();
  }
  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9);
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      return raw ? JSON.parse(raw) : { users: [], accounts: {} };
    } catch (e) {
      return { users: [], accounts: {} };
    }
  }

  function saveDB(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn("Não foi possível salvar no navegador:", e);
    }
  }

  /* Datas relativas a hoje, para a demonstração sempre ter alertas reais */
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /* ----------------------------------------------------------
     CAPEX Guard — dados de exemplo
     Intervalos inspirados em manuais de fabricantes; ajuste
     sempre pelo manual do seu modelo.
     ---------------------------------------------------------- */
  function seedCapex() {
    const m1 = uid("mq"), m2 = uid("mq"), m3 = uid("mq"), m4 = uid("mq"), m5 = uid("mq"), m6 = uid("mq");
    const maquinas = [
      { id: m1, nome: "Esteira Movement LX 160", tipo: "Esteira", marca: "Movement", modelo: "LX 160", serie: "MV-160-0921",
        dataCompra: daysAgo(760), valorPago: 28900, vidaUtilAnos: 8, garantiaMeses: 24, modoUso: "contador", fatorUso: 0.7,
        leituras: [{ data: daysAgo(30), horas: 3870 }, { data: daysAgo(2), horas: 4120 }], avaria: false },
      { id: m2, nome: "Leg Press Pro", tipo: "Musculação", marca: "Nexus Strength", modelo: "LP-45 Pro", serie: "",
        dataCompra: daysAgo(420), valorPago: 14500, vidaUtilAnos: 10, garantiaMeses: 12, modoUso: "estimado", fatorUso: 0.45,
        leituras: [], avaria: false },
      { id: m3, nome: "Esteira 02", tipo: "Esteira", marca: "Movement", modelo: "RT 250", serie: "MV-250-1188",
        dataCompra: daysAgo(1100), valorPago: 21400, vidaUtilAnos: 8, garantiaMeses: 24, modoUso: "estimado", fatorUso: 0.8,
        leituras: [], avaria: false },
      { id: m4, nome: "Cross Over Duplo", tipo: "Musculação", marca: "Nexus Strength", modelo: "CO-2", serie: "",
        dataCompra: daysAgo(900), valorPago: 18700, vidaUtilAnos: 10, garantiaMeses: 12, modoUso: "estimado", fatorUso: 0.55,
        leituras: [], avaria: false },
      { id: m5, nome: "Bike Spinning 03", tipo: "Bike", marca: "Spin Pro", modelo: "S3", serie: "",
        dataCompra: daysAgo(300), valorPago: 4800, vidaUtilAnos: 6, garantiaMeses: 12, modoUso: "estimado", fatorUso: 0.35,
        leituras: [], avaria: false },
      { id: m6, nome: "Elíptico 01", tipo: "Elíptico", marca: "Movement", modelo: "E-500", serie: "",
        dataCompra: daysAgo(200), valorPago: 16200, vidaUtilAnos: 8, garantiaMeses: 24, modoUso: "estimado", fatorUso: 0.4,
        leituras: [], avaria: false },
    ];

    /* horasAtras = quantas horas de uso já passaram desde a última execução */
    const r = (maquinaId, descricao, intervaloHoras, intervaloDias, custoEstimado, horasAtras, diasAtras) =>
      ({ id: uid("rg"), maquinaId, descricao, intervaloHoras, intervaloDias, custoEstimado, horasAtras, ultimaExecData: daysAgo(diasAtras) });

    const regras = [
      r(m1, "Lubrificar lona e prancha", 150, 30, 120, 122, 14),
      r(m1, "Verificar correia e alinhamento da lona", 500, 90, 180, 250, 30),
      r(m1, "Revisão geral técnica (motor e placa)", 1500, 365, 650, 600, 75),
      r(m2, "Lubrificar guias e trilhos", 200, 60, 90, 40, 12),
      r(m2, "Verificar estofados, travas e parafusos", 400, 90, 60, 90, 25),
      r(m3, "Lubrificar lona e prancha", 150, 30, 120, 175, 26),
      r(m3, "Verificar correia e alinhamento da lona", 500, 90, 180, 300, 45),
      r(m4, "Checar cabos de aço e polias", 300, 60, 80, 255, 52),
      r(m4, "Trocar cabos de aço (peça de desgaste)", 2000, 730, 520, 900, 300),
      r(m5, "Ajustar e lubrificar corrente", 250, 60, 70, 60, 20),
      r(m5, "Trocar pastilha de freio", 600, 180, 110, 200, 70),
      r(m6, "Limpeza e lubrificação de articulações", 300, 90, 90, 80, 30),
    ];

    const historico = [
      { id: uid("hs"), maquinaId: m1, data: daysAgo(14), tipo: "Revisão preventiva", descricao: "Lubrificação de lona e prancha", custo: 120, responsavel: "TecFit Assistência", osId: null },
      { id: uid("hs"), maquinaId: m4, data: daysAgo(52), tipo: "Revisão preventiva", descricao: "Checagem de cabos e polias", custo: 80, responsavel: "João (manutenção interna)", osId: null },
      { id: uid("hs"), maquinaId: m3, data: daysAgo(95), tipo: "Conserto", descricao: "Troca do motor de inclinação após quebra", custo: 1850, responsavel: "TecFit Assistência", osId: null },
      { id: uid("hs"), maquinaId: m1, data: daysAgo(75), tipo: "Revisão preventiva", descricao: "Revisão geral técnica", custo: 650, responsavel: "TecFit Assistência", osId: null },
      { id: uid("hs"), maquinaId: m5, data: daysAgo(70), tipo: "Troca de peça", descricao: "Pastilha de freio", custo: 110, responsavel: "João (manutenção interna)", osId: null },
      { id: uid("hs"), maquinaId: m2, data: daysAgo(12), tipo: "Revisão preventiva", descricao: "Lubrificação de guias", custo: 90, responsavel: "João (manutenção interna)", osId: null },
    ];

    const os = [
      { id: uid("os"), numero: 1, maquinaId: m3, regraId: regras[5].id, tipo: "Preventiva", prioridade: "Alta",
        descricao: "Lubrificar lona e prancha (revisão vencida)", responsavel: "TecFit Assistência",
        abertaEm: daysAgo(1), prazo: daysAgo(-2), status: "Aberta", custo: 0, concluidaEm: null },
    ];

    return {
      config: { horasDia: 15, diasSemana: 6, antecedenciaDias: 7, limiteProxima: 80, email: "", whatsapp: "" },
      maquinas, regras, historico, os, proximaOS: 2,
    };
  }

  function seedAccountData(academiaNome) {
    return {
      academia: academiaNome,
      plano: "Piloto — Feira de Ciências",
      createdAt: nowISO(),
      capex: seedCapex(),
      hub: {
        academiasNoPedido: 12,
        insumos: [
          { id: uid("ins"), nome: "Álcool 70% (5L)", varejo: 68 },
          { id: uid("ins"), nome: "Papel toalha (fardo c/ 6)", varejo: 112 },
          { id: uid("ins"), nome: "Sabonete líquido (5L)", varejo: 89 },
          { id: uid("ins"), nome: "Kit peças de esteira", varejo: 340 },
        ],
        historico: [
          { data: "01/08/2026", valor: 1180, economia: 340 },
          { data: "01/07/2026", valor: 1050, economia: 290 },
          { data: "01/06/2026", valor: 990, economia: 260 },
        ],
      },
      alertasResolvidos: 14,
      savedTotal: 3260,
    };
  }

  function signup({ nome, academia, email, senha }) {
    const db = loadDB();
    email = (email || "").trim().toLowerCase();
    if (!nome || !academia || !email || !senha) {
      throw new Error("Preencha todos os campos.");
    }
    if (senha.length < 4) {
      throw new Error("A senha precisa ter pelo menos 4 caracteres.");
    }
    if (db.users.some((u) => u.email === email)) {
      throw new Error("Já existe uma conta cadastrada com esse e-mail.");
    }
    const userId = uid("user");
    db.users.push({ id: userId, nome, email, senha, academia, createdAt: nowISO() });
    db.accounts[userId] = seedAccountData(academia);
    saveDB(db);
    setSession(userId);
    return userId;
  }

  function login({ email, senha }) {
    const db = loadDB();
    email = (email || "").trim().toLowerCase();
    const user = db.users.find((u) => u.email === email && u.senha === senha);
    if (!user) throw new Error("E-mail ou senha incorretos.");
    setSession(user.id);
    return user.id;
  }

  function loginDemo() {
    const db = loadDB();
    let user = db.users.find((u) => u.email === "demo@nexusfitness.com.br");
    if (!user) {
      const userId = uid("user");
      user = {
        id: userId,
        nome: "Visitante",
        email: "demo@nexusfitness.com.br",
        senha: "demo",
        academia: "Academia Demonstração — Feira de Ciências",
        createdAt: nowISO(),
      };
      db.users.push(user);
      db.accounts[userId] = seedAccountData(user.academia);
      saveDB(db);
    }
    setSession(user.id);
    return user.id;
  }

  function setSession(userId) {
    try { localStorage.setItem(SESSION_KEY, userId); } catch (e) {}
  }
  function getSession() {
    try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function requireAuth() {
    const userId = getSession();
    if (!userId) {
      window.location.href = "index.html";
      return null;
    }
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user || !db.accounts[userId]) {
      logout();
      window.location.href = "index.html";
      return null;
    }
    return userId;
  }

  function getCurrent() {
    const userId = getSession();
    if (!userId) return null;
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return null;
    return { user, account: db.accounts[userId] };
  }

  function updateAccount(userId, mutatorFn) {
    const db = loadDB();
    const account = db.accounts[userId];
    if (!account) return;
    mutatorFn(account);
    saveDB(db);
  }

  function updateUser(userId, mutatorFn) {
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    mutatorFn(user);
    saveDB(db);
  }

  function resetDemoData(userId) {
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    db.accounts[userId] = seedAccountData(user.academia);
    saveDB(db);
  }

  global.NexusAuth = {
    signup,
    login,
    loginDemo,
    logout,
    requireAuth,
    getCurrent,
    updateAccount,
    updateUser,
    resetDemoData,
    seedCapex,
    uid,
  };
})(window);