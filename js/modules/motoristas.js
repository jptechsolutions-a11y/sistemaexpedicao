import { getState, setState } from '../state.js';
import { supabaseRequest } from '../api.js';
import { showNotification } from '../ui.js';
import { getStatusLabel, minutesToHHMM } from '../utils.js';

export async function loadMotoristaTab() {
    const permittedMotoristasTabs = window.getPermittedSubTabs ? window.getPermittedSubTabs('motoristas') : ['statusFrota', 'relatorioMotoristas'];

    if (permittedMotoristasTabs.length > 0) {
        const initialSubTab = permittedMotoristasTabs.length === 1 ? permittedMotoristasTabs[0] : 'statusFrota';
        const initialElement = document.querySelector(`#motoristas .sub-tabs button[onclick*="'${initialSubTab}'"]`);

        if (initialElement) {
            window.showSubTab('motoristas', initialSubTab, initialElement);
        } else {
            await renderMotoristasStatusList();
        }
    }

    const hoje = new Date();
    const hojeFormatado = hoje.toISOString().split('T')[0];
    const dataInicio = document.getElementById('relatorioMotoristaDataInicio');
    const dataFim = document.getElementById('relatorioMotoristaDataFim');
    if (dataInicio && !dataInicio.value) dataInicio.value = hojeFormatado;
    if (dataFim && !dataFim.value) dataFim.value = hojeFormatado;
}

export async function renderMotoristasStatusList() {
    const container = document.getElementById('motoristasStatusList');
    if (!container) return;
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando status...</div>`;

    if (window.activeTimers) {
        Object.values(window.activeTimers).forEach(clearInterval);
        window.activeTimers = {};
    }

    const [activeExpeditions, recentlyCompletedExpeditions, allItems] = await Promise.all([
        supabaseRequest(`expeditions?status=not.in.(entregue,cancelado)`),
        supabaseRequest(`expeditions?status=eq.entregue&order=data_hora.desc&limit=50`),
        supabaseRequest('expedition_items')
    ]);

    const motoristas = window.motoristas || [];
    const veiculos = window.veiculos || [];

    const dispCount = motoristas.filter(m => m.status === 'disponivel').length;
    const ativoCount = motoristas.filter(m => ['em_viagem', 'descarregando_imobilizado', 'saiu_para_entrega'].includes(m.status)).length;
    const retornandoCount = motoristas.filter(m => ['retornando_cd', 'retornando_com_imobilizado'].includes(m.status)).length;

    const motoristasComStatus = motoristas.map(m => {
        const activeExp = activeExpeditions.find(exp => exp.motorista_id === m.id);
        let veiculoPlaca = 'N/A';
        let veiculoId = null;
        let displayStatus = m.status;

        if (activeExp) {
            veiculoId = activeExp.veiculo_id;
            veiculoPlaca = veiculos.find(v => v.id === veiculoId)?.placa || 'N/A';
            displayStatus = activeExp.status;
            return { ...m, displayStatus, veiculoPlaca, veiculoId, activeExp: { ...activeExp, items: allItems.filter(i => i.expedition_id === activeExp.id) } };
        }

        if (['retornando_cd', 'retornando_com_imobilizado', 'descarregando_imobilizado'].includes(m.status)) {
            const lastExp = recentlyCompletedExpeditions.find(exp => exp.motorista_id === m.id);
            veiculoId = lastExp?.veiculo_id;
            veiculoPlaca = veiculos.find(v => v.id === veiculoId)?.placa || 'N/A';
        }

        return { ...m, displayStatus, veiculoPlaca, veiculoId };
    });

    motoristasComStatus.sort((a, b) => a.nome.localeCompare(b.nome));

    let html = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-number">${dispCount}</div><div class="stat-label">Disponíveis</div></div>
            <div class="stat-card" style="background: var(--secondary-gradient);"><div class="stat-number">${ativoCount}</div><div class="stat-label">Em Atividade</div></div>
            <div class="stat-card" style="background: var(--accent-gradient);"><div class="stat-number">${retornandoCount}</div><div class="stat-label">Retornando</div></div>
            <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);"><div class="stat-number">${motoristas.filter(m => m.status === 'folga').length}</div><div class="stat-label">Em Folga</div></div>
        </div>
        
        <h3 class="text-xl font-semibold text-gray-800 my-4">Status dos Motoristas</h3>
        <div id="motoristaListFiltered">
            ${renderMotoristasListHtml(motoristasComStatus)}
        </div>
        `;
    container.innerHTML = html;

    window.motoristasDataCache = motoristasComStatus;

    motoristasComStatus.forEach(m => {
        if (m.activeExp && m.displayStatus === 'saiu_para_entrega') {
            startMotoristaTimer(m);
        }
    });
}

