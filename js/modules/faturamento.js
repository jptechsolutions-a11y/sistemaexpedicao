import { getState, setState } from '../state.js';
import { supabaseRequest } from '../api.js';
import { showNotification } from '../ui.js';
import { getStatusLabel, minutesToHHMM } from '../utils.js';

export async function loadFaturamento() {
    // Busca e aplica a lógica para auto-abrir a única sub-aba permitida
    const permittedFaturamentoTabs = window.getPermittedSubTabs ? window.getPermittedSubTabs('faturamento') : ['faturamentoAtivo', 'historicoFaturamento'];

    if (permittedFaturamentoTabs.length > 0) {
        const initialSubTab = permittedFaturamentoTabs.length === 1 ? permittedFaturamentoTabs[0] : 'faturamentoAtivo';
        const initialElement = document.querySelector(`#faturamento .sub-tabs button[onclick*="'${initialSubTab}'"]`);

        if (initialElement) {
            window.showSubTab('faturamento', initialSubTab, initialElement);
        } else {
            await loadFaturamentoData(initialSubTab);
        }
    }
}

export function renderFaturamentoList(expeditionsList) {
    const container = document.getElementById('faturamentoList');

    if (expeditionsList.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Nenhuma expedição pendente de faturamento!</div>';
        return;
    }

    container.innerHTML = expeditionsList.map(exp => {
        const carregadoEm = exp.data_saida_veiculo ? new Date(exp.data_saida_veiculo) : new Date(exp.data_hora);
        const tempoEspera = Math.round((new Date() - carregadoEm) / 60000);

        let actionButtons = '', statusInfo = '';

        if (exp.status === 'faturado' && exp.data_saida_veiculo) {
            statusInfo = `<div class="text-green-600 font-semibold mb-2">✅ Carregado e Faturado</div>`;
            actionButtons = `<button class="btn btn-warning" onclick="marcarSaiuEntrega('${exp.id}')">Marcar Saída</button>`;
        }
        else if (exp.status === 'faturado' && !exp.data_saida_veiculo) {
            statusInfo = `<div class="text-blue-600 font-semibold mb-2">✅ Faturado (Aguardando Fim do Carregamento)</div>`;
            actionButtons = `<button class="btn btn-secondary" disabled title="Finalize o carregamento na tela de Motoristas para liberar a saída">Aguardando Carregamento</button>`;
        }
        else if (exp.status === 'carregado' || exp.status === 'aguardando_faturamento') {
            statusInfo = `<div class="text-blue-600 font-semibold mb-2">🚚 Carregado (Aguardando Faturamento)</div>`;
            actionButtons = `<button class="btn btn-success" onclick="iniciarFaturamento('${exp.id}')">Iniciar Faturamento</button>`;
        }
        else if (exp.status === 'faturamento_iniciado' || exp.status === 'em_carregamento_faturando') {
            const iniciadoEm = exp.data_inicio_faturamento ? new Date(exp.data_inicio_faturamento) : null;
            const tempoFaturamento = iniciadoEm ? Math.round((new Date() - iniciadoEm) / 60000) : 0;
            const faturandoTexto = exp.status === 'em_carregamento_faturando' ? 'Carregando e Faturando' : 'Faturamento em andamento';
            statusInfo = `<div class="text-yellow-600 font-semibold mb-2">📄 ${faturandoTexto} há ${minutesToHHMM(tempoFaturamento)}</div>`;
            actionButtons = `<button class="btn btn-primary" onclick="finalizarFaturamento('${exp.id}')">Finalizar Faturamento</button>`;
        }
        else if (exp.status === 'em_carregamento') {
            statusInfo = `<div class="text-gray-600 font-semibold mb-2">🚚 Carregando...</div>`;
            actionButtons = `<button class="btn btn-success" onclick="iniciarFaturamento('${exp.id}')">Iniciar Faturamento (Antecipado)</button>`;
        }

        return `
            <div class="faturamento-card">
               <h3 class="text-lg font-bold text-gray-800">${exp.lojas_count} loja${exp.lojas_count > 1 ? 's' : ''} - ${exp.veiculo_placa || 'N/A'}</h3>
                <p class="text-sm text-gray-500 mb-2">${exp.lojas_info}</p>
                ${exp.numeros_carga && exp.numeros_carga.length > 0 ? `<p class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-2 inline-block">📦 Cargas: ${exp.numeros_carga.join(', ')}</p>` : ''}
                ${statusInfo}
                <div class="time-display">
                    <strong>Tempo de Espera/Carregamento:</strong> ${minutesToHHMM(tempoEspera)}
                </div>
                <div class="grid grid-cols-2 gap-4 my-4 text-sm">
                    <p><strong>Pallets:</strong> ${exp.total_pallets}</p>
                    <p><strong>RollTrainers:</strong> ${exp.total_rolltrainers}</p>
                    <p><strong>Motorista:</strong> ${exp.motorista_nome || 'N/A'}</p>
                    <p><strong>Líder:</strong> ${exp.lider_nome || 'N/A'}</p>
                </div>
                <div class="text-center mt-4">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

export function updateFaturamentoStats(expeditions) {
    document.getElementById('totalCarregadas').textContent = expeditions.filter(e =>
        e.status === 'em_carregamento' ||
        e.status === 'carregado' ||
        e.status === 'aguardando_faturamento'
    ).length;

    document.getElementById('emFaturamento').textContent = expeditions.filter(e =>
        e.status === 'faturamento_iniciado' ||
        e.status === 'em_carregamento_faturando'
    ).length;

    document.getElementById('faturadas').textContent = expeditions.filter(e => e.status === 'faturado').length;

    const expedicoesComFaturamento = expeditions.filter(e => e.data_inicio_faturamento && e.data_fim_faturamento);
    if (expedicoesComFaturamento.length > 0) {
        const tempos = expedicoesComFaturamento.map(e => (new Date(e.data_fim_faturamento) - new Date(e.data_inicio_faturamento)) / 60000);
        const tempoMedio = tempos.reduce((a, b) => a + b, 0) / tempos.length;
        document.getElementById('tempoMedioFaturamento').textContent = minutesToHHMM(tempoMedio);
    } else {
        document.getElementById('tempoMedioFaturamento').textContent = '-';
    }
}

export async function iniciarFaturamento(expeditionId) {
    try {
        const currentExp = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=status`);
        const currentStatus = currentExp[0].status;

        let newStatus;
        if (currentStatus === 'em_carregamento') {
            newStatus = 'em_carregamento_faturando';
        } else if (currentStatus === 'carregado' || currentStatus === 'aguardando_faturamento') {
            newStatus = 'faturamento_iniciado';
        } else if (currentStatus === 'em_carregamento_faturando' || currentStatus === 'faturamento_iniciado') {
            showNotification('Faturamento já está em andamento!', 'info');
            return;
        } else {
            showNotification(`Não é possível iniciar faturamento no status atual: ${getStatusLabel(currentStatus)}`, 'error');
            return;
        }

        const updateData = { status: newStatus, data_inicio_faturamento: new Date().toISOString() };
        await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', updateData);

        showNotification(`Faturamento iniciado! Status: ${getStatusLabel(newStatus)}`, 'success');
        loadFaturamentoData();
    } catch (error) {
        showNotification('Erro ao iniciar faturamento: ' + error.message, 'error');
    }
}

export async function finalizarFaturamento(expeditionId) {
    try {
        const updateData = { status: 'faturado', data_fim_faturamento: new Date().toISOString() };
        await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', updateData);
        showNotification(`Faturamento finalizado!`, 'success');
        loadFaturamento();
    } catch (error) {
        showNotification('Erro ao finalizar faturamento: ' + error.message, 'error');
    }
}

export async function marcarSaiuEntrega(expeditionId) {
    try {
        await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', { status: 'saiu_para_entrega', data_saida_entrega: new Date().toISOString() });
        showNotification('Expedição marcada como saiu para entrega!', 'success');
        loadFaturamento();
    } catch (error) {
        showNotification('Erro ao marcar saída: ' + error.message, 'error');
    }
}

export async function loadHistoricoFaturamento() {
    const dataInicio = document.getElementById('historicoFaturamentoDataInicio').value;
    const dataFim = document.getElementById('historicoFaturamentoDataFim').value;
    const searchTerm = document.getElementById('historicoFaturamentoSearch').value.toLowerCase();

    const tbody = document.getElementById('historicoFaturamentoBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>`;

    try {
        let query = 'expeditions?status=in.(saiu_para_entrega,entregue)&data_inicio_faturamento=not.is.null&data_fim_faturamento=not.is.null&order=data_fim_faturamento.desc';
        if (dataInicio) query += `&data_fim_faturamento=gte.${dataInicio}T00:00:00`;
        if (dataFim) query += `&data_fim_faturamento=lte.${dataFim}T23:59:59`;

        const expeditions = await supabaseRequest(query);
        const items = await supabaseRequest('expedition_items');

        if (!expeditions || expeditions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-500">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
            updateHistoricoFaturamentoStats([]);
            return;
        }

        const veiculos = window.veiculos || [];
        const motoristas = window.motoristas || [];
        const lojas = window.lojas || [];

        let expeditionsWithItems = expeditions.map(exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
            const motorista = exp.motorista_id ? motoristas.find(m => m.id === exp.motorista_id) : null;

            let tempoFaturamento = 0;
            if (exp.data_inicio_faturamento && exp.data_fim_faturamento) {
                tempoFaturamento = (new Date(exp.data_fim_faturamento) - new Date(exp.data_inicio_faturamento)) / 60000;
            }

            return {
                ...exp,
                items: expItems,
                total_pallets: expItems.reduce((sum, item) => sum + (item.pallets || 0), 0),
                total_rolltrainers: expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0),
                lojas_count: expItems.length,
                lojas_info: expItems.map(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    return loja ? `${loja.codigo} - ${loja.nome}` : 'N/A';
                }),
                veiculo_placa: veiculo?.placa || 'N/A',
                motorista_nome: motorista?.nome || 'N/A',
                tempo_faturamento: tempoFaturamento
            };
        });

        if (searchTerm) {
            expeditionsWithItems = expeditionsWithItems.filter(exp => {
                const searchableText = [
                    exp.veiculo_placa,
                    exp.motorista_nome,
                    exp.lojas_info.join(' '),
                    exp.numeros_carga ? exp.numeros_carga.join(' ') : ''
                ].join(' ').toLowerCase();
                return searchableText.includes(searchTerm);
            });
        }

        updateHistoricoFaturamentoStats(expeditionsWithItems);
        renderHistoricoFaturamentoTable(expeditionsWithItems);

    } catch (error) {
        console.error('Erro ao carregar histórico de faturamento:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="alert alert-error">Erro ao carregar histórico: ${error.message}</td></tr>`;
        updateHistoricoFaturamentoStats([]);
    }
}

export function updateHistoricoFaturamentoStats(expeditions) {
    const totalElement = document.getElementById('historicoTotalFaturadas');
    const tempoMedioElement = document.getElementById('historicoTempoMedio');
    const menorTempoElement = document.getElementById('historicoMenorTempo');
    const maiorTempoElement = document.getElementById('historicoMaiorTempo');

    if (expeditions.length === 0) {
        if (totalElement) totalElement.textContent = '0';
        if (tempoMedioElement) tempoMedioElement.textContent = '00:00';
        if (menorTempoElement) menorTempoElement.textContent = '00:00';
        if (maiorTempoElement) maiorTempoElement.textContent = '00:00';
        return;
    }

    const tempos = expeditions.map(exp => exp.tempo_faturamento).filter(t => t > 0);
    if (totalElement) totalElement.textContent = expeditions.length;

    if (tempos.length > 0) {
        const tempoMedio = tempos.reduce((sum, tempo) => sum + tempo, 0) / tempos.length;
        if (tempoMedioElement) tempoMedioElement.textContent = minutesToHHMM(tempoMedio);
        if (menorTempoElement) menorTempoElement.textContent = minutesToHHMM(Math.min(...tempos));
        if (maiorTempoElement) maiorTempoElement.textContent = minutesToHHMM(Math.max(...tempos));
    } else {
        if (tempoMedioElement) tempoMedioElement.textContent = '00:00';
        if (menorTempoElement) menorTempoElement.textContent = '00:00';
        if (maiorTempoElement) maiorTempoElement.textContent = '00:00';
    }
}

export function renderHistoricoFaturamentoTable(expeditions) {
    const tbody = document.getElementById('historicoFaturamentoBody');
    if (expeditions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-gray-500">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
        return;
    }

    tbody.innerHTML = expeditions.map(exp => {
        const dataExpedicao = new Date(exp.data_hora).toLocaleDateString('pt-BR');
        const inicioFaturamento = exp.data_inicio_faturamento ? new Date(exp.data_inicio_faturamento).toLocaleString('pt-BR') : 'N/A';
        const fimFaturamento = exp.data_fim_faturamento ? new Date(exp.data_fim_faturamento).toLocaleString('pt-BR') : 'N/A';
        const tempoFaturamento = exp.tempo_faturamento > 0 ? minutesToHHMM(exp.tempo_faturamento) : 'N/A';

        let lojasInfo = exp.lojas_info.join('<br>');
        if (exp.numeros_carga && exp.numeros_carga.length > 0) {
            lojasInfo += `<br><span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1 inline-block">📦 Cargas: ${exp.numeros_carga.join(', ')}</span>`;
        }

        let tempoColor = 'text-green-600';
        if (exp.tempo_faturamento > 60) tempoColor = 'text-orange-600';
        if (exp.tempo_faturamento > 120) tempoColor = 'text-red-600';

        return `
            <tr class="hover:bg-gray-50 text-sm">
                <td class="font-medium">${dataExpedicao}</td>
                <td class="font-medium">${exp.veiculo_placa}</td>
                <td>${exp.motorista_nome}</td>
                <td class="whitespace-normal">${lojasInfo}</td>
                <td class="text-xs">${inicioFaturamento}</td>
                <td class="text-xs">${fimFaturamento}</td>
                <td class="font-bold ${tempoColor}">${tempoFaturamento}</td>
                <td class="text-center">${exp.total_pallets}</td>
                <td class="text-center">${exp.total_rolltrainers}</td>
                <td class="text-center">
                    <button class="btn btn-primary btn-small" onclick="window.showDetalhesExpedicao('${exp.id}')">Detalhes</button>
                </td>
            </tr>
        `;
    }).join('');
}

export function clearHistoricoFaturamentoFilters() {
    document.getElementById('historicoFaturamentoDataInicio').value = '';
    document.getElementById('historicoFaturamentoDataFim').value = '';
    document.getElementById('historicoFaturamentoSearch').value = '';

    const hoje = new Date();
    const ha30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById('historicoFaturamentoDataInicio').value = ha30Dias.toISOString().split('T')[0];
    document.getElementById('historicoFaturamentoDataFim').value = hoje.toISOString().split('T')[0];

    loadHistoricoFaturamento();
}

export async function loadFaturamentoData(subTabName = 'faturamentoAtivo') {
    const container = document.getElementById('faturamentoList');
    if (!container) return;

    if (subTabName === 'faturamentoAtivo') {
        container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando expedições...</div>`;

        try {
            const expeditions = await supabaseRequest("expeditions?status=in.(em_carregamento,carregado,aguardando_faturamento,faturamento_iniciado,faturado,em_carregamento_faturando)&order=data_hora.asc");
            const items = await supabaseRequest('expedition_items');

            const veiculos = window.veiculos || [];
            const motoristas = window.motoristas || [];
            const lojas = window.lojas || [];

            const expeditionsWithItems = expeditions.map(exp => {
                const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
                const motorista = exp.motorista_id ? motoristas.find(m => m.id === exp.motorista_id) : null;
                const expItems = items.filter(item => item.expedition_id === exp.id);

                return {
                    ...exp,
                    veiculo_placa: veiculo?.placa || 'N/A',
                    motorista_nome: motorista?.nome || 'N/A',
                    lojas_count: expItems.length,
                    lojas_info: expItems.map(item => lojas.find(l => l.id === item.loja_id)?.nome || 'N/A').join(', '),
                    total_pallets: expItems.reduce((sum, item) => sum + (item.pallets || 0), 0),
                    total_rolltrainers: expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0)
                };
            });

            updateFaturamentoStats(expeditionsWithItems);
            renderFaturamentoList(expeditionsWithItems);

        } catch (error) {
            container.innerHTML = `<div class="alert alert-error">Erro ao carregar lista de faturamento: ${error.message}</div>`;
        }
    }
}

// Expose to window for HTML onclicks
window.loadFaturamento = loadFaturamento;
window.iniciarFaturamento = iniciarFaturamento;
window.finalizarFaturamento = finalizarFaturamento;
window.marcarSaiuEntrega = marcarSaiuEntrega;
window.clearHistoricoFaturamentoFilters = clearHistoricoFaturamentoFilters;
window.loadHistoricoFaturamento = loadHistoricoFaturamento;
