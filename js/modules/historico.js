import { getState } from '../state.js';
import { supabaseRequest } from '../api.js';
import { showNotification } from '../ui.js';
import { minutesToHHMM } from '../utils.js';

let allHistorico = [];
let filteredHistorico = [];
const chartInstances = {};

export async function loadHistorico() {
    const permittedHistoricoTabs = window.getPermittedSubTabs ? window.getPermittedSubTabs('historico') : ['listaEntregas'];

    if (permittedHistoricoTabs.length > 0) {
        const initialSubTab = permittedHistoricoTabs.length === 1 ? permittedHistoricoTabs[0] : 'listaEntregas';
        const initialElement = document.querySelector(`#historico .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        if (window.showSubTab) window.showSubTab('historico', initialSubTab, initialElement);
    }

    const container = document.getElementById('historicoList');
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando histórico...</div>`;
    try {
        const expeditions = await supabaseRequest('expeditions?status=eq.entregue&order=data_hora.desc&limit=1000');
        const items = await supabaseRequest('expedition_items');

        const veiculos = getState('veiculos') || [];
        const motoristas = getState('motoristas') || [];
        const lojas = getState('lojas') || [];

        allHistorico = expeditions.map(exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
            const totalPallets = expItems.reduce((s, i) => s + (i.pallets || 0), 0);
            const totalRolls = expItems.reduce((s, i) => s + (i.rolltrainers || 0), 0);
            const totalCarga = totalPallets + (totalRolls / 2);
            const ocupacao = veiculo && veiculo.capacidade_pallets > 0 ? (totalCarga / veiculo.capacidade_pallets) * 100 : 0;

            return {
                ...exp,
                items: expItems,
                lojas_count: expItems.length,
                lojas_info: expItems.map(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    return loja ? `${loja.codigo} - ${loja.nome}` : 'N/A';
                }).join(', '),
                veiculo_placa: veiculo?.placa,
                motorista_nome: motoristas.find(m => m.id === exp.motorista_id)?.nome,
                total_pallets: totalPallets,
                ocupacao: ocupacao.toFixed(1)
            };
        });

        applyHistoricoFilters();
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Erro ao carregar histórico: ${error.message}</div>`;
    }
}

export function applyHistoricoFilters() {
    const dataInicio = document.getElementById('historicoFiltroDataInicio')?.value || document.getElementById('indicadoresFiltroDataInicio')?.value;
    const dataFim = document.getElementById('historicoFiltroDataFim')?.value || document.getElementById('indicadoresFiltroDataFim')?.value;
    const searchTerm = document.getElementById('historicoSearchInput')?.value.toLowerCase() || '';

    filteredHistorico = allHistorico.filter(exp => {
        const expDate = new Date(exp.data_hora).toISOString().split('T')[0];
        if (dataInicio && expDate < dataInicio) return false;
        if (dataFim && expDate > dataFim) return false;
        if (searchTerm) {
            const searchable = [exp.lojas_info, exp.veiculo_placa, exp.motorista_nome].join(' ').toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }
        return true;
    });

    renderHistorico(filteredHistorico);
    generateHistoricoIndicators(filteredHistorico);
}

export function clearHistoricoFilters() {
    if (document.getElementById('historicoFiltroDataInicio')) document.getElementById('historicoFiltroDataInicio').value = '';
    if (document.getElementById('historicoFiltroDataFim')) document.getElementById('historicoFiltroDataFim').value = '';
    if (document.getElementById('historicoSearchInput')) document.getElementById('historicoSearchInput').value = '';
    if (document.getElementById('indicadoresFiltroDataInicio')) document.getElementById('indicadoresFiltroDataInicio').value = '';
    if (document.getElementById('indicadoresFiltroDataFim')) document.getElementById('indicadoresFiltroDataFim').value = '';
    applyHistoricoFilters();
}

export function renderHistorico(data) {
    const container = document.getElementById('historicoList');
    if (data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Nenhum registro encontrado para os filtros.</div>';
        return;
    }

    const lojas = getState('lojas') || [];

    container.innerHTML = data.map(exp => {
        const tempos = {
            patio: (exp.data_saida_veiculo && exp.data_hora) ? minutesToHHMM((new Date(exp.data_saida_veiculo) - new Date(exp.data_hora)) / 60000) : 'N/A',
            alocacao: (exp.data_alocacao_veiculo && exp.data_hora) ? minutesToHHMM((new Date(exp.data_alocacao_veiculo) - new Date(exp.data_hora)) / 60000) : 'N/A',
            carregamento: (exp.data_chegada_veiculo && exp.data_saida_veiculo) ? minutesToHHMM((new Date(exp.data_saida_veiculo) - new Date(exp.data_chegada_veiculo)) / 60000) : 'N/A',
            faturamento: (exp.data_inicio_faturamento && exp.data_fim_faturamento) ? minutesToHHMM((new Date(exp.data_fim_faturamento) - new Date(exp.data_inicio_faturamento)) / 60000) : 'N/A',
        };

        let roteiroHtml = '';
        let totalTempoEmTransito = 0;
        let totalTempoEmLoja = 0;
        let lastDeparture = exp.data_saida_entrega ? new Date(exp.data_saida_entrega) : new Date(exp.data_saida_veiculo);

        if (exp.items && exp.items.length > 0) {
            exp.items.sort((a, b) => (a.ordem_entrega || 999) - (b.ordem_entrega || 999)).forEach((item, index) => {
                const loja = lojas.find(l => l.id === item.loja_id);
                const t_chegada = item.data_inicio_descarga ? new Date(item.data_inicio_descarga) : null;
                const t_saida = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;

                let tempoEmLojaMin = 0;
                let tempoTransitoMin = 0;

                if (t_chegada && lastDeparture) {
                    tempoTransitoMin = (t_chegada - lastDeparture) / 60000;
                    totalTempoEmTransito += tempoTransitoMin;
                }

                if (t_saida && t_chegada) {
                    tempoEmLojaMin = (t_saida - t_chegada) / 60000;
                    totalTempoEmLoja += tempoEmLojaMin;
                    lastDeparture = t_saida;
                }

                let tempoLojaClass = '';
                if (tempoEmLojaMin > 60) tempoLojaClass = 'bg-red-100 text-red-800';
                else if (tempoEmLojaMin > 30) tempoLojaClass = 'bg-yellow-100 text-yellow-800';
                else if (tempoEmLojaMin > 0) tempoLojaClass = 'bg-green-100 text-green-800';

                const palletsDisplay = item.pallets || 0;
                const rollsDisplay = item.rolltrainers || 0;

                roteiroHtml += `
                    <div class="p-3 border-b border-dashed border-gray-200">
                        <div class="flex justify-between items-center">
                            <strong class="text-sm text-gray-800">${index + 1}. ${loja?.codigo || 'N/A'} - ${loja?.nome || 'N/A'}</strong>
                            <div class="flex items-center space-x-2">
                                <span class="text-xs font-semibold ${tempoLojaClass} px-2 py-1 rounded">
                                    ${tempoEmLojaMin > 0 ? `Descarga: ${minutesToHHMM(tempoEmLojaMin)}` : 'Descarga: N/A'}
                                </span>
                                <span class="text-xs text-gray-500">${palletsDisplay}P / ${rollsDisplay}R</span>
                            </div>
                        </div>
                        ${tempoTransitoMin > 0 ? `
                            <div class="text-xs text-gray-500 mt-1 pl-4">
                                ↳ T. Desloc.: ${minutesToHHMM(tempoTransitoMin)}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
        }

        const ocupacaoPerc = Math.round(exp.ocupacao || 0);
        let ocupacaoColor = 'text-green-600';
        if (ocupacaoPerc > 90) ocupacaoColor = 'text-orange-600';
        if (ocupacaoPerc > 100) ocupacaoColor = 'text-red-600';

        return `
            <div class="historico-card" data-aos="fade-up">
                <div class="flex justify-between items-start mb-4 border-b pb-3">
                   <div>
                        <h3 class="text-xl font-bold text-gray-800">${new Date(exp.data_hora).toLocaleDateString('pt-BR')} - ${exp.veiculo_placa}</h3>
                        <p class="text-sm text-gray-600">Motorista: <span class="font-semibold">${exp.motorista_nome}</span></p>
                        ${exp.numeros_carga && exp.numeros_carga.length > 0 ? `<p class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1 inline-block">📦 Cargas: ${exp.numeros_carga.join(', ')}</p>` : ''}
                    </div>
                    <div class="text-right">
                        <span class="status-badge status-entregue">ENTREGUE</span>
                        <div class="mt-2 flex gap-2">
                            <button class="btn btn-primary btn-small" onclick="window.showDetalhesExpedicao('${exp.id}')">Detalhes</button>
                            <button class="btn btn-danger btn-small" onclick="window.deleteHistoricoExpedition('${exp.id}')">Excluir</button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm font-semibold">
                    <div class="p-3 bg-gray-50 rounded-lg text-center">
                        <div class="text-2xl font-bold text-blue-600">${exp.total_pallets}P / ${exp.total_rolltrainers || 0}R</div>
                        <div class="text-xs text-gray-500">Carga Total</div>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg text-center">
                        <div class="text-2xl font-bold ${ocupacaoColor}">${ocupacaoPerc}%</div>
                        <div class="text-xs text-gray-500">Ocupação</div>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg text-center">
                        <div class="text-2xl font-bold text-green-600">${minutesToHHMM(totalTempoEmLoja)}</div>
                        <div class="text-xs text-gray-500">T. Descarga Total</div>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg text-center">
                        <div class="text-2xl font-bold text-orange-600">${minutesToHHMM(totalTempoEmTransito)}</div>
                        <div class="text-xs text-gray-500">T. Trânsito Total</div>
                    </div>
                </div>

                <h4 class="font-bold text-gray-700 mb-2 border-t pt-3">Tempos de Pátio e Faturamento</h4>
                <div class="grid grid-cols-3 gap-2 text-xs text-center mb-4">
                    <div class="time-display" style="background:#e0e7ff; border-left-color:#3730a3;"><strong>T. Alocação:</strong> ${tempos.alocacao}</div>
                    <div class="time-display" style="background:#cffafe; border-left-color:#0e7490;"><strong>T. Carga:</strong> ${tempos.carregamento}</div>
                    <div class="time-display" style="background:#d1fae5; border-left-color:#065f46;"><strong>T. Faturamento:</strong> ${tempos.faturamento}</div>
                </div>

                <h4 class="font-bold text-gray-700 mb-2 border-t pt-3">Roteiro Detalhado (${exp.lojas_count} Paradas)</h4>
                <div class="space-y-1 bg-white p-2 border rounded-lg">
                    ${roteiroHtml}
                </div>
            </div>
        `;
    }).join('');
}

export async function deleteHistoricoExpedition(expeditionId) {
    const confirmed = await (window.showYesNoModal ? window.showYesNoModal('Deseja excluir permanentemente esta expedição do histórico?') : confirm('Deseja excluir permanentemente?'));
    if (confirmed) {
        try {
            await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`, 'DELETE', null, false);
            await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'DELETE', null, false);
            showNotification('Registro do histórico excluído!', 'success');
            loadHistorico();
        } catch (error) {
            showNotification(`Erro ao excluir: ${error.message}`, 'error');
        }
    }
}