export function renderMotoristasListHtml(motoristasData) {
    if (motoristasData.length === 0) {
        return '<div class="alert alert-info mt-4">Nenhum motorista encontrado com o filtro selecionado.</div>';
    }

    return motoristasData.map(m => {
        let actionButton = '';

        let placaClass = 'placa-destaque';
        if (m.displayStatus === 'saiu_para_entrega' || m.displayStatus === 'em_viagem') {
            placaClass += ' em-viagem';
        } else if (m.displayStatus === 'retornando_cd' || m.displayStatus === 'retornando_com_imobilizado') {
            placaClass += ' retornando';
        } else if (m.displayStatus === 'disponivel') {
            placaClass += ' disponivel';
        }

        const veiculoPlacaNoNome = m.veiculoPlaca && m.veiculoPlaca !== 'N/A' ?
            `<span class="${placaClass}" title="Veículo: ${m.veiculoPlaca}">${m.veiculoPlaca}</span>` : '';

        if ((m.displayStatus === 'retornando_cd' || m.displayStatus === 'retornando_com_imobilizado') && m.veiculoId) {
            actionButton = `<button class="btn btn-primary btn-small" onclick="marcarRetornoCD('${m.id}', '${m.veiculoId}')">Cheguei no CD</button>`;
        }
        else if (m.displayStatus === 'descarregando_imobilizado' && m.veiculoId) {
            actionButton = `<button class="btn btn-warning btn-small" onclick="finalizarDescargaImobilizado('${m.id}', '${m.veiculoId}')">Finalizar Descarga</button>`;
        }

        let timeInfo = '';
        if (m.activeExp && m.displayStatus === 'saiu_para_entrega') {
            timeInfo = `
                <div class="text-xs text-gray-500 mt-1">
                    <span id="loja_timer_${m.id}">Loja: --:--</span> | 
                    <span id="desloc_timer_${m.id}">Desloc.: --:--</span>
                </div>
            `;
        }

        return `
            <div class="motorista-status-item">
                <div>
                    <strong class="text-gray-800">${m.nome} ${veiculoPlacaNoNome}</strong>
                    ${timeInfo}
                </div>
                <div class="flex items-center gap-4">
                    <span class="status-badge status-${m.displayStatus.replace(/ /g, '_')}">${getStatusLabel(m.displayStatus)}</span>
                    ${actionButton}
                </div>
            </div>`;
    }).join('');
}

export async function consultarExpedicoesPorPlaca() {
    const placa = document.getElementById('placaMotorista').value;
    if (!placa) {
        showNotification('Por favor, selecione uma placa', 'error');
        return;
    }
    const resultsContainer = document.getElementById('resultadosMotorista');
    resultsContainer.innerHTML = `<div class="loading"><div class="spinner"></div>Consultando...</div>`;

    try {
        const expeditions = await supabaseRequest("expeditions?status=in.(aguardando_veiculo,em_carregamento,saiu_para_entrega)&order=data_hora.desc");
        const items = await supabaseRequest('expedition_items');

        const veiculos = window.veiculos || [];

        const expeditionsWithItems = expeditions.map(exp => {
            const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
            return { ...exp, items: items.filter(i => i.expedition_id === exp.id), veiculo_placa: veiculo?.placa };
        }).filter(exp => exp.veiculo_placa === placa);

        renderExpedicoesMotorista(expeditionsWithItems);
    } catch (error) {
        resultsContainer.innerHTML = `<div class="alert alert-error">Erro ao consultar expedições.</div>`;
    }
}

