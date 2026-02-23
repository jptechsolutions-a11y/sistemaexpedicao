import { supabaseRequest } from '../api.js';
import { getState } from '../state.js';
import { showNotification } from '../ui.js';
import { getPermittedSubTabs, showSubTab, getStatusLabel } from '../utils.js';
import { openOrdemCarregamentoModal } from './configuracoes.js';



let cargasDisponiveis = [];

// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

async function lancarCarga() {
    const lojaId = document.getElementById('lancar_lojaSelect').value;
    const docaId = document.getElementById('lancar_docaSelect').value;
    const pallets = parseInt(document.getElementById('lancar_palletsInput').value);
    const rolltrainers = parseInt(document.getElementById('lancar_rolltrainersInput').value);
    const liderId = document.getElementById('lancar_liderSelect').value;
    const numerosCargaInput = document.getElementById('lancar_numerosCarga').value.trim();
    const observacoes = document.getElementById('lancar_observacoes').value;

    if (!lojaId || !liderId || !docaId || (isNaN(pallets) && isNaN(rolltrainers))) {
        showNotification('Preencha Loja, Doca, Líder e ao menos um tipo de carga!', 'error');
        return;
    }
    if ((pallets < 0) || (rolltrainers < 0)) {
        showNotification('As quantidades não podem ser negativas.', 'error');
        return;
    }

    try {
        let numerosCarga = [];
        if (numerosCargaInput) {
            numerosCarga = numerosCargaInput.split(',').map(num => num.trim()).filter(num => num.length > 0);
        }

        const expeditionData = {
            data_hora: new Date().toISOString(),
            lider_id: liderId,
            doca_id: docaId,
            observacoes: observacoes || null,
            status: 'aguardando_agrupamento',
            numeros_carga: numerosCarga.length > 0 ? numerosCarga : null
            // filial será injetada automaticamente pela função supabaseRequest
        };

        // 1. Cria a Expedição principal COM filtro de filial (true)
        const expeditionResponse = await supabaseRequest('expeditions', 'POST', expeditionData, true);

        if (!expeditionResponse || expeditionResponse.length === 0) {
            throw new Error("A criação da expedição falhou.");
        }

        const newExpeditionId = expeditionResponse[0].id;

        // 2. Cria o item da expedição SEM enviar campo filial (o trigger cuida)
        const itemData = {
            expedition_id: newExpeditionId,
            loja_id: lojaId,
            pallets: pallets || 0,
            rolltrainers: rolltrainers || 0,
            status_descarga: 'pendente'
            // NÃO incluir campo filial aqui - o trigger set_filial_expedition_items cuida disso
        };

        // IMPORTANTE: Não precisa passar false, pois a função já sabe que não deve enviar filial para expedition_items
        await supabaseRequest('expedition_items', 'POST', itemData);

        const lojaNome = lojas.find(l => l.id === lojaId)?.nome || 'Loja';
        const cargasInfo = numerosCarga.length > 0 ? ` (Cargas: ${numerosCarga.join(', ')})` : '';
        showNotification(`Expedição para ${lojaNome}${cargasInfo} lançada com sucesso!`, 'success');

        document.getElementById('expeditionForm').reset();
        document.getElementById('lancar_lojaSelect').focus();

        if (document.getElementById('home').classList.contains('active')) {
            await loadHomeData();
        }

    } catch (error) {
        console.error('Erro ao lançar carga:', error);
        showNotification(`Erro ao lançar carga: ${error.message}`, 'error');
    }
}

// --- FUNCIONALIDADES DA ABA TRANSPORTE ---
async function loadTransportList() {
    try {
        const expeditions = await supabaseRequest("expeditions?status=eq.aguardando_agrupamento&order=data_hora.asc");
        if (!expeditions || expeditions.length === 0) {
            renderCargasDisponiveis([], veiculos, motoristas);
            atualizarResumoAgrupamento();
            return;
        }
        const expeditionIds = expeditions.map(exp => exp.id);
        const items = await supabaseRequest(`expedition_items?expedition_id=in.(${expeditionIds.join(',')})`);

        document.getElementById('availableVehicles').textContent = veiculos.filter(v => v.status === 'disponivel').length;
        document.getElementById('availableDrivers').textContent = motoristas.filter(m => m.status === 'disponivel').length;

        const expeditionsWithItems = expeditions.map(exp => ({ ...exp, items: items.filter(item => item.expedition_id === exp.id) })).filter(exp => exp.items.length > 0);

        renderCargasDisponiveis(expeditionsWithItems, veiculos, motoristas);
        atualizarResumoAgrupamento();
    } catch (error) {
        document.getElementById('cargasDisponiveisList').innerHTML = `<div class="alert alert-error">Erro ao carregar cargas: ${error.message}</div>`;
    }
}