export function generateHistoricoIndicators(data) {
    const timeSummaryContainer = document.getElementById('indicadoresTimeSummary');
    const volumeStatsContainer = document.getElementById('indicadoresVolumeStats');

    if (data.length === 0) {
        if (timeSummaryContainer) timeSummaryContainer.innerHTML = '<div class="alert alert-info md:col-span-5">Sem dados de expedições concluídas para o período selecionado.</div>';
        if (volumeStatsContainer) volumeStatsContainer.innerHTML = '';
        destroyChart('lojasRankingChart');
        destroyChart('entregasChart');
        destroyChart('totalEntregasLojaChart');
        destroyChart('participacaoEntregasLojaChart');
        destroyChart('palletsPorLojaChart');
        return;
    }

    const calcularMedia = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const totalViagens = data.length;

    let temposAlocar = [];
    let temposChegadaDoca = [];
    let temposCarregamento = [];
    let temposFaturamento = [];
    let temposEmTransito = [];
    let temposEmLoja = [];

    let lojasData = {};
    let entregasFort = 0, entregasComper = 0;
    let totalEntregas = 0;
    let totalPallets = 0;
    let totalRolls = 0;
    let ocupacoes = [];
    let lojasAtendidas = new Set();
    const veiculos = getState('veiculos') || [];
    const lojas = getState('lojas') || [];

    data.forEach(exp => {
        if (exp.data_alocacao_veiculo) temposAlocar.push((new Date(exp.data_alocacao_veiculo) - new Date(exp.data_hora)) / 60000);
        if (exp.data_chegada_veiculo && exp.data_alocacao_veiculo) temposChegadaDoca.push((new Date(exp.data_chegada_veiculo) - new Date(exp.data_alocacao_veiculo)) / 60000);
        if (exp.data_chegada_veiculo && exp.data_saida_veiculo) temposCarregamento.push((new Date(exp.data_saida_veiculo) - new Date(exp.data_chegada_veiculo)) / 60000);
        if (exp.data_inicio_faturamento && exp.data_fim_faturamento) temposFaturamento.push((new Date(exp.data_fim_faturamento) - new Date(exp.data_inicio_faturamento)) / 60000);

        let ultimaData = exp.data_saida_entrega ? new Date(exp.data_saida_entrega) : new Date(exp.data_saida_veiculo);
        let totalTransitoViagem = 0;
        let totalLojaViagem = 0;

        const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
        let cargaPalletExp = 0;
        let cargaRollExp = 0;

        exp.items.sort((a, b) => (a.ordem_entrega || 999) - (b.ordem_entrega || 999)).forEach(item => {
            totalPallets += item.pallets || 0;
            totalRolls += item.rolltrainers || 0;
            cargaPalletExp += item.pallets || 0;
            cargaRollExp += item.rolltrainers || 0;

            const t_chegada = item.data_inicio_descarga ? new Date(item.data_inicio_descarga) : null;
            const t_saida = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
            const tempoEmLoja = t_saida && t_chegada ? (t_saida - t_chegada) / 60000 : 0;
            const tempoTransito = ultimaData && t_chegada ? (t_chegada - ultimaData) / 60000 : 0;

            if (tempoEmLoja > 0) {
                totalLojaViagem += tempoEmLoja;
                const loja = lojas.find(l => l.id === item.loja_id);
                if (loja) {
                    lojasAtendidas.add(loja.id);
                    if (!lojasData[loja.id]) {
                        lojasData[loja.id] = { nome: `${loja.codigo} - ${loja.nome}`, totalEntregas: 0, totalTempo: 0, totalPallets: 0, tempos: [] };
                    }
                    lojasData[loja.id].totalTempo += tempoEmLoja;
                    lojasData[loja.id].totalPallets += item.pallets || 0;
                    lojasData[loja.id].tempos.push(tempoEmLoja);

                    if (loja.nome.toLowerCase().includes('fort')) entregasFort++;
                    else if (loja.nome.toLowerCase().includes('comper')) entregasComper++;
                }
            }
            if (tempoTransito > 0) totalTransitoViagem += tempoTransito;
            if (t_saida) ultimaData = t_saida;
        });

        if (exp.status === 'entregue') {
            exp.items.forEach(item => {
                const loja = lojas.find(l => l.id === item.loja_id);
                if (loja && item.status_descarga === 'descarregado') {
                    lojasData[loja.id].totalEntregas++;
                    totalEntregas++;
                }
            });
        }

        if (totalLojaViagem > 0) temposEmLoja.push(totalLojaViagem);
        if (totalTransitoViagem > 0) temposEmTransito.push(totalTransitoViagem);

        if (veiculo && veiculo.capacidade_pallets > 0) {
            const cargaTotal = cargaPalletExp + (cargaRollExp / 2);
            ocupacoes.push((cargaTotal / veiculo.capacidade_pallets) * 100);
        }
    });

    const mediaAlocar = calcularMedia(temposAlocar);
    const mediaChegadaDoca = calcularMedia(temposChegadaDoca);
    const mediaCarregamento = calcularMedia(temposCarregamento);
    const mediaFaturamento = calcularMedia(temposFaturamento);
    const mediaEmTransito = calcularMedia(temposEmTransito);
    const mediaEmLoja = calcularMedia(temposEmLoja);
    const mediaOcupacao = calcularMedia(ocupacoes);
    const mediaTempoInternoTotal = mediaAlocar + mediaChegadaDoca + mediaCarregamento + mediaFaturamento;

    const lojasRankingData = Object.values(lojasData).map(loja => ({
        ...loja,
        tempoMedio: calcularMedia(loja.tempos)
    })).filter(l => l.totalEntregas > 0);

    if (volumeStatsContainer) {
        volumeStatsContainer.innerHTML = `
            <div class="stat-card" style="background: linear-gradient(135deg, #00D4AA, #00B4D8);">
                <div class="stat-number">${totalViagens}</div>
                <div class="stat-label">Viagens Concluídas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #00B4D8, #0077B6);">
                <div class="stat-number">${totalEntregas}</div>
                <div class="stat-label">Entregas Realizadas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #FFD700, #F77F00);">
                <div class="stat-number">${totalPallets}</div>
                <div class="stat-label">Total Pallets</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #9C27B0, #7209B7);">
                <div class="stat-number">${totalRolls}</div>
                <div class="stat-label">Total RollTrainers</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #DC143C, #D62828);">
                <div class="stat-number">${mediaOcupacao.toFixed(1)}%</div>
                <div class="stat-label">Ocupação Média</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #3B82F6, #1D4ED8);">
                <div class="stat-number">${lojasAtendidas.size}</div>
                <div class="stat-label">Lojas Atendidas</div>
            </div>
        `;
    }

    if (timeSummaryContainer) {
        timeSummaryContainer.innerHTML = `
            <div class="bg-white p-4 rounded-xl shadow-lg border-t-4 border-blue-600 historico-time-card" data-aos="fade-up">
                <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">⏱️Tempo Interno </h3>
                <div class="time-stat-card" style="background: linear-gradient(135deg, #0077B6, #00B4D8); margin-bottom: 15px;">
                    <div class="stat-number text-3xl">${minutesToHHMM(mediaTempoInternoTotal)}</div>
                    <div class="stat-label">TEMPO TOTAL PÁTIO</div>
                </div>
                
                <div class="text-sm space-y-2">
                    <div class="flex justify-between border-b pb-1"><span>Ociosidade (Lanç. → Aloc.)</span><span class="font-bold text-blue-600">${minutesToHHMM(mediaAlocar)}</span></div>
                    <div class="flex justify-between border-b pb-1"><span>Chegada Doca (Aloc. → Cheg.)</span><span class="font-bold text-blue-600">${minutesToHHMM(mediaChegadaDoca)}</span></div>
                    <div class="flex justify-between border-b pb-1"><span>Carregamento (Cheg. → Saída)</span><span class="font-bold text-blue-600">${minutesToHHMM(mediaCarregamento)}</span></div>
                    <div class="flex justify-between pb-1"><span>T.M. Faturamento</span><span class="font-bold text-blue-600">${minutesToHHMM(mediaFaturamento)}</span></div>
                </div>
            </div>
            
            <div class="bg-white p-4 rounded-xl shadow-lg border-t-4 border-yellow-600 historico-time-card" data-aos="fade-up" data-aos-delay="100">
                <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">Carregamento (Doca)</h3>
                <div class="time-stat-card" style="background: linear-gradient(135deg, #FFD700, #F77F00); height: 100%;">
                    <div class="stat-number text-5xl">${minutesToHHMM(mediaCarregamento)}</div>
                    <div class="stat-label text-xl">TEMPO EM DOCA</div>
                </div>
            </div>
            
            <div class="bg-white p-4 rounded-xl shadow-lg border-t-4 border-purple-600 historico-time-card" data-aos="fade-up" data-aos-delay="200">
                <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">Faturamento</h3>
                <div class="time-stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC); height: 100%;">
                    <div class="stat-number text-5xl">${minutesToHHMM(mediaFaturamento)}</div>
                    <div class="stat-label text-xl">TEMPO EM FATURAMENTO</div>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl shadow-lg border-t-4 border-orange-600 historico-time-card" data-aos="fade-up" data-aos-delay="300">
                <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">Trânsito</h3>
                <div class="time-stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49); height: 100%;">
                    <div class="stat-number text-5xl">${minutesToHHMM(mediaEmTransito)}</div>
                    <div class="stat-label text-xl">TEMPO DE TRANSITO</div>
                </div>
            </div>
            
            <div class="bg-white p-4 rounded-xl shadow-lg border-t-4 border-green-600 historico-time-card" data-aos="fade-up" data-aos-delay="400">
                <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">Loja</h3>
                <div class="time-stat-card" style="background: linear-gradient(135deg, #00D4AA, #10B981); height: 100%;">
                    <div class="stat-number text-5xl">${minutesToHHMM(mediaEmLoja)}</div>
                    <div class="stat-label text-xl">TEMPO DE DESCARGA</div>
                </div>
            </div>
        `;
    }

    renderLojasRankingChart(lojasRankingData.filter(l => l.tempoMedio > 0).sort((a, b) => b.tempoMedio - a.tempoMedio).slice(0, 10));
    renderEntregasChart(entregasFort, entregasComper);
    renderTotalEntregasLojaChart(lojasRankingData);
    renderParticipacaoEntregasLojaChart(lojasRankingData);
    renderPalletsPorLojaChart(lojasRankingData);
}