export function renderExpedicoesMotorista(expeditions) {
    const container = document.getElementById('resultadosMotorista');
    if (window.activeTimers) {
        Object.values(window.activeTimers).forEach(clearInterval);
        window.activeTimers = {};
    }

    if (expeditions.length === 0) {
        container.innerHTML = `<div class="alert alert-success mt-4">Nenhuma expedição ativa encontrada para esta placa.</div>`;
        return;
    }

    const docas = window.docas || [];

    container.innerHTML = expeditions.map(exp => {
        if (exp.status === 'saiu_para_entrega') {
            return renderPainelDescarga(exp);
        }
        const doca = docas.find(d => d.id === exp.doca_id);
        const coddocaValue = doca?.coddoca || 'N/A';
        let actionButton = '';
        if (exp.status === 'aguardando_veiculo') {
            actionButton = `<button class="btn btn-success" onclick="openQrModal('iniciar', '${exp.id}', '${coddocaValue}')">Iniciar Carregamento</button>`;
        } else if (exp.status === 'em_carregamento') {
            actionButton = `<button class="btn btn-primary" onclick="openQrModal('finalizar', '${exp.id}', '${coddocaValue}')">Finalizar Carregamento</button>`;
        }
        return `
            <div class="motorista-card">
                 <div class="flex justify-between items-start mb-4">
                    <h3 class="text-lg font-bold">Viagem para ${exp.items.length} Lojas</h3>
                    <span class="status-badge status-${exp.status}">${getStatusLabel(exp.status)}</span>
                </div>
                <div class="text-center mt-4">${actionButton}</div>
            </div>
        `;
    }).join('');
}

export function renderPainelDescarga(exp) {
    let html = `<div class="motorista-card"><h3 class="text-xl font-semibold mb-4">Roteiro de Entregas</h3>`;
    let emTransito = true;

    const lojas = window.lojas || [];

    exp.items.forEach(item => {
        const loja = lojas.find(l => l.id === item.loja_id);
        let actionButton = '', statusDescargaLabel = '', statusColor = '';

        if (item.status_descarga === 'pendente' && emTransito) {
            statusDescargaLabel = 'Próxima Entrega'; statusColor = 'text-blue-600';
            actionButton = `<button class="btn btn-success" onclick="window.openQrModal('iniciar_descarga', '${item.id}', '${loja?.codlojaqr || ''}', '${exp.id}')">Iniciar Descarga</button>`;
            emTransito = false;
        } else if (item.status_descarga === 'pendente' && !emTransito) {
            statusDescargaLabel = 'Aguardando'; statusColor = 'text-gray-500';
        } else if (item.status_descarga === 'em_descarga') {
            statusDescargaLabel = 'Em Descarga'; statusColor = 'text-yellow-600';
            actionButton = `<button class="btn btn-primary" onclick="window.openQrModal('finalizar_descarga', '${item.id}', '${loja?.codlojaqr || ''}', '${exp.id}')">Finalizar Descarga</button>`;
            emTransito = false;
        } else if (item.status_descarga === 'descarregado') {
            statusDescargaLabel = 'Descarregado'; statusColor = 'text-green-600';
        }

        html += `
            <div class="loja-descarga-card">
                <div class="flex justify-between items-center mb-2">
                     <h4 class="font-bold">${loja?.nome || 'N/A'}</h4>
                     <span class="font-bold ${statusColor}">${statusDescargaLabel}</span>
                </div>
                <div class="text-center mt-4">${actionButton}</div>
            </div>`;
    });
    return html + `</div>`;
}

export async function showYesNoModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('qrModal');
        document.getElementById('qrModalTitle').textContent = "Confirmação";
        document.getElementById('qrModalMessage').innerHTML = message;
        document.getElementById('qr-reader').style.display = 'none';

        const confirmBtn = document.getElementById('confirmQrBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.textContent = 'Sim';
        newConfirmBtn.disabled = false;
        newConfirmBtn.onclick = () => { window.closeQrModal(); resolve(true); };

        const cancelBtn = modal.querySelector('.btn-danger');
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.textContent = 'Não';
        newCancelBtn.onclick = () => { window.closeQrModal(); resolve(false); };

        modal.style.display = 'flex';
    });
}

export async function marcarRetornoCD(motoristaId, veiculoId) {
    try {
        const motoristas = window.motoristas || [];
        const motorista = motoristas.find(m => m.id === motoristaId);
        let novoStatusMotorista, novoStatusVeiculo, msg;

        if (motorista && motorista.status === 'retornando_com_imobilizado') {
            novoStatusMotorista = 'descarregando_imobilizado';
            novoStatusVeiculo = 'descarregando_imobilizado';
            msg = 'Retorno com imobilizado registrado. Inicie a descarga.';
        } else {
            novoStatusMotorista = 'disponivel';
            novoStatusVeiculo = 'disponivel';
            msg = 'Retorno ao CD registrado. Motorista e veículo disponíveis!';
        }

        await Promise.all([
            supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: novoStatusMotorista }, false),
            supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: novoStatusVeiculo }, false)
        ]);
        showNotification(msg, 'success');

        if (window.loadSelectData) await window.loadSelectData();
        await renderMotoristasStatusList();
    } catch (error) {
        showNotification('Erro ao marcar retorno: ' + error.message, 'error');
    }
}