function renderCargasDisponiveis(cargas, veiculosList, motoristasList) {
    const container = document.getElementById('cargasDisponiveisList');
    cargasDisponiveis = cargas;

    if (cargas.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Nenhuma carga aguardando agrupamento!</div>';
        return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
    cargas.forEach(carga => {
        const loja = lojas.find(l => l.id === carga.items[0].loja_id);
        const numerosCarga = carga.numeros_carga && carga.numeros_carga.length > 0 ? carga.numeros_carga.join(', ') : null;
        html += `
                    <div class="form-group rounded-lg p-3 border border-gray-200 hover:border-blue-400">
                        <label for="carga_${carga.id}" class="flex items-center cursor-pointer">
                            <input type="checkbox" id="carga_${carga.id}" value="${carga.id}" onchange="atualizarResumoAgrupamento()" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3">
                            <div>
                                <strong class="text-gray-800">${loja ? `${loja.codigo} - ${loja.nome}` : 'N/A'}</strong><br>
                                ${numerosCarga ? `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-1 inline-block">?? ${numerosCarga}</span><br>` : ''}
                                <span class="text-sm text-gray-500">${carga.items[0].pallets}P + ${carga.items[0].rolltrainers}R | ${new Date(carga.data_hora).toLocaleTimeString('pt-BR')}</span>
                            </div>
                        </label>
                    </div>
                `;
    });
    html += '</div>';
    container.innerHTML = html;

    const veiculoSelect = document.getElementById('alocar_veiculoSelect');
    veiculoSelect.innerHTML = '<option value="">Selecione...</option>';
    veiculosList.filter(v => v.status === 'disponivel').forEach(v => {
        veiculoSelect.innerHTML += `<option value="${v.id}" class="veiculo-option">${v.placa} - ${v.modelo} (Cap: ${v.capacidade_pallets}P)</option>`;
    });

    const motoristaSelect = document.getElementById('alocar_motoristaSelect');
    motoristaSelect.innerHTML = '<option value="">Selecione...</option>';
    motoristasList.filter(m => m.status === 'disponivel').forEach(m => {
        motoristaSelect.innerHTML += `<option value="${m.id}">${m.nome}</option>`;
    });
}

function atualizarResumoAgrupamento() {
    const checkboxes = document.querySelectorAll('#cargasDisponiveisList input[type="checkbox"]:checked');
    let totalLojas = 0, totalPallets = 0, totalRolls = 0;

    document.querySelectorAll('#cargasDisponiveisList .form-group').forEach(group => {
        const checkbox = group.querySelector('input[type="checkbox"]');
        group.classList.toggle('selected', checkbox && checkbox.checked);
    });

    checkboxes.forEach(cb => {
        const carga = cargasDisponiveis.find(c => c.id == cb.value);
        if (carga) {
            totalLojas++;
            totalPallets += carga.items[0].pallets;
            totalRolls += carga.items[0].rolltrainers;
        }
    });

    const cargaTotal = totalPallets + (totalRolls / 2);

    document.getElementById('summaryLojas').textContent = totalLojas;
    document.getElementById('summaryPallets').textContent = totalPallets;
    document.getElementById('summaryRolls').textContent = totalRolls;
    document.getElementById('summaryCargaTotal').textContent = cargaTotal.toFixed(1);

    const veiculoSelect = document.getElementById('alocar_veiculoSelect');
    for (const option of veiculoSelect.options) {
        const veiculo = veiculos.find(v => v.id == option.value);
        if (veiculo) {
            option.classList.toggle('incapacitated', veiculo.capacidade_pallets < cargaTotal);
        }
    }
}

async function agruparEAlocar() {
    const checkboxes = document.querySelectorAll('#cargasDisponiveisList input[type="checkbox"]:checked');
    const veiculoId = document.getElementById('alocar_veiculoSelect').value;
    const motoristaId = document.getElementById('alocar_motoristaSelect').value;
    const observacoes = document.getElementById('alocar_observacoes').value;

    if (checkboxes.length === 0 || !veiculoId || !motoristaId) {
        showNotification('Selecione ao menos uma carga, um veículo e um motorista!', 'error');
        return;
    }

    const idsDasCargas = Array.from(checkboxes).map(cb => cb.value);

    try {
        const cargasSelecionadas = cargasDisponiveis.filter(c => idsDasCargas.includes(String(c.id)));
        const originalDocaIds = [...new Set(cargasSelecionadas.map(c => c.doca_id).filter(id => id))];

        const dockPalletCounts = {};
        cargasSelecionadas.forEach(carga => {
            const docaId = carga.doca_id;
            if (docaId) dockPalletCounts[docaId] = (dockPalletCounts[docaId] || 0) + (carga.items[0]?.pallets || 0);
        });

        const rankedDocks = Object.keys(dockPalletCounts).sort((a, b) => dockPalletCounts[b] - dockPalletCounts[a]);
        const docaAlvoId = rankedDocks.find(docaId => docas.find(d => d.id == docaId)?.status === 'disponivel');

        if (!docaAlvoId) {
            showNotification(`Nenhuma das docas de destino está disponível. Aguarde e tente novamente.`, 'error');
            return;
        }

        // ?? CORREÇÃO: AGREGAR NÚMEROS DE CARGA ??
        let todosNumerosCarga = [];
        cargasSelecionadas.forEach(c => {
            if (c.numeros_carga) {
                if (Array.isArray(c.numeros_carga)) {
                    todosNumerosCarga.push(...c.numeros_carga);
                } else if (typeof c.numeros_carga === 'string') {
                    // Trata formato string do postgres ex: "{123,456}" ou "123"
                    const clean = c.numeros_carga.replace(/[{}"]/g, '');
                    if (clean) todosNumerosCarga.push(...clean.split(',').map(s => s.trim()));
                }
            }
        });
        // Remove duplicatas e vazios
        todosNumerosCarga = [...new Set(todosNumerosCarga)].filter(n => n && n.trim() !== "");

        const newExpeditionData = {
            data_hora: new Date().toISOString(),
            status: 'aguardando_veiculo',
            doca_id: docaAlvoId,
            veiculo_id: veiculoId,
            motorista_id: motoristaId,
            lider_id: cargasSelecionadas[0].lider_id,
            data_alocacao_veiculo: new Date().toISOString(),
            observacoes: observacoes || null,
            numeros_carga: todosNumerosCarga.length > 0 ? todosNumerosCarga : null // ? Agora salva as cargas!
        };

        const newExpeditionResponse = await supabaseRequest('expeditions', 'POST', newExpeditionData);
        const newExpeditionId = newExpeditionResponse[0].id;

        const itemsToUpdate = cargasSelecionadas.flatMap(c => c.items.map(i => i.id));
        await supabaseRequest(`expedition_items?id=in.(${itemsToUpdate.join(',')})`, 'PATCH', { expedition_id: newExpeditionId });
        await supabaseRequest(`expeditions?id=in.(${idsDasCargas.join(',')})`, 'DELETE');

        const updatePromises = [
            supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: 'em_uso' }, false),
            supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: 'em_viagem' }, false),

        ];

        originalDocaIds.forEach(docaId => {
            if (docaId !== docaAlvoId) {
                updatePromises.push(supabaseRequest(`docas?id=eq.${docaId}`, 'PATCH', { status: 'disponivel' }, false));
            }
        });

        await Promise.all(updatePromises);

        showNotification('Expedição montada! Defina a ordem de carregamento.', 'info');
        document.getElementById('alocar_veiculoSelect').value = '';
        document.getElementById('alocar_motoristaSelect').value = '';
        document.getElementById('alocar_observacoes').value = '';

        // Chama o novo modal para definir a ordem
        await openOrdemCarregamentoModal(newExpeditionId);

    } catch (error) {
        showNotification(`Erro ao agrupar: ${error.message}`, 'error');
    }
}

// SUBSTITUIR A FUNÇÃO loadFaturamento

window.loadTransportList = loadTransportList;
window.lancarCarga = lancarCarga;
window.atualizarResumoAgrupamento = atualizarResumoAgrupamento;
window.agruparEAlocar = agruparEAlocar;

export {
    loadTransportList,
    lancarCarga,
    atualizarResumoAgrupamento,
    agruparEAlocar
};

