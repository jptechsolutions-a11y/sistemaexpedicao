import { supabaseRequest } from '../api.js';
import { getState, setState } from '../state.js';
import { getStatusLabel, minutesToHHMM } from '../utils.js';
async function loadAcompanhamento() {
    const permittedAcompanhamentoTabs = getPermittedSubTabs('acompanhamento');
    
    if (permittedAcompanhamentoTabs.length > 0) {
        const initialSubTab = permittedAcompanhamentoTabs.length === 1 ? permittedAcompanhamentoTabs[0] : 'expedicoesEmAndamento';
        const initialElement = document.querySelector(`#acompanhamento .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        showSubTab('acompanhamento', initialSubTab, initialElement);
    }
    
    // O restante da lógica de carregamento de dados (expeditions, items) permanece aqui
    setDefaultDateFilters();
    const tbody = document.getElementById('acompanhamentoBody');
    tbody.innerHTML = `<tr><td colspan="12" class="loading"><div class="spinner"></div>Carregando expedições...</td></tr>`;

    try {
        const expeditions = await supabaseRequest('expeditions?status=not.eq.entregue&order=data_hora.desc');
        const items = await supabaseRequest('expedition_items');
        // ... (o resto da lógica de loadAcompanhamento, que popula allExpeditions, etc., deve permanecer)
        
        window.allExpeditions = expeditions.map(exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
            const totalCarga = (expItems.reduce((s, i) => s + (i.pallets || 0), 0)) + ((expItems.reduce((s, i) => s + (i.rolltrainers || 0), 0)) / 2);

            return {
                ...exp, items: expItems,
                total_pallets: expItems.reduce((s, i) => s + (i.pallets || 0), 0),
                total_rolltrainers: expItems.reduce((s, i) => s + (i.rolltrainers || 0), 0),
                lojas_count: expItems.length,
                
                // AJUSTE 1: Mostrar apenas o CÓDIGO da loja, separado por vírgula
                lojas_info: expItems.map(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    return loja ? `${loja.codigo}` : 'N/A'; // Apenas o código
                }).join(', '), // MUDANÇA AQUI: de '<br>' para ', '
                
                doca_nome: docas.find(d => d.id === exp.doca_id)?.nome || 'N/A',
                lider_nome: lideres.find(l => l.id === exp.lider_id)?.nome || 'N/A',
                veiculo_placa: veiculo?.placa,
                
                // AJUSTE 2: Resumir o nome do motorista (Primeiro e Último nome)
                motorista_nome: ((nomeCompleto) => {
                    if (!nomeCompleto) return '-';
                    const partes = nomeCompleto.trim().split(' ');
                    if (partes.length > 1) {
                        return `${partes[0]} ${partes[partes.length - 1]}`; // Primeiro e último nome
                    }
                    return nomeCompleto; // Retorna o nome se for único
                })(motoristas.find(m => m.id === exp.motorista_id)?.nome),
                
                ocupacao: veiculo && veiculo.capacidade_pallets > 0 ? (totalCarga / veiculo.capacidade_pallets) * 100 : 0
            };
        });
        
        populateStatusFilter();
        applyFilters();

        populateRastreioFilters();
    } catch(error) {
        tbody.innerHTML = `<tr><td colspan="12" class="alert alert-error">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}
        
        function populateStatusFilter() {
            const filtroStatus = document.getElementById('filtroStatus');
            const statuses = [...new Set(allExpeditions.map(e => e.status))];
            filtroStatus.innerHTML = '<option value="">Todos</option>';
            statuses.forEach(s => {
                filtroStatus.innerHTML += `<option value="${s}">${getStatusLabel(s)}</option>`;
            });
        }
        
        function applyFilters() {
            const dataInicio = document.getElementById('filtroDataInicio').value;
            const dataFim = document.getElementById('filtroDataFim').value;
            const status = document.getElementById('filtroStatus').value;
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();

            window.filteredExpeditions = allExpeditions.filter(exp => {
                const expDate = new Date(exp.data_hora).toISOString().split('T')[0];
                if (dataInicio && expDate < dataInicio) return false;
                if (dataFim && expDate > dataFim) return false;
                if (status && exp.status !== status) return false;
                if (searchTerm) {
                    const numerosCargaSearch = exp.numeros_carga ? exp.numeros_carga.join(' ') : '';
                    const searchable = [exp.lojas_info, exp.doca_nome, exp.lider_nome, exp.veiculo_placa, exp.motorista_nome, numerosCargaSearch].join(' ').toLowerCase();
                    if (!searchable.includes(searchTerm)) return false;
                }
                return true;
            });

            updateStats(filteredExpeditions);
            updateTimeStats(filteredExpeditions);
            renderAcompanhamentoTable(filteredExpeditions);
        }

        function clearFilters() {
            document.getElementById('filtroDataInicio').value = '';
            document.getElementById('filtroDataFim').value = '';
            document.getElementById('filtroStatus').value = '';
            document.getElementById('searchInput').value = '';
            setDefaultDateFilters();
            applyFilters();
        }

        function setDefaultDateFilters() {
    // Cria um formatador específico para obter ano, mês e dia no fuso de Brasília
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    // Obtém as partes da data atual formatadas para Brasília
    const parts = formatter.formatToParts(new Date());
    let year, month, day;
    parts.forEach(part => {
        if (part.type === 'year') year = part.value;
        if (part.type === 'month') month = part.value;
        if (part.type === 'day') day = part.value;
    });

    // Monta a string no formato YYYY-MM-DD
    const hojeBrasilia = `${year}-${month}-${day}`;

    // --- Aplica aos filtros da aba Acompanhamento ---
    const filtroInicio = document.getElementById('filtroDataInicio');
    const filtroFim = document.getElementById('filtroDataFim');
    if (filtroInicio) filtroInicio.value = hojeBrasilia;
    if (filtroFim) filtroFim.value = hojeBrasilia;


}

        function updateStats(data) {
            document.getElementById('totalExpedicoes').textContent = data.length;
            document.getElementById('pendentesCount').textContent = data.filter(d => d.status === 'pendente' || d.status === 'aguardando_agrupamento').length;
            document.getElementById('emAndamentoCount').textContent = data.filter(d => !['pendente', 'aguardando_agrupamento', 'entregue', 'cancelado'].includes(d.status)).length;
        }

        function updateTimeStats(data) {
            const calcularMedia = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
            const temposAlocacao = data.filter(e => e.data_alocacao_veiculo).map(e => (new Date(e.data_alocacao_veiculo) - new Date(e.data_hora)) / 60000);
            const temposChegada = data.filter(e => e.data_chegada_veiculo).map(e => (new Date(e.data_chegada_veiculo) - new Date(e.data_hora)) / 60000);
            const temposCarregamento = data.filter(e => e.data_chegada_veiculo && e.data_saida_veiculo).map(e => (new Date(e.data_saida_veiculo) - new Date(e.data_chegada_veiculo)) / 60000);
            const temposTotal = data.filter(e => e.data_saida_veiculo).map(e => (new Date(e.data_saida_veiculo) - new Date(e.data_hora)) / 60000);

            document.getElementById('tempoMedioAlocar').textContent = minutesToHHMM(calcularMedia(temposAlocacao));
            document.getElementById('tempoMedioChegada').textContent = minutesToHHMM(calcularMedia(temposChegada));
            document.getElementById('tempoMedioCarregamento').textContent = minutesToHHMM(calcularMedia(temposCarregamento));
            document.getElementById('tempoMedioTotal').textContent = minutesToHHMM(calcularMedia(temposTotal));
        }
        
       // SUBSTITUA A FUNÇÃO renderAcompanhamentoTable (aprox. linha 2970)
function renderAcompanhamentoTable(expeditions) {
    const tbody = document.getElementById('acompanhamentoBody');
    if (expeditions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-8 text-gray-500">Nenhuma expedição encontrada para os filtros selecionados.</td></tr>';
        return;
    }

    tbody.innerHTML = expeditions.map(exp => {
        const ocupacaoPerc = Math.round(exp.ocupacao || 0);
        let barColor = 'progress-green';
        
        if (ocupacaoPerc > 90) barColor = 'progress-orange';
        if (ocupacaoPerc > 100) barColor = 'progress-red';
        
        const tempos = {
            alocar: exp.data_alocacao_veiculo ? minutesToHHMM((new Date(exp.data_alocacao_veiculo) - new Date(exp.data_hora)) / 60000) : '-',
            chegada: exp.data_chegada_veiculo ? minutesToHHMM((new Date(exp.data_chegada_veiculo) - new Date(exp.data_hora)) / 60000) : '-',
            carreg: (exp.data_chegada_veiculo && exp.data_saida_veiculo) ? minutesToHHMM((new Date(exp.data_saida_veiculo) - new Date(exp.data_chegada_veiculo)) / 60000) : '-'
        };
        
        const canEdit = exp.status !== 'saiu_para_entrega' && exp.status !== 'entregue';
        const editButton = canEdit ? 
            `<button class="btn btn-warning btn-small" onclick="openEditModal('${exp.id}')">Editar</button>` :
            `<button class="btn btn-secondary btn-small" disabled title="Não pode editar após saída para entrega">Editar</button>`;
        const deleteButton = canEdit ?
            `<button class="btn btn-danger btn-small" onclick="deleteExpedition('${exp.id}')">Excluir</button>` :
            `<button class="btn btn-secondary btn-small" disabled title="Não pode excluir após saída para entrega">Excluir</button>`;
            
        return `
            <tr class="hover:bg-gray-50 text-sm">
                
                <td>${new Date(exp.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}</td>
                
                <td class="whitespace-normal">
                    ${exp.lojas_info} </td>
                <td>${exp.total_pallets}</td>
                <td>${exp.total_rolltrainers}</td>
                <td>${exp.doca_nome}</td>
                <td><span class="status-badge status-${exp.status}">${getStatusLabel(exp.status)}</span></td>
                <td>${exp.veiculo_placa || '-'}</td>
                <td style="min-width: 120px;">
                    <div class="progress-container"><div class="progress-bar ${barColor}" style="width: ${Math.min(100, ocupacaoPerc)}%;">${ocupacaoPerc}%</div></div>
                </td>
                <td>${exp.motorista_nome || '-'}</td> <td class="text-xs">
                    <div>Aloc: ${tempos.alocar}</div>
                    <div>Cheg: ${tempos.chegada}</div>
                    <div>Carr: ${tempos.carreg}</div>
                </td>
              <td>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-small" onclick="showDetalhesExpedicao('${exp.id}')">Detalhes</button>
                    ${editButton}
                    ${deleteButton}
                </div>
            </td>
            </tr>
        `;
    }).join('');
}
        
        async function loadFrotaData() {
    if (!selectedFilial) {
        document.getElementById('ociosidadeBody').innerHTML = '<tr><td colspan="5" class="alert alert-error">Selecione uma filial primeiro!</td></tr>';
        return;
    }

    const tbody = document.getElementById('ociosidadeBody');
    tbody.innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div>Calculando ociosidade...</td></tr>`;

    try {
        // 1. Definir Período de Análise
        const hoje = new Date();
        const dataInicio = document.getElementById('frotaFiltroDataInicio').value || new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];
        const dataFimInput = document.getElementById('frotaFiltroDataFim').value || hoje.toISOString().split('T')[0];

        const startOfAnalysis = new Date(dataInicio + 'T00:00:00.000Z');
        const endOfAnalysis = new Date(dataFimInput + 'T23:59:59.999Z');

        // 2. Buscar histórico de status relevante
        const startQuery = new Date(startOfAnalysis);
        startQuery.setDate(startQuery.getDate() - 1); // Pega um dia antes para garantir o status inicial
        
        // NOVO: A requisição agora busca o histórico de status de veículos da filial
        const statusHistory = await supabaseRequest(`veiculos_status_historico?created_at=gte.${startQuery.toISOString()}&created_at=lte.${endOfAnalysis.toISOString()}&order=created_at.asc`, 'GET', null, false);

        const ociosidadeData = [];

        // NOVO: Filtrar veículos que NÃO estão em 'manutencao' e pertencem à filial
        const veiculosFiltrados = veiculos.filter(v => v.filial === selectedFilial.nome && v.status !== 'manutencao');

        for (const veiculo of veiculosFiltrados) {
            const veiculoHistory = statusHistory.filter(h => h.veiculo_id === veiculo.id);

            const lastStatusBeforePeriod = veiculoHistory
                .filter(h => new Date(h.created_at) < startOfAnalysis)
                .pop();
            
            let statusAtual = lastStatusBeforePeriod ? lastStatusBeforePeriod.status_novo : (veiculo.status || 'disponivel');
            let ultimoTimestamp = startOfAnalysis;
            let tempoOciosoTotal = 0;
            let inicioOciosidadeAtual = statusAtual === 'disponivel' ? startOfAnalysis : null;

            const historyInPeriod = veiculoHistory.filter(h => new Date(h.created_at) >= startOfAnalysis);
            
            historyInPeriod.forEach(evento => {
                const tempoEvento = new Date(evento.created_at);
                
                if (statusAtual === 'disponivel') {
                    // Soma o tempo ocioso acumulado entre a última ação e este evento
                    tempoOciosoTotal += (tempoEvento - ultimoTimestamp);
                }

                statusAtual = evento.status_novo;
                ultimoTimestamp = tempoEvento;
                
                if (statusAtual === 'disponivel') {
                    if (!inicioOciosidadeAtual) inicioOciosidadeAtual = tempoEvento;
                } else {
                    inicioOciosidadeAtual = null;
                }
            });

            // Considera o tempo ocioso até o momento atual (endOfAnalysis)
            if (statusAtual === 'disponivel') {
                tempoOciosoTotal += (endOfAnalysis - ultimoTimestamp);
            }

            // NOVO CÓDIGO: Calcula o tempo ocioso 'agora'
            let tempoOciosoAtual = 0;
            if (veiculo.status === 'disponivel') {
                // Tenta achar a última mudança para 'disponivel' dentro do período
                const lastIdleChange = veiculoHistory
                    .filter(h => h.status_novo === 'disponivel' && new Date(h.created_at) >= startOfAnalysis)
                    .pop();
                
                // Se achou, calcula o tempo entre o evento e o tempo atual (agora)
                const inicioIdle = lastIdleChange ? new Date(lastIdleChange.created_at) : (inicioOciosidadeAtual || new Date());
                tempoOciosoAtual = (new Date() - inicioIdle) / 60000; // Tempo em minutos até o 'agora'
            }


            ociosidadeData.push({
                placa: veiculo.placa,
                status: veiculo.status,
                idleTime: tempoOciosoTotal / 60000, // Tempo Ocioso Total no Período (em minutos)
                idleSince: veiculo.status === 'disponivel' ? inicioOciosidadeAtual : null, // Início da Ociosidade no Período
                lastAction: ultimoTimestamp, // Último evento de status no período (ou inicio da análise)
                // NOVO: Adiciona o tempo ocioso atual (do status 'disponivel')
                currentIdleTime: tempoOciosoAtual 
            });
        }
        
        const mediaOciosidade = ociosidadeData.length > 0 ? ociosidadeData.reduce((sum, v) => sum + v.idleTime, 0) / ociosidadeData.length : 0;
        document.getElementById('totalOciosidade').textContent = minutesToHHMM(mediaOciosidade);
        document.getElementById('frotaAtiva').textContent = veiculosFiltrados.filter(v => v.status !== 'disponivel' && v.status !== 'folga').length;
        document.getElementById('frotaOciosa').textContent = veiculosFiltrados.filter(v => v.status === 'disponivel').length;
        
        // Ordena pela ociosidade ATUAL (currentIdleTime)
        renderOciosidadeTable(ociosidadeData.sort((a, b) => b.currentIdleTime - a.currentIdleTime));

    } catch (error) {
        console.error('Erro ao carregar dados da frota:', error);
        tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao calcular ociosidade: ${error.message}</td></tr>`;
    }
}
        
        function renderOciosidadeTable(data) {
    const tbody = document.getElementById('ociosidadeBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum veículo ativo (excluindo manutenção) encontrado para o período.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(v => {
        // NOVO: Exibe o tempo ocioso APENAS se o status for 'disponivel'
        const tempoOciosoDisplay = v.status === 'disponivel' && v.currentIdleTime > 0 ? minutesToHHMM(v.currentIdleTime) : '-';
        // A coluna 'Início Ociosidade' é o inicio da contagem atual (se disponível), senão é o tempo total da análise
        const ociosoDesdeDisplay = v.status === 'disponivel' && v.idleSince ? new Date(v.idleSince).toLocaleTimeString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
        // NOVO: A coluna 'Última Ação' agora exibe o último timestamp de mudança de status (mesmo que não seja ocioso)
        const ultimaAcaoDisplay = v.lastAction && new Date(v.lastAction).getTime() > new Date(document.getElementById('frotaFiltroDataInicio').value + 'T00:00:00.000Z').getTime() ? 
            new Date(v.lastAction).toLocaleTimeString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 
            'N/A'; // Não exibe se for o timestamp do início da análise
        
        // Define a cor da linha com base no tempo ocioso atual
        let rowClass = '';
        if (v.status === 'disponivel') {
             if (v.currentIdleTime > 120) rowClass = 'bg-red-100'; // > 2h ocioso
             else if (v.currentIdleTime > 60) rowClass = 'bg-orange-100'; // > 1h ocioso
             else if (v.currentIdleTime > 0) rowClass = 'bg-green-100'; // < 1h ocioso
        }

        return `
            <tr class="hover:bg-gray-50 text-sm ${rowClass}">
                <td class="font-semibold">${v.placa}</td>
                <td><span class="status-badge status-${v.status.replace(/ /g, '_')}">${getStatusLabel(v.status)}</span></td>
                <td>${ociosoDesdeDisplay}</td>
                <td class="font-bold">${tempoOciosoDisplay}</td>
                <td>${ultimaAcaoDisplay}</td>
            </tr>
        `;
    }).join('');
}
// --- FUNCIONALIDADES DO RASTREIO EM TEMPO REAL ---