export async function finalizarDescargaImobilizado(motoristaId, veiculoId) {
    try {
        await Promise.all([
            supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: 'disponivel' }, false),
            supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: 'disponivel' }, false)
        ]);
        showNotification('Descarga de imobilizado finalizada. Motorista e veículo disponíveis!', 'success');

        if (window.loadSelectData) await window.loadSelectData();
        await renderMotoristasStatusList();
    } catch (error) {
        showNotification('Erro ao finalizar descarga: ' + error.message, 'error');
    }
}

export async function generateMotoristaReports() {
    const dataInicio = document.getElementById('relatorioMotoristaDataInicio').value;
    const dataFim = document.getElementById('relatorioMotoristaDataFim').value;

    const hoje = new Date();
    const inicioAnalise = dataInicio ? new Date(dataInicio + 'T00:00:00.000Z') : new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fimAnalise = dataFim ? new Date(dataFim + 'T23:59:59.999Z') : hoje;

    try {
        const expeditions = await supabaseRequest('expeditions?status=eq.entregue&order=data_hora.desc');
        const items = await supabaseRequest('expedition_items');

        const expedicoesFiltradas = expeditions.filter(exp => {
            const dataExp = new Date(exp.data_hora);
            return dataExp >= inicioAnalise && dataExp <= fimAnalise;
        });

        const motoristasStats = {};
        const motoristas = window.motoristas || [];
        const veiculos = window.veiculos || [];

        expedicoesFiltradas.forEach(exp => {
            if (!exp.motorista_id) return;

            const motorista = motoristas.find(m => m.id === exp.motorista_id);
            if (!motorista) return;

            const expItems = items.filter(item => item.expedition_id === exp.id);
            const totalEntregas = expItems.length;
            const totalPallets = expItems.reduce((sum, item) => sum + (item.pallets || 0), 0);

            let tempoTotalViagem = 0;
            const ultimaEntrega = expItems.reduce((ultima, item) => {
                const fimDescarga = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
                return fimDescarga && (!ultima || fimDescarga > ultima) ? fimDescarga : ultima;
            }, null);

            if (ultimaEntrega) {
                tempoTotalViagem = (ultimaEntrega - new Date(exp.data_hora)) / 60000;
            }

            if (!motoristasStats[exp.motorista_id]) {
                motoristasStats[exp.motorista_id] = {
                    nome: motorista.nome,
                    produtivo: motorista.PRODUTIVO || 'N/A',
                    viagens: 0,
                    entregas: 0,
                    totalPallets: 0,
                    temposTotalViagem: [],
                    ocupacaoMedia: []
                };
            }

            const stats = motoristasStats[exp.motorista_id];
            stats.viagens++;
            stats.entregas += totalEntregas;
            stats.totalPallets += totalPallets;

            if (tempoTotalViagem > 0) {
                stats.temposTotalViagem.push(tempoTotalViagem);
            }

            if (exp.veiculo_id) {
                const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                if (veiculo && veiculo.capacidade_pallets > 0) {
                    const totalRolls = expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0);
                    const cargaTotal = totalPallets + (totalRolls / 2);
                    const ocupacao = (cargaTotal / veiculo.capacidade_pallets) * 100;
                    stats.ocupacaoMedia.push(ocupacao);
                }
            }
        });

        const motoristasData = Object.values(motoristasStats).map(stats => ({
            ...stats,
            tempoMedioViagem: stats.temposTotalViagem.length > 0 ?
                stats.temposTotalViagem.reduce((a, b) => a + b, 0) / stats.temposTotalViagem.length : 0,
            ocupacaoMediaCalc: stats.ocupacaoMedia.length > 0 ?
                stats.ocupacaoMedia.reduce((a, b) => a + b, 0) / stats.ocupacaoMedia.length : 0,
            entregasPorViagem: stats.viagens > 0 ? (stats.entregas / stats.viagens).toFixed(1) : 0
        }));

        motoristasData.sort((a, b) => b.entregas - a.entregas);

        renderMotoristaReportSummary(motoristasData, expedicoesFiltradas.length);
        renderMotoristaRankingChart(motoristasData.slice(0, 10));
        renderMotoristaTable(motoristasData);

    } catch (error) {
        console.error('Erro ao gerar relatório de motoristas:', error);
        document.getElementById('motoristaReportSummary').innerHTML =
            `<div class="alert alert-error">Erro ao carregar relatório: ${error.message}</div>`;
    }
}