export function renderTotalEntregasLojaChart(lojasData) {
    const dataFiltrada = lojasData.filter(l => l.totalEntregas > 0).sort((a, b) => b.totalEntregas - a.totalEntregas).slice(0, 10);
    if (dataFiltrada.length === 0) {
        destroyChart('totalEntregasLojaChart');
        return;
    }

    const labels = dataFiltrada.map(l => l.nome);
    const data = dataFiltrada.map(l => l.totalEntregas);
    const colors = dataFiltrada.map(l => l.nome.toLowerCase().includes('fort') ? 'rgba(214, 40, 40, 0.7)' : 'rgba(0, 119, 182, 0.7)');

    renderChart('totalEntregasLojaChart', 'bar', {
        labels: labels,
        datasets: [{ label: 'Total de Entregas', data: data, backgroundColor: colors }]
    }, {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            datalabels: {
                anchor: 'end',
                align: 'end',
                color: '#333',
                formatter: (value) => value
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return `Saídas: ${context.raw}`;
                    }
                }
            }
        }
    });
}

export function renderParticipacaoEntregasLojaChart(lojasData) {
    const dataFiltrada = lojasData.filter(l => l.totalEntregas > 0).sort((a, b) => b.totalEntregas - a.totalEntregas);
    if (dataFiltrada.length === 0) {
        destroyChart('participacaoEntregasLojaChart');
        return;
    }

    const totalGeral = dataFiltrada.reduce((sum, l) => sum + l.totalEntregas, 0);

    const topN = 5;
    const topLojas = dataFiltrada.slice(0, topN);

    let labels = topLojas.map(l => l.nome);
    let data = topLojas.map(l => l.totalEntregas);
    let colors = topLojas.map(l => l.nome.toLowerCase().includes('fort') ? 'rgba(239, 68, 68, 0.8)' : 'rgba(0, 180, 216, 0.8)');

    renderChart('participacaoEntregasLojaChart', 'pie', {
        labels: labels,
        datasets: [{
            label: 'Total de Entregas',
            data: data,
            backgroundColor: colors
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            datalabels: {
                color: 'white',
                font: { weight: 'bold', size: 14 },
                formatter: (value) => {
                    if (totalGeral === 0) return '0%';
                    let percentage = (value * 100 / totalGeral).toFixed(1) + '%';
                    return percentage;
                }
            }
        }
    });
}

export function renderPalletsPorLojaChart(lojasData) {
    const dataFiltrada = lojasData.filter(l => l.totalPallets > 0).sort((a, b) => b.totalPallets - a.totalPallets).slice(0, 10);
    if (dataFiltrada.length === 0) {
        destroyChart('palletsPorLojaChart');
        return;
    }

    const labels = dataFiltrada.map(l => l.nome);
    const data = dataFiltrada.map(l => l.totalPallets);
    const colors = dataFiltrada.map(l => l.nome.toLowerCase().includes('fort') ? 'rgba(247, 127, 0, 0.7)' : 'rgba(255, 215, 0, 0.7)');

    renderChart('palletsPorLojaChart', 'bar', {
        labels: labels,
        datasets: [{ label: 'Total de Pallets', data: data, backgroundColor: colors }]
    }, {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            datalabels: {
                anchor: 'end',
                align: 'end',
                color: '#333',
                formatter: (value) => value
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return `Pallets: ${context.raw}`;
                    }
                }
            }
        }
    });
}

