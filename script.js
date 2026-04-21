// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-analytics.js";
import {
    getFirestore, collection, addDoc, getDocs,
    deleteDoc, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAuz7p8hwBYbYwe-W2xw6s1m80ToA93Lx4",
    authDomain: "projeto-agendamento-projetor.firebaseapp.com",
    projectId: "projeto-agendamento-projetor",
    storageBucket: "projeto-agendamento-projetor.firebasestorage.app",
    messagingSenderId: "388443857631",
    appId: "1:388443857631:web:b3a11057f365d27058bf6a",
    measurementId: "G-KCYMLTJW7K"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const db = getFirestore(app);

// ─────────────────────────────────────────────
//  DATAS
// ─────────────────────────────────────────────

function obterDataHoje() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function obterProximoDiaUtil() {
    const agora = new Date();
    const d = new Date(agora);

    if (agora.getHours() >= 17) {
        d.setDate(d.getDate() + 1);
    }

    while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1);
    }

    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function formatarDataExibicao(dataStr) {
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}

// ─────────────────────────────────────────────
//  LIMPEZA — baseada no Firestore, sem localStorage
//
//  Lógica:
//  1. Lê o doc "config/ultimaLimpeza" para saber
//     quando foi a última limpeza.
//  2. Se já limpou hoje, não faz nada.
//  3. Se não limpou hoje, apaga todos os agendamentos
//     cuja data < hoje e atualiza o doc de controle.
//
//  Assim a limpeza acontece uma vez por dia,
//  na primeira abertura do site — independente
//  de quem acessa ou que horas é.
// ─────────────────────────────────────────────

async function limparAgendamentosAntigos() {
    try {
        const hoje = obterDataHoje();
        const configRef = doc(db, "config", "ultimaLimpeza");
        const configSnap = await getDoc(configRef);

        const ultimaLimpeza = configSnap.exists()
            ? configSnap.data().dataLimpeza
            : null;

        // Já limpou hoje, não precisa fazer nada
        if (ultimaLimpeza === hoje) {
            console.log("[Limpeza] Já realizada hoje:", hoje);
            return;
        }

        // Busca e apaga agendamentos antigos
        const querySnapshot = await getDocs(collection(db, "agendamentos"));
        const promessas = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data().data;
            if (data && data < hoje) {
                promessas.push(deleteDoc(doc(db, "agendamentos", docSnap.id)));
            }
        });

        if (promessas.length > 0) {
            await Promise.all(promessas);
            console.log(`[Limpeza] ${promessas.length} agendamento(s) antigo(s) removido(s).`);
        }

        // Registra a data da limpeza no Firestore
        await setDoc(configRef, { dataLimpeza: hoje });
        console.log("[Limpeza] Registro atualizado para:", hoje);

    } catch (err) {
        // Erro na limpeza não deve impedir o resto do sistema
        console.error("[Limpeza] Erro (não crítico):", err);
    }
}

// ─────────────────────────────────────────────
//  FIRESTORE — leitura
// ─────────────────────────────────────────────

async function carregarAgendamentos() {
    const querySnapshot = await getDocs(collection(db, "agendamentos"));
    const agendamentos = [];
    querySnapshot.forEach((docSnap) => {
        agendamentos.push({ id: docSnap.id, ...docSnap.data() });
    });
    return agendamentos;
}

// ─────────────────────────────────────────────
//  HORÁRIOS
// ─────────────────────────────────────────────

async function atualizarHorariosDisponiveis() {
    const projetorSelect = document.getElementById("projetor");
    const horariosContainer = document.getElementById("horarios-container");
    if (!projetorSelect || !horariosContainer) return;

    // Mostra feedback de carregamento
    horariosContainer.innerHTML =
        '<span style="font-size:13px;color:var(--text-muted)">Carregando horários...</span>';

    const horarios = ["1º", "2º", "3º", "4º", "5º", "Alm.", "6º", "7º", "8º", "9º"];
    const projetorSelecionado = projetorSelect.value;
    const dataFormatada = obterProximoDiaUtil();

    let horariosOcupados = [];
    try {
        const agendamentos = await carregarAgendamentos();
        horariosOcupados = agendamentos
            .filter(a => a.projetor === projetorSelecionado && a.data === dataFormatada)
            .map(a => a.horario);
    } catch (err) {
        console.error("[Horários] Erro ao carregar do Firebase:", err);
        // Continua e mostra todos como disponíveis
    }

    horariosContainer.innerHTML = "";

    horarios.forEach(horario => {
        const label    = document.createElement("label");
        const checkbox = document.createElement("input");

        checkbox.type  = "checkbox";
        checkbox.value = horario;
        checkbox.name  = "horario";

        if (horariosOcupados.includes(horario)) {
            checkbox.disabled = true;
            label.classList.add("horario-indisponivel");
        } else {
            label.classList.add("horario-disponivel");
        }

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(" " + horario));
        horariosContainer.appendChild(label);
    });
}