export function renderMotoristaReportSummary(motoristasData, totalExpedicoes) {
    const summaryContainer = document.getElementById('motoristaReportSummary');

    if (motoristasData.length === 0) {
        summaryContainer.innerHTML = '<div class="alert alert-info">Nenhum dado encontrado para o período selecionado.</div>';
        summaryContainer.style.display = 'block';
        return;
    }

    const totalEntregas = motoristasData.reduce((sum, m) => sum + m.entregas, 0);
    const totalPallets = motoristasData.reduce((sum, m) => sum + m.totalPallets, 0);
    const motoristasAtivos = motoristasData.length;
    const mediaEntregasPorMotorista = motoristasAtivos > 0 ? (totalEntregas / motoristasAtivos).toFixed(1) : 0;

    summaryContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${motoristasAtivos}</div>
            <div class="stat-label">Motoristas Ativos</div>
        </div>
        <div class="stat-card" style="background: var(--secondary-gradient);">
            <div class="stat-number">${totalExpedicoes}</div>
            <div class="stat-label">Total Viagens</div>
        </div>
        <div class="stat-card" style="background: var(--accent-gradient);">
            <div class="stat-number">${totalEntregas}</div>
            <div class="stat-label">Total Entregas</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);">
            <div class="stat-number">${totalPallets}</div>
            <div class="stat-label">Total Pallets</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);">
            <div class="stat-number">${mediaEntregasPorMotorista}</div>
            <div class="stat-label">Média Entregas/Motorista</div>
        </div>
    `;
    summaryContainer.style.display = 'grid';
}

export function renderMotoristaRankingChart(motoristasData) {
    if (!motoristasData || motoristasData.length === 0) {
        if (window.destroyChart) window.destroyChart('motoristasRankingChart');
        return;
    }

    const top10 = [...motoristasData].sort((a, b) => b.entregas - a.entregas).slice(0, 10);

    const data = {
        labels: top10.map(m => m.nome),
        datasets: [{
            label: 'Entregas',
            data: top10.map(m => m.entregas),
            backgroundColor: [
                'rgba(255, 215, 0, 0.8)',
                'rgba(192, 192, 192, 0.8)',
                'rgba(205, 127, 50, 0.8)',
                'rgba(0, 212, 170, 0.8)',
                'rgba(0, 180, 216, 0.8)',
                'rgba(0, 119, 182, 0.8)',
                'rgba(114, 9, 183, 0.8)',
                'rgba(166, 99, 204, 0.8)',
                'rgba(247, 127, 0, 0.8)',
                'rgba(252, 191, 73, 0.8)'
            ],
            borderColor: 'rgba(255, 255, 255, 1)',
            borderWidth: 2,
            borderRadius: 8
        }]
    };

    if (window.renderChart) {
        window.renderChart('motoristasRankingChart', 'bar', data, {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function (context) {
                            const motorista = top10[context.dataIndex];
                            return [
                                `Entregas: ${context.raw}`,
                                `Viagens: ${motorista.viagens}`,
                                `Entregas/Viagem: ${motorista.entregasPorViagem}`
                            ];
                        }
                    }
                },
                datalabels: {
                    display: true,
                    color: '#FFFFFF',
                    font: { weight: 'bold', size: 14 },
                    anchor: 'end',
                    align: 'start',
                    offset: 10,
                    formatter: (value) => value
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: Math.max(...top10.map(m => m.entregas)) * 1.2,
                }
            }
        });
    }
}

export function renderMotoristaTable(motoristasData) {
    const container = document.getElementById('motoristaTableContainer');

    if (motoristasData.length === 0) {
        container.innerHTML = '<div class="alert alert-info p-4">Nenhum dado encontrado para o período selecionado.</div>';
        return;
    }

    let tableHtml = `
        <table class="w-full">
            <thead>
                <tr>
                    <th class="text-left p-3">Ranking</th>
                    <th class="text-left p-3">Nome</th>
                    <th class="text-left p-3">Produtivo</th>
                    <th class="text-left p-3">Viagens</th>
                    <th class="text-left p-3">Entregas</th>
                    <th class="text-left p-3">Entregas/Viagem</th>
                    <th class="text-left p-3">Total Pallets</th>
                    <th class="text-left p-3">Tempo Médio Viagem</th>
                    <th class="text-left p-3">Ocupação Média</th>
                </tr>
            </thead>
            <tbody>
    `;

    motoristasData.forEach((motorista, index) => {
        let rankingIcon = '';
        if (index === 0) rankingIcon = '🥇';
        else if (index === 1) rankingIcon = '🥈';
        else if (index === 2) rankingIcon = '🥉';
        else rankingIcon = `${index + 1}º`;

        tableHtml += `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-3 font-bold">${rankingIcon}</td>
                <td class="p-3 font-medium">${motorista.nome}</td>
                <td class="p-3">${motorista.produtivo}</td>
                <td class="p-3 text-center">${motorista.viagens}</td>
                <td class="p-3 text-center font-bold text-blue-600">${motorista.entregas}</td>
                <td class="p-3 text-center">${motorista.entregasPorViagem}</td>
                <td class="p-3 text-center">${motorista.totalPallets}</td>
                <td class="p-3 text-center">${minutesToHHMM(motorista.tempoMedioViagem)}</td>
                <td class="p-3 text-center">${motorista.ocupacaoMediaCalc.toFixed(1)}%</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