export function renderLojasRankingChart(lojasData) {
    const ranking = Object.values(lojasData)
        .map(loja => ({ ...loja, tempoMedio: (loja.tempos && loja.tempos.length > 0) ? loja.tempos.reduce((a, b) => a + b, 0) / loja.tempos.length : 0 }))
        .filter(loja => loja.tempoMedio > 0)
        .sort((a, b) => b.tempoMedio - a.tempoMedio)
        .slice(0, 10);

    if (ranking.length === 0) {
        destroyChart('lojasRankingChart');
        return;
    }

    const backgroundColors = ranking.map(l => l.nome.toLowerCase().includes('fort') ? 'rgba(214, 40, 40, 0.7)' : 'rgba(0, 119, 182, 0.7)');

    renderChart('lojasRankingChart', 'bar', {
        labels: ranking.map(l => l.nome),
        datasets: [{ label: 'Tempo Médio (min)', data: ranking.map(l => l.tempoMedio), backgroundColor: backgroundColors }]
    }, {
        indexAxis: 'y',
        plugins: {
            datalabels: {
                anchor: 'end',
                align: 'end',
                formatter: (value) => minutesToHHMM(value),
                color: '#333'
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return `Tempo Médio: ${minutesToHHMM(context.raw)}`;
                    }
                }
            }
        }
    });
}

