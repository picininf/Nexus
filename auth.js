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
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function seedAccountData(academiaNome) {
    return {
      academia: academiaNome,
      plano: "Piloto — Feira de Ciências",
      createdAt: nowISO(),
      equipamentos: [
        { id: uid("eq"), nome: "Esteira 01", tipo: "Cardio", uso: 22, status: "ok", ultimaRevisao: "12/07/2026" },
        { id: uid("eq"), nome: "Esteira 02", tipo: "Cardio", uso: 81, status: "alerta", ultimaRevisao: "02/05/2026" },
        { id: uid("eq"), nome: "Bike ergométrica 04", tipo: "Cardio", uso: 47, status: "ok", ultimaRevisao: "19/06/2026" },
        { id: uid("eq"), nome: "Elíptico 01", tipo: "Cardio", uso: 65, status: "ok", ultimaRevisao: "30/06/2026" },
        { id: uid("eq"), nome: "Estação de musculação 03", tipo: "Força", uso: 9, status: "ok", ultimaRevisao: "01/08/2026" },
      ],
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
    if (senha.length < 6) {
      throw new Error("A senha precisa ter pelo menos 6 caracteres.");
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
    localStorage.setItem(SESSION_KEY, userId);
  }
  function getSession() {
    return localStorage.getItem(SESSION_KEY);
  }
  function logout() {
    localStorage.removeItem(SESSION_KEY);
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
    uid,
  };
})(window);