function populateRastreioFilters() {
    const motoristaFilter = document.getElementById('rastreioFiltroMotorista');
    if (motoristaFilter) {
        motoristaFilter.innerHTML = '<option value="">Todos os Motoristas</option>';
        motoristas.forEach(m => {
            motoristaFilter.innerHTML += `<option value="${m.id}">${m.nome}</option>`;
        });
    }
}

// --- FUNCIONALIDADES DO RASTREIO EM TEMPO REAL ---

// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

// SUBSTITUIR A FUNÇÃO loadRastreioData COMPLETA
// SUBSTITUIR A FUNÇÃO loadRastreioData COMPLETA (aprox. linha 3866)
async function loadRastreioData() {
    try {
        console.log("Iniciando carregamento dos dados de rastreio...");
        // Garante que o status de retorno seja tratado (para Veículos e Motoristas)
        const expeditionsEmRota = await supabaseRequest('expeditions?status=eq.saiu_para_entrega&order=data_saida_entrega.desc');
        const items = await supabaseRequest('expedition_items');
        
        let locations = [];
        if (expeditionsEmRota.length > 0) {
            const expeditionIds = expeditionsEmRota.map(exp => exp.id);
            const query = `gps_tracking?expedition_id=in.(${expeditionIds.join(',')})&order=data_gps.desc`;
            locations = await supabaseRequest(query, 'GET', null, false);
        }

        const promessasRoteamento = expeditionsEmRota.map(async exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const motorista = motoristas.find(m => m.id === exp.motorista_id);
            const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
            const currentLocation = locations.find(loc => loc.expedition_id === exp.id);
            
            if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) {
                return null;
            }

            // Ordenar itens por ordem_entrega primeiro, depois por data_inicio_descarga
            const itemsOrdenados = expItems.sort((a, b) => {
                const aOrdem = a.ordem_entrega || 999;
                const bOrdem = b.ordem_entrega || 999;
                if (aOrdem !== bOrdem) return aOrdem - bOrdem;
                const aInicio = a.data_inicio_descarga ? new Date(a.data_inicio_descarga) : new Date('2099-01-01');
                const bInicio = b.data_inicio_descarga ? new Date(b.data_inicio_descarga) : new Date('2099-01-01');
                return aInicio - bInicio;
            });

            let statusAtual = 'em_transito';
            let proximaLoja = null;
            let lojaAtual = null;
            let progresso = 0;
            let entregasConcluidas = 0;

            for (let i = 0; i < itemsOrdenados.length; i++) {
                const item = itemsOrdenados[i];
                if (item.status_descarga === 'em_descarga') {
                    statusAtual = 'em_descarga';
                    lojaAtual = lojas.find(l => l.id === item.loja_id);
                    progresso = ((i + 0.5) / itemsOrdenados.length) * 100;
                    break;
                } else if (item.status_descarga === 'descarregado') {
                    entregasConcluidas++;
                    progresso = (entregasConcluidas / itemsOrdenados.length) * 100;
                    continue;
                } else {
                    proximaLoja = lojas.find(l => l.id === item.loja_id);
                    progresso = (entregasConcluidas / itemsOrdenados.length) * 100;
                    break;
                }
            }

            if (itemsOrdenados.every(item => item.status_descarga === 'descarregado')) {
                statusAtual = 'retornando';
                progresso = 100;
            }

            const tempoSaida = new Date(exp.data_saida_entrega);
            const tempoDecorrido = (new Date() - tempoSaida) / 60000;
            
            // 🚨 CÁLCULO DE DISTÂNCIA E TEMPO DA ROTA COMPLETA 🚨
            let distanciaTotalKm = 0;
            let tempoTotalRota = 0;
            let eta = new Date();
            
            try {
                // Construir waypoints para a rota completa
                const waypoints = [
                    { lat: selectedFilial.latitude_cd, lng: selectedFilial.longitude_cd }
                ];
                
                itemsOrdenados.forEach(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    if (loja && loja.latitude && loja.longitude) {
                        waypoints.push({ 
                            lat: parseFloat(loja.latitude), 
                            lng: parseFloat(loja.longitude) 
                        });
                    }
                });
                
                // Se há pelo menos 2 pontos, calcular a rota
                if (waypoints.length >= 2) {
                    const rotaCompleta = await getRouteFromAPI(waypoints);
                    
                    if (rotaCompleta) {
                        distanciaTotalKm = rotaCompleta.distance / 1000; // Converter metros para km
                        tempoTotalRota = rotaCompleta.duration / 60; // Converter segundos para minutos
                    } else {
                        // Fallback: calcular distância em linha reta
                        let distanciaEstimada = 0;
                        for (let i = 1; i < waypoints.length; i++) {
                            distanciaEstimada += calculateDistance(
                                waypoints[i-1].lat, waypoints[i-1].lng,
                                waypoints[i].lat, waypoints[i].lng
                            );
                        }
                        distanciaTotalKm = distanciaEstimada / 1000;
                        tempoTotalRota = (distanciaEstimada / 1000) / 40 * 60; // Estimativa a 40km/h
                    }
                }
                
                // Calcular ETA para a próxima loja (se houver)
                if (proximaLoja && proximaLoja.latitude && proximaLoja.longitude) {
                    try {
                        const rotaProximaLoja = await getRouteFromAPI([
                            { lat: parseFloat(currentLocation.latitude), lng: parseFloat(currentLocation.longitude) },
                            { lat: parseFloat(proximaLoja.latitude), lng: parseFloat(proximaLoja.longitude) }
                        ]);
                        
                        if (rotaProximaLoja) {
                            const tempoRestanteMinutos = rotaProximaLoja.duration / 60;
                            eta = new Date(Date.now() + (tempoRestanteMinutos * 60000));
                        } else {
                            // Fallback: estimar baseado em distância reta
                            const distReta = calculateDistance(
                                parseFloat(currentLocation.latitude), parseFloat(currentLocation.longitude),
                                parseFloat(proximaLoja.latitude), parseFloat(proximaLoja.longitude)
                            );
                            const tempoEstimado = (distReta / 1000) / 40 * 60; // 40 km/h
                            eta = new Date(Date.now() + (tempoEstimado * 60000));
                        }
                    } catch (e) {
                        console.warn("Falha ao calcular ETA específico:", e);
                    }
                }
            } catch (error) {
                console.error('Erro ao calcular rota completa:', error);
                // Fallback completo: usar estimativa simples
                let distanciaEstimada = 0;
                const waypoints = [
                    { lat: selectedFilial.latitude_cd, lng: selectedFilial.longitude_cd }
                ];
                
                itemsOrdenados.forEach(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    if (loja && loja.latitude && loja.longitude) {
                        waypoints.push({ 
                            lat: parseFloat(loja.latitude), 
                            lng: parseFloat(loja.longitude) 
                        });
                    }
                });
                
                for (let i = 1; i < waypoints.length; i++) {
                    distanciaEstimada += calculateDistance(
                        waypoints[i-1].lat, waypoints[i-1].lng,
                        waypoints[i].lat, waypoints[i].lng
                    );
                }
                distanciaTotalKm = distanciaEstimada / 1000;
                tempoTotalRota = (distanciaEstimada / 1000) / 40 * 60; // Estimativa a 40km/h
            }
            
            return {
                ...exp,
                items: expItems,
                motorista_nome: motorista?.nome || 'N/A',
                veiculo_placa: veiculo?.placa || 'N/A',
                status_rastreio: statusAtual,
                loja_atual: lojaAtual,
                proxima_loja: proximaLoja,
                progresso_rota: Math.round(progresso),
                tempo_em_rota: Math.round(tempoDecorrido),
                distancia_total_km: distanciaTotalKm, // ✅ VALOR REAL
                tempo_total_rota: tempoTotalRota,     // ✅ VALOR REAL
                coordenadas: {
                    lat: parseFloat(currentLocation.latitude),
                    lng: parseFloat(currentLocation.longitude)
                },
                eta: eta,
                velocidade_media: currentLocation.velocidade || 0,
                entregas_concluidas: entregasConcluidas,
                total_entregas: itemsOrdenados.length,
                last_update: new Date(currentLocation.data_gps),
                accuracy: currentLocation.precisao || 0,
                pontos_proximos: checkProximityToPontosInteresse(currentLocation.latitude, currentLocation.longitude)
            };
        });

        const resultsSettled = await Promise.allSettled(promessasRoteamento);
        const results = resultsSettled
            .filter(p => p.status === 'fulfilled' && p.value !== null)
            .map(p => p.value);
        
        
        const motoristasRetornando = await supabaseRequest('motoristas?status=in.(retornando_cd,retornando_com_imobilizado)');
        const returningMotoristIds = motoristasRetornando.map(m => m.id);

        let returningLocations = [];
        if (returningMotoristIds.length > 0) {
            const query = `gps_tracking?motorista_id=in.(${returningMotoristIds.join(',')})&order=data_gps.desc`;
            returningLocations = await supabaseRequest(query, 'GET', null, false);
        }

        const promessasRetorno = motoristasRetornando.map(async m => {
            const currentLocation = returningLocations.find(loc => loc.motorista_id === m.id);
            
            const lastExpedition = await supabaseRequest(`expeditions?motorista_id=eq.${m.id}&select=veiculo_id&order=data_hora.desc&limit=1`, 'GET', null, false);
            const lastVeiculoId = lastExpedition[0]?.veiculo_id;
            const lastVehicle = lastVeiculoId ? veiculos.find(v => v.id === lastVeiculoId) : null;
            
            if (currentLocation && currentLocation.latitude && currentLocation.longitude) {
                // Calcular distância e tempo de retorno ao CD
                let distanciaTotalKm = 0;
                let tempoEstimadoMinutos = 0;
                let eta = new Date();
                
                try {
                    const rota = await getRouteFromAPI([
                        { lat: parseFloat(currentLocation.latitude), lng: parseFloat(currentLocation.longitude) },
                        { lat: selectedFilial.latitude_cd, lng: selectedFilial.longitude_cd }
                    ]);
                    
                    if (rota) {
                        distanciaTotalKm = rota.distance / 1000;
                        tempoEstimadoMinutos = rota.duration / 60;
                        eta = new Date(Date.now() + (tempoEstimadoMinutos * 60000));
                    } else {
                        // Fallback
                        const distReta = calculateDistance(
                            parseFloat(currentLocation.latitude), parseFloat(currentLocation.longitude),
                            selectedFilial.latitude_cd, selectedFilial.longitude_cd
                        );
                        distanciaTotalKm = distReta / 1000;
                        tempoEstimadoMinutos = (distReta / 1000) / 40 * 60;
                        eta = new Date(Date.now() + (tempoEstimadoMinutos * 60000));
                    }
                } catch (error) {
                    console.warn('Erro ao calcular rota de retorno, usando estimativa:', error);
                    const distReta = calculateDistance(
                        parseFloat(currentLocation.latitude), parseFloat(currentLocation.longitude),
                        selectedFilial.latitude_cd, selectedFilial.longitude_cd
                    );
                    distanciaTotalKm = distReta / 1000;
                    tempoEstimadoMinutos = (distReta / 1000) / 40 * 60;
                    eta = new Date(Date.now() + (tempoEstimadoMinutos * 60000));
                }
                
                return {
                    id: `return-${m.id}`,
                    expedition_id: null,
                    motorista_id: m.id,
                    motorista_nome: m.nome,
                    veiculo_placa: lastVehicle?.placa || 'N/A', 
                    status_rastreio: 'retornando',
                    distancia_total_km: distanciaTotalKm,
                    tempo_total_rota: tempoEstimadoMinutos,
                    tempo_em_rota: 0, 
                    entregas_concluidas: 0,
                    total_entregas: 0,
                    items: [],
                    progresso_rota: 100,
                    loja_atual: null,
                    proxima_loja: null,
                    coordenadas: {
                        lat: parseFloat(currentLocation.latitude),
                        lng: parseFloat(currentLocation.longitude)
                    },
                    eta: eta,
                    last_update: new Date(currentLocation.data_gps),
                    velocidade_media: currentLocation.velocidade || 0,
                    pontos_proximos: checkProximityToPontosInteresse(currentLocation.latitude, currentLocation.longitude)
                };
            }
            return null;
        });

        const returningResultsSettled = await Promise.allSettled(promessasRetorno);
        const returningResults = returningResultsSettled
            .filter(p => p.status === 'fulfilled' && p.value !== null)
            .map(p => p.value);
            
        window.rastreioData = results;
        rastreioData.push(...returningResults);
        
        window.rastreioData = rastreioData.filter(Boolean);
        
        updateRastreioStats();
        applyRastreioFilters();
        updateLastRefreshTime();

    } catch (error) {
        console.error('ERRO GERAL: Falha no loadRastreioData:', error);
        document.getElementById('rastreioList').innerHTML = `<div class="alert alert-error">Erro ao carregar dados de rastreio. Verifique o servidor.</div>`;
    }
}
function updateRastreioStats() {
    const veiculosEmRota = rastreioData.length;
    const entregasAndamento = rastreioData.filter(r => r.status_rastreio === 'em_descarga').length;
    const proximasEntregas = rastreioData.reduce((sum, r) => sum + (r.total_entregas - r.entregas_concluidas), 0);
    const tempoMedioRota = rastreioData.length > 0 ? 
        rastreioData.reduce((sum, r) => sum + r.tempo_em_rota, 0) / rastreioData.length : 0;
    
    document.getElementById('veiculosEmRota').textContent = veiculosEmRota;
    document.getElementById('entregasAndamento').textContent = entregasAndamento;
    document.getElementById('proximasEntregas').textContent = proximasEntregas;
    document.getElementById('tempoMedioRota').textContent = minutesToHHMM(tempoMedioRota);
}