export function renderEntregasChart(fort, comper) {
    if (fort === 0 && comper === 0) {
        destroyChart('entregasChart');
        return;
    }
    renderChart('entregasChart', 'pie', {
        labels: ['Lojas Fort', 'Lojas Comper'],
        datasets: [{
            label: 'Nº de Entregas',
            data: [fort, comper],
            backgroundColor: ['rgba(214, 40, 40, 0.7)', 'rgba(0, 119, 182, 0.7)']
        }]
    }, {
        plugins: {
            datalabels: {
                color: 'white',
                font: { weight: 'bold', size: 14 },
                formatter: (value, ctx) => {
                    let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    if (sum === 0) return '0 (0%)';
                    let percentage = (value * 100 / sum).toFixed(1) + '%';
                    return `${value}\\n(${percentage})`;
                }
            }
        }
    });
}

export function renderChart(canvasId, type, data, options = {}, plugins = []) {
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (ctx && window.Chart) {
        chartInstances[canvasId] = new window.Chart(ctx, { type, data, options, plugins });
    }
}

export function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
}

export async function showDetalhesExpedicao(expeditionId) {
    const modal = document.getElementById('detalhesExpedicaoModal');
    const content = document.getElementById('detalhesContent');

    content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando detalhes...</div>';
    modal.style.display = 'flex';

    try {
        const expedition = await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'GET', null, false);
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`, 'GET', null, false);

        if (!expedition || expedition.length === 0) {
            content.innerHTML = '<div class="alert alert-error">Expedição não encontrada.</div>';
            return;
        }

        const exp = expedition[0];
        const veiculos = getState('veiculos') || [];
        const motoristas = getState('motoristas') || [];
        const lideres = getState('lideres') || [];
        const lojas = getState('lojas') || [];

        const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
        const motorista = motoristas.find(m => m.id === exp.motorista_id);
        const lider = lideres.find(l => l.id === exp.lider_id);

        let planilhaHTML = '';

        if (items && items.length > 0) {
            items.forEach((item, index) => {
                const loja = lojas.find(l => l.id === item.loja_id);

                if (index > 0) {
                    planilhaHTML += '<div style="page-break-before: always;"></div>';
                }

                planilhaHTML += `
    <div class="planilha-controle">
        <div class="planilha-header" style="background: #4a90e2; color: white; font-size: 16px; padding: 10px;">
            LOJA ${loja?.codigo || 'N/A'} - ${loja?.nome || 'N/A'}
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 10px;">
            <div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">DATA:</div>
                    <div class="planilha-value">${new Date(exp.data_hora).toLocaleDateString('pt-BR')}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">PLACA:</div>
                    <div class="planilha-value">${veiculo?.placa || 'N/A'}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">MOTORISTA:</div>
                    <div class="planilha-value">${motorista?.nome || 'N/A'}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">CONFERENTE:</div>
                    <div class="planilha-value">${lider?.nome || 'N/A'}</div>
                </div>
            </div>
            <div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">PALLETS:</div>
                    <div class="planilha-value" style="font-size: 14px; font-weight: bold; color: #2d5aa0;">${item.pallets || 0}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">ROLLTRAINERS:</div>
                    <div class="planilha-value" style="font-size: 14px; font-weight: bold; color: #2d5aa0;">${item.rolltrainers || 0}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">INÍCIO CARREG.:</div>
                    <div class="planilha-value">${exp.data_chegada_veiculo ? new Date(exp.data_chegada_veiculo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">FIM CARREG.:</div>
                    <div class="planilha-value">${exp.data_saida_veiculo ? new Date(exp.data_saida_veiculo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                </div>
            </div>
        </div>
        
        ${exp.numeros_carga && exp.numeros_carga.length > 0 ? `
            <div style="margin: 10px;">
                <div class="planilha-header" style="background: #f0f0f0; color: #333; padding: 6px; font-size: 12px;">
                    NÚMEROS DE CARGA
                </div>
                <div class="planilha-value" style="padding: 8px; font-size: 12px; font-weight: bold;">
                    ${exp.numeros_carga.join(', ')}
                </div>
            </div>
        ` : ''}
        
        ${item.data_inicio_descarga || item.data_fim_descarga ? `
            <div style="margin: 10px;">
                <div class="planilha-header" style="background: #e8f4f8; color: #333; padding: 6px; font-size: 12px;">
                    HORÁRIOS DE ENTREGA
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0;">
                    <div class="planilha-cell" style="padding: 8px;">CHEGADA NA LOJA:</div>
                    <div class="planilha-value" style="padding: 8px;">${item.data_inicio_descarga ? new Date(item.data_inicio_descarga).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                    <div class="planilha-cell" style="padding: 8px;">SAÍDA DA LOJA:</div>
                    <div class="planilha-value" style="padding: 8px;">${item.data_fim_descarga ? new Date(item.data_fim_descarga).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                </div>
            </div>
        ` : ''}
    </div>
`;
            });
        } else {
            planilhaHTML = `
                <div class="planilha-controle">
                    <div class="planilha-header">DETALHES DA EXPEDIÇÃO</div>
                    <div class="alert alert-info">Nenhuma loja encontrada para esta expedição.</div>
                </div>
            `;
        }

        content.innerHTML = planilhaHTML;

    } catch (error) {
        content.innerHTML = '<div class="alert alert-error">Erro ao carregar detalhes da expedição.</div>';
    }
}

export function closeDetalhesModal() {
    document.getElementById('detalhesExpedicaoModal').style.display = 'none';
}

export function imprimirDetalhes() {
    window.print();
}

window.loadHistorico = loadHistorico;
window.applyHistoricoFilters = applyHistoricoFilters;
window.clearHistoricoFilters = clearHistoricoFilters;
window.renderHistorico = renderHistorico;
window.deleteHistoricoExpedition = deleteHistoricoExpedition;
window.generateHistoricoIndicators = generateHistoricoIndicators;
window.showDetalhesExpedicao = showDetalhesExpedicao;
window.closeDetalhesModal = closeDetalhesModal;
window.imprimirDetalhes = imprimirDetalhes;
