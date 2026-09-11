/* ============================================================
   NEXUS FITNESS — dashboard.js
   Renderiza e controla os módulos do painel
   ============================================================ */

(function () {
  "use strict";

  const userId = NexusAuth.requireAuth();
  if (!userId) return;

  const ALERT_THRESHOLD = 75;

  function formatBRL(n) {
    return "R$ " + Math.round(n).toLocaleString("pt-BR");
  }

  function discountForCount(n) {
    return Math.min(5 + n * 0.75, 32);
  }

  function todayBR() {
    const d = new Date();
    return d.toLocaleDateString("pt-BR");
  }

  function current() {
    return NexusAuth.getCurrent();
  }

  /* ==========================================================
     TOAST
     ========================================================== */

  const toastEl = document.getElementById("toast");
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) return;

    toastEl.textContent = msg;
    toastEl.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2600);
  }

  /* ==========================================================
     SIDEBAR / NAVEGAÇÃO
     ========================================================== */

  const navItems = document.querySelectorAll(".nav-item");
  const viewSections = document.querySelectorAll(".view-section");

  const topbarTitle = document.getElementById("topbar-title");
  const topbarSub = document.getElementById("topbar-sub");

  const viewMeta = {
    "visao-geral": [
      "Visão geral",
      "Resumo da operação em tempo real"
    ],

    manutencao: [
      "Manutenção preditiva",
      "Monitoramento de uso e agendamento automático de revisões"
    ],

    hub: [
      "Hub de suprimentos",
      "Compra coletiva de insumos a preço de atacado"
    ],

    equipamentos: [
      "Equipamentos",
      "Cadastro e gestão da frota monitorada"
    ],

    configuracoes: [
      "Configurações",
      "Dados da conta e da academia"
    ]
  };

  function goToView(view) {
    navItems.forEach((item) => {
      item.classList.toggle(
        "active",
        item.dataset.view === view
      );
    });

    viewSections.forEach((section) => {
      section.classList.toggle(
        "active",
        section.id === "view-" + view
      );
    });

    const meta = viewMeta[view];

    if (meta) {
      topbarTitle.textContent = meta[0];
      topbarSub.textContent = meta[1];
    }

    if (view === "visao-geral") {
      requestAnimationFrame(() => {
        if (usageChart) usageChart.resize();
        if (statusChart) statusChart.resize();
        if (economiaChart) economiaChart.resize();
      });
    }
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      goToView(item.dataset.view);
    });
  });

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goToView(btn.dataset.goto);
    });
  });

  /* ==========================================================
     SIDEBAR / USUÁRIO
     ========================================================== */

  function renderUserChrome() {
    const data = current();

    if (!data) return;

    const { user, account } = data;

    document.getElementById("sidebar-user-name").textContent =
      user.nome;

    document.getElementById("sidebar-user-academia").textContent =
      account.academia;

    document.getElementById("topbar-plan").textContent =
      account.plano;
  }

  /* ==========================================================
     VISÃO GERAL
     ========================================================== */

  function renderOverview() {
    const data = current();

    if (!data) return;

    const { account } = data;

    const equipamentos = account.equipamentos;

    const alertas = equipamentos.filter(
      (e) => e.status === "alerta"
    );

    document.getElementById("kpi-equip-total").textContent =
      equipamentos.length;

    document.getElementById("kpi-alertas").textContent =
      alertas.length;

    document.getElementById("kpi-economia").textContent =
      formatBRL(account.savedTotal);

    const n = account.hub.academiasNoPedido;

    const discount = discountForCount(n);

    document.getElementById("kpi-desconto").textContent =
      discount.toFixed(0) + "%";

    document.getElementById("kpi-desconto-note").textContent =
      n + " academias no pedido coletivo";

    /* Badge de alertas */

    const badge = document.getElementById("badge-alertas");

    if (alertas.length > 0) {
      badge.hidden = false;
      badge.textContent = alertas.length;
    } else {
      badge.hidden = true;
    }

    /* Lista de alertas */

    const listEl =
      document.getElementById("overview-alert-list");

    if (alertas.length === 0) {
      listEl.innerHTML =
        '<div class="alert-empty">' +
        "Nenhum alerta no momento — frota operando dentro do esperado." +
        "</div>";
    } else {
      listEl.innerHTML = alertas
        .map(
          (e) => `
            <div class="alert-item is-amber">
              <div class="alert-item-left">
                <span class="dot"></span>

                <span>
                  ${escapeHTML(e.nome)}
                  atingiu ${Math.round(e.uso)}%
                  de uso — revisão recomendada
                </span>
              </div>
            </div>
          `
        )
        .join("");
    }

    document.getElementById("overview-hub-count").textContent =
      n;

    document.getElementById(
      "overview-hub-discount"
    ).textContent =
      discount.toFixed(0) + "%";

    updateCharts(account);
  }

  /* ==========================================================
     ESCAPE HTML
     ========================================================== */

  function escapeHTML(str) {
    const div = document.createElement("div");

    div.textContent = String(str);

    return div.innerHTML;
  }

  /* ==========================================================
     GRÁFICOS
     ========================================================== */

  let usageChart = null;
  let statusChart = null;
  let economiaChart = null;

  function chartColors() {
    const styles =
      getComputedStyle(document.documentElement);

    return {
      teal:
        styles.getPropertyValue("--teal").trim() ||
        "#4ED1B0",

      amber:
        styles.getPropertyValue("--amber").trim() ||
        "#E3A94C",

      rust:
        styles.getPropertyValue("--rust").trim() ||
        "#C4593F",

      textSecondary:
        styles
          .getPropertyValue("--text-secondary")
          .trim() ||
        "#9FACA8",

      textTertiary:
        styles
          .getPropertyValue("--text-tertiary")
          .trim() ||
        "#63706C",

      border:
        styles
          .getPropertyValue("--border-soft")
          .trim() ||
        "#1D2726"
    };
  }

  function initCharts() {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js não foi carregado.");
      return;
    }

    const c = chartColors();

    Chart.defaults.font.family =
      "Inter, sans-serif";

    Chart.defaults.font.size = 10;

    Chart.defaults.color =
      c.textSecondary;

    /* ========================================================
       GRÁFICO DE TORRES
       ======================================================== */

    const usageCtx =
      document.getElementById("chart-uso");

    if (usageCtx) {
      usageChart = new Chart(usageCtx, {
        type: "bar",

        data: {
          labels: [],

          datasets: [
            {
              label: "Uso estimado (%)",

              data: [],

              backgroundColor: [],

              borderRadius: 5,

              /*
               * Limita a largura das torres.
               * Isso evita que elas fiquem gigantes.
               */
              maxBarThickness: 32,

              categoryPercentage: 0.75,

              barPercentage: 0.8
            }
          ]
        },

        options: {
          responsive: true,

          /*
           * IMPORTANTE:
           * o tamanho vertical será controlado pelo
           * .chart-container-usage
           */
          maintainAspectRatio: false,

          animation: {
            duration: 350
          },

          plugins: {
            legend: {
              display: false
            },

            tooltip: {
              callbacks: {
                label: (ctx) => {
                  return (
                    ctx.parsed.y.toFixed(0) +
                    "% de uso"
                  );
                }
              }
            }
          },

          scales: {
            y: {
              min: 0,

              max: 100,

              grid: {
                color: c.border
              },

              ticks: {
                font: {
                  size: 9
                },

                callback: (value) => {
                  return value + "%";
                }
              }
            },

            x: {
              grid: {
                display: false
              },

              ticks: {
                font: {
                  size: 9
                },

                maxRotation: 25,

                minRotation: 0
              }
            }
          }
        }
      });
    }

    /* ========================================================
       GRÁFICO DE STATUS
       ======================================================== */

    const statusCtx =
      document.getElementById("chart-status");

    if (statusCtx) {
      statusChart = new Chart(statusCtx, {
        type: "doughnut",

        data: {
          labels: [
            "Operando normal",
            "Revisão recomendada"
          ],

          datasets: [
            {
              data: [0, 0],

              backgroundColor: [
                c.teal,
                c.amber
              ],

              borderColor: "#141B1A",

              borderWidth: 3
            }
          ]
        },

        options: {
          responsive: true,

          maintainAspectRatio: false,

          cutout: "72%",

          plugins: {
            legend: {
              position: "bottom",

              labels: {
                boxWidth: 8,

                boxHeight: 8,

                padding: 8,

                font: {
                  size: 10
                }
              }
            }
          }
        }
      });
    }

    /* ========================================================
       GRÁFICO DE ECONOMIA
       ======================================================== */

    const economiaCtx =
      document.getElementById("chart-economia");

    if (economiaCtx) {
      economiaChart = new Chart(economiaCtx, {
        type: "line",

        data: {
          labels: [],

          datasets: [
            {
              label: "Economia mensal",

              data: [],

              borderColor: c.teal,

              backgroundColor:
                "rgba(78, 209, 176, 0.12)",

              tension: 0.35,

              fill: true,

              pointBackgroundColor:
                c.teal,

              pointRadius: 3
            }
          ]
        },

        options: {
          responsive: true,

          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false
            },

            tooltip: {
              callbacks: {
                label: (ctx) => {
                  return (
                    formatBRL(ctx.parsed.y) +
                    " economizados"
                  );
                }
              }
            }
          },

          scales: {
            y: {
              grid: {
                color: c.border
              },

              ticks: {
                font: {
                  size: 9
                },

                callback: (value) => {
                  return "R$ " + value;
                }
              }
            },

            x: {
              grid: {
                display: false
              },

              ticks: {
                font: {
                  size: 9
                }
              }
            }
          }
        }
      });
    }
  }

  /* ==========================================================
     ATUALIZAÇÃO DOS GRÁFICOS
     ========================================================== */

  function updateCharts(account) {
    /* GRÁFICO DE TORRES */

    if (usageChart) {
      const c = chartColors();

      usageChart.data.labels =
        account.equipamentos.map(
          (e) => e.nome
        );

      usageChart.data.datasets[0].data =
        account.equipamentos.map(
          (e) => Math.round(e.uso)
        );

      usageChart.data.datasets[0].backgroundColor =
        account.equipamentos.map((e) => {
          if (e.uso >= 90) {
            return c.rust;
          }

          if (e.uso >= ALERT_THRESHOLD) {
            return c.amber;
          }

          return c.teal;
        });

      usageChart.update("none");
    }

    /* GRÁFICO DE STATUS */

    if (statusChart) {
      const ok =
        account.equipamentos.filter(
          (e) => e.status !== "alerta"
        ).length;

      const alerta =
        account.equipamentos.filter(
          (e) => e.status === "alerta"
        ).length;

      statusChart.data.datasets[0].data = [
        ok,
        alerta
      ];

      statusChart.update("none");
    }

    /* GRÁFICO DE ECONOMIA */

    if (economiaChart) {
      const historico =
        account.hub.historico
          .slice()
          .reverse();

      economiaChart.data.labels =
        historico.map(
          (h) => h.data
        );

      economiaChart.data.datasets[0].data =
        historico.map(
          (h) => h.economia
        );

      economiaChart.update("none");
    }
  }

  /* ==========================================================
     MANUTENÇÃO PREDITIVA
     ========================================================== */

  function usageColor(uso) {
    if (uso >= 90) {
      return "var(--rust)";
    }

    if (uso >= ALERT_THRESHOLD) {
      return "var(--amber)";
    }

    return "var(--teal)";
  }

  function eqRowHTML(eq, mode) {
    const clamped =
      Math.min(eq.uso, 100);

    const statusBadge =
      eq.status === "alerta"
        ? `
          <span class="badge badge-alerta">
            Revisão recomendada
          </span>
        `
        : `
          <span class="badge badge-ok">
            Operando normal
          </span>
        `;

    let actions = "";

    if (mode === "monitor") {
      actions = `
        <button
          class="btn btn-ghost btn-sm"
          data-action="advance"
          data-id="${eq.id}">
          +1 semana
        </button>

        ${
          eq.status === "alerta"
            ? `
              <button
                class="btn btn-primary btn-sm"
                data-action="resolve"
                data-id="${eq.id}">
                Concluir revisão
              </button>
            `
            : ""
        }
      `;
    } else {
      actions = `
        <button
          class="btn btn-danger btn-sm"
          data-action="remove"
          data-id="${eq.id}">
          Remover
        </button>
      `;
    }

    return `
      <div class="eq-row">

        <span class="eq-name">
          ${escapeHTML(eq.nome)}
        </span>

        <span class="eq-tipo col-tipo">
          ${escapeHTML(eq.tipo)}
        </span>

        <span>
          <div class="eq-usage-track">
            <div
              class="eq-usage-fill"
              style="
                width:${clamped}%;
                background:${usageColor(eq.uso)}
              ">
            </div>
          </div>
        </span>

        <span>
          ${statusBadge}
        </span>

        <span
          class="col-revisao"
          style="color:var(--text-tertiary)">
          ${eq.ultimaRevisao}
        </span>

        <span class="eq-actions">
          ${actions}
        </span>

      </div>
    `;
  }

  function renderManutencao() {
    const { account } = current();

    document.getElementById("eq-list").innerHTML =
      account.equipamentos
        .map((e) =>
          eqRowHTML(e, "monitor")
        )
        .join("");
  }

  function renderEquipamentosCRUD() {
    const { account } = current();

    document.getElementById(
      "eq-crud-list"
    ).innerHTML =
      account.equipamentos
        .map((e) =>
          eqRowHTML(e, "crud")
        )
        .join("");
  }

  /* ==========================================================
     RENDERIZAÇÃO GERAL
     ========================================================== */

  function renderAll() {
    renderUserChrome();
    renderOverview();
    renderManutencao();
    renderEquipamentosCRUD();
    renderHub();
    renderSettings();
  }

  /* ==========================================================
     EVENTOS DOS EQUIPAMENTOS
     ========================================================== */

  document
    .getElementById("view-manutencao")
    .addEventListener(
      "click",
      handleEqAction
    );

  document
    .getElementById("view-equipamentos")
    .addEventListener(
      "click",
      handleEqAction
    );

  function handleEqAction(e) {
    const btn =
      e.target.closest("[data-action]");

    if (!btn) return;

    const action = btn.dataset.action;

    const id = btn.dataset.id;

    NexusAuth.updateAccount(
      userId,
      (account) => {
        const eq =
          account.equipamentos.find(
            (x) => x.id === id
          );

        if (!eq) return;

        if (action === "advance") {
          eq.uso = Math.min(
            eq.uso +
              8 +
              Math.random() * 7,
            100
          );

          if (
            eq.uso >= ALERT_THRESHOLD
          ) {
            eq.status = "alerta";
          }
        }

        if (action === "resolve") {
          eq.uso =
            5 +
            Math.random() * 8;

          eq.status = "ok";

          eq.ultimaRevisao =
            todayBR();

          account.savedTotal +=
            850 +
            Math.round(
              Math.random() * 500
            );

          account.alertasResolvidos =
            (account.alertasResolvidos || 0) +
            1;

          showToast(
            `Revisão de ${eq.nome} concluída — economia registrada.`
          );
        }

        if (action === "remove") {
          account.equipamentos =
            account.equipamentos.filter(
              (x) => x.id !== id
            );
        }
      }
    );

    renderAll();
  }

  /* ==========================================================
     HUB DE SUPRIMENTOS
     ========================================================== */

  const hubSlider =
    document.getElementById(
      "hub-slider"
    );

  let editingInsumoId = null;

  function insumoRowHTML(
    item,
    discount
  ) {
    const hubPrice =
      item.varejo *
      (1 - discount / 100);

    const economia =
      item.varejo - hubPrice;

    if (
      editingInsumoId === item.id
    ) {
      return `
        <div
          class="insumo-row"
          data-id="${item.id}">

          <input
            type="text"
            class="insumo-edit-input"
            data-field="nome"
            value="${escapeHTML(item.nome)}">

          <input
            type="number"
            min="0"
            step="1"
            class="insumo-edit-input"
            data-field="varejo"
            value="${item.varejo}">

          <span class="insumo-price-hub">
            ${formatBRL(hubPrice)}
          </span>

          <span class="insumo-econ">
            -${formatBRL(economia)}
          </span>

          <span class="insumo-actions">

            <button
              class="btn btn-primary btn-sm"
              data-action="save-insumo"
              data-id="${item.id}">
              Salvar
            </button>

            <button
              class="btn btn-ghost btn-sm"
              data-action="cancel-insumo"
              data-id="${item.id}">
              Cancelar
            </button>

          </span>
        </div>
      `;
    }

    return `
      <div
        class="insumo-row"
        data-id="${item.id}">

        <span>
          ${escapeHTML(item.nome)}
        </span>

        <span
          style="color:var(--text-tertiary)">
          ${formatBRL(item.varejo)}
        </span>

        <span class="insumo-price-hub">
          ${formatBRL(hubPrice)}
        </span>

        <span class="insumo-econ">
          -${formatBRL(economia)}
        </span>

        <span class="insumo-actions">

          <button
            class="btn btn-ghost btn-sm"
            data-action="edit-insumo"
            data-id="${item.id}">
            Editar
          </button>

          <button
            class="btn btn-danger btn-sm"
            data-action="delete-insumo"
            data-id="${item.id}">
            Remover
          </button>

        </span>

      </div>
    `;
  }

  function renderHub() {
    const { account } = current();

    const n =
      account.hub.academiasNoPedido;

    hubSlider.value = n;

    document.getElementById(
      "hub-count"
    ).textContent = n;

    const discount =
      discountForCount(n);

    document.getElementById(
      "insumo-list"
    ).innerHTML =
      account.hub.insumos
        .map((item) =>
          insumoRowHTML(
            item,
            discount
          )
        )
        .join("");

    document.getElementById(
      "hub-history"
    ).innerHTML =
      account.hub.historico
        .map(
          (h) => `
            <div class="history-item">

              <span>
                ${h.data} — pedido coletivo
              </span>

              <span class="econ">
                economia de
                ${formatBRL(h.economia)}
              </span>

            </div>
          `
        )
        .join("");
  }

  hubSlider.addEventListener(
    "input",
    () => {
      NexusAuth.updateAccount(
        userId,
        (account) => {
          account.hub.academiasNoPedido =
            Number(hubSlider.value);
        }
      );

      renderHub();
      renderOverview();
    }
  );

  document
    .getElementById(
      "registrar-pedido-btn"
    )
    .addEventListener(
      "click",
      () => {
        NexusAuth.updateAccount(
          userId,
          (account) => {
            const discount =
              discountForCount(
                account.hub
                  .academiasNoPedido
              );

            const varejoTotal =
              account.hub.insumos.reduce(
                (sum, i) =>
                  sum + i.varejo,
                0
              );

            const hubTotal =
              varejoTotal *
              (1 - discount / 100);

            const economia =
              varejoTotal -
              hubTotal;

            account.hub.historico.unshift(
              {
                data: todayBR(),
                valor: Math.round(
                  hubTotal
                ),
                economia: Math.round(
                  economia
                )
              }
            );

            account.hub.historico =
              account.hub.historico.slice(
                0,
                8
              );

            account.savedTotal +=
              Math.round(economia);
          }
        );

        renderHub();
        renderOverview();

        showToast(
          "Pedido coletivo registrado no histórico."
        );
      }
    );

  /* ==========================================================
     CRUD DE INSUMOS
     ========================================================== */

  document
    .getElementById("insumo-list")
    .addEventListener(
      "click",
      (e) => {
        const btn =
          e.target.closest(
            "[data-action]"
          );

        if (!btn) return;

        const action =
          btn.dataset.action;

        const id =
          btn.dataset.id;

        if (
          action === "edit-insumo"
        ) {
          editingInsumoId = id;

          renderHub();

          return;
        }

        if (
          action === "cancel-insumo"
        ) {
          editingInsumoId = null;

          renderHub();

          return;
        }

        if (
          action === "delete-insumo"
        ) {
          const { account } =
            current();

          const item =
            account.hub.insumos.find(
              (i) => i.id === id
            );

          if (
            !confirm(
              `Remover "${
                item
                  ? item.nome
                  : "este item"
              }" do hub de suprimentos?`
            )
          ) {
            return;
          }

          NexusAuth.updateAccount(
            userId,
            (acc) => {
              acc.hub.insumos =
                acc.hub.insumos.filter(
                  (i) => i.id !== id
                );
            }
          );

          renderHub();

          showToast(
            "Insumo removido do hub."
          );

          return;
        }

        if (
          action === "save-insumo"
        ) {
          const row =
            btn.closest(
              ".insumo-row"
            );

          const nomeInput =
            row.querySelector(
              '[data-field="nome"]'
            );

          const varejoInput =
            row.querySelector(
              '[data-field="varejo"]'
            );

          const nome =
            nomeInput.value.trim();

          const varejo =
            Number(
              varejoInput.value
            );

          if (!nome) {
            showToast(
              "Informe um nome para o insumo."
            );

            return;
          }

          if (
            !Number.isFinite(
              varejo
            ) ||
            varejo <= 0
          ) {
            showToast(
              "Informe um preço de varejo válido."
            );

            return;
          }

          NexusAuth.updateAccount(
            userId,
            (acc) => {
              const item =
                acc.hub.insumos.find(
                  (i) => i.id === id
                );

              if (item) {
                item.nome = nome;
                item.varejo = varejo;
              }
            }
          );

          editingInsumoId = null;

          renderHub();

          showToast(
            "Insumo atualizado."
          );

          return;
        }
      }
    );

  /* ==========================================================
     ADICIONAR INSUMO
     ========================================================== */

  const toggleAddInsumoBtn =
    document.getElementById(
      "toggle-add-insumo"
    );

  const addInsumoForm =
    document.getElementById(
      "add-insumo-form"
    );

  if (
    toggleAddInsumoBtn &&
    addInsumoForm
  ) {
    toggleAddInsumoBtn.addEventListener(
      "click",
      () => {
        addInsumoForm.classList.toggle(
          "show"
        );
      }
    );

    addInsumoForm.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();

        const nome =
          document
            .getElementById(
              "new-insumo-nome"
            )
            .value.trim();

        const varejo =
          Number(
            document.getElementById(
              "new-insumo-varejo"
            ).value
          );

        if (
          !nome ||
          !Number.isFinite(
            varejo
          ) ||
          varejo <= 0
        ) {
          showToast(
            "Preencha nome e preço de varejo válidos."
          );

          return;
        }

        NexusAuth.updateAccount(
          userId,
          (account) => {
            account.hub.insumos.push(
              {
                id:
                  NexusAuth.uid(
                    "ins"
                  ),
                nome,
                varejo
              }
            );
          }
        );

        addInsumoForm.reset();

        addInsumoForm.classList.remove(
          "show"
        );

        renderHub();

        showToast(
          `${nome} adicionado ao hub de suprimentos.`
        );
      }
    );
  }

  /* ==========================================================
     ADICIONAR EQUIPAMENTO
     ========================================================== */

  const toggleAddBtn =
    document.getElementById(
      "toggle-add-eq"
    );

  const addEqForm =
    document.getElementById(
      "add-eq-form"
    );

  if (
    toggleAddBtn &&
    addEqForm
  ) {
    toggleAddBtn.addEventListener(
      "click",
      () => {
        addEqForm.classList.toggle(
          "show"
        );
      }
    );

    addEqForm.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();

        const nome =
          document
            .getElementById(
              "new-eq-nome"
            )
            .value.trim();

        const tipo =
          document
            .getElementById(
              "new-eq-tipo"
            )
            .value.trim();

        if (!nome || !tipo) {
          return;
        }

        NexusAuth.updateAccount(
          userId,
          (account) => {
            account.equipamentos.push(
              {
                id:
                  NexusAuth.uid(
                    "eq"
                  ),

                nome,

                tipo,

                uso: Math.round(
                  3 +
                    Math.random() *
                      10
                ),

                status: "ok",

                ultimaRevisao:
                  todayBR()
              }
            );
          }
        );

        addEqForm.reset();

        addEqForm.classList.remove(
          "show"
        );

        renderAll();

        showToast(
          `${nome} adicionado à frota monitorada.`
        );
      }
    );
  }

  /* ==========================================================
     CONFIGURAÇÕES
     ========================================================== */

  function renderSettings() {
    const { user, account } =
      current();

    document.getElementById(
      "cfg-academia"
    ).value =
      account.academia;

    document.getElementById(
      "cfg-nome"
    ).value =
      user.nome;

    document.getElementById(
      "cfg-email"
    ).value =
      user.email;

    document.getElementById(
      "cfg-plano"
    ).textContent =
      account.plano;
  }

  document
    .getElementById(
      "save-settings-btn"
    )
    .addEventListener(
      "click",
      () => {
        const novaAcademia =
          document
            .getElementById(
              "cfg-academia"
            )
            .value.trim();

        const novoNome =
          document
            .getElementById(
              "cfg-nome"
            )
            .value.trim();

        if (
          !novaAcademia ||
          !novoNome
        ) {
          return;
        }

        NexusAuth.updateAccount(
          userId,
          (account) => {
            account.academia =
              novaAcademia;
          }
        );

        NexusAuth.updateUser(
          userId,
          (user) => {
            user.nome =
              novoNome;
          }
        );

        renderAll();

        showToast(
          "Configurações salvas."
        );
      }
    );

  document
    .getElementById(
      "reset-data-btn"
    )
    .addEventListener(
      "click",
      () => {
        if (
          !confirm(
            "Isso vai restaurar os dados de demonstração desta conta. Continuar?"
          )
        ) {
          return;
        }

        NexusAuth.resetDemoData(
          userId
        );

        editingInsumoId = null;

        renderAll();

        showToast(
          "Dados de demonstração restaurados."
        );
      }
    );

  /* ==========================================================
     LOGOUT
     ========================================================== */

  function doLogout() {
    NexusAuth.logout();

    window.location.href =
      "login.html";
  }

  document
    .getElementById("logout-btn")
    .addEventListener(
      "click",
      doLogout
    );

  document
    .getElementById("logout-btn-2")
    .addEventListener(
      "click",
      doLogout
    );

  /* ==========================================================
     BOOT
     ========================================================== */

  initCharts();

  renderAll();

  /* ==========================================================
     SIMULAÇÃO DE USO
     ========================================================== */

  setInterval(() => {
    NexusAuth.updateAccount(
      userId,
      (account) => {
        account.equipamentos.forEach(
          (eq) => {
            if (
              eq.status === "alerta"
            ) {
              return;
            }

            eq.uso = Math.min(
              eq.uso +
                Math.random() *
                  1.2,
              100
            );

            if (
              eq.uso >=
              ALERT_THRESHOLD
            ) {
              eq.status =
                "alerta";
            }
          }
        );
      }
    );

    renderAll();
  }, 4000);
})();