// ─────────────────────────────────────────────
//  TABELA (agendamentos.html)
// ─────────────────────────────────────────────

async function atualizarListaAgendamentos() {
    const tabela  = document.getElementById("tabela-agendamentos");
    const vazioEl = document.getElementById("tabela-vazia");
    const dataEl  = document.getElementById("data-exibicao");
    if (!tabela) return;

    const tbody = tabela.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const hoje = obterDataHoje();
    if (dataEl) dataEl.textContent = formatarDataExibicao(hoje);

    let agendamentos = [];
    try {
        agendamentos = await carregarAgendamentos();
    } catch (err) {
        console.error("[Tabela] Erro ao carregar:", err);
    }

    const agendamentosAtivos = agendamentos.filter(a => a.data >= hoje);

    // Agrupa por professor+equipamento (junta horários da mesma combinação)
    const agrupados = {};
    agendamentosAtivos.forEach(a => {
        const chave = `${a.professor}__${a.projetor}`;
        if (!agrupados[chave]) {
            agrupados[chave] = {
                professor: a.professor,
                projetor: a.projetor,
                horarios: []
            };
        }
        agrupados[chave].horarios.push(a.horario);
    });

    // Ordena por professor para ficarem agrupados visualmente
    const lista = Object.values(agrupados).sort((a, b) =>
        a.professor.localeCompare(b.professor)
    );

    if (vazioEl) vazioEl.style.display = lista.length === 0 ? "block" : "none";

    let ultimoProfessor = null;
    lista.forEach(a => {
        const tr = document.createElement("tr");
        // Destaca visualmente quando muda de professor
        if (a.professor !== ultimoProfessor) {
            tr.classList.add("tr-novo-professor");
            ultimoProfessor = a.professor;
        }
        tr.innerHTML = `
            <td>${a.professor}</td>
            <td>${a.projetor}</td>
            <td>${a.horarios.sort().join(", ")}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ─────────────────────────────────────────────
//  GERENCIAR (gerenciar.html)
// ─────────────────────────────────────────────

function confirmarAcao(mensagem, callback) {
    const overlay  = document.getElementById("modal-overlay");
    const msgEl    = document.getElementById("modal-msg");
    const btnSim   = document.getElementById("modal-confirmar");
    const btnNao   = document.getElementById("modal-cancelar");
    if (!overlay) return;

    msgEl.textContent = mensagem;
    overlay.style.display = "flex";

    const fechar = () => { overlay.style.display = "none"; };

    btnSim.onclick = () => { fechar(); callback(); };
    btnNao.onclick = fechar;
    overlay.onclick = (e) => { if (e.target === overlay) fechar(); };
}

async function excluirPorIds(ids) {
    for (const id of ids) {
        await deleteDoc(doc(db, "agendamentos", id));
    }
}

async function carregarGerenciar() {
    const painel  = document.getElementById("painel-gerenciar");
    const vazioEl = document.getElementById("gerenciar-vazio");
    if (!painel) return;

    painel.innerHTML = '<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px">Carregando...</p>';

    const hoje = obterDataHoje();
    let agendamentos = [];
    try {
        agendamentos = await carregarAgendamentos();
    } catch (err) {
        console.error("[Gerenciar] Erro:", err);
    }

    const ativos = agendamentos.filter(a => a.data >= hoje);
    painel.innerHTML = "";

    if (ativos.length === 0) {
        if (vazioEl) vazioEl.style.display = "block";
        return;
    }
    if (vazioEl) vazioEl.style.display = "none";

    // Agrupa por professor
    const porProfessor = {};
    ativos.forEach(a => {
        if (!porProfessor[a.professor]) porProfessor[a.professor] = [];
        porProfessor[a.professor].push(a);
    });

    // Ordena professores alfabeticamente
    const professores = Object.keys(porProfessor).sort((a, b) => a.localeCompare(b));

    professores.forEach(professor => {
        const registros = porProfessor[professor];
        const ids = registros.map(r => r.id);

        // Card do professor
        const card = document.createElement("div");
        card.className = "gerenciar-card";

        // Cabeçalho do professor
        const header = document.createElement("div");
        header.className = "gerenciar-card-header";
        header.innerHTML = `
            <div class="gerenciar-professor-info">
                <span class="gerenciar-avatar">${professor.charAt(0).toUpperCase()}</span>
                <span class="gerenciar-professor-nome">${professor}</span>
                <span class="gerenciar-badge">${ids.length} horário${ids.length > 1 ? "s" : ""}</span>
            </div>
            <button class="btn-excluir-todos" data-professor="${professor}">
                Excluir todos
            </button>
        `;
        card.appendChild(header);

        // Agrupa por equipamento dentro do professor
        const porEquipamento = {};
        registros.forEach(r => {
            if (!porEquipamento[r.projetor]) porEquipamento[r.projetor] = [];
            porEquipamento[r.projetor].push(r);
        });

        // Lista de equipamentos e horários
        const lista = document.createElement("div");
        lista.className = "gerenciar-lista";

        Object.entries(porEquipamento).forEach(([equipamento, regs]) => {
            const equipRow = document.createElement("div");
            equipRow.className = "gerenciar-equipamento";

            const equipNome = document.createElement("span");
            equipNome.className = "gerenciar-equip-nome";
            equipNome.textContent = equipamento;
            equipRow.appendChild(equipNome);

            const horariosDiv = document.createElement("div");
            horariosDiv.className = "gerenciar-horarios";

            regs.forEach(reg => {
                const chip = document.createElement("div");
                chip.className = "gerenciar-chip";
                chip.innerHTML = `
                    <span>${reg.horario}</span>
                    <button class="btn-excluir-chip" title="Excluir este horário" data-id="${reg.id}">✕</button>
                `;
                horariosDiv.appendChild(chip);
            });

            equipRow.appendChild(horariosDiv);
            lista.appendChild(equipRow);
        });

        card.appendChild(lista);
        painel.appendChild(card);
    });

    // Eventos — excluir horário individual
    painel.querySelectorAll(".btn-excluir-chip").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            confirmarAcao("Excluir este horário?", async () => {
                await excluirPorIds([id]);
                await carregarGerenciar();
            });
        });
    });

    // Eventos — excluir todos do professor
    painel.querySelectorAll(".btn-excluir-todos").forEach(btn => {
        btn.addEventListener("click", () => {
            const professor = btn.dataset.professor;
            const ids = porProfessor[professor].map(r => r.id);
            confirmarAcao(
                `Excluir todos os ${ids.length} agendamento(s) de "${professor}"?`,
                async () => {
                    await excluirPorIds(ids);
                    await carregarGerenciar();
                }
            );
        });
    });
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────

function mostrarToast(mensagem, tipo = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = mensagem;
    toast.className = `toast toast--${tipo}`;
    setTimeout(() => { toast.className = "toast"; }, 4000);
}

// ─────────────────────────────────────────────
//  INICIALIZAÇÃO
// ─────────────────────────────────────────────

// Usa 'load' ao invés de 'DOMContentLoaded' para garantir
// que os módulos do Firebase já foram completamente inicializados
window.addEventListener("load", async () => {

    // Limpeza em background — não bloqueia a interface
    limparAgendamentosAntigos();

    const form           = document.getElementById("agendamento-form");
    const projetorSelect = document.getElementById("projetor");

    // Página index.html
    if (form && projetorSelect) {

        // Carrega horários imediatamente
        await atualizarHorariosDisponiveis();

        projetorSelect.addEventListener("change", atualizarHorariosDisponiveis);

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const professor = document.getElementById("professor").value.trim();
            const projetor  = projetorSelect.value;
            const horariosSelecionados = Array.from(
                document.querySelectorAll("input[name='horario']:checked")
            ).map(cb => cb.value);
            const dataFormatada = obterProximoDiaUtil();

            if (!professor || !projetor || horariosSelecionados.length === 0) {
                mostrarToast("Preencha todos os campos e selecione ao menos um horário.", "error");
                return;
            }

            const btnSubmit = form.querySelector(".btn-agendar");
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.querySelector(".btn-text").textContent = "Salvando...";
            }

            try {
                for (const horario of horariosSelecionados) {
                    await addDoc(collection(db, "agendamentos"), {
                        professor,
                        projetor,
                        horario,
                        data: dataFormatada
                    });
                }
                mostrarToast(`Agendamento confirmado para ${formatarDataExibicao(dataFormatada)}! ✓`);
                form.reset();
                await atualizarHorariosDisponiveis();
            } catch (err) {
                console.error("[Submit] Erro:", err);
                mostrarToast("Erro ao salvar. Verifique sua conexão.", "error");
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.querySelector(".btn-text").textContent = "Confirmar Agendamento";
                }
            }
        });
    }

    // Página agendamentos.html
    await atualizarListaAgendamentos();

    // Página gerenciar.html
    await carregarGerenciar();
});