export function applyMotoristaStatusFilter() {
    const filterValue = document.getElementById('motoristaStatusFilter').value;
    const allMotoristas = window.motoristasDataCache || [];

    let filteredList = allMotoristas;

    if (filterValue) {
        const statuses = filterValue.split(',').map(s => s.trim());
        if (statuses.length > 0 && statuses[0]) {
            filteredList = allMotoristas.filter(m => statuses.includes(m.displayStatus));
        }
    }

    const listContainer = document.getElementById('motoristaListFiltered');
    if (listContainer) {
        listContainer.innerHTML = renderMotoristasListHtml(filteredList);
    }

    filteredList.forEach(m => {
        if (m.activeExp && m.displayStatus === 'saiu_para_entrega') {
            startMotoristaTimer(m);
        }
    });
}

export function startMotoristaTimer(m) {
    if (!window.activeTimers) window.activeTimers = {};
    const timerId = `motorista_${m.id}`;
    if (window.activeTimers[timerId]) clearInterval(window.activeTimers[timerId]);

    window.activeTimers[timerId] = setInterval(() => {
        let tempoEmLoja = 0, tempoDeslocamento = 0;
        let lastEventTime = new Date(m.activeExp.data_saida_entrega);

        m.activeExp.items.sort((a, b) => new Date(a.data_inicio_descarga) - new Date(b.data_inicio_descarga)).forEach(item => {
            if (item.data_inicio_descarga) {
                const inicio = new Date(item.data_inicio_descarga);
                tempoDeslocamento += (inicio - lastEventTime);
                if (item.data_fim_descarga) {
                    const fim = new Date(item.data_fim_descarga);
                    tempoEmLoja += (fim - inicio);
                    lastEventTime = fim;
                } else {
                    tempoEmLoja += (new Date() - inicio);
                    lastEventTime = new Date();
                }
            }
        });

        const elLoja = document.getElementById(`loja_timer_${m.id}`);
        const elDesloc = document.getElementById(`desloc_timer_${m.id}`);

        if (elLoja) elLoja.textContent = `Loja: ${minutesToHHMM(tempoEmLoja / 60000)}`;
        if (elDesloc) elDesloc.textContent = `Desloc.: ${minutesToHHMM(tempoDeslocamento / 60000)}`;

    }, 1000);
}

// Global exposure for HTML inline handlers
window.loadMotoristaTab = loadMotoristaTab;
window.consultarExpedicoesPorPlaca = consultarExpedicoesPorPlaca;
window.showYesNoModal = showYesNoModal;
window.marcarRetornoCD = marcarRetornoCD;
window.finalizarDescargaImobilizado = finalizarDescargaImobilizado;
window.generateMotoristaReports = generateMotoristaReports;
window.applyMotoristaStatusFilter = applyMotoristaStatusFilter;
window.renderMotoristasStatusList = renderMotoristasStatusList;