function applyRastreioFilters() {
    const motoristaFilter = document.getElementById('rastreioFiltroMotorista')?.value;
    const statusFilter = document.getElementById('rastreioFiltroStatus')?.value;
    
    let filteredData = rastreioData;
    
    if (motoristaFilter) {
        filteredData = filteredData.filter(r => r.motorista_id === motoristaFilter);
    }
    
    if (statusFilter) {
        if (statusFilter === 'saiu_para_entrega') {
            filteredData = filteredData.filter(r => r.status_rastreio === 'em_transito');
        } else if (statusFilter === 'em_descarga') {
            filteredData = filteredData.filter(r => r.status_rastreio === 'em_descarga');
        } else if (statusFilter === 'retornando') {
            filteredData = filteredData.filter(r => r.status_rastreio === 'retornando');
        }
    }
    
    console.log('Dados filtrados para exibição:', filteredData.length); // DEBUG
    renderRastreioList(filteredData);
}

// SUBSTITUIR A FUNÇÃO renderRastreioList COMPLETA (Aprox. linha 3901)
function renderRastreioList(data) {
    const container = document.getElementById('rastreioList');
    
    // Filtra explicitamente qualquer nulo ou undefined que possa ter entrado
    const safeData = data.filter(Boolean); 
    
    if (safeData.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum veículo em rota no momento.</div>';
        return;
    }
    
    container.innerHTML = safeData.map(rastreio => { 
        let statusInfo = '';
        let locationInfo = '';
        let nextActionInfo = '';
        
        // 🚨 NOVO CÓDIGO: Verifica se o status é de retorno para desabilitar o botão de trajeto 🚨
        const isReturning = rastreio.status_rastreio === 'retornando';
        const trajectoryButton = isReturning ?
            `<button class="btn btn-secondary btn-small" disabled title="Trajeto de retorno não disponível">Ver Trajeto</button>` :
            `<button class="btn btn-warning btn-small" onclick="showTrajectoryMap('${rastreio.id}', '${rastreio.veiculo_placa}')">Ver Trajeto</button>`;


        if (rastreio.status_rastreio === 'em_transito') {
            statusInfo = `<div class="flex items-center gap-2 text-blue-600"><div class="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div><span class="font-semibold">Em Trânsito</span></div>`;
            locationInfo = `<div class="text-sm text-gray-600">Próxima parada: <strong>${rastreio.proxima_loja?.nome || 'N/A'}</strong></div>`;
            nextActionInfo = `<div class="text-xs text-gray-500">ETA: ${rastreio.eta.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</div>`;
        } else if (rastreio.status_rastreio === 'em_descarga') {
            statusInfo = `<div class="flex items-center gap-2 text-orange-600"><div class="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div><span class="font-semibold">Descarregando</span></div>`;
            locationInfo = `<div class="text-sm text-gray-600">Local atual: <strong>${rastreio.loja_atual?.nome || 'N/A'}</strong></div>`;
            
            const item = rastreio.items.find(i => i.status_descarga === 'em_descarga');
            if (item && item.data_inicio_descarga) {
                const tempoDescarga = Math.round((new Date() - new Date(item.data_inicio_descarga)) / 60000);
                nextActionInfo = `<div class="text-xs text-gray-500">Tempo de descarga: ${minutesToHHMM(tempoDescarga)}</div>`;
            }
        } else if (rastreio.status_rastreio === 'retornando') {
            statusInfo = `<div class="flex items-center gap-2 text-green-600"><div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div><span class="font-semibold">Retornando ao CD</span></div>`;
            locationInfo = `<div class="text-sm text-gray-600">Todas as entregas concluídas</div>`;
            nextActionInfo = `<div class="text-xs text-gray-500">ETA CD: ${rastreio.eta.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</div>`;
        }
        
        // Calcular tempo desde a última atualização
        const tempoUltimaAtualizacao = rastreio.last_update ? 
            Math.round((new Date() - rastreio.last_update) / 60000) : null;

        // Informações de proximidade
        let proximityInfo = '';
        if (rastreio.pontos_proximos && Array.isArray(rastreio.pontos_proximos) && rastreio.pontos_proximos.length > 0) {
            proximityInfo = `
                <div class="proximity-alert">
                    <div class="text-sm font-medium">
                        <span class="proximity-icon">📍</span>Pontos Próximos:
                    </div>
                    ${rastreio.pontos_proximos.map(p => {
                        let icon = '';
                        if (p.ponto.tipo === 'CD') icon = '🏭';
                        else if (p.ponto.tipo === 'LOJA') icon = '🏪';
                        else if (p.ponto.tipo === 'POSTO') icon = '⛽';
                        else if (p.ponto.tipo === 'CASA') icon = '🏠';
                        else icon = '📍';
                        
                        return `<div class="text-xs mt-1">${icon} ${p.ponto.nome} - ${p.distancia}m</div>`;
                    }).join('')}
                </div>
            `;
        }

        return `
            <div class="bg-white rounded-lg shadow-md p-6 border-l-4 ${rastreio.status_rastreio === 'em_transito' ? 'border-blue-500' : rastreio.status_rastreio === 'em_descarga' ? 'border-orange-500' : 'border-green-500'}">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">${rastreio.veiculo_placa} - ${rastreio.motorista_nome}</h3>
                        <p class="text-sm text-gray-500">Saiu às ${new Date(rastreio.data_saida_entrega).toLocaleTimeString('pt-BR')}</p>
                        ${tempoUltimaAtualizacao !== null ? `<p class="text-xs text-gray-400">Última localização: ${tempoUltimaAtualizacao < 1 ? 'agora' : tempoUltimaAtualizacao + 'min atrás'}</p>` : ''}
                    </div>
                    <div class="text-right">
                        ${statusInfo}
                        <div class="text-xs text-gray-500 mt-1">Velocidade: ${rastreio.velocidade_media} km/h</div>
                        ${rastreio.accuracy > 0 ? `<div class="text-xs text-gray-400">Precisão: ${rastreio.accuracy}m</div>` : ''}
                    </div>
                </div>

${proximityInfo}

<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
    <div class="text-center">
        <div class="text-2xl font-bold text-blue-600">${rastreio.entregas_concluidas}</div>
        <div class="text-xs text-gray-500">Entregas Feitas</div>
    </div>
    <div class="text-center">
        <div class="text-2xl font-bold text-orange-600">${rastreio.total_entregas - rastreio.entregas_concluidas}</div>
        <div class="text-xs text-gray-500">Restantes</div>
    </div>
    <div class="text-center">
        <div class="text-2xl font-bold text-green-600">${(rastreio.distancia_total_km || 0).toFixed(1)}</div>
        <div class="text-xs text-gray-500">KM da Rota</div>
    </div>
    <div class="text-center">
        <div class="text-2xl font-bold text-purple-600">${minutesToHHMM(rastreio.tempo_total_rota || 0)}</div>
        <div class="text-xs text-gray-500">Tempo Total Rota</div>
    </div>
</div>
                
                <div class="mb-4">
                    <div class="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progresso da Rota</span>
                        <span>${rastreio.progresso_rota}%</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar ${rastreio.progresso_rota === 100 ? 'progress-green' : rastreio.progresso_rota > 50 ? 'progress-orange' : 'progress-red'}" 
                             style="width: ${rastreio.progresso_rota}%;">
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        ${locationInfo}
                        ${nextActionInfo}
                    </div>
                    <div class="text-right">
                        <div class="text-xs text-gray-500">Posição GPS</div>
                        <div class="text-sm font-mono text-gray-600">${rastreio.coordenadas.lat.toFixed(6)}, ${rastreio.coordenadas.lng.toFixed(6)}</div>
                        <div class="flex gap-2 mt-2">
    <button class="btn btn-primary btn-small" onclick="showLocationMap('${rastreio.id}', ${rastreio.coordenadas.lat}, ${rastreio.coordenadas.lng}, '${rastreio.veiculo_placa}')">
        Ver no Mapa
    </button>
    <button class="btn btn-success btn-small" onclick="showAllVehiclesMap()">
        Mapa Geral
    </button>
    ${trajectoryButton}
</div>
                    </div>
                </div>
                
                <div class="mt-4 pt-4 border-t border-gray-200">
                    <h4 class="font-semibold text-gray-700 mb-2">Roteiro de Entregas</h4>
                    <div class="space-y-1">
                        ${rastreio.items.map((item, index) => {
                            const loja = lojas.find(l => l.id === item.loja_id);
                            let iconStatus = '';
                            if (item.status_descarga === 'descarregado') iconStatus = '✅';
                            else if (item.status_descarga === 'em_descarga') iconStatus = '🚚';
                            else iconStatus = '⏳';
                            
                            
return `<div class="flex items-center text-sm ...">
    <span class="mr-2">${iconStatus}</span>
    <span>${index + 1}. ${loja?.codigo || 'N/A'} - ${loja?.nome || 'N/A'}</span>
    ${item.data_fim_descarga ? `<span class="ml-auto text-xs">${new Date(item.data_fim_descarga).toLocaleTimeString('pt-BR')}</span>` : ''}
</div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function showLocationMap(expeditionId, lat, lng) {
    // Em uma implementação real, isso abriria um mapa (Google Maps, OpenStreetMap, etc.)
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15`;
    window.open(mapUrl, '_blank');
}

function toggleAutoRefresh() {
    const autoRefresh = document.getElementById('autoRefreshRastreio').checked;
    
    if (autoRefresh) {
        // Atualizar a cada 15 segundos para dados em tempo real
        window.rastreioTimer = setInterval(() => {
            loadRastreioData();
        }, 15000);
        showNotification('Auto-refresh ativado (15s)', 'success');
    } else {
        if (rastreioTimer) {
            clearInterval(rastreioTimer);
            window.rastreioTimer = null;
        }
        showNotification('Auto-refresh desativado', 'info');
    }
}

function updateLastRefreshTime() {
    const now = new Date();
    document.getElementById('lastUpdateRastreio').textContent = 
        `Última atualização: ${now.toLocaleTimeString('pt-BR')}`;
}

// Expor funções para o escopo global (para o HTML e outros módulos não modernizados)
window.loadAcompanhamento = loadAcompanhamento;
window.populateStatusFilter = populateStatusFilter;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.setDefaultDateFilters = setDefaultDateFilters;
window.updateStats = updateStats;
window.updateTimeStats = updateTimeStats;
window.renderAcompanhamentoTable = renderAcompanhamentoTable;
window.loadFrotaData = loadFrotaData;
window.renderOciosidadeTable = renderOciosidadeTable;
window.populateRastreioFilters = populateRastreioFilters;
window.loadRastreioData = loadRastreioData;
window.updateRastreioStats = updateRastreioStats;
window.applyRastreioFilters = applyRastreioFilters;
window.renderRastreioList = renderRastreioList;
window.showLocationMap = showLocationMap;
window.toggleAutoRefresh = toggleAutoRefresh;
window.updateLastRefreshTime = updateLastRefreshTime;
