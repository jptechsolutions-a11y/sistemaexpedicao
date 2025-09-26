 // --- INÍCIO DO SCRIPT ADAPTADO ---
        Chart.register(ChartDataLabels);
        // API REST do Supabase e Headers (do sistema original)
        const SUPABASE_URL = 'https://owsoweqqttcmuuaohxke.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c293ZXFxdHRjbXV1YW9oeGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMjQ5OTAsImV4cCI6MjA3MTgwMDk5MH0.Iee27SUOIkhMFvgDWXrW3C38DUuMr0MyVtR-NjF6FRk';
        const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };

        // Variáveis globais (do sistema original)
        let lojas = [], docas = [], lideres = [], veiculos = [], motoristas = [], filiais = [];
        let selectedFilial = null;
        let currentUser = null; // Para controle de acesso
        let cargasDisponiveis = [];
        let allExpeditions = [], filteredExpeditions = [];
        let allHistorico = [], filteredHistorico = [];
        let chartInstances = {};
        let html5QrCodeScanner = null;
        let scannerIsRunning = false;
        let activeTimers = {};
        let modalState = { action: null, scannedValue: null, mainId: null, secondaryId: null, expectedCode: null };
        let editLojaLineCounter = 0;
        let rastreioTimer = null;
let rastreioData = [];
let pontosInteresse = []; // Pontos fixos no mapa
let homeMapInstance = null;
let homeMapTimer = null;
// Variáveis e lógicas de permissão (ADICIONADO)
let userPermissions = [];
let masterUserPermission = false;

function hasPermission(permission) {
    // Se for usuário master, sempre retorna true.
    if (masterUserPermission) {
        return true;
    }
    // Caso contrário, verifica se a permissão existe no array do usuário.
    return userPermissions.includes(permission);
}
        // Função de requisição ao Supabase (do sistema original, adaptada)
        async function supabaseRequest(endpoint, method = 'GET', data = null, includeFilialFilter = true) {
            let url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
            if (includeFilialFilter && selectedFilial && method === 'GET') {
                const separator = url.includes('?') ? '&' : '?';
                url += `${separator}filial=eq.${selectedFilial.nome}`;
            }
            const options = { method, headers: { ...headers } };
            
            if (data && (method === 'POST' || method === 'PATCH')) {
                if (includeFilialFilter && selectedFilial) {
                    if (Array.isArray(data)) {
                        data = data.map(item => ({ ...item, filial: selectedFilial.nome }));
                    } else {
                        data = { ...data, filial: selectedFilial.nome };
                    }
                }
                options.body = JSON.stringify(data);
                if (method !== 'DELETE') {
                    options.headers.Prefer = 'return=representation';
                }
            }
            
            try {
                const response = await fetch(url, options);
                if (!response.ok) throw new Error(`Erro ${response.status}: ${await response.text()}`);
                return method === 'DELETE' ? null : await response.json();
            } catch (error) {
                console.error(`Falha na requisição: ${method} ${url}`, error);
                showNotification(`Erro de comunicação com o servidor: ${error.message}`, 'error');
                throw error;
            }
        }

        // NOVO: Função de notificação aprimorada
        function showNotification(message, type = 'info', timeout = 4000) {
            const container = document.getElementById('notificationContainer');
            if (!container) return;

            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            let icon = '';
            let title = '';
            if (type === 'success') {
                icon = '<i data-feather="check-circle" class="h-5 w-5 mr-2"></i>';
                title = 'Sucesso!';
            } else if (type === 'error') {
                icon = '<i data-feather="x-circle" class="h-5 w-5 mr-2"></i>';
                title = 'Erro!';
            } else if (type === 'info') {
                icon = '<i data-feather="info" class="h-5 w-5 mr-2"></i>';
                title = 'Informação';
            }
            
            notification.innerHTML = `
                <div class="notification-header">
                    ${icon}
                    <span>${title}</span>
                </div>
                <div class="notification-body">${message}</div>
            `;
            
            container.appendChild(notification);
            feather.replace();

            setTimeout(() => {
                notification.classList.add('hide');
                notification.addEventListener('animationend', () => notification.remove());
            }, timeout);
        }

       // NOVA FUNÇÃO de navegação (SUBSTITUÍDA)
function showView(viewId, element) {
    // Verificar permissão
    const permission = element.dataset.permission;
    if (permission && !hasPermission(permission)) {
        showNotification('Você não tem permissão para acessar esta aba.', 'error');
        return;
    }

    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if(element) element.classList.add('active');

   // Limpa timers antigos ao trocar de view para não sobrecarregar
Object.values(activeTimers).forEach(clearInterval);
activeTimers = {};

// Limpa timer específico do rastreio
if (rastreioTimer) {
    clearInterval(rastreioTimer);
    rastreioTimer = null;
}

// Limpa timer específico do mapa da home
if (homeMapTimer) {
    clearInterval(homeMapTimer);
    homeMapTimer = null;
}

    // Carrega os dados da view selecionada
    switch(viewId) {
        case 'home': loadHomeData(); break;
        case 'transporte': loadTransportList(); break;
        case 'faturamento': loadFaturamento(); break;
        case 'motoristas': loadMotoristaTab(); break;
        case 'acompanhamento': loadAcompanhamento(); break;
        case 'historico': loadHistorico(); break;
        case 'configuracoes': loadConfiguracoes(); break;
        case 'operacao': loadOperacao(); break;
    }
    feather.replace(); // Redesenha os ícones
}
        // Carregar filiais (do sistema original)
        async function loadFiliais() {
            try {
                const filiaisData = await supabaseRequest('filiais?select=nome,descricao,ativo&ativo=eq.true&order=nome', 'GET', null, false);
                const grid = document.getElementById('filiaisGrid');
                grid.innerHTML = '';
                filiaisData.forEach(filial => {
                    const card = document.createElement('div');
                    card.className = 'filial-card';
                    card.onclick = () => selectFilial(filial);
                    card.innerHTML = `<h3>${filial.nome}</h3><p>${filial.descricao || 'Descrição não informada'}</p>`;
                    grid.appendChild(card);
                });
                filiais = filiaisData;
            } catch (error) {
                document.getElementById('filiaisGrid').innerHTML = `<p class="text-red-500">Erro ao carregar filiais.</p>`;
            }
        }

     // Remova a lógica de exibição de telas daqui
async function selectFilial(filial) {
    // Verificar se o usuário tem permissão para a filial
    if (!hasPermission(`acesso_filial_${filial.nome}`)) {
        showNotification('Você não tem permissão para acessar esta filial.', 'error');
        return;
    }

    try {
        const fullFilialData = await supabaseRequest(`filiais?nome=eq.${filial.nome}`, 'GET', null, false);
        selectedFilial = fullFilialData[0];
    } catch (error) {
        showNotification('Erro ao carregar dados da filial. Verifique as configurações.', 'error');
        return;
    }
    
    document.getElementById('sidebarFilial').textContent = selectedFilial.nome;
    
    // NOVO: Chama a função que gerencia a transição de telas
    await showMainSystem();
    
    await loadAllTabData();
    await loadPontosInteresse();
    showView('home', document.querySelector('.nav-item'));
    setTimeout(() => {
        const homeAutoRefreshCheckbox = document.getElementById('homeAutoRefresh');
        if (homeAutoRefreshCheckbox) {
            homeAutoRefreshCheckbox.checked = true;
            toggleHomeAutoRefresh();
        }
    }, 2000);
    showNotification(`Bem-vindo à filial: ${selectedFilial.nome}!`, 'success');
}
        
        // NOVO: Carrega o conteúdo das abas originais para as divs de view
        async function loadAllTabData() {
            
            document.getElementById('operacao').innerHTML = `
    <h1 class="text-3xl font-bold text-gray-800 mb-6">Operação</h1>
    
    <div class="sub-tabs">
        <button class="sub-tab active" onclick="showSubTab('operacao', 'lancamento', this)">Lançamento</button>
        <button class="sub-tab" onclick="showSubTab('operacao', 'identificacao', this)">Identificação</button>
    </div>

    <div id="lancamento" class="sub-tab-content active">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Lançamento de Expedição</h2>
        <div class="bg-white p-6 rounded-lg shadow-md max-w-4xl mx-auto">
            <p class="text-sm text-gray-500 mb-4">A data e hora da expedição serão registradas automaticamente no momento do lançamento.</p>
            <form id="expeditionForm">
              <div class="form-grid">
                <div class="form-group">
                    <label for="lancar_lojaSelect">Loja:</label>
                    <select id="lancar_lojaSelect" class="loja-select" required></select>
                </div>
                <div class="form-group">
                    <label for="lancar_docaSelect">Doca de Preparação:</label>
                    <select id="lancar_docaSelect" required></select>
                </div>
                <div class="form-group">
                    <label for="lancar_palletsInput">Pallets:</label>
                    <input type="number" id="lancar_palletsInput" class="pallets-input" min="0" required placeholder="0">
                </div>
                <div class="form-group">
                    <label for="lancar_rolltrainersInput">RollTainers:</label>
                    <input type="number" id="lancar_rolltrainersInput" class="rolltrainers-input" min="0" required placeholder="0">
                </div>
                <div class="form-group md:col-span-2">
                    <label for="lancar_numerosCarga">Números de Carga (separados por vírgula):</label>
                    <input type="text" id="lancar_numerosCarga" placeholder="Ex: CG001, CG002, CG003" class="w-full">
                    <small class="text-gray-500">Deixe em branco se não houver números específicos</small>
                </div>
                <div class="form-group md:col-span-2">
                     <label for="lancar_liderSelect">Líder Responsável:</label>
                     <select id="lancar_liderSelect" required></select>
                </div>
                <div class="form-group md:col-span-2">
                    <label for="lancar_observacoes">Observações:</label>
                    <textarea id="lancar_observacoes" placeholder="Observações para esta carga específica..." class="w-full"></textarea>
                </div>
            </div>
            <div class="mt-6 text-center">
                <button type="submit" class="btn btn-primary w-full md:w-auto">Lançar Expedição</button>
            </div>
            </form>
            <div id="operacaoAlert" class="mt-4"></div>
        </div>
    </div>

    <div id="identificacao" class="sub-tab-content">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Impressão de Identificação</h2>
        <div class="bg-white p-6 rounded-lg shadow-md">
            <p class="text-sm text-gray-500 mb-4">Expedições aguardando impressão de etiquetas de identificação</p>
            <div id="expedicoesParaIdentificacao" class="loading">
                <div class="spinner"></div>
                Carregando expedições...
            </div>
        </div>
    </div>
`;
            
            document.getElementById('transporte').innerHTML = `
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Agrupamento e Alocação de Cargas</h1>
                <div id="availabilityInfo" class="availability-info" style="max-width: 600px; margin: 0 auto 2rem auto;">
                    <div class="availability-stat">
                        <div class="stat-number" id="availableVehicles">0</div>
                        <div class="stat-label">Veículos Disponíveis</div>
                    </div>
                    <div class="availability-stat">
                        <div class="stat-number" id="availableDrivers">0</div>
                        <div class="stat-label">Motoristas Disponíveis</div>
                    </div>
                </div>
                
                <div class="transport-card mb-6">
                    <h3 class="text-xl font-semibold text-gray-800 mb-4">Cargas Disponíveis para Agrupamento</h3>
                    <div id="cargasDisponiveisList" class="loading">
                        <div class="spinner"></div>
                        Carregando cargas...
                    </div>
                </div>
                
                <div class="transport-card">
                    <h3 class="text-xl font-semibold text-gray-800 mb-4">Montar Expedição</h3>
                    <div class="stats-grid mb-6">
                        <div class="stat-card" style="background: var(--secondary-gradient);"><div class="stat-number" id="summaryLojas">0</div><div class="stat-label">Lojas</div></div>
                        <div class="stat-card"><div class="stat-number" id="summaryPallets">0</div><div class="stat-label">Pallets</div></div>
                        <div class="stat-card" style="background: var(--accent-gradient);"><div class="stat-number" id="summaryRolls">0</div><div class="stat-label">RollTrainers</div></div>
                        <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);"><div class="stat-number" id="summaryCargaTotal">0</div><div class="stat-label">Carga Total</div></div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="alocar_veiculoSelect">Selecione o Veículo:</label>
                            <select id="alocar_veiculoSelect" required class="w-full"></select>
                        </div>
                        <div class="form-group">
                            <label for="alocar_motoristaSelect">Selecione o Motorista:</label>
                            <select id="alocar_motoristaSelect" required class="w-full"></select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="alocar_observacoes">Observações da Expedição:</label>
                        <textarea id="alocar_observacoes" placeholder="Observações gerais para a viagem..." class="w-full"></textarea>
                    </div>
                    <div class="text-center mt-6">
                        <button class="btn btn-primary w-full md:w-auto" onclick="agruparEAlocar()">Agrupar e Alocar Transporte</button>
                    </div>
                </div>
            `;
            
            document.getElementById('faturamento').innerHTML = `
    <h1 class="text-3xl font-bold text-gray-800 mb-6">Controle de Faturamento</h1>
    
    <div class="sub-tabs">
        <button class="sub-tab active" onclick="showSubTab('faturamento', 'faturamentoAtivo', this)">Faturamento Ativo</button>
        <button class="sub-tab" onclick="showSubTab('faturamento', 'historicoFaturamento', this)">Histórico de Faturamento</button>
    </div>

    <div id="faturamentoAtivo" class="sub-tab-content active">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number" id="totalCarregadas">0</div>
                <div class="stat-label">Aguardando Faturamento</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);">
                <div class="stat-number" id="emFaturamento">0</div>
                <div class="stat-label">Em Faturamento</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #00D4AA, #00B4D8);">
                <div class="stat-number" id="faturadas">0</div>
                <div class="stat-label">Faturadas</div>
            </div>
        </div>

        <div class="time-stats-grid max-w-xs mx-auto">
            <div class="time-stat-card">
                <div class="stat-number" id="tempoMedioFaturamento">-</div>
                <div class="stat-label">Tempo Médio<br>Faturamento (HH:mm)</div>
            </div>
        </div>

        <div id="faturamentoList" class="loading">
            <div class="spinner"></div>
            Carregando expedições...
        </div>
    </div>

    <div id="historicoFaturamento" class="sub-tab-content">
        <div class="filters-section">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">Filtros de Pesquisa</h3>
            <div class="filters-grid">
                <div class="form-group">
                    <label for="historicoFaturamentoDataInicio">Data Início:</label>
                    <input type="date" id="historicoFaturamentoDataInicio" onchange="loadHistoricoFaturamento()">
                </div>
                <div class="form-group">
                    <label for="historicoFaturamentoDataFim">Data Fim:</label>
                    <input type="date" id="historicoFaturamentoDataFim" onchange="loadHistoricoFaturamento()">
                </div>
                <div class="form-group">
                    <label for="historicoFaturamentoSearch">Pesquisar:</label>
                    <input type="text" id="historicoFaturamentoSearch" placeholder="Buscar por placa, loja..." onkeyup="loadHistoricoFaturamento()">
                </div>
            </div>
            <div class="text-right mt-4">
                <button class="btn btn-primary btn-small" onclick="clearHistoricoFaturamentoFilters()">Limpar Filtros</button>
            </div>
        </div>

        <div class="stats-grid mb-6">
            <div class="stat-card">
                <div class="stat-number" id="historicoTotalFaturadas">0</div>
                <div class="stat-label">Total Faturadas</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);">
                <div class="stat-number" id="historicoTempoMedio">00:00</div>
                <div class="stat-label">Tempo Médio Faturamento</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);">
                <div class="stat-number" id="historicoMenorTempo">00:00</div>
                <div class="stat-label">Menor Tempo</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #D62828, #F77F00);">
                <div class="stat-number" id="historicoMaiorTempo">00:00</div>
                <div class="stat-label">Maior Tempo</div>
            </div>
        </div>

        <div class="table-container bg-white rounded-lg shadow-md">
<table class="w-full" style="min-width: 1100px;">
    <thead>
        <tr>
            <th>Data</th>
            <th>Placa</th>
            <th>Motorista</th>
            <th>Lojas/Cargas</th>
            <th>Início Faturamento</th>
            <th>Fim Faturamento</th>
            <th>Tempo Faturamento</th>
            <th>Pallets</th>
            <th>RollTrainers</th>
            <th>Ações</th>
        </tr>
    </thead>
    <tbody id="historicoFaturamentoBody">
        <tr><td colspan="10" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>
    </tbody>
                <tbody id="historicoFaturamentoBody">
                    <tr><td colspan="9" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
`;

            document.getElementById('motoristas').innerHTML = `
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Painel de Motoristas</h1>
                <div class="sub-tabs">
                    <button class="sub-tab active" onclick="showSubTab('motoristas', 'statusFrota', this)">Status da Frota</button>
                    <button class="sub-tab" onclick="showSubTab('motoristas', 'relatorioMotoristas', this)">Relatório</button>
                </div>

                <div id="statusFrota" class="sub-tab-content active">
                    <div class="transport-card mb-6">
                        <h3 class="text-xl font-semibold text-gray-800 mb-4">Consulta por Placa</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="placaMotorista">Placa do Veículo:</label>
                                <select id="placaMotorista" class="w-full">
                                    <option value="">Selecione a placa</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <button class="btn btn-primary w-full" onclick="consultarExpedicoesPorPlaca()">Consultar Expedições</button>
                            </div>
                        </div>
                        <div id="resultadosMotorista" class="mt-4"></div>
                    </div>
                    
                     <div id="motoristasStatusList">
                         <div class="loading"><div class="spinner"></div>Carregando status...</div>
                    </div>
                </div>
               
                <div id="relatorioMotoristas" class="sub-tab-content">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4 text-center">Relatório de Desempenho dos Motoristas</h2>
                    <div class="filters-section">
                        <div class="filters-grid">
                            <div class="form-group">
                                <label for="relatorioMotoristaDataInicio">Data Início:</label>
                                <input type="date" id="relatorioMotoristaDataInicio" onchange="generateMotoristaReports()">
                            </div>
                            <div class="form-group">
                                <label for="relatorioMotoristaDataFim">Data Fim:</label>
                                <input type="date" id="relatorioMotoristaDataFim" onchange="generateMotoristaReports()">
                            </div>
                        </div>
                    </div>
                    <div id="motoristaReportSummary" class="stats-grid" style="display:none;"></div>
                    <div class="bg-white p-4 rounded-lg shadow-md mt-8">
                         <h3 class="text-lg font-semibold text-center mb-4">Ranking de Motoristas por Entregas</h3>
                        <canvas id="motoristasRankingChart"></canvas>
                    </div>
                    <div id="motoristaTableContainer" class="table-container bg-white rounded-lg shadow-md mt-8"></div>
                </div>
            `;

            document.getElementById('acompanhamento').innerHTML = `
                 <h1 class="text-3xl font-bold text-gray-800 mb-6">Acompanhamento de Tempos</h1>
               <div class="sub-tabs">
    <button class="sub-tab active" onclick="showSubTab('acompanhamento', 'expedicoesEmAndamento', this)">Expedições</button>
    <button class="sub-tab" onclick="showSubTab('acompanhamento', 'rastreio', this)">Rastreio</button>
    <button class="sub-tab" onclick="showSubTab('acompanhamento', 'frota', this)">Frota</button>
</div>

                <div id="expedicoesEmAndamento" class="sub-tab-content active">
                    <div class="stats-grid">
                        <div class="stat-card"><div class="stat-number" id="totalExpedicoes">0</div><div class="stat-label">Total</div></div>
                        <div class="stat-card" style="background: linear-gradient(135deg, #D62828, #F77F00);"><div class="stat-number" id="pendentesCount">0</div><div class="stat-label">Pendentes</div></div>
                        <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);"><div class="stat-number" id="emAndamentoCount">0</div><div class="stat-label">Em Andamento</div></div>
                    </div>

                    <div class="time-stats-grid">
                        <div class="time-stat-card"><div class="stat-number" id="tempoMedioAlocar">-</div><div class="stat-label">T.M. Alocar Placa</div></div>
                        <div class="time-stat-card"><div class="stat-number" id="tempoMedioChegada">-</div><div class="stat-label">T.M. Chegada Doca</div></div>
                        <div class="time-stat-card"><div class="stat-number" id="tempoMedioCarregamento">-</div><div class="stat-label">T.M. Carregamento</div></div>
                        <div class="time-stat-card"><div class="stat-number" id="tempoMedioTotal">-</div><div class="stat-label">T.M. Total Pátio</div></div>
                    </div>

                    <div class="filters-section">
                        <div class="filters-grid">
                            <div class="form-group"><label for="filtroDataInicio">Data Início:</label><input type="date" id="filtroDataInicio" onchange="applyFilters()"></div>
                            <div class="form-group"><label for="filtroDataFim">Data Fim:</label><input type="date" id="filtroDataFim" onchange="applyFilters()"></div>
                            <div class="form-group"><label for="filtroStatus">Status:</label><select id="filtroStatus" onchange="applyFilters()"><option value="">Todos</option></select></div>
                            <div class="form-group"><label for="searchInput">Pesquisar:</label><input type="text" id="searchInput" placeholder="Loja, doca, líder..." onkeyup="applyFilters()"></div>
                        </div>
                        <div class="text-right mt-4"><button class="btn btn-primary btn-small" onclick="clearFilters()">Limpar Filtros</button></div>
                    </div>

                    <div class="table-container bg-white rounded-lg shadow-md mt-6">
                        <table class="w-full" style="min-width: 1200px;">
                            <thead>
                                <tr>
                                    <th>Data/Hora</th><th>Lojas/Cargas</th><th>Pallets</th><th>Rolls</th><th>Doca</th><th>Líder</th>
                                    <th>Status</th><th>Veículo</th><th>Ocupação</th><th>Motorista</th><th>Tempos</th><th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="acompanhamentoBody"></tbody>
                        </table>
                    </div>
               </div>

<div id="rastreio" class="sub-tab-content">
    <div class="stats-grid mb-6">
        <div class="stat-card">
            <div class="stat-number" id="veiculosEmRota">0</div>
            <div class="stat-label">Veículos em Rota</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #00D4AA, #00B4D8);">
            <div class="stat-number" id="entregasAndamento">0</div>
            <div class="stat-label">Entregas em Andamento</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);">
            <div class="stat-number" id="proximasEntregas">0</div>
            <div class="stat-label">Próximas Entregas</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);">
            <div class="stat-number" id="tempoMedioRota">--:--</div>
            <div class="stat-label">Tempo Médio em Rota</div>
        </div>
    </div>

    <div class="filters-section mb-6">
        <div class="filters-grid">
            <div class="form-group">
                <label for="rastreioFiltroMotorista">Motorista:</label>
                <select id="rastreioFiltroMotorista" onchange="applyRastreioFilters()">
                    <option value="">Todos os Motoristas</option>
                </select>
            </div>
            <div class="form-group">
                <label for="rastreioFiltroStatus">Status:</label>
                <select id="rastreioFiltroStatus" onchange="applyRastreioFilters()">
                    <option value="">Todos</option>
                    <option value="saiu_para_entrega">Em Rota</option>
                    <option value="em_descarga">Em Descarga</option>
                    <option value="retornando">Retornando</option>
                </select>
            </div>
            <div class="form-group">
                <label>Atualização:</label>
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-600">Auto-refresh</span>
                    <input type="checkbox" id="autoRefreshRastreio" checked onchange="toggleAutoRefresh()">
                    <span class="text-xs text-green-600" id="lastUpdateRastreio">Última atualização: --:--</span>
                </div>
            </div>
        </div>
    </div>

    <div id="rastreioList" class="space-y-4">
        <div class="loading">
            <div class="spinner"></div>
            Carregando dados de rastreio...
        </div>
    </div>
</div>

<div id="frota" class="sub-tab-content">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4 text-center">Análise de Ociosidade da Frota</h2>
                    <div class="filters-section">
                        <div class="filters-grid">
                            <div class="form-group"><label for="frotaFiltroDataInicio">Data Início:</label><input type="date" id="frotaFiltroDataInicio" onchange="loadFrotaData()"></div>
                            <div class="form-group"><label for="frotaFiltroDataFim">Data Fim:</label><input type="date" id="frotaFiltroDataFim" onchange="loadFrotaData()"></div>
                        </div>
                    </div>
                    <div class="time-stats-grid">
                        <div class="time-stat-card"><div class="stat-number" id="totalOciosidade">-</div><div class="stat-label">Ociosidade Média</div></div>
                        <div class="time-stat-card"><div class="stat-number" id="frotaAtiva">0</div><div class="stat-label">Veículos Ativos Hoje</div></div>
                        <div class="time-stat-card"><div class="stat-number" id="frotaOciosa">0</div><div class="stat-label">Veículos Ociosos Agora</div></div>
                    </div>
                     <div class="table-container bg-white rounded-lg shadow-md mt-6">
                        <table class="w-full">
                            <thead><tr><th>Veículo</th><th>Status</th><th>Início Ociosidade</th><th>Tempo Ocioso</th><th>Última Ação</th></tr></thead>
                            <tbody id="ociosidadeBody"></tbody>
                        </table>
                    </div>
                </div>
            `;
            
            document.getElementById('historico').innerHTML = `
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Histórico de Entregas</h1>
                <div class="sub-tabs">
                    <button class="sub-tab active" onclick="showSubTab('historico', 'listaEntregas', this)">Entregas</button>
                    <button class="sub-tab" onclick="showSubTab('historico', 'indicadores', this)">Indicadores</button>
                </div>

                <div id="listaEntregas" class="sub-tab-content active">
                    <div class="filters-section">
                        <h3 class="text-xl font-semibold text-gray-800 mb-4">Filtros e Pesquisa</h3>
                        <div class="filters-grid">
                            <div class="form-group">
                                <label for="historicoFiltroDataInicio">Data Início:</label>
                                <input type="date" id="historicoFiltroDataInicio" onchange="applyHistoricoFilters()">
                            </div>
                            <div class="form-group">
                                <label for="historicoFiltroDataFim">Data Fim:</label>
                                <input type="date" id="historicoFiltroDataFim" onchange="applyHistoricoFilters()">
                            </div>
                            <div class="form-group">
                                <label for="historicoSearchInput">Pesquisar:</label>
                                <input type="text" id="historicoSearchInput" placeholder="Buscar por loja, placa, motorista..." onkeyup="applyHistoricoFilters()">
                            </div>
                        </div>
                        <div class="text-right mt-4">
                            <button class="btn btn-primary btn-small" onclick="clearHistoricoFilters()">Limpar Filtros</button>
                        </div>
                    </div>
                    <div id="historicoList" class="loading">
                        <div class="spinner"></div>
                        Carregando histórico...
                    </div>
                </div>

                <div id="indicadores" class="sub-tab-content">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4 text-center">Indicadores de Desempenho</h2>
                    <div class="filters-section">
                         <div class="filters-grid">
                            <div class="form-group">
                                <label for="indicadoresFiltroDataInicio">Data Início:</label>
                                <input type="date" id="indicadoresFiltroDataInicio" onchange="applyHistoricoFilters()">
                            </div>
                            <div class="form-group">
                                <label for="indicadoresFiltroDataFim">Data Fim:</label>
                                <input type="date" id="indicadoresFiltroDataFim" onchange="applyHistoricoFilters()">
                            </div>
                        </div>
                    </div>
                    <div id="indicadoresSummary" class="time-stats-grid">
                        </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                        <div class="bg-white p-4 rounded-lg shadow-md">
                            <h3 class="text-lg font-semibold text-center mb-4">Ranking de Lojas por Tempo de Descarga</h3>
                            <canvas id="lojasRankingChart"></canvas>
                        </div>
                        <div class="bg-white p-4 rounded-lg shadow-md">
                            <h3 class="text-lg font-semibold text-center mb-4">Distribuição de Entregas (Fort x Comper)</h3>
                            <canvas id="entregasChart"></canvas>
                        </div>
                    </div>
                </div>
            `;
            
            document.getElementById('configuracoes').innerHTML = `
    <h1 class="text-3xl font-bold text-gray-800 mb-6">Configurações</h1>
    <div id="passwordFormContainer" class="transport-card max-w-md mx-auto">
        <p class="text-center text-gray-600 mb-4">Acesso restrito. Por favor, insira suas credenciais.</p>
        <form id="passwordForm">
            <div class="form-group">
                <label for="userInput">Usuário:</label>
                <input type="text" id="userInput" required>
            </div>
            <div class="form-group">
                <label for="passwordInput">Senha:</label>
                <input type="password" id="passwordInput" required>
            </div>
            <div class="mt-4"><button type="submit" class="btn btn-primary w-full">Acessar</button></div>
        </form>
        <div id="passwordAlert" class="mt-4"></div>
    </div>

    <div id="configuracoesContent" style="display: none;">
        <div class="sub-tabs">
            <button class="sub-tab active" onclick="showSubTab('configuracoes', 'filiais', this)">Filiais</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'lojas', this)">Lojas</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'docas', this)">Docas</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'veiculos', this)">Veículos</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'motoristasConfig', this)">Motoristas</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'lideres', this)">Líderes</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'pontosInteresse', this)">Pontos</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'acessos', this)">Acessos</button>
            <button class="sub-tab" onclick="showSubTab('configuracoes', 'sistema', this)">Sistema</button>
        </div>

        <!-- FILIAIS -->
        <div id="filiais" class="sub-tab-content active">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Filiais</h3>
                    <button class="btn btn-success" onclick="showAddForm('filial')">+ Nova Filial</button>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Descrição</th>
                                <th>Endereço CD</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="filiaisConfigBody">
                            <tr><td colspan="5" class="loading"><div class="spinner"></div>Carregando filiais...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- LOJAS -->
        <div id="lojas" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Lojas</h3>
                    <div class="flex gap-2">
                        <button class="btn btn-primary" onclick="showAllLojasMap()">Ver no Mapa</button>
                        <button class="btn btn-success" onclick="showAddForm('loja')">+ Nova Loja</button>
                    </div>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nome</th>
                                <th>Cidade</th>
                                <th>QR Code</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="lojasConfigBody">
                            <tr><td colspan="6" class="loading"><div class="spinner"></div>Carregando lojas...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- DOCAS -->
        <div id="docas" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Docas</h3>
                    <button class="btn btn-success" onclick="showAddForm('doca')">+ Nova Doca</button>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Capacidade (Pallets)</th>
                                <th>Código QR</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="docasConfigBody">
                            <tr><td colspan="5" class="loading"><div class="spinner"></div>Carregando docas...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- VEÍCULOS -->
        <div id="veiculos" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Frota</h3>
                    <button class="btn btn-success" onclick="showAddForm('veiculo')">+ Novo Veículo</button>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Placa</th>
                                <th>Modelo</th>
                                <th>Tipo</th>
                                <th>Capacidade (P)</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="veiculosConfigBody">
                            <tr><td colspan="6" class="loading"><div class="spinner"></div>Carregando veículos...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- MOTORISTAS -->
        <div id="motoristasConfig" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Motoristas</h3>
                    <button class="btn btn-success" onclick="showAddForm('motorista')">+ Novo Motorista</button>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Produtivo</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="motoristasConfigBody">
                            <tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando motoristas...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- LÍDERES -->
        <div id="lideres" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Líderes</h3>
                    <button class="btn btn-success" onclick="showAddForm('lider')">+ Novo Líder</button>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Código Funcionário</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="lideresConfigBody">
                            <tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando líderes...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- PONTOS DE INTERESSE -->
        <div id="pontosInteresse" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Pontos de Interesse</h3>
                    <div class="flex gap-2">
                        <button class="btn btn-primary" onclick="showPontosInteresseMap()">Ver no Mapa</button>
                        <button class="btn btn-success" onclick="showAddPontoInteresse()">+ Novo Ponto</button>
                    </div>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Tipo</th>
                                <th>Coordenadas</th>
                                <th>Raio (m)</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="pontosInteresseConfigBody">
                            <tr><td colspan="6" class="loading"><div class="spinner"></div>Carregando pontos...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ACESSOS -->
        <div id="acessos" class="sub-tab-content">
            <div class="transport-card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold">Gerenciar Acessos</h3>
                    <button class="btn btn-success" onclick="showAddForm('acesso')">+ Novo Acesso</button>
                </div>
                <div class="table-container bg-white rounded-lg shadow-md">
                    <table class="w-full">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Tipo de Acesso</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="acessosConfigBody">
                            <tr><td colspan="3" class="loading"><div class="spinner"></div>Carregando acessos...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- SISTEMA -->
        <div id="sistema" class="sub-tab-content">
            <div class="transport-card">
                <h3 class="text-xl font-semibold mb-4">Status do Sistema</h3>
                <pre id="systemStatus" class="bg-gray-100 p-4 rounded-md text-sm whitespace-pre-wrap"></pre>
            </div>
        </div>
    </div>
</div>
`;


// Adicionar event listeners aos formulários
document.getElementById('expeditionForm').addEventListener('submit', (e) => { e.preventDefault(); lancarCarga(); });
document.getElementById('editExpeditionForm').addEventListener('submit', (e) => { e.preventDefault(); saveEditedExpedition(); });
document.getElementById('passwordForm').addEventListener('submit', (e) => { e.preventDefault(); checkPassword(); });
document.getElementById('addForm').addEventListener('submit', (e) => { e.preventDefault(); handleSave(); });
// Event listener para o formulário de autenticação de edição
document.getElementById('authEditForm').addEventListener('submit', (e) => { 
    e.preventDefault(); 
    checkAuthForEdit(); 
});

            // Carregar dados para os selects
            await loadSelectData();
        }

        async function loadSelectData() {
    try {
        const [lojasData, docasData, veiculosData, motoristasData, lideresData] = await Promise.all([
            // Ordena lojas por código primeiro, depois por nome
            supabaseRequest('lojas?select=*,codlojaqr,endereco_completo,latitude,longitude&ativo=eq.true&order=codigo,nome'),
            // Ordena docas por nome
            supabaseRequest('docas?ativo=eq.true&order=nome'),
            supabaseRequest('veiculos?order=placa'),
            supabaseRequest('motoristas?order=nome'),
            supabaseRequest('lideres?ativo=eq.true&order=nome')
        ]);
        lojas = lojasData || [];
        docas = docasData || [];
        veiculos = veiculosData || [];
        motoristas = motoristasData || [];
        lideres = lideresData || [];
        populateSelects();
    } catch (error) {
        console.error("Erro ao carregar dados dos selects:", error);
    }
}
       function populateSelects() {
    // Ordena lojas por código localmente (garantia extra)
    const lojasOrdenadas = [...lojas].sort((a, b) => {
        // Primeiro por código, depois por nome
        if (a.codigo !== b.codigo) {
            return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
        }
        return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    // Ordena docas por nome localmente (garantia extra)
    const docasOrdenadas = [...docas].sort((a, b) => 
        a.nome.localeCompare(b.nome, 'pt-BR')
    );

    // Popula todos os selects de loja
    const lojaSelects = document.querySelectorAll('.loja-select');
    lojaSelects.forEach(select => {
        select.innerHTML = '<option value="">Selecione a loja</option>';
        lojasOrdenadas.forEach(loja => {
            select.innerHTML += `<option value="${loja.id}">${loja.codigo} - ${loja.nome}</option>`;
        });
    });

    // Popula selects de doca
    ['dashboardDocaSelect', 'lancar_docaSelect'].forEach(id => {
        const docaSelect = document.getElementById(id);
        if (docaSelect) {
            docaSelect.innerHTML = '<option value="">Selecione a doca</option>';
            docasOrdenadas.forEach(doca => {
                docaSelect.innerHTML += `<option value="${doca.id}">${doca.nome}</option>`;
            });
        }
    });

    // Resto da função permanece igual...
    ['dashboardPlacaSelect', 'placaMotorista'].forEach(id => {
        const placaSelect = document.getElementById(id);
        if(placaSelect) {
            placaSelect.innerHTML = '<option value="">Selecione o veículo</option>';
            veiculos.forEach(v => {
                placaSelect.innerHTML += `<option value="${v.id}">${v.placa} - ${v.modelo}</option>`;
            });
        }
    });

    ['lancar_liderSelect', 'dashboardLiderSelect'].forEach(id => {
        const liderSelect = document.getElementById(id);
        if (liderSelect) {
            liderSelect.innerHTML = '<option value="">Selecione o líder</option>';
            lideres.forEach(lider => {
                liderSelect.innerHTML += `<option value="${lider.id}">${lider.nome}</option>`;
            });
        }
    });
}
        
        function getStatusLabel(status) {
            const labels = {
                'pendente': 'Pendente', 'aguardando_agrupamento': 'Aguard. Agrupamento', 'aguardando_doca': 'Aguard. Doca',
                'aguardando_veiculo': 'Aguard. Veículo', 'em_carregamento': 'Carregando', 'carregado': 'Carregado',
                'aguardando_faturamento': 'Aguard. Faturamento', 'faturamento_iniciado': 'Faturando', 'faturado': 'Faturado',
                'saiu_para_entrega': 'Saiu p/ Entrega', 'entregue': 'Entregue', 'retornando_cd': 'Retornando CD',
                'cancelado': 'Cancelado', 'disponivel': 'Disponível', 'em_viagem': 'Em Viagem', 'folga': 'Folga',
                'retornando_com_imobilizado': 'Ret. c/ Imobilizado', 'descarregando_imobilizado': 'Desc. Imobilizado',
                'em_uso': 'Em Uso', 'manutencao': 'Manutenção'
            };
            return labels[status] || status.replace(/_/g, ' ');
        }
        
        function minutesToHHMM(minutes) {
            if (minutes === null || isNaN(minutes) || minutes < 0) return '-';
            const hours = Math.floor(minutes / 60);
            const mins = Math.round(minutes % 60);
            return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        }

async function loadHomeData() {
    const dataInicioInput = document.getElementById('homeDataInicio');
    const dataFimInput = document.getElementById('homeDataFim');
    const searchInput = document.getElementById('homeSearchInput');

    // Verifica se os elementos existem antes de tentar usá-los
    if (!dataInicioInput || !dataFimInput || !searchInput) {
        console.error("Erro: Elementos da página inicial não encontrados. A função loadHomeData não pode ser executada.");
        return;
    }

    if (!dataInicioInput.value || !dataFimInput.value) {
        const hoje = new Date().toISOString().split('T')[0];
        dataInicioInput.value = hoje;
        dataFimInput.value = hoje;
    }

    document.getElementById('homeViagensConcluidas').textContent = '...';
    document.getElementById('homeEntregasRealizadas').textContent = '...';
    document.getElementById('homeTempoMedioPatio').textContent = '...';
    document.getElementById('homeOcupacaoMedia').textContent = '...';
    document.getElementById('homeTempoMedioLoja').textContent = '...';
    document.getElementById('temposMediosLojaTbody').innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>`;

    try {
        const dataInicio = dataInicioInput.value;
        const dataFim = dataFimInput.value;
        let query = `expeditions?status=eq.entregue&data_hora=gte.${dataInicio}T00:00:00&data_hora=lte.${dataFim}T23:59:59&order=data_hora.desc`;
        
        const allExpeditionsInPeriod = await supabaseRequest(query);
        
        if (!allExpeditionsInPeriod || allExpeditionsInPeriod.length === 0) {
             document.getElementById('homeViagensConcluidas').textContent = '0';
             document.getElementById('homeEntregasRealizadas').textContent = '0';
             document.getElementById('homeTempoMedioPatio').textContent = '00:00';
             document.getElementById('homeOcupacaoMedia').textContent = '0%';
             document.getElementById('homeTempoMedioLoja').textContent = '00:00';
             document.getElementById('temposMediosLojaTbody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
             destroyChart('ocupacaoTotalChart');
             destroyChart('lojaDesempenhoChart');
             destroyChart('frotaProdutividadeChart');
             destroyChart('fleetUtilizationChart');
             return;
             initHomeMap(); // Inicializar mapa mesmo sem dados
        }
        
        const expeditionIds = allExpeditionsInPeriod.map(e => e.id);
        const allItemsInPeriod = await supabaseRequest(`expedition_items?expedition_id=in.(${expeditionIds.join(',')})`);
        
        const expToLojaNames = {};
        allItemsInPeriod.forEach(item => {
            if (!expToLojaNames[item.expedition_id]) {
                expToLojaNames[item.expedition_id] = [];
            }
            const loja = lojas.find(l => l.id === item.loja_id);
            if (loja) expToLojaNames[item.expedition_id].push(loja.nome);
        });

        let filteredExpeditions = allExpeditionsInPeriod;
        if (searchInput.value) {
            filteredExpeditions = allExpeditionsInPeriod.filter(exp => {
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                const searchableMotorista = motorista ? motorista.nome.toLowerCase() : '';
                const searchableLojas = (expToLojaNames[exp.id] || []).join(' ').toLowerCase();
                
                return searchableMotorista.includes(searchInput.value.toLowerCase()) || searchableLojas.includes(searchInput.value.toLowerCase());
            });
        }
        
        const filteredExpeditionIds = filteredExpeditions.map(e => e.id);
        const items = allItemsInPeriod.filter(item => filteredExpeditionIds.includes(item.expedition_id));

        if (filteredExpeditions.length === 0) {
             document.getElementById('homeViagensConcluidas').textContent = '0';
             document.getElementById('homeEntregasRealizadas').textContent = '0';
             document.getElementById('homeTempoMedioPatio').textContent = '00:00';
             document.getElementById('homeOcupacaoMedia').textContent = '0%';
             document.getElementById('homeTempoMedioLoja').textContent = '00:00';
             document.getElementById('temposMediosLojaTbody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
             destroyChart('ocupacaoTotalChart');
             destroyChart('lojaDesempenhoChart');
             destroyChart('frotaProdutividadeChart');
             destroyChart('fleetUtilizationChart');
             return;
             initHomeMap(); // Inicializar mapa mesmo sem dados
        }


        const totalViagens = filteredExpeditions.length;
        const totalEntregas = items.length;

        const temposPatio = filteredExpeditions
            .filter(e => e.data_hora && e.data_saida_veiculo)
            .map(e => (new Date(e.data_saida_veiculo) - new Date(e.data_hora)) / 60000);
        const tempoMedioPatio = temposPatio.length > 0 ? temposPatio.reduce((a, b) => a + b, 0) / temposPatio.length : 0;

        const ocupacoes = [];
        let perlogCount = 0;
        let jjsCount = 0;

        filteredExpeditions.forEach(exp => {
            const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
            if (veiculo) {
                if (veiculo.tipo === 'PERLOG') perlogCount++;
                if (veiculo.tipo === 'JJS') jjsCount++;
                
                if (veiculo.capacidade_pallets > 0) {
                    const expItems = items.filter(i => i.expedition_id === exp.id);
                    const totalPallets = expItems.reduce((sum, item) => sum + (item.pallets || 0), 0);
                    const totalRolls = expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0);
                    const cargaTotal = totalPallets + (totalRolls / 2);
                    ocupacoes.push((cargaTotal / veiculo.capacidade_pallets) * 100);
                }
            }
        });
        const ocupacaoMedia = ocupacoes.length > 0 ? ocupacoes.reduce((a, b) => a + b, 0) / ocupacoes.length : 0;

        document.getElementById('homeViagensConcluidas').textContent = totalViagens;
        document.getElementById('homeEntregasRealizadas').textContent = totalEntregas;
        document.getElementById('homeTempoMedioPatio').textContent = minutesToHHMM(tempoMedioPatio);
        document.getElementById('homeOcupacaoMedia').textContent = `${ocupacaoMedia.toFixed(1)}%`;

        const temposLojaGeral = [];
        const lojasStats = {};
        const motoristasStats = {};

        items.forEach(item => {
            if (item.data_inicio_descarga && item.data_fim_descarga) {
                const tempo = (new Date(item.data_fim_descarga) - new Date(item.data_inicio_descarga)) / 60000;
                temposLojaGeral.push(tempo);
                
                const lojaId = item.loja_id;
                if (!lojasStats[lojaId]) {
                    const lojaInfo = lojas.find(l => l.id === lojaId);
                    lojasStats[lojaId] = {
                        nome: lojaInfo ? `${lojaInfo.codigo} - ${lojaInfo.nome}` : 'Desconhecida',
                        codigo: lojaInfo ? lojaInfo.codigo : 'N/A',
                        tempos: [],
                        entregas: 0,
                        totalPallets: 0,
                        totalRolls: 0
                    };
                }
                lojasStats[lojaId].tempos.push(tempo);
                lojasStats[lojaId].entregas++;
                lojasStats[lojaId].totalPallets += item.pallets || 0;
                lojasStats[lojaId].totalRolls += item.rolltrainers || 0;
            }
        });

        filteredExpeditions.forEach(exp => {
            if (exp.motorista_id) {
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                if (motorista) {
                    if (!motoristasStats[exp.motorista_id]) {
                        motoristasStats[exp.motorista_id] = {
                            nome: motorista.nome,
                            entregas: 0
                        };
                    }
                    const expItemsCount = items.filter(i => i.expedition_id === exp.id).length;
                    motoristasStats[exp.motorista_id].entregas += expItemsCount;
                }
            }
        });

        const tempoMedioLoja = temposLojaGeral.length > 0 ? temposLojaGeral.reduce((a, b) => a + b, 0) / temposLojaGeral.length : 0;
        document.getElementById('homeTempoMedioLoja').textContent = minutesToHHMM(tempoMedioLoja);

        const lojasData = Object.values(lojasStats).map(loja => ({
            ...loja,
            tempoMedio: loja.tempos.reduce((a, b) => a + b, 0) / loja.tempos.length
        })).sort((a, b) => b.tempoMedio - a.tempoMedio);

        const motoristasData = Object.values(motoristasStats).sort((a, b) => b.entregas - a.entregas);

        renderFrotaProdutividadeChart(motoristasData.slice(0, 5));
        renderOcupacaoTotalChart(ocupacaoMedia);
        renderLojaDesempenhoChart(lojasData.slice(0, 5));
        renderFleetUtilizationChart(perlogCount, jjsCount);
        renderTemposMediosTable(lojasData);
        // Inicializar/atualizar mapa da home
        await initHomeMap();

    } catch (error) {
        console.error("Erro ao carregar dados da home:", error);
        document.getElementById('temposMediosLojaTbody').innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

        function renderFleetUtilizationChart(perlogCount, jjsCount) {
            const total = perlogCount + jjsCount;
            if (total === 0) {
                destroyChart('fleetUtilizationChart');
                return;
                initHomeMap(); // Inicializar mapa mesmo sem dados
            }

            const data = {
                labels: ['PERLOG', 'JJS'],
                datasets: [{
                    label: 'Nº de Viagens',
                    data: [perlogCount, jjsCount],
                    backgroundColor: ['#0077B6', '#00D4AA'],
                    borderColor: '#fff',
                    borderWidth: 2,
                }]
            };

            renderChart('fleetUtilizationChart', 'doughnut', data, {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '50%',
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${context.raw} viagens`;
                            }
                        }
                    },
                   datalabels: {
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            size: 14
                        },
                        formatter: (value, ctx) => {
                            let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            let percentage = (value * 100 / sum).toFixed(1) + '%';
                            return percentage;
                        },
                    }
                }
            });
        }

        function renderOcupacaoTotalChart(ocupacaoPercent) {
            const data = {
                datasets: [{
                    data: [ocupacaoPercent, 100 - ocupacaoPercent],
                    backgroundColor: ['#0077B6', '#E5E7EB'],
                    borderColor: ['#fff'],
                    borderWidth: 2,
                    circumference: 180,
                    rotation: 270,
                }]
            };

            const ocupacaoText = {
                id: 'ocupacaoText',
                beforeDraw(chart) {
                    const { ctx, chartArea: { width, height } } = chart;
                    ctx.save();
                    ctx.font = `bold ${height / 4}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#023047';
                    ctx.fillText(`${ocupacaoPercent.toFixed(1)}%`, width / 2, height * 0.85);
                    ctx.restore();
                }
            };

            renderChart('ocupacaoTotalChart', 'doughnut', data, {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    datalabels: { display: false }
                }
            }, [ocupacaoText]);
        }

        function renderFrotaProdutividadeChart(motoristasData) {
            if (!motoristasData || motoristasData.length === 0) {
                destroyChart('frotaProdutividadeChart');
                return;
            }
            const data = {
                labels: motoristasData.map(f => f.nome),
                datasets: [{
                    label: 'Total de Entregas',
                    data: motoristasData.map(f => f.entregas),
                    backgroundColor: '#00D4AA',
                    borderColor: '#00B4D8',
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            };

            renderChart('frotaProdutividadeChart', 'bar', data, {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: '#023047',
                        font: { weight: 'bold' },
                        anchor: 'end',
                        align: 'end',
                        offset: 5,
                        formatter: (value) => value
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Total de Entregas: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        display: false,
                        beginAtZero: true
                    },
                    x: {
                        title: { display: true, text: 'Motorista' }
                    }
                }
            });
        }

        function renderLojaDesempenhoChart(lojasData) {
            if (!lojasData || lojasData.length === 0) {
                destroyChart('lojaDesempenhoChart');
                return;
            }

            const backgroundColors = lojasData.map(loja => 
                loja.nome.toLowerCase().includes('fort') ? 'rgba(239, 68, 68, 0.8)' : '#00B4D8'
            );
            const borderColors = lojasData.map(loja => 
                loja.nome.toLowerCase().includes('fort') ? 'rgba(220, 38, 38, 1)' : '#0077B6'
            );

            const data = {
                labels: lojasData.map(l => l.nome),
                datasets: [{
                    label: 'Tempo Médio em Loja',
                    data: lojasData.map(l => l.tempoMedio),
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            };
            
            renderChart('lojaDesempenhoChart', 'bar', data, {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: 'white',
                        font: { weight: 'bold' },
                        formatter: (value) => minutesToHHMM(value),
                        anchor: 'center',
                        align: 'center',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const loja = lojasData[context.dataIndex];
                                return [ `Tempo Médio: ${minutesToHHMM(context.raw)}`, `Total de Entregas: ${loja.entregas}` ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        display: false,
                        beginAtZero: true
                    },
                    x: {
                        title: { display: true, text: 'Loja' }
                    }
                }
            });
        }

        function renderTemposMediosTable(lojasData) {
            const tbody = document.getElementById('temposMediosLojaTbody');
            if (!lojasData || lojasData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado de loja encontrado.</td></tr>';
                return;
            }
            tbody.innerHTML = lojasData.map(loja => `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 px-4 font-medium text-gray-800">${loja.nome}</td>
                    <td class="py-3 px-4 text-center">${loja.entregas}</td>
                    <td class="py-3 px-4 text-center">${loja.totalPallets}</td>
                    <td class="py-3 px-4 text-center">${loja.totalRolls}</td>
                    <td class="py-3 px-4 text-center font-semibold">${minutesToHHMM(loja.tempoMedio)}</td>
                </tr>
            `).join('');
        }

        // --- FUNÇÕES DO MAPA DA HOME ---
async function initHomeMap() {
    // Destruir mapa existente se houver
    if (homeMapInstance) {
        homeMapInstance.remove();
        homeMapInstance = null;
    }
    
    // Aguardar o elemento estar disponível
    const mapElement = document.getElementById('homeMap');
    if (!mapElement) {
        console.warn('Elemento do mapa da home não encontrado');
        return;
    }
    
    try {
        // Coordenadas do CD da filial selecionada
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        
        // Criar mapa da home
        homeMapInstance = L.map('homeMap').setView(cdCoords, 11);
        
        // Adicionar camada do mapa
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(homeMapInstance);
        
        // Carregar dados do rastreio para o mapa
        await loadHomeMapData();
        
        // Configurar auto-refresh se estiver ativado
        if (document.getElementById('homeAutoRefresh')?.checked) {
            toggleHomeAutoRefresh();
        }
        
    } catch (error) {
        console.error('Erro ao inicializar mapa da home:', error);
        mapElement.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500">
            <div class="text-center">
                <p class="mb-2">Erro ao carregar mapa</p>
                <button class="btn btn-primary btn-small" onclick="initHomeMap()">Tentar Novamente</button>
            </div>
        </div>`;
    }
}

async function loadHomeMapData() {
    if (!homeMapInstance) return;
    
    try {
        // Limpar marcadores existentes
        homeMapInstance.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Circle) {
                homeMapInstance.removeLayer(layer);
            }
        });
        
        // Coordenadas do CD
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        
        // Adicionar marcador do CD
        const cdIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #0077B6; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>',
            iconSize: [80, 30],
            iconAnchor: [40, 15]
        });
        
        L.marker(cdCoords, { icon: cdIcon })
            .addTo(homeMapInstance)
            .bindPopup(`<h3><strong>Centro de Distribuição</strong></h3><p>Filial ${selectedFilial.nome}</p>`);
        
        // Carregar dados de rastreio atuais
        const expeditionsEmRota = await supabaseRequest('expeditions?status=eq.saiu_para_entrega&order=data_saida_entrega.desc');
        const motoristasRetornando = await supabaseRequest('motoristas?status=in.(retornando_cd,retornando_com_imobilizado)');
        
        // Buscar localizações GPS
        let locations = [];
        if (expeditionsEmRota.length > 0) {
            const expeditionIds = expeditionsEmRota.map(exp => exp.id);
            const query = `gps_tracking?expedition_id=in.(${expeditionIds.join(',')})&order=data_gps.desc`;
            locations = await supabaseRequest(query, 'GET', null, false);
        }
        
        let returningLocations = [];
        if (motoristasRetornando.length > 0) {
            const motoristaIds = motoristasRetornando.map(m => m.id);
            const query = `gps_tracking?motorista_id=in.(${motoristaIds.join(',')})&order=data_gps.desc`;
            returningLocations = await supabaseRequest(query, 'GET', null, false);
        }
        
        const bounds = L.latLngBounds();
        bounds.extend(cdCoords);
        
        // Adicionar veículos em rota
        expeditionsEmRota.forEach(exp => {
            const location = locations.find(loc => loc.expedition_id === exp.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                
                // Determinar status do veículo para cor
                let color = '#F59E0B'; // laranja para em trânsito
                let statusText = 'Em Trânsito';
                
                // Verificar se está descarregando (lógica simplificada)
                // Na implementação real, você pode verificar o status atual das entregas
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [60, 20],
                    iconAnchor: [30, 10]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(homeMapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista?.nome || 'N/A'}</p>
                            <p><strong>Status:</strong> <span style="color: ${color};">${statusText}</span></p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar veículos retornando
        motoristasRetornando.forEach(motorista => {
            const location = returningLocations.find(loc => loc.motorista_id === motorista.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const veiculo = veiculos.find(v => v.id === motorista.veiculo_id);
                const color = '#10B981'; // verde para retornando
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [60, 20],
                    iconAnchor: [30, 10]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(homeMapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista.nome}</p>
                            <p><strong>Status:</strong> <span style="color: ${color};">Retornando</span></p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar lojas
        lojas.forEach(loja => {
            if (loja.latitude && loja.longitude && loja.ativo) {
                const lat = parseFloat(loja.latitude);
                const lng = parseFloat(loja.longitude);
                
                let cor = '#10B981'; // verde padrão
                if (loja.nome.toLowerCase().includes('fort')) cor = '#EF4444'; // vermelho
                else if (loja.nome.toLowerCase().includes('comper')) cor = '#0077B6'; // azul
                
                const lojaIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${cor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
                    iconSize: [50, 18],
                    iconAnchor: [25, 9]
                });
                
                L.marker([lat, lng], { icon: lojaIcon })
                    .addTo(homeMapInstance)
                    .bindPopup(`<strong>${loja.nome}</strong><br>Código: ${loja.codigo}`);
                
                bounds.extend([lat, lng]);
            }
        });

        // Adicionar pontos de interesse se existirem
        if (pontosInteresse && pontosInteresse.length > 0) {
            pontosInteresse.forEach(ponto => {
                if (ponto.ativo) {
                    const pontoIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background: ${ponto.cor}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: bold; border: 1px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${ponto.tipo}</div>`,
                        iconSize: [30, 15],
                        iconAnchor: [15, 7]
                    });
                    
                    L.marker([ponto.latitude, ponto.longitude], { icon: pontoIcon })
                        .addTo(homeMapInstance)
                        .bindPopup(`<strong>${ponto.nome}</strong><br><small>${ponto.tipo}</small>`);
                }
            });
        }
        
        // Ajustar zoom para mostrar todos os pontos
        if (bounds.isValid()) {
            homeMapInstance.fitBounds(bounds, { padding: [20, 20] });
        }
        
        // Atualizar timestamp
        updateHomeLastRefreshTime();
        
    } catch (error) {
        console.error('Erro ao carregar dados do mapa da home:', error);
        showNotification('Erro ao atualizar mapa: ' + error.message, 'error');
    }
}

function toggleHomeAutoRefresh() {
    const autoRefresh = document.getElementById('homeAutoRefresh')?.checked;
    
    // Limpar timer existente
    if (homeMapTimer) {
        clearInterval(homeMapTimer);
        homeMapTimer = null;
    }
    
    if (autoRefresh) {
        // Atualizar a cada 30 segundos
        homeMapTimer = setInterval(() => {
            loadHomeMapData();
        }, 30000);
        showNotification('Auto-refresh do mapa ativado (30s)', 'success', 2000);
    } else {
        showNotification('Auto-refresh do mapa desativado', 'info', 2000);
    }
}

function updateHomeLastRefreshTime() {
    const now = new Date();
    const element = document.getElementById('homeLastUpdate');
    if (element) {
        element.textContent = `Última atualização: ${now.toLocaleTimeString('pt-BR')}`;
    }
}

function showHomeMapFullscreen() {
    document.getElementById('mapModalTitle').textContent = 'Visão Geral em Tempo Real - Tela Cheia';
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(async () => {
        if (mapInstance) {
            mapInstance.remove();
        }
        
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        mapInstance = L.map('map').setView(cdCoords, 11);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance);
        
        // Reutilizar a mesma lógica do mapa da home
        await loadHomeMapDataForFullscreen();
    }, 100);
}

async function loadHomeMapDataForFullscreen() {
    try {
        // Coordenadas do CD
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        
        // Adicionar marcador do CD
        const cdIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #0077B6; color: white; padding: 8px 16px; border-radius: 10px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>',
            iconSize: [100, 40],
            iconAnchor: [50, 20]
        });
        
        L.marker(cdCoords, { icon: cdIcon })
            .addTo(mapInstance)
            .bindPopup(`<h3><strong>Centro de Distribuição</strong></h3><p>Filial ${selectedFilial.nome}</p>`);
        
        const bounds = L.latLngBounds();
        bounds.extend(cdCoords);
        
        // Carregar dados de rastreio atuais (similar ao loadHomeMapData)
        const expeditionsEmRota = await supabaseRequest('expeditions?status=eq.saiu_para_entrega&order=data_saida_entrega.desc');
        const motoristasRetornando = await supabaseRequest('motoristas?status=in.(retornando_cd,retornando_com_imobilizado)');
        
        // Buscar localizações GPS
        let locations = [];
        if (expeditionsEmRota.length > 0) {
            const expeditionIds = expeditionsEmRota.map(exp => exp.id);
            const query = `gps_tracking?expedition_id=in.(${expeditionIds.join(',')})&order=data_gps.desc`;
            locations = await supabaseRequest(query, 'GET', null, false);
        }
        
        let returningLocations = [];
        if (motoristasRetornando.length > 0) {
            const motoristaIds = motoristasRetornando.map(m => m.id);
            const query = `gps_tracking?motorista_id=in.(${motoristaIds.join(',')})&order=data_gps.desc`;
            returningLocations = await supabaseRequest(query, 'GET', null, false);
        }
        
        // Adicionar veículos em rota (ícones maiores para fullscreen)
        expeditionsEmRota.forEach(exp => {
            const location = locations.find(loc => loc.expedition_id === exp.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                
                let color = '#F59E0B'; // laranja para em trânsito
                let statusText = 'Em Trânsito';
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [80, 30],
                    iconAnchor: [40, 15]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista?.nome || 'N/A'}</p>
                            <p><strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">${statusText}</span></p>
                            <p><strong>Velocidade:</strong> ${location.velocidade || 0} km/h</p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar veículos retornando
        motoristasRetornando.forEach(motorista => {
            const location = returningLocations.find(loc => loc.motorista_id === motorista.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const veiculo = veiculos.find(v => v.id === motorista.veiculo_id);
                const color = '#10B981'; // verde para retornando
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [80, 30],
                    iconAnchor: [40, 15]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista.nome}</p>
                            <p><strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">Retornando</span></p>
                            <p><strong>Velocidade:</strong> ${location.velocidade || 0} km/h</p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar lojas (ícones maiores)
        lojas.forEach(loja => {
            if (loja.latitude && loja.longitude && loja.ativo) {
                const lat = parseFloat(loja.latitude);
                const lng = parseFloat(loja.longitude);
                
                let cor = '#10B981';
                if (loja.nome.toLowerCase().includes('fort')) cor = '#EF4444';
                else if (loja.nome.toLowerCase().includes('comper')) cor = '#0077B6';
                
                const lojaIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${cor}; color: white; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
                    iconSize: [70, 25],
                    iconAnchor: [35, 12]
                });
                
                L.marker([lat, lng], { icon: lojaIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${loja.nome}</strong></h4>
                            <p><strong>Código:</strong> ${loja.codigo}</p>
                            <p><strong>Cidade:</strong> ${loja.cidade}</p>
                            ${loja.endereco_completo ? `<p><strong>Endereço:</strong><br>${loja.endereco_completo}</p>` : ''}
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar pontos de interesse se existirem
        if (pontosInteresse && pontosInteresse.length > 0) {
            pontosInteresse.forEach(ponto => {
                if (ponto.ativo) {
                    const pontoIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background: ${ponto.cor}; color: white; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${ponto.tipo}</div>`,
                        iconSize: [40, 20],
                        iconAnchor: [20, 10]
                    });
                    
                    L.marker([ponto.latitude, ponto.longitude], { icon: pontoIcon })
                        .addTo(mapInstance)
                        .bindPopup(`<strong>${ponto.nome}</strong><br><small>${ponto.tipo}</small>`);
                }
            });
        }
        
        if (bounds.isValid()) {
            mapInstance.fitBounds(bounds, { padding: [30, 30] });
        }
        
    } catch (error) {
        console.error('Erro ao carregar mapa fullscreen:', error);
        showNotification('Erro ao carregar mapa fullscreen: ' + error.message, 'error');
    }
}

        // --- FUNCIONALIDADES DA ABA OPERAÇÃO ---
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
                // Processar números de carga
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
                };
                
                const expeditionResponse = await supabaseRequest('expeditions', 'POST', expeditionData);
                if (!expeditionResponse || expeditionResponse.length === 0) {
                    throw new Error("A criação da expedição falhou e não retornou um ID.");
                }
                const newExpeditionId = expeditionResponse[0].id;

                const itemData = { expedition_id: newExpeditionId, loja_id: lojaId, pallets: pallets || 0, rolltrainers: rolltrainers || 0, status_descarga: 'pendente' };
                await supabaseRequest('expedition_items', 'POST', itemData);

                const lojaNome = lojas.find(l => l.id === lojaId)?.nome || 'Loja';
                const cargasInfo = numerosCarga.length > 0 ? ` (Cargas: ${numerosCarga.join(', ')})` : '';
                showNotification(`Expedição para ${lojaNome}${cargasInfo} lançada com sucesso!`, 'success');

                document.getElementById('expeditionForm').reset();
                document.getElementById('lancar_lojaSelect').focus();
                
                if(document.getElementById('home').classList.contains('active')) {
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
                                ${numerosCarga ? `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-1 inline-block">📦 ${numerosCarga}</span><br>` : ''}
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

                const newExpeditionData = { data_hora: new Date().toISOString(), status: 'aguardando_veiculo', doca_id: docaAlvoId, veiculo_id: veiculoId, motorista_id: motoristaId, lider_id: cargasSelecionadas[0].lider_id, data_alocacao_veiculo: new Date().toISOString(), observacoes: observacoes || null };
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

        // --- FUNCIONALIDADES DA ABA FATURAMENTO ---
       async function loadFaturamento() {
    showSubTab('faturamento', 'faturamentoAtivo', document.querySelector('#faturamento .sub-tab'));
    
    try {
        const expeditions = await supabaseRequest("expeditions?status=in.(aguardando_faturamento,faturamento_iniciado,faturado)&order=data_hora.desc");
        const items = await supabaseRequest('expedition_items');

        const expeditionsWithItems = expeditions.map(exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
            return {
                ...exp,
                items: expItems,
                total_pallets: expItems.reduce((sum, item) => sum + (item.pallets || 0), 0),
                total_rolltrainers: expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0),
                lojas_count: expItems.length,
                lojas_info: expItems.map(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    return loja ? `${loja.codigo} - ${loja.nome}` : 'N/A';
                }).join(', '),
                doca_nome: docas.find(d => d.id === exp.doca_id)?.nome || 'N/A',
                lider_nome: lideres.find(l => l.id === exp.lider_id)?.nome || 'N/A',
                veiculo_placa: veiculo?.placa || null,
                veiculo_modelo: veiculo?.modelo || null,
                motorista_nome: motoristas.find(m => m.id === exp.motorista_id)?.nome || null
            };
        });

        updateFaturamentoStats(expeditionsWithItems);
        renderFaturamentoList(expeditionsWithItems);
        
        // Definir datas padrão para o histórico (últimos 30 dias)
        const hoje = new Date();
        const ha30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const historicoDataInicio = document.getElementById('historicoFaturamentoDataInicio');
        const historicoDataFim = document.getElementById('historicoFaturamentoDataFim');
        
        if (historicoDataInicio && !historicoDataInicio.value) {
            historicoDataInicio.value = ha30Dias.toISOString().split('T')[0];
        }
        if (historicoDataFim && !historicoDataFim.value) {
            historicoDataFim.value = hoje.toISOString().split('T')[0];
        }
        
    } catch (error) {
        document.getElementById('faturamentoList').innerHTML = `<div class="alert alert-error">Erro: ${error.message}</div>`;
    }
}

        function renderFaturamentoList(expeditionsList) {
            const container = document.getElementById('faturamentoList');

            if (expeditionsList.length === 0) {
                container.innerHTML = '<div class="alert alert-success">Nenhuma expedição pendente de faturamento!</div>';
                return;
            }

            container.innerHTML = expeditionsList.map(exp => {
                const carregadoEm = exp.data_saida_veiculo ? new Date(exp.data_saida_veiculo) : new Date(exp.data_hora);
                const tempoEspera = Math.round((new Date() - carregadoEm) / 60000);
                
                let actionButtons = '', statusInfo = '';
                if (exp.status === 'aguardando_faturamento') {
                    statusInfo = `<div class="text-blue-600 font-semibold mb-2">📄 Pronto para iniciar faturamento</div>`;
                    actionButtons = `<button class="btn btn-success" onclick="iniciarFaturamento('${exp.id}')">Iniciar Faturamento</button>`;
                } else if (exp.status === 'faturamento_iniciado') {
                    const iniciadoEm = exp.data_inicio_faturamento ? new Date(exp.data_inicio_faturamento) : null;
                    const tempoFaturamento = iniciadoEm ? Math.round((new Date() - iniciadoEm) / 60000) : 0;
                    statusInfo = `<div class="text-yellow-600 font-semibold mb-2">📄 Faturamento em andamento há ${minutesToHHMM(tempoFaturamento)}</div>`;
                    actionButtons = `<button class="btn btn-primary" onclick="finalizarFaturamento('${exp.id}')">Finalizar Faturamento</button>`;
                } else if (exp.status === 'faturado') {
                    statusInfo = `<div class="text-green-600 font-semibold mb-2">✅ Faturado</div>`;
                    actionButtons = `<button class="btn btn-warning" onclick="marcarSaiuEntrega('${exp.id}')">Marcar Saída</button>`;
                }

                return `
                    <div class="faturamento-card">
                       <h3 class="text-lg font-bold text-gray-800">${exp.lojas_count} loja${exp.lojas_count > 1 ? 's' : ''} - ${exp.veiculo_placa || 'N/A'}</h3>
                        <p class="text-sm text-gray-500 mb-2">${exp.lojas_info}</p>
                        ${exp.numeros_carga && exp.numeros_carga.length > 0 ? `<p class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-2 inline-block">📦 Cargas: ${exp.numeros_carga.join(', ')}</p>` : ''}
                        ${statusInfo}
                        <div class="time-display">
                            <strong>Carregado há:</strong> ${minutesToHHMM(tempoEspera)}
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

        function updateFaturamentoStats(expeditions) {
            document.getElementById('totalCarregadas').textContent = expeditions.filter(e => e.status === 'aguardando_faturamento').length;
            document.getElementById('emFaturamento').textContent = expeditions.filter(e => e.status === 'faturamento_iniciado').length;
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

        async function iniciarFaturamento(expeditionId) {
            try {
                const updateData = { status: 'faturamento_iniciado', data_inicio_faturamento: new Date().toISOString() };
                await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', updateData);
                showNotification(`Faturamento iniciado!`, 'success');
                loadFaturamento();
            } catch (error) {
                showNotification('Erro ao iniciar faturamento: ' + error.message, 'error');
            }
        }

        async function finalizarFaturamento(expeditionId) {
             try {
                const updateData = { status: 'faturado', data_fim_faturamento: new Date().toISOString() };
                await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', updateData);
                showNotification(`Faturamento finalizado!`, 'success');
                loadFaturamento();
            } catch (error) {
                showNotification('Erro ao finalizar faturamento: ' + error.message, 'error');
            }
        }

        async function marcarSaiuEntrega(expeditionId) {
            try {
                await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', { status: 'saiu_para_entrega', data_saida_entrega: new Date().toISOString() });
                showNotification('Expedição marcada como saiu para entrega!', 'success');
                loadFaturamento();
            } catch (error) {
                showNotification('Erro ao marcar saída: ' + error.message, 'error');
            }
        }
// --- FUNCIONALIDADES DO HISTÓRICO DE FATURAMENTO ---
async function loadHistoricoFaturamento() {
    const dataInicio = document.getElementById('historicoFaturamentoDataInicio').value;
    const dataFim = document.getElementById('historicoFaturamentoDataFim').value;
    const searchTerm = document.getElementById('historicoFaturamentoSearch').value.toLowerCase();
    
    const tbody = document.getElementById('historicoFaturamentoBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>`;
    
    try {
        // Buscar expedições que foram faturadas (que passaram pelo processo de faturamento)
        let query = 'expeditions?status=in.(saiu_para_entrega,entregue)&data_inicio_faturamento=not.is.null&data_fim_faturamento=not.is.null&order=data_fim_faturamento.desc';
        
        if (dataInicio) {
            query += `&data_fim_faturamento=gte.${dataInicio}T00:00:00`;
        }
        if (dataFim) {
            query += `&data_fim_faturamento=lte.${dataFim}T23:59:59`;
        }
        
        const expeditions = await supabaseRequest(query);
        const items = await supabaseRequest('expedition_items');
        
        if (!expeditions || expeditions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-500">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
            updateHistoricoFaturamentoStats([]);
            return;
        }
        
        let expeditionsWithItems = expeditions.map(exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
            const motorista = exp.motorista_id ? motoristas.find(m => m.id === exp.motorista_id) : null;
            
            // Calcular tempo de faturamento
            let tempoFaturamento = 0;
            if (exp.data_inicio_faturamento && exp.data_fim_faturamento) {
                tempoFaturamento = (new Date(exp.data_fim_faturamento) - new Date(exp.data_inicio_faturamento)) / 60000; // em minutos
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
        
        // Aplicar filtro de busca
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

function updateHistoricoFaturamentoStats(expeditions) {
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
        const menorTempo = Math.min(...tempos);
        const maiorTempo = Math.max(...tempos);
        
        if (tempoMedioElement) tempoMedioElement.textContent = minutesToHHMM(tempoMedio);
        if (menorTempoElement) menorTempoElement.textContent = minutesToHHMM(menorTempo);
        if (maiorTempoElement) maiorTempoElement.textContent = minutesToHHMM(maiorTempo);
    } else {
        if (tempoMedioElement) tempoMedioElement.textContent = '00:00';
        if (menorTempoElement) menorTempoElement.textContent = '00:00';
        if (maiorTempoElement) maiorTempoElement.textContent = '00:00';
    }
}

function renderHistoricoFaturamentoTable(expeditions) {
    const tbody = document.getElementById('historicoFaturamentoBody');
    
    if (expeditions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-gray-500">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
        return;
    }
    
    tbody.innerHTML = expeditions.map(exp => {
        const dataExpedicao = new Date(exp.data_hora).toLocaleDateString('pt-BR');
        const inicioFaturamento = exp.data_inicio_faturamento ? 
            new Date(exp.data_inicio_faturamento).toLocaleString('pt-BR') : 'N/A';
        const fimFaturamento = exp.data_fim_faturamento ? 
            new Date(exp.data_fim_faturamento).toLocaleString('pt-BR') : 'N/A';
        const tempoFaturamento = exp.tempo_faturamento > 0 ? minutesToHHMM(exp.tempo_faturamento) : 'N/A';
        
        // Formatar informações das lojas e cargas
        let lojasInfo = exp.lojas_info.join('<br>');
        if (exp.numeros_carga && exp.numeros_carga.length > 0) {
            lojasInfo += `<br><span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1 inline-block">📦 Cargas: ${exp.numeros_carga.join(', ')}</span>`;
        }
        
        // Definir cor do tempo baseada na duração
        let tempoColor = 'text-green-600';
        if (exp.tempo_faturamento > 60) tempoColor = 'text-orange-600'; // > 1 hora
        if (exp.tempo_faturamento > 120) tempoColor = 'text-red-600'; // > 2 horas
        
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
                    <button class="btn btn-primary btn-small" onclick="showDetalhesExpedicao('${exp.id}')">Detalhes</button>
                </td>
            </tr>
        `;
    }).join('');
}

function clearHistoricoFaturamentoFilters() {
    document.getElementById('historicoFaturamentoDataInicio').value = '';
    document.getElementById('historicoFaturamentoDataFim').value = '';
    document.getElementById('historicoFaturamentoSearch').value = '';
    
    // Definir datas padrão (últimos 30 dias)
    const hoje = new Date();
    const ha30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById('historicoFaturamentoDataInicio').value = ha30Dias.toISOString().split('T')[0];
    document.getElementById('historicoFaturamentoDataFim').value = hoje.toISOString().split('T')[0];
    
    loadHistoricoFaturamento();
}

      // Nova função para sub-abas (SUBSTITUÍDA)
function showSubTab(tabName, subTabName, element) {
    // Verificar permissão da sub-aba
    const permissionMap = {
        'operacao': {
            'lancamento': 'acesso_operacao_lancamento',
            'identificacao': 'acesso_operacao_identificacao'
        },
        'faturamento': {
            'faturamentoAtivo': 'acesso_faturamento_ativo',
            'historicoFaturamento': 'acesso_faturamento_historico'
        },
        'motoristas': {
            'statusFrota': 'acesso_motoristas_status',
            'relatorioMotoristas': 'acesso_motoristas_relatorio'
        },
        'acompanhamento': {
            'expedicoesEmAndamento': 'acesso_acompanhamento_expedicoes',
            'rastreio': 'acesso_acompanhamento_rastreio',
            'frota': 'acesso_acompanhamento_frota'
        },
        'historico': {
            'listaEntregas': 'acesso_historico_entregas',
            'indicadores': 'acesso_historico_indicadores'
        },
        'configuracoes': {
            'filiais': 'acesso_configuracoes_filiais',
            'lojas': 'acesso_configuracoes_lojas',
            'docas': 'acesso_configuracoes_docas',
            'veiculos': 'acesso_configuracoes_veiculos',
            'motoristasConfig': 'acesso_configuracoes_motoristas',
            'lideres': 'acesso_configuracoes_lideres',
            'pontosInteresse': 'acesso_configuracoes_pontos',
            'acessos': 'acesso_configuracoes_acessos',
            'sistema': 'acesso_configuracoes_sistema'
        }
    };
    
    if (permissionMap[tabName] && permissionMap[tabName][subTabName] && !hasPermission(permissionMap[tabName][subTabName])) {
        showNotification('Você não tem permissão para acessar esta seção.', 'error');
        return;
    }

    const tabContent = document.getElementById(tabName);
    if (!tabContent) return;
    
    tabContent.querySelectorAll('.sub-tab').forEach(tab => tab.classList.remove('active'));
    tabContent.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));

    if(element) element.classList.add('active');
    document.getElementById(subTabName).classList.add('active');
    
    if (tabName === 'acompanhamento') {
        if (subTabName === 'frota') {
            loadFrotaData();
        } else if (subTabName === 'rastreio') {
            loadRastreioData();
            if (document.getElementById('autoRefreshRastreio')?.checked) {
                toggleAutoRefresh();
            }
        }
    } else if (tabName === 'historico' && subTabName === 'indicadores') {
        applyHistoricoFilters();
    } else if (tabName === 'faturamento' && subTabName === 'historicoFaturamento') {
        loadHistoricoFaturamento();
    } else if (tabName === 'configuracoes') {
        if (subTabName === 'filiais') {
            renderFiliaisConfig();
        } else if (subTabName === 'lojas') {
            renderLojasConfig();
        } else if (subTabName === 'docas') {
            renderDocasConfig();
        } else if (subTabName === 'veiculos') {
            renderVeiculosConfig();
        } else if (subTabName === 'motoristasConfig') {
            renderMotoristasConfig();
        } else if (subTabName === 'lideres') {
            renderLideresConfig();
        } else if (subTabName === 'pontosInteresse') {
            loadPontosInteresse();
            renderPontosInteresseConfig();
        } else if (subTabName === 'acessos') {
            renderAcessosConfig();
        } else if (subTabName === 'sistema') {
            updateSystemStatus();
        }
    } else if (tabName === 'operacao') {
        if (subTabName === 'identificacao') {
            loadIdentificacaoExpedicoes();
        }
    } else if (tabName === 'motoristas' && subTabName === 'relatorioMotoristas') {
        generateMotoristaReports();
    }
    feather.replace();
}

        async function loadMotoristaTab() {
            ('motoristas', 'statusFrota', document.querySelector('#motoristas .sub-tab'));
            await renderMotoristasStatusList();
            
            // Definir datas padrão para o relatório (últimos 30 dias)
            const hoje = new Date();
            const ha30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const dataInicio = document.getElementById('relatorioMotoristaDataInicio');
            const dataFim = document.getElementById('relatorioMotoristaDataFim');
            
            if (dataInicio && !dataInicio.value) {
                dataInicio.value = ha30Dias.toISOString().split('T')[0];
            }
            if (dataFim && !dataFim.value) {
                dataFim.value = hoje.toISOString().split('T')[0];
            }
        }

        async function renderMotoristasStatusList() {
            const container = document.getElementById('motoristasStatusList');
            if (!container) return;
            container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando status...</div>`;
            Object.values(activeTimers).forEach(clearInterval);
            activeTimers = {};

            const [activeExpeditions, recentlyCompletedExpeditions, allItems] = await Promise.all([
                 supabaseRequest(`expeditions?status=not.in.(entregue,cancelado)`),
                 supabaseRequest(`expeditions?status=eq.entregue&order=data_hora.desc&limit=50`),
                 supabaseRequest('expedition_items')
            ]);
            
            let html = `<div class="stats-grid">
                <div class="stat-card"><div class="stat-number">${motoristas.filter(m => m.status === 'disponivel').length}</div><div class="stat-label">Disponíveis</div></div>
                <div class="stat-card" style="background: var(--secondary-gradient);"><div class="stat-number">${motoristas.filter(m => ['em_viagem', 'descarregando_imobilizado', 'saiu_para_entrega'].includes(m.status)).length}</div><div class="stat-label">Em Atividade</div></div>
                <div class="stat-card" style="background: var(--accent-gradient);"><div class="stat-number">${motoristas.filter(m => ['retornando_cd', 'retornando_com_imobilizado'].includes(m.status)).length}</div><div class="stat-label">Retornando</div></div>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 my-4">Status dos Motoristas</h3>
            `;

            const motoristasComStatus = motoristas.map(m => {
                const activeExp = activeExpeditions.find(exp => exp.motorista_id === m.id);
                if (activeExp) {
                    const itemsForExp = allItems.filter(i => i.expedition_id === activeExp.id);
                    return { ...m, displayStatus: activeExp.status, veiculoId: activeExp.veiculo_id, activeExp: { ...activeExp, items: itemsForExp } };
                } else {
                    const lastCompletedExp = recentlyCompletedExpeditions.find(exp => exp.motorista_id === m.id);
                    return { ...m, displayStatus: m.status, veiculoId: lastCompletedExp ? lastCompletedExp.veiculo_id : null };
                }
            });

            motoristasComStatus.sort((a, b) => a.nome.localeCompare(b.nome));

            motoristasComStatus.forEach(m => {
                let actionButton = '';
                if ((m.status === 'retornando_cd' || m.status === 'retornando_com_imobilizado') && m.veiculoId) {
                    actionButton = `<button class="btn btn-primary btn-small" onclick="marcarRetornoCD('${m.id}', '${m.veiculoId}')">Cheguei no CD</button>`;
                } else if (m.status === 'descarregando_imobilizado' && m.veiculoId) {
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

                html += `
                    <div class="motorista-status-item">
                        <div>
                            <strong class="text-gray-800">${m.nome}</strong>
                            ${timeInfo}
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="status-badge status-${m.displayStatus.replace(/ /g, '_')}">${getStatusLabel(m.displayStatus)}</span>
                            ${actionButton}
                        </div>
                    </div>`;
            });
            container.innerHTML = html;

            // Iniciar timers
            motoristasComStatus.forEach(m => {
                if(m.activeExp && m.displayStatus === 'saiu_para_entrega') {
                    const timerId = `motorista_${m.id}`;
                    if(activeTimers[timerId]) clearInterval(activeTimers[timerId]);
                    
                    activeTimers[timerId] = setInterval(() => {
                        let tempoEmLoja = 0, tempoDeslocamento = 0;
                        let lastEventTime = new Date(m.activeExp.data_saida_entrega);

                        m.activeExp.items.sort((a,b) => new Date(a.data_inicio_descarga) - new Date(b.data_inicio_descarga)).forEach(item => {
                            if(item.data_inicio_descarga) {
                               const inicio = new Date(item.data_inicio_descarga);
                               tempoDeslocamento += (inicio - lastEventTime);
                               if(item.data_fim_descarga) {
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

                        if(elLoja) elLoja.textContent = `Loja: ${minutesToHHMM(tempoEmLoja / 60000)}`;
                        if(elDesloc) elDesloc.textContent = `Desloc.: ${minutesToHHMM(tempoDeslocamento / 60000)}`;

                    }, 1000);
                }
            });
        }

        async function consultarExpedicoesPorPlaca() {
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

                const expeditionsWithItems = expeditions.map(exp => {
                    const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                    return { ...exp, items: items.filter(i => i.expedition_id === exp.id), veiculo_placa: veiculo?.placa };
                }).filter(exp => exp.veiculo_placa === placa);
                
                renderExpedicoesMotorista(expeditionsWithItems);
            } catch (error) {
                resultsContainer.innerHTML = `<div class="alert alert-error">Erro ao consultar expedições.</div>`;
            }
        }
        
        function renderExpedicoesMotorista(expeditions) {
            const container = document.getElementById('resultadosMotorista');
            Object.values(activeTimers).forEach(clearInterval);
            activeTimers = {};

            if(expeditions.length === 0) {
                container.innerHTML = `<div class="alert alert-success mt-4">Nenhuma expedição ativa encontrada para esta placa.</div>`;
                return;
            }

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

        function renderPainelDescarga(exp) {
            let html = `<div class="motorista-card"><h3 class="text-xl font-semibold mb-4">Roteiro de Entregas</h3>`;
            let emTransito = true;
            
            exp.items.forEach(item => {
                const loja = lojas.find(l => l.id === item.loja_id);
                let actionButton = '', statusDescargaLabel = '', statusColor = '';
                
                if (item.status_descarga === 'pendente' && emTransito) {
                    statusDescargaLabel = 'Próxima Entrega'; statusColor = 'text-blue-600';
                    actionButton = `<button class="btn btn-success" onclick="openQrModal('iniciar_descarga', '${item.id}', '${loja.codlojaqr || ''}', '${exp.id}')">Iniciar Descarga</button>`;
                    emTransito = false;
                } else if (item.status_descarga === 'pendente' && !emTransito) {
                    statusDescargaLabel = 'Aguardando'; statusColor = 'text-gray-500';
                } else if (item.status_descarga === 'em_descarga') {
                    statusDescargaLabel = 'Em Descarga'; statusColor = 'text-yellow-600';
                    actionButton = `<button class="btn btn-primary" onclick="openQrModal('finalizar_descarga', '${item.id}', '${loja.codlojaqr || ''}', '${exp.id}')">Finalizar Descarga</button>`;
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
        
        async function showYesNoModal(message) {
            // Reutiliza o modal de QR, simplificado
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
                newConfirmBtn.onclick = () => { closeQrModal(); resolve(true); };

                const cancelBtn = modal.querySelector('.btn-danger');
                const newCancelBtn = cancelBtn.cloneNode(true);
                cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                newCancelBtn.textContent = 'Não';
                newCancelBtn.onclick = () => { closeQrModal(); resolve(false); };
                
                modal.style.display = 'flex';
            });
        }
        
        async function marcarRetornoCD(motoristaId, veiculoId) {
            try {
                const motorista = motoristas.find(m => m.id === motoristaId);
                const veiculo = veiculos.find(v => v.id === veiculoId);
                let novoStatusMotorista, novoStatusVeiculo, msg;

                if (motorista.status === 'retornando_com_imobilizado') {
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
                await loadSelectData();
                await renderMotoristasStatusList();
            } catch (error) {
                showNotification('Erro ao marcar retorno: ' + error.message, 'error');
            }
        }
        
        async function finalizarDescargaImobilizado(motoristaId, veiculoId) {
            try {
                await Promise.all([
                    supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: 'disponivel' }, false),
                    supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: 'disponivel' }, false)
                ]);
                showNotification('Descarga de imobilizado finalizada. Motorista e veículo disponíveis!', 'success');
                await loadSelectData();
                await renderMotoristasStatusList();
            } catch (error) {
                showNotification('Erro ao finalizar descarga: ' + error.message, 'error');
            }
        }

        // --- FUNCIONALIDADES DO RELATÓRIO DE MOTORISTAS ---
        
        async function generateMotoristaReports() {
            const dataInicio = document.getElementById('relatorioMotoristaDataInicio').value;
            const dataFim = document.getElementById('relatorioMotoristaDataFim').value;
            
            // Se não há filtros de data, usar últimos 30 dias
            const hoje = new Date();
            const inicioAnalise = dataInicio ? new Date(dataInicio + 'T00:00:00.000Z') : new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
            const fimAnalise = dataFim ? new Date(dataFim + 'T23:59:59.999Z') : hoje;

            try {
                // Buscar expedições entregues no período
                const expeditions = await supabaseRequest('expeditions?status=eq.entregue&order=data_hora.desc');
                const items = await supabaseRequest('expedition_items');
                
                // Filtrar por período
                const expedicoesFiltradas = expeditions.filter(exp => {
                    const dataExp = new Date(exp.data_hora);
                    return dataExp >= inicioAnalise && dataExp <= fimAnalise;
                });

                // Processar dados dos motoristas
                const motoristasStats = {};
                
                expedicoesFiltradas.forEach(exp => {
                    if (!exp.motorista_id) return;
                    
                    const motorista = motoristas.find(m => m.id === exp.motorista_id);
                    if (!motorista) return;
                    
                    const expItems = items.filter(item => item.expedition_id === exp.id);
                    const totalEntregas = expItems.length;
                    const totalPallets = expItems.reduce((sum, item) => sum + (item.pallets || 0), 0);
                    
                    // Calcular tempo total da viagem (da criação até última entrega)
                    let tempoTotalViagem = 0;
                    const ultimaEntrega = expItems.reduce((ultima, item) => {
                        const fimDescarga = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
                        return fimDescarga && (!ultima || fimDescarga > ultima) ? fimDescarga : ultima;
                    }, null);
                    
                    if (ultimaEntrega) {
                        tempoTotalViagem = (ultimaEntrega - new Date(exp.data_hora)) / 60000; // em minutos
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
                    
                    // Calcular ocupação do veículo
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

                // Calcular médias e preparar dados finais
                const motoristasData = Object.values(motoristasStats).map(stats => ({
                    ...stats,
                    tempoMedioViagem: stats.temposTotalViagem.length > 0 ? 
                        stats.temposTotalViagem.reduce((a, b) => a + b, 0) / stats.temposTotalViagem.length : 0,
                    ocupacaoMediaCalc: stats.ocupacaoMedia.length > 0 ? 
                        stats.ocupacaoMedia.reduce((a, b) => a + b, 0) / stats.ocupacaoMedia.length : 0,
                    entregasPorViagem: stats.viagens > 0 ? (stats.entregas / stats.viagens).toFixed(1) : 0
                }));

                // Ordenar por número de entregas (ranking)
                motoristasData.sort((a, b) => b.entregas - a.entregas);

                renderMotoristaReportSummary(motoristasData, expedicoesFiltradas.length);
                renderMotoristaRankingChart(motoristasData.slice(0, 10)); // Top 10
                renderMotoristaTable(motoristasData);

            } catch (error) {
                console.error('Erro ao gerar relatório de motoristas:', error);
                document.getElementById('motoristaReportSummary').innerHTML = 
                    `<div class="alert alert-error">Erro ao carregar relatório: ${error.message}</div>`;
            }
        }

        function renderMotoristaReportSummary(motoristasData, totalExpedicoes) {
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

        function renderMotoristaRankingChart(motoristasData) {
            if (motoristasData.length === 0) {
                destroyChart('motoristasRankingChart');
                return;
            }

            const backgroundColors = motoristasData.map((_, index) => {
                if (index === 0) return 'rgba(255, 215, 0, 0.8)'; // Ouro para 1º lugar
                if (index === 1) return 'rgba(192, 192, 192, 0.8)'; // Prata para 2º lugar  
                if (index === 2) return 'rgba(205, 127, 50, 0.8)'; // Bronze para 3º lugar
                return 'rgba(0, 119, 182, 0.7)'; // Azul padrão para os demais
            });

            renderChart('motoristasRankingChart', 'bar', {
                labels: motoristasData.map(m => m.nome),
                datasets: [{
                    label: 'Número de Entregas',
                    data: motoristasData.map(m => m.entregas),
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(color => color.replace('0.7', '1').replace('0.8', '1')),
                    borderWidth: 2
                }]
            }, {
                indexAxis: 'y',
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        color: '#333',
                        font: { weight: 'bold' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const motorista = motoristasData[context.dataIndex];
                                return [
                                    `Entregas: ${context.raw}`,
                                    `Viagens: ${motorista.viagens}`,
                                    `Tempo Médio: ${minutesToHHMM(motorista.tempoMedioViagem)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Número de Entregas'
                        }
                    }
                }
            });
        }

        function renderMotoristaTable(motoristasData) {
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
        
        // --- FUNÇÕES DO MODAL DE QR CODE ---
        async function openQrModal(action, mainId, code, secondaryId = null) {
            modalState = { action, mainId, secondaryId, expectedCode: code, scannedValue: null };
            const modal = document.getElementById('qrModal');
            document.getElementById('qrModalTitle').textContent = `Escanear QR Code`;
            document.getElementById('qrModalMessage').textContent = `Aponte a câmera para o QR Code do local (código: ${code}).`;
            modal.style.display = 'flex';
            
            if (html5QrCodeScanner) await stopScannerSafely();
            html5QrCodeScanner = new Html5Qrcode("qr-reader");
            try {
                await html5QrCodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, ()=>{});
                scannerIsRunning = true;
            } catch (err) {
                document.getElementById('qr-reader').innerHTML = '<p class="text-red-500">Erro ao iniciar câmera. Use a inserção manual.</p>';
                document.getElementById('manualInputContainer').style.display = 'block';
            }
        }

        function onScanSuccess(decodedText) {
            if (modalState.scannedValue !== decodedText) {
                modalState.scannedValue = decodedText;
                document.getElementById('scannedValue').textContent = decodedText;
                document.getElementById('qr-result-display').style.display = 'block';
                document.getElementById('confirmQrBtn').disabled = false;
                stopScannerSafely();
            }
        }

        async function stopScannerSafely() {
            if (html5QrCodeScanner && scannerIsRunning) {
                try { await html5QrCodeScanner.stop(); } catch(e) {}
                scannerIsRunning = false;
            }
        }

        function closeQrModal() {
            stopScannerSafely();
            document.getElementById('qrModal').style.display = 'none';
        }

        async function handleQrScan() {
            let value = modalState.scannedValue || document.getElementById('qrCodeInput').value.trim();
            if (value.toLowerCase() !== modalState.expectedCode.toLowerCase()) {
                showNotification(`QR Code incorreto! Esperado: "${modalState.expectedCode}"`, 'error');
                return;
            }
            closeQrModal();
            switch(modalState.action) {
                case 'iniciar': await startLoading(modalState.mainId); break;
                case 'finalizar': await finishLoading(modalState.mainId); break;
                case 'iniciar_descarga': await iniciarDescarga(modalState.mainId); break;
                case 'finalizar_descarga': await finalizarDescarga(modalState.mainId); break;
            }
        }

        async function startLoading(expeditionId) { /* ... */ }
        async function finishLoading(expeditionId) { /* ... */ }

        async function iniciarDescarga(itemId) {
            try {
                await supabaseRequest(`expedition_items?id=eq.${itemId}`, 'PATCH', { status_descarga: 'em_descarga', data_inicio_descarga: new Date().toISOString() });
                showNotification('Descarga iniciada!', 'success');
                consultarExpedicoesPorPlaca();
            } catch(error) {
                showNotification('Erro ao iniciar descarga: ' + error.message, 'error');
            }
        }

        async function finalizarDescarga(itemId) {
            try {
                await supabaseRequest(`expedition_items?id=eq.${itemId}`, 'PATCH', { status_descarga: 'descarregado', data_fim_descarga: new Date().toISOString() });
                
                const itemData = await supabaseRequest(`expedition_items?id=eq.${itemId}&select=expedition_id`);
                const expeditionId = itemData[0].expedition_id;
                const allItems = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`);

                if (allItems.every(item => item.status_descarga === 'descarregado')) {
                    await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', { status: 'entregue' });
                    const comImobilizado = await showYesNoModal('Retornando com imobilizados?');
                    const novoStatus = comImobilizado ? 'retornando_com_imobilizado' : 'retornando_cd';
                    
                    const expDetails = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=motorista_id`);
                    await supabaseRequest(`motoristas?id=eq.${expDetails[0].motorista_id}`, 'PATCH', { status: novoStatus }, false);
                    
                    showNotification(`Última entrega finalizada! Viagem concluída.`, 'success');
                } else {
                    showNotification('Descarga da loja finalizada!', 'success');
                }
                consultarExpedicoesPorPlaca();
            } catch(error) {
                showNotification('Erro ao finalizar descarga: ' + error.message, 'error');
            }
        }
        
        // --- FUNCIONALIDADES DA ABA ACOMPANHAMENTO ---
        async function loadAcompanhamento() {
            showSubTab('acompanhamento', 'expedicoesEmAndamento', document.querySelector('#acompanhamento .sub-tab'));
            setDefaultDateFilters();
            
            const tbody = document.getElementById('acompanhamentoBody');
            tbody.innerHTML = `<tr><td colspan="12" class="loading"><div class="spinner"></div>Carregando expedições...</td></tr>`;

            try {
                const expeditions = await supabaseRequest('expeditions?status=not.eq.entregue&order=data_hora.desc');
                const items = await supabaseRequest('expedition_items');
                
                allExpeditions = expeditions.map(exp => {
                    const expItems = items.filter(item => item.expedition_id === exp.id);
                    const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
                    const totalCarga = (expItems.reduce((s, i) => s + (i.pallets || 0), 0)) + ((expItems.reduce((s, i) => s + (i.rolltrainers || 0), 0)) / 2);

                    return {
                        ...exp, items: expItems,
                        total_pallets: expItems.reduce((s, i) => s + (i.pallets || 0), 0),
                        total_rolltrainers: expItems.reduce((s, i) => s + (i.rolltrainers || 0), 0),
                        lojas_count: expItems.length,
                        lojas_info: expItems.map(item => {
    const loja = lojas.find(l => l.id === item.loja_id);
    return loja ? `${loja.codigo} - ${loja.nome}` : 'N/A';
}).join(', '),
                        doca_nome: docas.find(d => d.id === exp.doca_id)?.nome || 'N/A',
                        lider_nome: lideres.find(l => l.id === exp.lider_id)?.nome || 'N/A',
                        veiculo_placa: veiculo?.placa,
                        motorista_nome: motoristas.find(m => m.id === exp.motorista_id)?.nome,
                        ocupacao: veiculo && veiculo.capacidade_pallets > 0 ? (totalCarga / veiculo.capacidade_pallets) * 100 : 0
                    };
                });
                
                populateStatusFilter();
applyFilters();

// Popula filtro de motoristas para rastreio
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

            filteredExpeditions = allExpeditions.filter(exp => {
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
            const hoje = new Date().toISOString().split('T')[0];
            document.getElementById('filtroDataInicio').value = hoje;
            document.getElementById('filtroDataFim').value = hoje;
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
// Verificar se pode editar/excluir
const canEdit = exp.status !== 'saiu_para_entrega' && exp.status !== 'entregue';
const editButton = canEdit ? 
    `<button class="btn btn-warning btn-small" onclick="openEditModal('${exp.id}')">Editar</button>` :
    `<button class="btn btn-secondary btn-small" disabled title="Não pode editar após saída para entrega">Editar</button>`;
const deleteButton = canEdit ?
    `<button class="btn btn-danger btn-small" onclick="deleteExpedition('${exp.id}')">Excluir</button>` :
    `<button class="btn btn-secondary btn-small" disabled title="Não pode excluir após saída para entrega">Excluir</button>`;
                return `
                    <tr class="hover:bg-gray-50 text-sm">
                        <td>${new Date(exp.data_hora).toLocaleString('pt-BR')}</td>
                        <td class="whitespace-normal">
                            ${exp.lojas_info}
                            ${exp.numeros_carga_display ? `<br><span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">📦 ${exp.numeros_carga_display}</span>` : ''}
                        </td>
                        <td>${exp.total_pallets}</td>
                        <td>${exp.total_rolltrainers}</td>
                        <td>${exp.doca_nome}</td>
                        <td>${exp.lider_nome}</td>
                        <td><span class="status-badge status-${exp.status}">${getStatusLabel(exp.status)}</span></td>
                        <td>${exp.veiculo_placa || '-'}</td>
                        <td>
                            <div class="progress-container"><div class="progress-bar ${barColor}" style="width: ${Math.min(100, ocupacaoPerc)}%;">${ocupacaoPerc}%</div></div>
                        </td>
                        <td>${exp.motorista_nome || '-'}</td>
                        <td class="text-xs">
                            <div>Aloc: ${tempos.alocar}</div>
                            <div>Cheg: ${tempos.chegada}</div>
                            <div>Carr: ${tempos.carreg}</div>
                        </td>
                      <td>
    <div class="flex gap-2">
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
                
                const statusHistory = await supabaseRequest(`veiculos_status_historico?created_at=gte.${startQuery.toISOString()}&created_at=lte.${endOfAnalysis.toISOString()}&order=created_at.asc`, 'GET', null, false);

                const ociosidadeData = [];

                for (const veiculo of veiculos) {
                    if (veiculo.filial !== selectedFilial.nome) continue;

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

                    if (statusAtual === 'disponivel') {
                        tempoOciosoTotal += (endOfAnalysis - ultimoTimestamp);
                    }

                    ociosidadeData.push({
                        placa: veiculo.placa,
                        status: veiculo.status,
                        idleTime: tempoOciosoTotal / 60000, // para minutos
                        idleSince: inicioOciosidadeAtual,
                        lastAction: ultimoTimestamp > startOfAnalysis ? ultimoTimestamp : null
                    });
                }
                
                const mediaOciosidade = ociosidadeData.length > 0 ? ociosidadeData.reduce((sum, v) => sum + v.idleTime, 0) / ociosidadeData.length : 0;
                document.getElementById('totalOciosidade').textContent = minutesToHHMM(mediaOciosidade);
                document.getElementById('frotaAtiva').textContent = veiculos.filter(v => v.status !== 'disponivel' && v.status !== 'folga' && v.status !== 'manutencao').length;
                document.getElementById('frotaOciosa').textContent = veiculos.filter(v => v.status === 'disponivel').length;
                
                renderOciosidadeTable(ociosidadeData.sort((a, b) => b.idleTime - a.idleTime));

            } catch (error) {
                console.error('Erro ao carregar dados da frota:', error);
                tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao calcular ociosidade: ${error.message}</td></tr>`;
            }
        }
        
        function renderOciosidadeTable(data) {
            const tbody = document.getElementById('ociosidadeBody');
            if (!tbody) return;

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum dado de ociosidade encontrado para o período.</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(v => {
                const tempoOciosoDisplay = v.idleTime > 0 ? minutesToHHMM(v.idleTime) : '-';
                const ociosoDesdeDisplay = v.idleSince ? new Date(v.idleSince).toLocaleString('pt-BR') : '-';
                const ultimaAcaoDisplay = v.lastAction ? new Date(v.lastAction).toLocaleString('pt-BR') : '-';

                return `
                    <tr class="hover:bg-gray-50 text-sm">
                        <td class="font-semibold">${v.placa}</td>
                        <td><span class="status-badge status-${v.status.replace(/ /g, '_')}">${getStatusLabel(v.status)}</span></td>
                        <td>${ociosoDesdeDisplay}</td>
                        <td>${tempoOciosoDisplay}</td>
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

// Função de rastreio em tempo real (Versão corrigida)
async function loadRastreioData() {
    try {
        console.log("Iniciando carregamento dos dados de rastreio...");
        const expeditionsEmRota = await supabaseRequest('expeditions?status=eq.saiu_para_entrega&order=data_saida_entrega.desc');
        const items = await supabaseRequest('expedition_items');
        
        let locations = [];
        const expeditionIds = expeditionsEmRota.map(exp => exp.id);
        if (expeditionIds.length > 0) {
            const query = `gps_tracking?expedition_id=in.(${expeditionIds.join(',')})&order=data_gps.desc`;
            locations = await supabaseRequest(query, 'GET', null, false);
        }

        const promessasRoteamento = expeditionsEmRota.map(async exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const motorista = motoristas.find(m => m.id === exp.motorista_id);
            const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
            const currentLocation = locations.find(loc => loc.expedition_id === exp.id);
            
            if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) {
                return;
            }

            const itemsOrdenados = expItems.sort((a, b) => {
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
            
            let distanciaTotalKm = 0;
            let tempoTotalRota = 0;
            let eta = new Date();
            
            // Re-calcula a rota completa do CD até a última loja para obter a distância total
            const waypoints = [
                { lat: selectedFilial.latitude_cd, lng: selectedFilial.longitude_cd },
                ...itemsOrdenados.map(item => {
                    const loja = lojas.find(l => l.id === item.loja_id);
                    return { lat: loja.latitude, lng: loja.longitude };
                })
            ];

            if (waypoints.length > 1) {
                const rotaCompleta = await getRouteFromAPI(waypoints);
                if (rotaCompleta) {
                    distanciaTotalKm = rotaCompleta.distance / 1000;
                    tempoTotalRota = rotaCompleta.duration / 60;
                }
            }

            // Calcula a ETA para a próxima parada, se houver
            if (proximaLoja && proximaLoja.latitude && proximaLoja.longitude) {
                const rotaProximaLoja = await getRouteFromAPI([{ lat: currentLocation.latitude, lng: currentLocation.longitude }, { lat: proximaLoja.latitude, lng: proximaLoja.longitude }]);
                if(rotaProximaLoja) {
                    const tempoEstimadoMinutos = rotaProximaLoja.duration / 60;
                    eta = new Date(new Date().getTime() + tempoEstimadoMinutos * 60000);
                }
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
                distancia_total_km: distanciaTotalKm,
                tempo_total_rota: tempoTotalRota,
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

        const results = await Promise.all(promessasRoteamento);
        rastreioData = results.filter(Boolean);

        const motoristasRetornando = await supabaseRequest('motoristas?status=in.(retornando_cd,retornando_com_imobilizado)');
        const returningMotoristIds = motoristasRetornando.map(m => m.id);

        let returningLocations = [];
        if (returningMotoristIds.length > 0) {
            const query = `gps_tracking?motorista_id=in.(${returningMotoristIds.join(',')})&order=data_gps.desc`;
            returningLocations = await supabaseRequest(query, 'GET', null, false);
        }

        const promessasRetorno = motoristasRetornando.map(async m => {
            const currentLocation = returningLocations.find(loc => loc.motorista_id === m.id);
            if (currentLocation && currentLocation.latitude && currentLocation.longitude) {
                const cdCoords = { lat: selectedFilial.latitude_cd, lng: selectedFilial.longitude_cd };
                const rota = await getRouteFromAPI([{ lat: currentLocation.latitude, lng: currentLocation.longitude }, { lat: cdCoords.lat, lng: cdCoords.lng }]);
                const distanciaTotalKm = rota ? rota.distance / 1000 : 0;
                const tempoEstimadoMinutos = rota ? rota.duration / 60 : 0;
                const eta = new Date(new Date().getTime() + tempoEstimadoMinutos * 60000);
                
                return {
                    id: `return-${m.id}`,
                    motorista_id: m.id,
                    motorista_nome: m.nome,
                    veiculo_placa: veiculos.find(v => v.id === m.veiculo_id)?.placa || 'N/A',
                    status_rastreio: 'retornando',
                    distancia_total_km: distanciaTotalKm,
                    coordenadas: {
                        lat: parseFloat(currentLocation.latitude),
                        lng: parseFloat(currentLocation.longitude)
                    },
                    eta: eta,
                    last_update: new Date(currentLocation.data_gps),
                    pontos_proximos: checkProximityToPontosInteresse(currentLocation.latitude, currentLocation.longitude)
                };
            }
            return null;
        });

        const returningResults = await Promise.all(promessasRetorno);
        rastreioData.push(...returningResults.filter(Boolean));

        updateRastreioStats();
        applyRastreioFilters();
        updateLastRefreshTime();

    } catch (error) {
        console.error('Erro ao carregar dados de rastreio:', error);
        document.getElementById('rastreioList').innerHTML = `<div class="alert alert-error">Erro ao carregar dados de rastreio: ${error.message}</div>`;
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

function renderRastreioList(data) {
    const container = document.getElementById('rastreioList');
    
    if (data.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum veículo em rota no momento.</div>';
        return;
    }
    
    container.innerHTML = data.map(rastreio => {
        let statusInfo = '';
        let locationInfo = '';
        let nextActionInfo = '';
        
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
if (rastreio.pontos_proximos && rastreio.pontos_proximos.length > 0) {
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
    <button class="btn btn-warning btn-small" onclick="showTrajectoryMap('${rastreio.id}', '${rastreio.veiculo_placa}')">
        Ver Trajeto
    </button>
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
                            
                            // ...
return `<div class="flex items-center text-sm ...">
    <span class="mr-2">${iconStatus}</span>
    <span>${index + 1}. ${loja?.codigo || 'N/A'} - ${loja?.nome || 'N/A'}</span>
    ${item.data_fim_descarga ? `<span class="ml-auto text-xs">${new Date(item.data_fim_descarga).toLocaleTimeString('pt-BR')}</span>` : ''}
</div>`;
// ...
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
        rastreioTimer = setInterval(() => {
            loadRastreioData();
        }, 15000);
        showNotification('Auto-refresh ativado (15s)', 'success');
    } else {
        if (rastreioTimer) {
            clearInterval(rastreioTimer);
            rastreioTimer = null;
        }
        showNotification('Auto-refresh desativado', 'info');
    }
}

function updateLastRefreshTime() {
    const now = new Date();
    document.getElementById('lastUpdateRastreio').textContent = 
        `Última atualização: ${now.toLocaleTimeString('pt-BR')}`;
}
        // --- FUNCIONALIDADES DA ABA HISTÓRICO ---
        async function loadHistorico() {
            showSubTab('historico', 'listaEntregas', document.querySelector('#historico .sub-tab'));
            const container = document.getElementById('historicoList');
            container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando histórico...</div>`;
            try {
                const expeditions = await supabaseRequest('expeditions?status=eq.entregue&order=data_hora.desc');
                const items = await supabaseRequest('expedition_items');
                
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
            } catch(error) {
                container.innerHTML = `<div class="alert alert-error">Erro ao carregar histórico: ${error.message}</div>`;
            }
        }

        function applyHistoricoFilters() {
            const dataInicio = document.getElementById('historicoFiltroDataInicio').value || document.getElementById('indicadoresFiltroDataInicio').value;
            const dataFim = document.getElementById('historicoFiltroDataFim').value || document.getElementById('indicadoresFiltroDataFim').value;
            const searchTerm = document.getElementById('historicoSearchInput').value.toLowerCase();

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

        function clearHistoricoFilters() {
            document.getElementById('historicoFiltroDataInicio').value = '';
            document.getElementById('historicoFiltroDataFim').value = '';
            document.getElementById('historicoSearchInput').value = '';
            document.getElementById('indicadoresFiltroDataInicio').value = '';
            document.getElementById('indicadoresFiltroDataFim').value = '';
            applyHistoricoFilters();
        }

        function renderHistorico(data) {
            const container = document.getElementById('historicoList');
            if (data.length === 0) {
                container.innerHTML = '<div class="alert alert-success">Nenhum registro encontrado para os filtros.</div>';
                return;
            }

            container.innerHTML = data.map(exp => {
                 const tempos = {
                    patio: (exp.data_saida_veiculo && exp.data_hora) ? minutesToHHMM((new Date(exp.data_saida_veiculo) - new Date(exp.data_hora)) / 60000) : '-',
                    carregamento: (exp.data_chegada_veiculo && exp.data_saida_veiculo) ? minutesToHHMM((new Date(exp.data_saida_veiculo) - new Date(exp.data_chegada_veiculo)) / 60000) : '-',
                };

                let roteiroHtml = '<div class="mt-4 space-y-2">';
                if (exp.items && exp.items.length > 0) {
                     exp.items.sort((a,b) => new Date(a.data_inicio_descarga) - new Date(b.data_inicio_descarga)).forEach((item, index) => {
                        const loja = lojas.find(l => l.id === item.loja_id);
                        const t_chegada = item.data_inicio_descarga ? new Date(item.data_inicio_descarga) : null;
                        const t_saida = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
                        const tempoEmLoja = t_saida && t_chegada ? (t_saida - t_chegada) / 60000 : null;

                        roteiroHtml += `
                            <div class="loja-descarga-card" style="padding: 10px; margin-bottom: 8px;">
                                <strong class="text-sm">${index + 1}. ${loja.codigo} - ${loja.nome}</strong>
                                ${tempoEmLoja !== null ? `<div class="time-display good text-xs p-1"><strong>Em Loja:</strong> ${minutesToHHMM(tempoEmLoja)}</div>` : ''}
                            </div>`;
                     });
                }
                roteiroHtml += '</div>';

                return `
                    <div class="historico-card">
                        <div class="flex justify-between items-start">
                           <div>
                                <h3 class="text-lg font-bold">${new Date(exp.data_hora).toLocaleDateString('pt-BR')} - ${exp.veiculo_placa}</h3>
                                <p class="text-sm text-gray-500">Motorista: ${exp.motorista_nome}</p>
                                ${exp.numeros_carga && exp.numeros_carga.length > 0 ? `<p class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1 inline-block">📦 ${exp.numeros_carga.join(', ')}</p>` : ''}
                            </div>
                            <div class="flex flex-col items-end gap-2">
    <span class="status-badge status-entregue">Entregue</span>
    <div class="flex gap-2">
        <button class="btn btn-success btn-small" onclick="showTrajectoryMap('${exp.id}', '${exp.veiculo_placa}')">Ver Trajeto</button>
        <button class="btn btn-danger btn-small" onclick="deleteHistoricoExpedition('${exp.id}')">Excluir</button>
    </div>
</div>
                        </div>
                        <div class="mt-2 grid grid-cols-2 gap-4 text-sm">
                            <div><strong>Ocupação:</strong> <span class="font-bold">${exp.ocupacao}%</span></div>
                            <div><strong>Pallets:</strong> <span class="font-bold">${exp.total_pallets}</span></div>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs">
                            <div class="time-display"><strong>T. Pátio:</strong> ${tempos.patio}</div>
                            <div class="time-display"><strong>T. Carga:</strong> ${tempos.carregamento}</div>
                        </div>
                        ${roteiroHtml}
                    </div>
                `;
            }).join('');
        }
        
        async function deleteHistoricoExpedition(expeditionId) {
            const confirmed = await showYesNoModal('Deseja excluir permanentemente esta expedição do histórico?');
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

        function generateHistoricoIndicators(data) {
            const summaryContainer = document.getElementById('indicadoresSummary');
            if (data.length === 0) {
                summaryContainer.innerHTML = '<div class="alert alert-info">Sem dados para exibir indicadores.</div>';
                destroyChart('lojasRankingChart');
                destroyChart('entregasChart');
                return;
            }
            
            const calcularMedia = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
            
            let temposAlocar = [], temposChegada = [], temposCarregamento = [], temposTotalViagem = [], temposEmTransito = [], temposEmLoja = [];
            let lojasData = {};
            let entregasFort = 0, entregasComper = 0;

            data.forEach(exp => {
                if (exp.data_alocacao_veiculo) temposAlocar.push((new Date(exp.data_alocacao_veiculo) - new Date(exp.data_hora)) / 60000);
                if (exp.data_chegada_veiculo) temposChegada.push((new Date(exp.data_chegada_veiculo) - new Date(exp.data_hora)) / 60000);
                if (exp.data_chegada_veiculo && exp.data_saida_veiculo) temposCarregamento.push((new Date(exp.data_saida_veiculo) - new Date(exp.data_chegada_veiculo)) / 60000);
                
                let ultimaData = exp.data_saida_entrega ? new Date(exp.data_saida_entrega) : null;
                let totalTransitoViagem = 0;
                let totalLojaViagem = 0;
                let ultimaDescarga = null;

                exp.items.forEach(item => {
                    const t_chegada = item.data_inicio_descarga ? new Date(item.data_inicio_descarga) : null;
                    const t_saida = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
                    const tempoEmLoja = t_saida && t_chegada ? (t_saida - t_chegada) / 60000 : 0;
                    const tempoTransito = ultimaData && t_chegada ? (t_chegada - ultimaData) / 60000 : 0;
                    
                    if (tempoEmLoja > 0) {
                        totalLojaViagem += tempoEmLoja;
                        const loja = lojas.find(l => l.id === item.loja_id);
                        if(loja) {
                            if (!lojasData[loja.id]) lojasData[loja.id] = { nome: `${loja.codigo} - ${loja.nome}`, tempos: [], entregas: 0 };
                            lojasData[loja.id].tempos.push(tempoEmLoja);
                            lojasData[loja.id].entregas++;
                            if (loja.nome.toLowerCase().includes('fort')) entregasFort++;
                            else if (loja.nome.toLowerCase().includes('comper')) entregasComper++;
                        }
                    }
                    if (tempoTransito > 0) totalTransitoViagem += tempoTransito;
                    if (t_saida) ultimaData = t_saida;
                    if (t_saida && (!ultimaDescarga || t_saida > ultimaDescarga)) ultimaDescarga = t_saida;
                });
                if (totalLojaViagem > 0) temposEmLoja.push(totalLojaViagem);
                if (totalTransitoViagem > 0) temposEmTransito.push(totalTransitoViagem);
                if(ultimaDescarga) temposTotalViagem.push((ultimaDescarga - new Date(exp.data_hora)) / 60000);
            });
            
            summaryContainer.innerHTML = `
                <div class="time-stat-card"><div class="stat-number">${data.length}</div><div class="stat-label">Viagens</div></div>
                <div class="time-stat-card"><div class="stat-number">${data.reduce((s,e)=> s + e.lojas_count, 0)}</div><div class="stat-label">Entregas</div></div>
                <div class="time-stat-card"><div class="stat-number">${minutesToHHMM(calcularMedia(temposAlocar))}</div><div class="stat-label">T.M. Alocar</div></div>
                <div class="time-stat-card"><div class="stat-number">${minutesToHHMM(calcularMedia(temposCarregamento))}</div><div class="stat-label">T.M. Carga</div></div>
                <div class="time-stat-card"><div class="stat-number">${minutesToHHMM(calcularMedia(temposTotalViagem))}</div><div class="stat-label">T.M. Viagem</div></div>
                <div class="time-stat-card"><div class="stat-number">${minutesToHHMM(calcularMedia(temposEmTransito))}</div><div class="stat-label">T.M. Trânsito</div></div>
                <div class="time-stat-card"><div class="stat-number">${minutesToHHMM(calcularMedia(temposEmLoja))}</div><div class="stat-label">T.M. em Loja</div></div>
            `;

           renderLojasRankingChart(lojasData);
renderEntregasChart(entregasFort, entregasComper);
        }
        
       function renderLojasRankingChart(lojasData) {
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
                            label: function(context) {
                                return `Tempo Médio: ${minutesToHHMM(context.raw)}`;
                            }
                        }
                    }
                }
            });
        }

        function renderEntregasChart(fort, comper) {
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
                            return `${value}\n(${percentage})`;
                        }
                    }
                }
            });
        }

        function renderChart(canvasId, type, data, options = {}, plugins = []) {
            if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
            const ctx = document.getElementById(canvasId)?.getContext('2d');
            if (ctx) {
                chartInstances[canvasId] = new Chart(ctx, { type, data, options, plugins });
            }
        }

        function destroyChart(canvasId) {
            if (chartInstances[canvasId]) {
                chartInstances[canvasId].destroy();
                delete chartInstances[canvasId];
            }
        }

// Função para mostrar modal de autenticação para edição - MODIFICADA
function showAuthEditModal(expeditionId) {
    // Armazena o ID no próprio formulário como um campo hidden
    document.getElementById('authEditModal').style.display = 'flex';
    document.getElementById('authEditUser').value = '';
    document.getElementById('authEditPassword').value = '';
    document.getElementById('authEditAlert').innerHTML = '';
    
    // ADICIONA UM CAMPO HIDDEN COM O ID DA EXPEDIÇÃO
    let hiddenIdField = document.getElementById('authEditExpeditionId');
    if (!hiddenIdField) {
        hiddenIdField = document.createElement('input');
        hiddenIdField.type = 'hidden';
        hiddenIdField.id = 'authEditExpeditionId';
        document.getElementById('authEditForm').appendChild(hiddenIdField);
    }
    hiddenIdField.value = expeditionId;
    
    document.getElementById('authEditUser').focus();
}

// Função para fechar modal de autenticação
function closeAuthEditModal() {
    document.getElementById('authEditModal').style.display = 'none';
}

// Função para verificar autenticação para edição - SIMPLIFICADA
async function checkAuthForEdit() {
    const nome = document.getElementById('authEditUser').value.trim();
    const senha = document.getElementById('authEditPassword').value;
    const expeditionId = document.getElementById('authEditExpeditionId').value;

    if (!nome || !senha) {
        showAlert('authEditAlert', 'Usuário e senha são obrigatórios.', 'error');
        return;
    }

    if (!expeditionId) {
        showAlert('authEditAlert', 'Erro: ID da expedição não encontrado.', 'error');
        return;
    }

    try {
        const endpoint = `acessos?select=nome,tipo_acesso&nome=eq.${nome}&senha=eq.${senha}`;
        const result = await supabaseRequest(endpoint, 'GET', null, false);

        if (!result || result.length === 0) {
            showAlert('authEditAlert', 'Usuário ou senha incorretos.', 'error');
            document.getElementById('authEditPassword').value = '';
            return;
        }

        const user = result[0];
        
        // Verifica se o usuário tem permissão (ALL ou filial específica)
        if (user.tipo_acesso !== 'ALL' && user.tipo_acesso !== selectedFilial.nome) {
            showAlert('authEditAlert', 'Você não tem permissão para editar nesta filial.', 'error');
            return;
        }

        // Autenticação bem-sucedida
        closeAuthEditModal();
        showNotification(`Acesso autorizado para ${user.nome}!`, 'success');
        
        // Abre o modal de edição diretamente
        openEditModalDirectly(expeditionId);

    } catch (error) {
        showAlert('authEditAlert', 'Erro ao verificar credenciais. Tente novamente.', 'error');
        console.error('Erro na autenticação:', error);
    }
}

      // Função para abrir modal de edição (SUBSTITUÍDA)
async function openEditModal(expeditionId) {
    if (!hasPermission('editar_expedicao')) {
        showNotification('Você não tem permissão para editar expedições.', 'error');
        return;
    }

    let expedition = allExpeditions ? allExpeditions.find(e => e.id === expeditionId) : null;

    if (!expedition) {
        try {
            const expeditions = await supabaseRequest(`expeditions?id=eq.${expeditionId}`);
            const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`);

            if (expeditions && expeditions.length > 0) {
                expedition = expeditions[0];
                expedition.items = items || [];
            }
        } catch (error) {
            console.error('Erro ao buscar expedição:', error);
        }
    }

    if (!expedition) {
        showNotification('Expedição não encontrada', 'error');
        return;
    }

    if (expedition.status === 'saiu_para_entrega' || expedition.status === 'entregue') {
        showNotification('Esta expedição não pode mais ser editada pois já saiu para entrega.', 'error');
        return;
    }

    document.getElementById('editExpeditionId').value = expeditionId;

    populateEditSelects();

    document.getElementById('editMotorista').value = expedition.motorista_id || '';
    document.getElementById('editVeiculo').value = expedition.veiculo_id || '';
    document.getElementById('editDoca').value = expedition.doca_id || '';
    document.getElementById('editLider').value = expedition.lider_id || '';
    document.getElementById('editObservacoes').value = expedition.observacoes || '';

    const lojasContainer = document.getElementById('editLojasContainer');
    lojasContainer.innerHTML = '<h4 class="font-semibold text-gray-700">Lojas e Quantidades</h4>';
    editLojaLineCounter = 0;

    if (expedition.items && expedition.items.length > 0) {
        expedition.items.forEach(item => addEditLojaLine(item));
    }

    document.getElementById('editExpeditionModal').style.display = 'flex';
}
// Função que abre o modal de edição sem verificação
async function openEditModalDirectly(expeditionId) {
    // Primeiro, garante que temos os dados carregados
    if (!allExpeditions || allExpeditions.length === 0) {
        showNotification('Carregando dados...', 'info');
        await loadAcompanhamento();
    }
    
    let expedition = allExpeditions ? allExpeditions.find(e => e.id === expeditionId) : null;
    
    if (!expedition) {
        // Tenta buscar diretamente do banco
        try {
            const expeditions = await supabaseRequest(`expeditions?id=eq.${expeditionId}`);
            const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`);
            
            if (expeditions && expeditions.length > 0) {
                expedition = expeditions[0];
                expedition.items = items || [];
            }
        } catch (error) {
            console.error('Erro ao buscar expedição:', error);
        }
    }
    
    if (!expedition) {
        showNotification('Expedição não encontrada', 'error');
        return;
    }

    // Verificar se a expedição pode ser editada
    if (expedition.status === 'saiu_para_entrega' || expedition.status === 'entregue') {
        showNotification('Esta expedição não pode mais ser editada pois já saiu para entrega.', 'error');
        return;
    }
    
    document.getElementById('editExpeditionId').value = expeditionId;
    
    // Preencher selects com opções
    populateEditSelects();
    
    // Preencher campos editáveis (removendo status)
    document.getElementById('editMotorista').value = expedition.motorista_id || '';
    document.getElementById('editVeiculo').value = expedition.veiculo_id || '';
    document.getElementById('editDoca').value = expedition.doca_id || '';
    document.getElementById('editLider').value = expedition.lider_id || '';
    document.getElementById('editObservacoes').value = expedition.observacoes || '';

    const lojasContainer = document.getElementById('editLojasContainer');
    lojasContainer.innerHTML = '<h4 class="font-semibold text-gray-700">Lojas e Quantidades</h4>';
    editLojaLineCounter = 0;
    
    if (expedition.items && expedition.items.length > 0) {
        expedition.items.forEach(item => addEditLojaLine(item));
    }
    
    document.getElementById('editExpeditionModal').style.display = 'flex';
}
// Nova função para popular os selects do modal de edição
function populateEditSelects() {
    // Veículos
    const veiculoSelect = document.getElementById('editVeiculo');
    veiculoSelect.innerHTML = '<option value="">Selecione o veículo</option>';
    veiculos.forEach(v => {
        veiculoSelect.innerHTML += `<option value="${v.id}">${v.placa} - ${v.modelo} (Cap: ${v.capacidade_pallets}P)</option>`;
    });

    // Motoristas
    const motoristaSelect = document.getElementById('editMotorista');
    motoristaSelect.innerHTML = '<option value="">Selecione o motorista</option>';
    motoristas.forEach(m => {
        motoristaSelect.innerHTML += `<option value="${m.id}">${m.nome}</option>`;
    });

    // Docas
    const docaSelect = document.getElementById('editDoca');
    docaSelect.innerHTML = '<option value="">Selecione a doca</option>';
    docas.forEach(d => {
        docaSelect.innerHTML += `<option value="${d.id}">${d.nome}</option>`;
    });

    // Líderes
    const liderSelect = document.getElementById('editLider');
    liderSelect.innerHTML = '<option value="">Selecione o líder</option>';
    lideres.forEach(l => {
        liderSelect.innerHTML += `<option value="${l.id}">${l.nome}</option>`;
    });
}

        function closeEditModal() {
            document.getElementById('editExpeditionModal').style.display = 'none';
        }

        function addEditLojaLine(item = null) {
            editLojaLineCounter++;
            const container = document.getElementById('editLojasContainer');
            const newLine = document.createElement('div');
            newLine.className = 'grid grid-cols-1 md:grid-cols-4 gap-4 items-end';
            newLine.dataset.editIndex = editLojaLineCounter;
            
            newLine.innerHTML = `
                <div class="form-group md:col-span-2"><label>Loja:</label><select class="edit-loja-select w-full">${lojas.map(l => `<option value="${l.id}">${l.codigo} - ${l.nome}</option>`).join('')}</select></div>
                <div class="form-group"><label>Pallets:</label><input type="number" class="edit-pallets-input w-full" min="0"></div>
                <div><button type="button" class="btn btn-danger btn-small w-full" onclick="removeEditLojaLine(${editLojaLineCounter})">Remover</button></div>
            `;
            container.appendChild(newLine);
            
            if(item) {
                newLine.querySelector('.edit-loja-select').value = item.loja_id;
                newLine.querySelector('.edit-pallets-input').value = item.pallets;
            }
        }
        
        function removeEditLojaLine(index) {
            document.querySelector(`[data-edit-index="${index}"]`)?.remove();
        }

        async function saveEditedExpedition() {
  const expeditionId = document.getElementById('editExpeditionId').value;
  const newVeiculo = document.getElementById('editVeiculo').value;
  const newMotorista = document.getElementById('editMotorista').value;
  const newDoca = document.getElementById('editDoca').value;
  const newLider = document.getElementById('editLider').value;
  const newObservacoes = document.getElementById('editObservacoes').value;

  // 1. Coletar os novos dados dos itens da expedição (lojas)
  const newItemsData = Array.from(document.querySelectorAll('#editLojasContainer .grid')).map(row => ({
    loja_id: row.querySelector('.edit-loja-select').value,
    pallets: parseInt(row.querySelector('.edit-pallets-input').value) || 0,
    rolltrainers: 0 // Assumindo que rolltrainers não são editáveis nesta tela
  }));

  try {
    // Encontra a expedição original
    const originalExpedition = allExpeditions.find(e => e.id === expeditionId);
    if (!originalExpedition) {
      throw new Error('Expedição original não encontrada.');
    }

    // Verificar se pode editar
    if (originalExpedition.status === 'saiu_para_entrega' || originalExpedition.status === 'entregue') {
      throw new Error('Esta expedição não pode mais ser editada pois já saiu para entrega.');
    }

    const updatePromises = [];

    // 2. Liberar recursos antigos se houve mudança
    if (originalExpedition.motorista_id && originalExpedition.motorista_id !== newMotorista) {
      updatePromises.push(
        supabaseRequest(`motoristas?id=eq.${originalExpedition.motorista_id}`, 'PATCH', { status: 'disponivel' }, false)
      );
    }

    if (originalExpedition.veiculo_id && originalExpedition.veiculo_id !== newVeiculo) {
      updatePromises.push(
        supabaseRequest(`veiculos?id=eq.${originalExpedition.veiculo_id}`, 'PATCH', { status: 'disponivel' }, false)
      );
    }

    if (originalExpedition.doca_id && originalExpedition.doca_id !== newDoca) {
      updatePromises.push(
        supabaseRequest(`docas?id=eq.${originalExpedition.doca_id}`, 'PATCH', { status: 'disponivel' }, false)
      );
    }

    // 3. Alocar novos recursos se foram selecionados
    if (newMotorista && newMotorista !== originalExpedition.motorista_id) {
      updatePromises.push(
        supabaseRequest(`motoristas?id=eq.${newMotorista}`, 'PATCH', { status: 'em_viagem' }, false)
      );
    }

    if (newVeiculo && newVeiculo !== originalExpedition.veiculo_id) {
      updatePromises.push(
        supabaseRequest(`veiculos?id=eq.${newVeiculo}`, 'PATCH', { status: 'em_uso' }, false)
      );
    }

    if (newDoca && newDoca !== originalExpedition.doca_id) {
      updatePromises.push(
        supabaseRequest(`docas?id=eq.${newDoca}`, 'PATCH', { status: 'em_uso' }, false)
      );
    }

    // 4. Atualizar os dados da expedição principal
    const expeditionUpdatePayload = {
      veiculo_id: newVeiculo || null,
      motorista_id: newMotorista || null,
      doca_id: newDoca || null,
      lider_id: newLider || null,
      observacoes: newObservacoes || null
    };
    
    updatePromises.push(
      supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', expeditionUpdatePayload, false)
    );

    // 5. Gerenciar os itens (lojas) da expedição
    const originalItems = originalExpedition.items;

    // Itens a serem removidos (se existiam antes e não estão mais na nova lista)
    const itemsToRemove = originalItems.filter(originalItem =>
      !newItemsData.some(newItem => newItem.loja_id === originalItem.loja_id)
    );
    for (const item of itemsToRemove) {
      updatePromises.push(
        supabaseRequest(`expedition_items?id=eq.${item.id}`, 'DELETE', null, false)
      );
    }

    // Itens a serem adicionados ou atualizados
    for (const newItem of newItemsData) {
      const existingItem = originalItems.find(originalItem => originalItem.loja_id === newItem.loja_id);
      if (existingItem) {
        // Se já existe, atualiza
        if (existingItem.pallets !== newItem.pallets) {
          updatePromises.push(
            supabaseRequest(`expedition_items?id=eq.${existingItem.id}`, 'PATCH', {
              pallets: newItem.pallets
            }, false)
          );
        }
      } else {
        // Se não existe, adiciona
        const payload = {
          expedition_id: expeditionId,
          loja_id: newItem.loja_id,
          pallets: newItem.pallets,
          rolltrainers: newItem.rolltrainers,
          status_descarga: 'pendente'
        };
        updatePromises.push(
          supabaseRequest('expedition_items', 'POST', payload, false)
        );
      }
    }

    // Executar todas as atualizações
    await Promise.all(updatePromises);

    showNotification('Expedição atualizada com sucesso!', 'success');
    closeEditModal();

    // Recarrega os dados para refletir as mudanças
    await loadSelectData();
    loadAcompanhamento();
  } catch (error) {
    console.error('Erro ao salvar edição:', error);
    showAlert('editFormAlert', `Erro ao salvar edição: ${error.message}`, 'error');
  }
}
        
       // CÓDIGO CORRIGIDO

// Função para excluir expedição (SUBSTITUÍDA)
async function deleteExpedition(expeditionId) {
    if (!hasPermission('excluir_expedicao')) {
        showNotification('Você não tem permissão para excluir expedições.', 'error');
        return;
    }

    const expeditionToDel = allExpeditions.find(e => e.id === expeditionId);
    if (!expeditionToDel) {
        showNotification('Erro: Expedição não encontrada para exclusão.', 'error');
        return;
    }

    if (expeditionToDel.status === 'saiu_para_entrega' || expeditionToDel.status === 'entregue') {
        showNotification('Esta expedição não pode ser excluída pois já saiu para entrega.', 'error');
        return;
    }

    const confirmed = await showYesNoModal('Deseja realmente excluir esta expedição? Esta ação não pode ser desfeita e liberará os recursos alocados.');
    if (confirmed) {
        try {
            const updatePromises = [];

            if (expeditionToDel.doca_id) {
                updatePromises.push(
                    supabaseRequest(`docas?id=eq.${expeditionToDel.doca_id}`, 'PATCH', { status: 'disponivel' })
                );
            }

            if (expeditionToDel.veiculo_id) {
                updatePromises.push(
                    supabaseRequest(`veiculos?id=eq.${expeditionToDel.veiculo_id}`, 'PATCH', { status: 'disponivel' }, false)
                );
            }

            if (expeditionToDel.motorista_id) {
                updatePromises.push(
                    supabaseRequest(`motoristas?id=eq.${expeditionToDel.motorista_id}`, 'PATCH', { status: 'disponivel' }, false)
                );
            }

            await Promise.all(updatePromises);
            await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`, 'DELETE', null, false);
            await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'DELETE', null, false);

            showNotification('Expedição excluída e recursos liberados com sucesso!', 'success');

            await loadSelectData();
            loadAcompanhamento();

        } catch (error) {
            showNotification(`Erro ao excluir: ${error.message}`, 'error');
        }
    }
}
        
        // --- FUNCIONALIDADES DA ABA CONFIGURAÇÕES ---

        function loadConfiguracoes() {
            if (currentUser) {
                document.getElementById('passwordFormContainer').style.display = 'none';
                document.getElementById('configuracoesContent').style.display = 'block';
                showSubTab('configuracoes', 'filiais', document.querySelector('#configuracoes .sub-tab'));
                updateSystemStatus();
            } else {
                document.getElementById('passwordFormContainer').style.display = 'block';
                document.getElementById('configuracoesContent').style.display = 'none';
                document.getElementById('passwordInput').value = '';
                document.getElementById('userInput').value = '';
            }
        }

        async function checkPassword() {
            const nome = document.getElementById('userInput').value.trim();
            const senha = document.getElementById('passwordInput').value;

            if (!nome || !senha) {
                showAlert('passwordAlert', 'Nome e senha são obrigatórios.', 'error');
                return;
            }

            try {
                const endpoint = `acessos?select=nome,tipo_acesso&nome=eq.${nome}&senha=eq.${senha}`;
                const result = await supabaseRequest(endpoint, 'GET', null, false);

                if (!result || result.length === 0) {
                    showAlert('passwordAlert', 'Nome de usuário ou senha incorretos.', 'error');
                    document.getElementById('passwordInput').value = '';
                    return;
                }

                const user = result[0];
                currentUser = {
                    nome: user.nome,
                    tipo_acesso: user.tipo_acesso
                };

                showNotification('Acesso concedido!', 'success');
                document.getElementById('passwordFormContainer').style.display = 'none';
                document.getElementById('configuracoesContent').style.display = 'block';
                showSubTab('configuracoes', 'filiais', document.querySelector('#configuracoes .sub-tab'));
                updateSystemStatus();

            } catch (err) {
                showAlert('passwordAlert', 'Erro ao verificar credenciais. Verifique a conexão.', 'error');
                console.error(err);
            }
        }

        function showAlert(containerId, message, type) {
            const container = document.getElementById(containerId);
            container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
        }
        
        function showAddForm(type) {
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    fieldsContainer.innerHTML = ''; // Limpa campos anteriores

    let formHtml = '';
    if (type === 'filial') {
        title.textContent = `Adicionar Nova Filial`;
        formHtml = `
            <div class="form-group"><label>Nome da Filial (Ex: 464):</label><input type="text" id="add_nome" required></div>
            <div class="form-group"><label>Descrição (Ex: MT):</label><input type="text" id="add_descricao" required></div>
            <div class="form-group md:col-span-2"><label>Endereço do CD (Ponto de Partida):</label><input type="text" id="add_endereco_cd" placeholder="Rua, Número, Cidade" required></div>
            <div class="form-group"><label>Latitude do CD:</label><input type="number" id="add_latitude_cd" step="0.000001" placeholder="-15.601400"></div>
            <div class="form-group"><label>Longitude do CD:</label><input type="number" id="add_longitude_cd" step="0.000001" placeholder="-56.097900"></div>
            <div class="text-center mt-4 md:col-span-2">
                <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocationFilial()">📍 Usar Localização Atual</button>
                <button type="button" class="btn btn-primary" onclick="geocodeAddressFilial()">🌍 Buscar por Endereço</button>
            </div>
        `;
    } else if (type === 'loja') {
        title.textContent = `Adicionar Nova Loja`;
        formHtml = `
            <div class="form-group"><label>Nome da Loja:</label><input type="text" id="add_nome" required></div>
            <div class="form-group"><label>Código da Loja:</label><input type="text" id="add_codigo" required></div>
            <div class="form-group"><label>Cidade:</label><input type="text" id="add_cidade" required></div>
            <div class="form-group"><label>Código QR:</label><input type="text" id="add_codlojaqr" required></div>
            <div class="form-group md:col-span-2"><label>Endereço Completo:</label><input type="text" id="add_endereco_completo" placeholder="Rua, Número, Bairro, CEP" required></div>
            <div class="form-group"><label>Latitude:</label><input type="number" id="add_latitude" step="0.000001" placeholder="-15.601400"></div>
            <div class="form-group"><label>Longitude:</label><input type="number" id="add_longitude" step="0.000001" placeholder="-56.097900"></div>
            <div class="form-group"><label>Status:</label><select id="add_ativo"><option value="true">Ativa</option><option value="false">Inativa</option></select></div>
            <div class="text-center mt-4 md:col-span-2">
                <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocation()">📍 Usar Localização Atual</button>
                <button type="button" class="btn btn-primary" onclick="geocodeAddress()">🌍 Buscar por Endereço</button>
            </div>
        `;
    } else if (type === 'doca') {
        title.textContent = `Adicionar Nova Doca`;
        formHtml = `
            <div class="form-group"><label>Nome da Doca:</label><input type="text" id="add_nome" required></div>
            <div class="form-group"><label>Capacidade (Pallets):</label><input type="number" id="add_capacidade_pallets" min="0" required></div>
            <div class="form-group"><label>Código QR:</label><input type="text" id="add_coddoca" required></div>
        `;
    } else if (type === 'lider') {
        title.textContent = `Adicionar Novo Líder`;
        formHtml = `
            <div class="form-group"><label>Nome do Líder:</label><input type="text" id="add_nome" required></div>
            <div class="form-group"><label>Matrícula:</label><input type="text" id="add_codigo_funcionario" required></div>
        `;
    } else if (type === 'veiculo') {
        title.textContent = `Adicionar Novo Veículo`;
        formHtml = `
            <div class="form-group"><label>Placa:</label><input type="text" id="add_placa" required></div>
            <div class="form-group"><label>Modelo:</label><input type="text" id="add_modelo" required></div>
            <div class="form-group"><label>Capacidade (Pallets):</label><input type="number" id="add_capacidade_pallets" min="1" required></div>
            <div class="form-group"><label>Tipo:</label><select id="add_tipo" required><option value="JJS">JJS</option><option value="PERLOG">PERLOG</option></select></div>
            <div class="form-group"><label>Status:</label><select id="add_status" required><option value="disponivel">Disponível</option><option value="em_uso">Em Uso</option><option value="manutencao">Manutenção</option></select></div>
        `;
    } else if (type === 'motorista') {
        title.textContent = `Adicionar Novo Motorista`;
        formHtml = `
            <div class="form-group"><label>Nome:</label><input type="text" id="add_nome" required></div>
            <div class="form-group"><label>Produtivo (Matrícula):</label><input type="text" id="add_produtivo" required></div>
            <div class="form-group"><label>Status:</label><select id="add_status" required><option value="disponivel">Disponível</option><option value="em_viagem">Em Viagem</option><option value="folga">Folga</option></select></div>
        `;
    } else if (type === 'acesso') {
        title.textContent = `Adicionar Novo Acesso`;
        formHtml = `
            <div class="form-group"><label>Nome de Usuário:</label><input type="text" id="add_nome" required></div>
            <div class="form-group"><label>Senha:</label><input type="password" id="add_senha" required></div>
            <div class="form-group"><label>Tipo de Acesso:</label><select id="add_tipo_acesso" required><option value="ALL">ALL (Master)</option><option value="${selectedFilial.nome}">${selectedFilial.nome}</option></select></div>
        `;
    } else if (type === 'pontoInteresse') {
        title.textContent = 'Adicionar Ponto de Interesse';
        formHtml = `
            <div class="form-group md:col-span-2">
                <label>Selecionar Loja (opcional):</label>
                <select id="add_loja_id" class="w-full">
                    <option value="">-- Ou insira um ponto manualmente --</option>
                    ${lojas.map(loja => `<option value="${loja.id}">${loja.codigo} - ${loja.nome}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Nome do Ponto:</label><input type="text" id="add_nome" placeholder="Ex: CD Principal, Loja 123, etc." required></div>
            <div class="form-group"><label>Tipo:</label><select id="add_tipo" required>
                <option value="CD">Centro de Distribuição</option>
                <option value="LOJA">Loja</option>
                <option value="POSTO">Posto de Combustível</option>
                <option value="CASA">Casa/Residência</option>
                <option value="OUTRO">Outro</option>
            </select></div>
            <div class="form-group"><label>Latitude:</label><input type="number" id="add_latitude" step="0.000001" placeholder="-15.601400" required></div>
            <div class="form-group"><label>Longitude:</label><input type="number" id="add_longitude" step="0.000001" value="" placeholder="-56.097900" required></div>
            <div class="form-group"><label>Raio de Detecção (metros):</label><input type="number" id="add_raio_deteccao" min="50" max="2000" value="200" required></div>
            <div class="form-group"><label>Cor no Mapa:</label><select id="add_cor">
                <option value="#0077B6">Azul</option>
                <option value="#EF4444">Vermelho</option>
                <option value="#10B981">Verde</option>
                <option value="#F59E0B">Laranja</option>
                <option value="#8B5CF6">Roxo</option>
                <option value="#EC4899">Rosa</option>
            </select></div>
            <div class="form-group" style="display:none;"><label>Status:</label><select id="add_ativo"><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
        `;
    }
    fieldsContainer.innerHTML = formHtml;
    modal.style.display = 'flex';
}

        function hideAddForm() {
            document.getElementById('addFormModal').style.display = 'none';
            document.getElementById('addFormAlert').innerHTML = '';
        }

        async function handleSave() {
            const title = document.getElementById('addFormTitle').textContent;
            let success = false;
            try {
                if (title.includes('Filial')) success = await saveFilial();
                else if (title.includes('Loja')) success = await saveLoja();
                else if (title.includes('Doca')) success = await saveDoca();
                else if (title.includes('Líder')) success = await saveLider();
                else if (title.includes('Veículo')) success = await saveVeiculo();
                else if (title.includes('Motorista')) success = await saveMotorista();
                else if (title.includes('Acesso')) success = await saveAcesso();
else if (title.includes('Ponto de Interesse')) success = await savePontoInteresse();
                
                if (success) {
                     showNotification('Cadastro realizado com sucesso!', 'success');
                     hideAddForm();
                     await loadSelectData(); 
                     if (title.includes('Filial')) await loadFiliais();
                     
                     if (document.getElementById('configuracoes').classList.contains('active')) {
                         const activeSubTabEl = document.querySelector('#configuracoes .sub-tab.active');
                         if(activeSubTabEl) {
                            const activeSubTab = activeSubTabEl.getAttribute('onclick').match(/'([^']*)','([^']*)'/)[2];
                            showSubTab('configuracoes', activeSubTab);
                         }
                     }
                }
            } catch (error) {
                 showAlert('addFormAlert', `Erro ao salvar: ${error.message}`, 'error');
            }
        }

       async function saveFilial() {
    const isEdit = !!document.getElementById('edit_filial_nome');
    const nomeOriginal = isEdit ? document.getElementById('edit_filial_nome').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        descricao: document.getElementById('add_descricao').value,
        endereco_cd: document.getElementById('add_endereco_cd').value,
        latitude_cd: document.getElementById('add_latitude_cd').value ? parseFloat(document.getElementById('add_latitude_cd').value) : null,
        longitude_cd: document.getElementById('add_longitude_cd').value ? parseFloat(document.getElementById('add_longitude_cd').value) : null,
        ativo: document.getElementById('add_ativo') ? document.getElementById('add_ativo').value === 'true' : true 
    };
    
    if (isEdit) {
        await supabaseRequest(`filiais?nome=eq.${nomeOriginal}`, 'PATCH', data, false);
        showNotification('Filial atualizada com sucesso!', 'success');
        renderFiliaisConfig();
    } else {
        await supabaseRequest('filiais', 'POST', data, false);
        showNotification('Filial cadastrada com sucesso!', 'success');
        renderFiliaisConfig();
    }
    return true;
}
        async function saveLoja() {
    const isEdit = !!document.getElementById('edit_loja_id');
    const lojaId = isEdit ? document.getElementById('edit_loja_id').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        codigo: document.getElementById('add_codigo').value, 
        cidade: document.getElementById('add_cidade').value, 
        codlojaqr: document.getElementById('add_codlojaqr').value,
        endereco_completo: document.getElementById('add_endereco_completo').value,
        latitude: document.getElementById('add_latitude') ? parseFloat(document.getElementById('add_latitude').value) : null,
        longitude: document.getElementById('add_longitude') ? parseFloat(document.getElementById('add_longitude').value) : null,
        ativo: document.getElementById('add_ativo') ? document.getElementById('add_ativo').value === 'true' : true 
    };
    
    if (isEdit) {
        await supabaseRequest(`lojas?id=eq.${lojaId}`, 'PATCH', data);
        showNotification('Loja atualizada com sucesso!', 'success');
    } else {
        await supabaseRequest('lojas', 'POST', data);
        showNotification('Loja cadastrada com sucesso!', 'success');
    }
    return true;
}
        
        async function saveDoca() {
    const isEdit = !!document.getElementById('edit_doca_id');
    const docaId = isEdit ? document.getElementById('edit_doca_id').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        capacidade_pallets: parseInt(document.getElementById('add_capacidade_pallets').value), 
        coddoca: document.getElementById('add_coddoca').value, 
        ativo: document.getElementById('add_ativo') ? document.getElementById('add_ativo').value === 'true' : true 
    };
    
    if (isEdit) {
        await supabaseRequest(`docas?id=eq.${docaId}`, 'PATCH', data);
        showNotification('Doca atualizada com sucesso!', 'success');
    } else {
        await supabaseRequest('docas', 'POST', data);
        showNotification('Doca cadastrada com sucesso!', 'success');
    }
    await loadSelectData();
    renderDocasConfig();
    return true;
}
        async function saveLider() {
    const isEdit = !!document.getElementById('edit_lider_id');
    const liderId = isEdit ? document.getElementById('edit_lider_id').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        codigo_funcionario: document.getElementById('add_codigo_funcionario').value, 
        ativo: document.getElementById('add_ativo') ? document.getElementById('add_ativo').value === 'true' : true 
    };
    
    if (isEdit) {
        await supabaseRequest(`lideres?id=eq.${liderId}`, 'PATCH', data);
        showNotification('Líder atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('lideres', 'POST', data);
        showNotification('Líder cadastrado com sucesso!', 'success');
    }
    await loadSelectData();
    renderLideresConfig();
    return true;
}
        async function saveVeiculo() {
    const isEdit = !!document.getElementById('edit_veiculo_id');
    const veiculoId = isEdit ? document.getElementById('edit_veiculo_id').value : null;
    
    const data = { 
        placa: document.getElementById('add_placa').value, 
        modelo: document.getElementById('add_modelo').value, 
        capacidade_pallets: parseInt(document.getElementById('add_capacidade_pallets').value), 
        tipo: document.getElementById('add_tipo').value, 
        status: document.getElementById('add_status').value 
    };
    
    if (isEdit) {
        await supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', data, false);
        showNotification('Veículo atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('veiculos', 'POST', data);
        showNotification('Veículo cadastrado com sucesso!', 'success');
    }
    await loadSelectData();
    renderVeiculosConfig();
    return true;
}
        async function saveMotorista() {
    const isEdit = !!document.getElementById('edit_motorista_id');
    const motoristaId = isEdit ? document.getElementById('edit_motorista_id').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        PRODUTIVO: document.getElementById('add_produtivo').value, 
        status: document.getElementById('add_status').value 
    };
    
    if (isEdit) {
        await supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', data, false);
        showNotification('Motorista atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('motoristas', 'POST', data);
        showNotification('Motorista cadastrado com sucesso!', 'success');
    }
    await loadSelectData();
    renderMotoristasConfig();
    return true;
}
       async function saveAcesso() {
    const isEdit = !!document.getElementById('edit_acesso_nome');
    const nomeOriginal = isEdit ? document.getElementById('edit_acesso_nome').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        tipo_acesso: document.getElementById('add_tipo_acesso').value 
    };
    
    const senha = document.getElementById('add_senha').value;
    if (!isEdit || senha.trim()) {
        data.senha = senha || document.getElementById('add_nome').value; // usar nome como senha padrão se vazio
    }
    
    if (isEdit) {
        await supabaseRequest(`acessos?nome=eq.${nomeOriginal}`, 'PATCH', data, false);
        showNotification('Acesso atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('acessos', 'POST', data, false);
        showNotification('Acesso cadastrado com sucesso!', 'success');
    }
    renderAcessosConfig();
    return true;
}
        async function renderVeiculosConfig() {
    const tbody = document.getElementById('veiculosConfigBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="6" class="loading"><div class="spinner"></div>Carregando veículos...</td></tr>`;
    
    try {
        const veiculosData = await supabaseRequest('veiculos?order=placa');
        if (!veiculosData || veiculosData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">Nenhum veículo cadastrado nesta filial.</td></tr>`;
            return;
        }

        tbody.innerHTML = veiculosData.map(veiculo => `
            <tr>
                <td class="font-medium">${veiculo.placa}</td>
                <td>${veiculo.modelo}</td>
                <td>${veiculo.tipo}</td>
                <td class="text-center">${veiculo.capacidade_pallets}</td>
                <td><span class="status-badge status-${veiculo.status}">${getStatusLabel(veiculo.status)}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editVeiculo('${veiculo.id}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteVeiculo('${veiculo.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">Erro ao carregar veículos: ${error.message}</td></tr>`;
    }
}
async function editVeiculo(veiculoId) {
    const veiculo = veiculos.find(v => v.id === veiculoId);
    if (!veiculo) {
        showNotification('Veículo não encontrado', 'error');
        return;
    }
    
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Veículo';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_veiculo_id" value="${veiculo.id}">
        <div class="form-group"><label>Placa:</label><input type="text" id="add_placa" value="${veiculo.placa}" required></div>
        <div class="form-group"><label>Modelo:</label><input type="text" id="add_modelo" value="${veiculo.modelo}" required></div>
        <div class="form-group"><label>Capacidade (Pallets):</label><input type="number" id="add_capacidade_pallets" min="1" value="${veiculo.capacidade_pallets}" required></div>
        <div class="form-group"><label>Tipo:</label><select id="add_tipo" required>
            <option value="JJS" ${veiculo.tipo === 'JJS' ? 'selected' : ''}>JJS</option>
            <option value="PERLOG" ${veiculo.tipo === 'PERLOG' ? 'selected' : ''}>PERLOG</option>
        </select></div>
        <div class="form-group"><label>Status:</label><select id="add_status" required>
            <option value="disponivel" ${veiculo.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
            <option value="em_uso" ${veiculo.status === 'em_uso' ? 'selected' : ''}>Em Uso</option>
            <option value="manutencao" ${veiculo.status === 'manutencao' ? 'selected' : ''}>Manutenção</option>
        </select></div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteVeiculo(veiculoId) {
    const confirmed = await showYesNoModal('Deseja excluir este veículo? Esta ação não pode ser desfeita.');
    if (confirmed) {
        try {
            await supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'DELETE', null, false);
            showNotification('Veículo excluído com sucesso!', 'success');
            await loadSelectData();
            renderVeiculosConfig();
        } catch (error) {
            showNotification(`Erro ao excluir veículo: ${error.message}`, 'error');
        }
    }
}

async function editMotorista(motoristaId) {
    const motorista = motoristas.find(m => m.id === motoristaId);
    if (!motorista) {
        showNotification('Motorista não encontrado', 'error');
        return;
    }
    
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Motorista';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_motorista_id" value="${motorista.id}">
        <div class="form-group"><label>Nome:</label><input type="text" id="add_nome" value="${motorista.nome}" required></div>
        <div class="form-group"><label>Produtivo (Matrícula):</label><input type="text" id="add_produtivo" value="${motorista.PRODUTIVO || ''}" required></div>
        <div class="form-group"><label>Status:</label><select id="add_status" required>
            <option value="disponivel" ${motorista.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
            <option value="em_viagem" ${motorista.status === 'em_viagem' ? 'selected' : ''}>Em Viagem</option>
            <option value="folga" ${motorista.status === 'folga' ? 'selected' : ''}>Folga</option>
        </select></div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteMotorista(motoristaId) {
    const confirmed = await showYesNoModal('Deseja excluir este motorista? Esta ação não pode ser desfeita.');
    if (confirmed) {
        try {
            await supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'DELETE', null, false);
            showNotification('Motorista excluído com sucesso!', 'success');
            await loadSelectData();
            renderMotoristasConfig();
        } catch (error) {
            showNotification(`Erro ao excluir motorista: ${error.message}`, 'error');
        }
    }
}
        
        async function renderMotoristasConfig() {
    const tbody = document.getElementById('motoristasConfigBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando motoristas...</td></tr>`;
    
    try {
        const motoristasData = await supabaseRequest('motoristas?order=nome');
        tbody.innerHTML = motoristasData.map(motorista => `
            <tr>
                <td class="font-medium">${motorista.nome}</td>
                <td>${motorista.PRODUTIVO || 'N/A'}</td>
                <td><span class="status-badge ${motorista.status === 'disponivel' ? 'status-disponivel' : motorista.status === 'em_viagem' ? 'status-em_uso' : 'status-cancelado'}">${getStatusLabel(motorista.status)}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editMotorista('${motorista.id}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteMotorista('${motorista.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="alert alert-error">Erro ao carregar motoristas: ${error.message}</td></tr>`;
    }
}
        
        function updateSystemStatus() {
            const statusEl = document.getElementById('systemStatus');
            if(statusEl) {
                statusEl.textContent = `
        Filial Ativa: ${selectedFilial.nome}
        Usuário Logado: ${currentUser.nome}
        Tipo de Acesso: ${currentUser.tipo_acesso}
        Cache: ${lojas.length} lojas, ${docas.length} docas, ${lideres.length} líderes
                `;
            }
        }
 // Variável global para o mapa
        let mapInstance = null;
        let markersLayer = null;

        function showLocationMap(expeditionId, lat, lng, vehiclePlaca) {
    console.log(`Abrindo mapa para ${vehiclePlaca} em:`, lat, lng); // DEBUG
    
    document.getElementById('mapModalTitle').textContent = `Localização de ${vehiclePlaca}`;
    document.getElementById('mapModal').style.display = 'flex';
    
    // Aguardar o modal aparecer antes de inicializar o mapa
    setTimeout(() => {
        initMap(lat, lng, vehiclePlaca);
    }, 100);
}
        function showAllVehiclesMap() {
    document.getElementById('mapModalTitle').textContent = 'Localização de Todos os Veículos e Lojas';
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(() => {
        initAllVehiclesAndLojasMap();
    }, 100);
}

function initAllVehiclesAndLojasMap() {
    if (mapInstance) {
        mapInstance.remove();
    }
    
    const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
    mapInstance = L.map('map').setView(cdCoords, 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    const bounds = L.latLngBounds();
    bounds.extend(cdCoords);

    rastreioData.forEach(rastreio => {
        const { lat, lng } = rastreio.coordenadas;
        
        let color = '#0077B6';
        if (rastreio.status_rastreio === 'em_descarga') color = '#F59E0B';
        else if (rastreio.status_rastreio === 'retornando') color = '#10B981';
        
        const vehicleIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${rastreio.veiculo_placa}</div>`,
            iconSize: [70, 25],
            iconAnchor: [35, 12]
        });
        
        L.marker([lat, lng], { icon: vehicleIcon })
            .addTo(mapInstance)
            .bindPopup(`
                <div style="text-align: center;">
                    <b>${rastreio.veiculo_placa}</b><br>
                    <small>${rastreio.motorista_nome}</small><br>
                    <span style="color: ${color}; font-weight: bold;">${getStatusLabel(rastreio.status_rastreio)}</span>
                </div>
            `);
        
        bounds.extend([lat, lng]);
    });
    
    lojas.forEach(loja => {
        if (loja.latitude && loja.longitude) {
            const lat = parseFloat(loja.latitude);
            const lng = parseFloat(loja.longitude);
            
            let cor = '#10B981';
            if (loja.nome.toLowerCase().includes('fort')) cor = '#EF4444';
            else if (loja.nome.toLowerCase().includes('comper')) cor = '#10B981';
            
            const lojaIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: ${cor}; color: white; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
                iconSize: [60, 25],
                iconAnchor: [30, 12]
            });
            
            L.marker([lat, lng], { icon: lojaIcon })
                .addTo(mapInstance)
                .bindPopup(`<b>${loja.nome}</b><br>Código: ${loja.codigo}`);
            
            bounds.extend([lat, lng]);
        }
    });

    if (rastreioData.length > 0 || lojas.length > 0) {
        mapInstance.fitBounds(bounds, { padding: [20, 20] });
    }
}

        function initMap(lat, lng, vehiclePlaca) {
            // Destruir mapa existente se houver
            if (mapInstance) {
                mapInstance.remove();
            }
            
            // Criar novo mapa
            mapInstance = L.map('map').setView([lat, lng], 15);
            
            // Adicionar camada do OpenStreetMap
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(mapInstance);
            
            // Criar ícone personalizado para veículo
            const vehicleIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: #0077B6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${vehiclePlaca}</div>`,
                iconSize: [80, 30],
                iconAnchor: [40, 15]
            });
            
            // Adicionar marcador do veículo
            L.marker([lat, lng], { icon: vehicleIcon })
                .addTo(mapInstance)
                .bindPopup(`<b>${vehiclePlaca}</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`);
        }

        function initAllVehiclesMap() {
            // Destruir mapa existente se houver
            if (mapInstance) {
                mapInstance.remove();
            }
            
            // Criar novo mapa centrado em Cuiabá
            mapInstance = L.map('map').setView([-15.6014, -56.0979], 11);
            
            // Adicionar camada do OpenStreetMap
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(mapInstance);
            
            // Adicionar marcadores para todos os veículos
            const bounds = L.latLngBounds();
            
            rastreioData.forEach(rastreio => {
                const { lat, lng } = rastreio.coordenadas;
                
                // Definir cor baseada no status
                let color = '#0077B6'; // azul padrão
                if (rastreio.status_rastreio === 'em_descarga') color = '#F59E0B'; // laranja
                else if (rastreio.status_rastreio === 'retornando') color = '#10B981'; // verde
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${rastreio.veiculo_placa}</div>`,
                    iconSize: [70, 25],
                    iconAnchor: [35, 12]
                });
                
                const marker = L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <b>${rastreio.veiculo_placa}</b><br>
                            <small>${rastreio.motorista_nome}</small><br>
                            <span style="color: ${color}; font-weight: bold;">${getStatusLabel(rastreio.status_rastreio)}</span><br>
                            <small>Progresso: ${rastreio.progresso_rota}%</small><br>
                            <small>Entregas: ${rastreio.entregas_concluidas}/${rastreio.total_entregas}</small>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            });
            
            // Ajustar zoom para mostrar todos os veículos
            if (rastreioData.length > 0) {
                mapInstance.fitBounds(bounds, { padding: [20, 20] });
            }
        }

        function closeMapModal() {
            document.getElementById('mapModal').style.display = 'none';
            if (mapInstance) {
                mapInstance.remove();
                mapInstance = null;
            }
        }
        // ===== ADICIONAR TODAS ESSAS FUNÇÕES NO SEU JAVASCRIPT =====

// === FUNÇÕES PARA TRAJETO NO HISTÓRICO ===

async function showTrajectoryMap(expeditionId, vehiclePlaca) {
    document.getElementById('mapModalTitle').textContent = `Trajeto da Viagem - ${vehiclePlaca}`;
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(async () => {
        await initTrajectoryMap(expeditionId, vehiclePlaca);
    }, 100);
}



// Remove a função antiga para recriá-la com as novas funcionalidades
async function initTrajectoryMap(expeditionId, vehiclePlaca) {
    try {
        if (mapInstance) {
            mapInstance.remove();
        }

        const expeditionItems = await supabaseRequest(
            `expedition_items?expedition_id=eq.${expeditionId}&order=data_inicio_descarga.asc`,
            'GET', null, false
        );
        
        if (!expeditionItems || expeditionItems.length === 0) {
            showNotification('Não há pontos de entrega para traçar a rota.', 'info');
            const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
            mapInstance = L.map('map').setView(cdCoords, 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
            return;
        }

        // Definir os waypoints para a rota completa (CD -> Lojas em ordem)
        const waypoints = [
            L.latLng(selectedFilial.latitude_cd, selectedFilial.longitude_cd),
            ...expeditionItems.map(item => {
                const loja = lojas.find(l => l.id === item.loja_id);
                return L.latLng(loja.latitude, loja.longitude);
            })
        ];

        mapInstance = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
        
        const routingControl = L.Routing.control({
            waypoints: waypoints,
            createMarker: function(i, waypoint, n) {
                // Personalizar o marcador para o CD (origem) e para cada loja (passagem)
                let iconHtml = '';
                if (i === 0) {
                    iconHtml = '<div style="background: #0077B6; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>';
                } else {
                    const loja = lojas.find(l => l.id === expeditionItems[i-1].loja_id);
                    iconHtml = `<div style="background: #EF4444; color: white; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">#${i} - ${loja.codigo}</div>`;
                }
                
                const markerIcon = L.divIcon({
                    className: 'custom-marker',
                    html: iconHtml,
                    iconSize: [80, 25],
                    iconAnchor: [40, 12]
                });
                return L.marker(waypoint.latLng, {
                    icon: markerIcon
                }).bindPopup(`<b>${waypoint.name}</b>`);
            },
            routeWhileDragging: false,
            autoRoute: true,
            lineOptions: { styles: [{ color: '#0077B6', weight: 6 }] }
        }).addTo(mapInstance);

        routingControl.on('routesfound', function(e) {
            const route = e.routes[0];
            const distance = route.summary.totalDistance / 1000;
            const duration = route.summary.totalTime / 60;
            
            // Ajustar o zoom do mapa para a rota completa
            mapInstance.fitBounds(route.coordinates, { padding: [20, 20] });
            
            // Criar e adicionar o painel de estatísticas
            const statsControl = L.control({ position: 'topright' });
            statsControl.onAdd = function() {
                const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
                div.style.background = 'white';
                div.style.padding = '10px';
                div.style.fontSize = '12px';
                
                div.innerHTML = `
                    <p><b>Estatísticas da Rota</b></p>
                    <p><strong>Veículo:</strong> ${vehiclePlaca}</p>
                    <p><strong>Distância Total:</strong> ${distance.toFixed(1)} km</p>
                    <p><strong>Duração Estimada:</strong> ${minutesToHHMM(duration)}</p>
                `;
                return div;
            };
            statsControl.addTo(mapInstance);
        });

        const routingAlt = document.querySelector('.leaflet-routing-alt');
        if (routingAlt) routingAlt.style.display = 'none';

    } catch (error) {
        console.error('Erro ao carregar trajeto:', error);
        showNotification('Erro ao carregar dados do trajeto: ' + error.message, 'error');
    }
}
// A função calculateTripStats também precisa ser ajustada para usar os dados do GPS
function calculateTripStats(trajectoryData) {
    let distanciaTotal = 0;
    let velocidades = [];
    
    for (let i = 1; i < trajectoryData.length; i++) {
        const p1 = trajectoryData[i - 1];
        const p2 = trajectoryData[i];
        
        // Apenas calcula a distância se a velocidade for > 0, para ignorar paradas longas
        if (p2.velocidade > 0) {
            const lat1 = parseFloat(p1.latitude);
            const lon1 = parseFloat(p1.longitude);
            const lat2 = parseFloat(p2.latitude);
            const lon2 = parseFloat(p2.longitude);
            
            const R = 6371; // Raio da Terra em km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distancia = R * c;
            
            distanciaTotal += distancia;
        }

        if (p2.velocidade > 0) {
            velocidades.push(parseFloat(p2.velocidade));
        }
    }
    
    const velocidadeMedia = velocidades.length > 0 ? 
        velocidades.reduce((a, b) => a + b, 0) / velocidades.length : 0;
    
    const inicio = new Date(trajectoryData[0].data_gps);
    const fim = new Date(trajectoryData[trajectoryData.length - 1].data_gps);
    const duracaoMs = fim - inicio;
    const duracaoHoras = Math.floor(duracaoMs / 3600000);
    const duracaoMinutos = Math.floor((duracaoMs % 3600000) / 60000);
    const duracao = `${duracaoHoras}h ${duracaoMinutos}min`;
    
    return {
        distancia: distanciaTotal,
        velocidadeMedia: velocidadeMedia,
        duracao: duracao
    };
}

// === FUNÇÕES PARA PONTOS DE INTERESSE ===

async function loadPontosInteresse() {
    try {
        // Agora, a requisição busca os dados diretamente do banco de dados Supabase
        const pontosInteresseData = await supabaseRequest('pontos_interesse?order=nome', 'GET', null, false);
        
        if (!pontosInteresseData) {
            pontosInteresse = [];
        } else {
            pontosInteresse = pontosInteresseData;
        }
        
        renderPontosInteresseTable();
        showNotification('Pontos de interesse carregados com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao carregar pontos de interesse:', error);
        pontosInteresse = [];
        renderPontosInteresseTable();
        showNotification(`Erro ao carregar pontos de interesse: ${error.message}`, 'error');
    }
}

function renderPontosInteresseTable() {
    const tbody = document.getElementById('pontosInteresseBody');
    if (!tbody) return;
    
    if (pontosInteresse.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Nenhum ponto de interesse cadastrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = pontosInteresse.map(ponto => `
        <tr>
            <td class="font-medium">${ponto.nome}</td>
            <td><span class="px-2 py-1 rounded text-xs font-medium" style="background: ${ponto.cor}20; color: ${ponto.cor};">${ponto.tipo}</span></td>
            <td class="text-xs font-mono">${parseFloat(ponto.latitude).toFixed(6)}, ${parseFloat(ponto.longitude).toFixed(6)}</td>
            <td class="text-center">${ponto.raio_deteccao}m</td>
            <td class="text-center">${ponto.ativo ? '✅' : '❌'}</td>
            <td>
                <div class="flex gap-1">
                    <button class="btn btn-warning btn-small" onclick="editPontoInteresse('${ponto.id}')">Editar</button>
                    <button class="btn btn-danger btn-small" onclick="deletePontoInteresse('${ponto.id}')">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showAddPontoInteresse() {
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Adicionar Ponto de Interesse';
    fieldsContainer.innerHTML = `
        <div class="form-group md:col-span-2">
            <label>Selecionar Loja (opcional):</label>
            <select id="add_loja_id" class="w-full">
                <option value="">-- Ou insira um ponto manualmente --</option>
                ${lojas.map(loja => `<option value="${loja.id}">${loja.codigo} - ${loja.nome}</option>`).join('')}
            </select>
        </div>
        <div class="form-group"><label>Nome do Ponto:</label><input type="text" id="add_nome" placeholder="Ex: CD Principal, Loja 123, etc." required></div>
        <div class="form-group"><label>Tipo:</label><select id="add_tipo" required>
            <option value="CD">Centro de Distribuição</option>
            <option value="LOJA">Loja</option>
            <option value="POSTO">Posto de Combustível</option>
            <option value="CASA">Casa/Residência</option>
            <option value="OUTRO">Outro</option>
        </select></div>
        <div class="form-group"><label>Latitude:</label><input type="number" id="add_latitude" step="0.000001" placeholder="-15.601400" required></div>
        <div class="form-group"><label>Longitude:</label><input type="number" id="add_longitude" step="0.000001" value="" placeholder="-56.097900" required></div>
        <div class="form-group"><label>Raio de Detecção (metros):</label><input type="number" id="add_raio_deteccao" min="50" max="2000" value="200" required></div>
        <div class="form-group"><label>Cor no Mapa:</label><select id="add_cor">
            <option value="#0077B6">Azul</option>
            <option value="#EF4444">Vermelho</option>
            <option value="#10B981">Verde</option>
            <option value="#F59E0B">Laranja</option>
            <option value="#8B5CF6">Roxo</option>
            <option value="#EC4899">Rosa</option>
        </select></div>
        <div class="form-group" style="display:none;"><label>Status:</label><select id="add_ativo"><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
        <div class="text-center mt-4 md:col-span-2">
            <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocation()">📍 Usar Localização Atual</button>
        </div>
    `;
    
    document.getElementById('add_loja_id').addEventListener('change', (e) => {
        const selectedLojaId = e.target.value;
        if (selectedLojaId) {
            const selectedLoja = lojas.find(l => l.id === selectedLojaId);
            if (selectedLoja) {
                document.getElementById('add_nome').value = selectedLoja.nome;
                document.getElementById('add_latitude').value = selectedLoja.latitude;
                document.getElementById('add_longitude').value = selectedLoja.longitude;
                document.getElementById('add_tipo').value = 'LOJA';
                document.getElementById('add_cor').value = selectedLoja.nome.toLowerCase().includes('fort') ? '#EF4444' : '#10B981';
            }
        }
    });
    
    modal.style.display = 'flex';
}
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('add_latitude').value = position.coords.latitude.toFixed(6);
                document.getElementById('add_longitude').value = position.coords.longitude.toFixed(6);
                showNotification('Localização atual capturada!', 'success');
            },
            (error) => {
                showNotification('Erro ao obter localização: ' + error.message, 'error');
            }
        );
    } else {
        showNotification('Geolocalização não suportada pelo navegador.', 'error');
    }
}

async function savePontoInteresse() {
    const isEdit = !!document.getElementById('edit_ponto_id');
    const pontoId = isEdit ? document.getElementById('edit_ponto_id').value : null;
    
    const data = {
        nome: document.getElementById('add_nome').value,
        tipo: document.getElementById('add_tipo').value,
        latitude: parseFloat(document.getElementById('add_latitude').value),
        longitude: parseFloat(document.getElementById('add_longitude').value),
        raio_deteccao: parseInt(document.getElementById('add_raio_deteccao').value),
        cor: document.getElementById('add_cor').value,
        ativo: document.getElementById('add_ativo') ? 
            document.getElementById('add_ativo').value === 'true' : true
    };
    
    try {
        if (isEdit) {
            await supabaseRequest(`pontos_interesse?id=eq.${pontoId}`, 'PATCH', data, false);
            showNotification('Ponto de interesse atualizado!', 'success');
        } else {
            await supabaseRequest('pontos_interesse', 'POST', data, false);
            showNotification('Ponto de interesse adicionado!', 'success');
        }
        
        hideAddForm();
        await loadPontosInteresse();
        return true;
    } catch (error) {
        showAlert('addFormAlert', `Erro ao salvar: ${error.message}`, 'error');
        return false;
    }
}

async function addPontosInteresseToMap() {
    if (!mapInstance || !pontosInteresse) return;
    
    pontosInteresse.forEach(ponto => {
        if (!ponto.ativo) return;
        
        // Ícone personalizado para o ponto
        const pontoIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background: ${ponto.cor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${ponto.tipo}</div>`,
            iconSize: [40, 20],
            iconAnchor: [20, 10]
        });
        
        // Adicionar marcador
        L.marker([ponto.latitude, ponto.longitude], { icon: pontoIcon })
            .addTo(mapInstance)
            .bindPopup(`<b>${ponto.nome}</b><br><small>${ponto.tipo}</small>`);
        
        // Adicionar círculo de detecção
        L.circle([ponto.latitude, ponto.longitude], {
            color: ponto.cor,
            fillColor: ponto.cor,
            fillOpacity: 0.1,
            radius: ponto.raio_deteccao
        }).addTo(mapInstance);
    });
}

function showPontosInteresseMap() {
    document.getElementById('mapModalTitle').textContent = 'Pontos de Interesse Cadastrados';
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(async () => {
        await initPontosInteresseMap();
    }, 100);
}

async function initPontosInteresseMap() {
    if (mapInstance) {
        mapInstance.remove();
    }
    
    mapInstance = L.map('map').setView([-15.6014, -56.0979], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    await addPontosInteresseToMap();
    
    // Ajustar zoom para mostrar todos os pontos
    if (pontosInteresse.length > 0) {
        const bounds = L.latLngBounds();
        pontosInteresse.forEach(ponto => {
            if (ponto.ativo) bounds.extend([ponto.latitude, ponto.longitude]);
        });
        mapInstance.fitBounds(bounds, { padding: [20, 20] });
    }
}

// Função para detectar proximidade durante rastreamento
function checkProximityToPontosInteresse(lat, lng) {
    const proximityAlerts = [];
    
    pontosInteresse.forEach(ponto => {
        if (!ponto.ativo) return;
        
        const distance = calculateDistance(lat, lng, ponto.latitude, ponto.longitude);
        
        if (distance <= ponto.raio_deteccao) {
            proximityAlerts.push({
                ponto: ponto,
                distancia: Math.round(distance)
            });
        }
    });
    
    return proximityAlerts;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
             Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function editPontoInteresse(pontoId) {
    const ponto = pontosInteresse.find(p => p.id === pontoId);
    if (!ponto) {
        showNotification('Ponto não encontrado', 'error');
        return;
    }
    
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Ponto de Interesse';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_ponto_id" value="${ponto.id}">
        <div class="form-group">
            <label>Nome do Ponto:</label>
            <input type="text" id="add_nome" value="${ponto.nome}" required>
        </div>
        <div class="form-group">
            <label>Tipo:</label>
            <select id="add_tipo" required>
                <option value="CD" ${ponto.tipo === 'CD' ? 'selected' : ''}>Centro de Distribuição</option>
                <option value="LOJA" ${ponto.tipo === 'LOJA' ? 'selected' : ''}>Loja</option>
                <option value="POSTO" ${ponto.tipo === 'POSTO' ? 'selected' : ''}>Posto de Combustível</option>
                <option value="CASA" ${ponto.tipo === 'CASA' ? 'selected' : ''}>Casa/Residência</option>
                <option value="OUTRO" ${ponto.tipo === 'OUTRO' ? 'selected' : ''}>Outro</option>
            </select>
        </div>
        <div class="form-group">
            <label>Latitude:</label>
            <input type="number" id="add_latitude" step="0.000001" value="${ponto.latitude}" required>
        </div>
        <div class="form-group">
            <label>Longitude:</label>
            <input type="number" id="add_longitude" step="0.000001" value="${ponto.longitude}" required>
        </div>
        <div class="form-group">
            <label>Raio de Detecção (metros):</label>
            <input type="number" id="add_raio_deteccao" min="50" max="2000" value="${ponto.raio_deteccao}" required>
        </div>
        <div class="form-group">
            <label>Cor no Mapa:</label>
            <select id="add_cor">
                <option value="#0077B6" ${ponto.cor === '#0077B6' ? 'selected' : ''}>Azul</option>
                <option value="#EF4444" ${ponto.cor === '#EF4444' ? 'selected' : ''}>Vermelho</option>
                <option value="#10B981" ${ponto.cor === '#10B981' ? 'selected' : ''}>Verde</option>
                <option value="#F59E0B" ${ponto.cor === '#F59E0B' ? 'selected' : ''}>Laranja</option>
                <option value="#8B5CF6" ${ponto.cor === '#8B5CF6' ? 'selected' : ''}>Roxo</option>
                <option value="#EC4899" ${ponto.cor === '#EC4899' ? 'selected' : ''}>Rosa</option>
            </select>
        </div>
        <div class="form-group">
            <label>Status:</label>
            <select id="add_ativo">
                <option value="true" ${ponto.ativo ? 'selected' : ''}>Ativo</option>
                <option value="false" ${!ponto.ativo ? 'selected' : ''}>Inativo</option>
            </select>
        </div>
    `;
    
    modal.style.display = 'flex';
}

async function deletePontoInteresse(pontoId) {
    const confirmed = await showYesNoModal('Deseja excluir este ponto de interesse?');
    if (confirmed) {
        try {
            await supabaseRequest(`pontos_interesse?id=eq.${pontoId}`, 'DELETE', null, false);
            pontosInteresse = pontosInteresse.filter(p => p.id !== pontoId);
            showNotification('Ponto de interesse excluído!', 'success');
            renderPontosInteresseTable();
        } catch (error) {
            showNotification(`Erro ao excluir: ${error.message}`, 'error');
        }
    }
}

// === DADOS SIMULADOS PARA DEMONSTRAÇÃO ===
function generateMockGPSTrajectory(expeditionId) {
    // Gerar trajeto simulado com pontos GPS
    const baseTime = new Date();
    const points = [];
    
    // Trajeto simulado saindo do CD e visitando algumas lojas
    const route = [
        { lat: -15.6014, lng: -56.0979, desc: "CD - Saída" },
        { lat: -15.5950, lng: -56.0920, desc: "Trânsito" },
        { lat: -15.5880, lng: -56.0860, desc: "Próximo à Loja Fort" },
        { lat: -15.5850, lng: -56.0850, desc: "Loja Fort - Descarga" },
        { lat: -15.5820, lng: -56.0800, desc: "Saindo da Loja Fort" },
        { lat: -15.5900, lng: -56.0700, desc: "Trânsito" },
        { lat: -15.6100, lng: -56.0650, desc: "Próximo à Loja Comper" },
        { lat: -15.6150, lng: -56.0680, desc: "Loja Comper - Descarga" },
        { lat: -15.6180, lng: -56.0720, desc: "Retorno" },
        { lat: -15.6080, lng: -56.0850, desc: "Trânsito" },
        { lat: -15.6014, lng: -56.0979, desc: "CD - Chegada" }
    ];
    
    route.forEach((point, index) => {
        const timeOffset = index * 15 * 60 * 1000; // 15 minutos entre pontos
        const timestamp = new Date(baseTime.getTime() + timeOffset);
        
        // Velocidade simulada
        let velocidade = 0;
        if (point.desc.includes('Trânsito')) velocidade = Math.random() * 30 + 40; // 40-70 km/h
        else if (point.desc.includes('Próximo')) velocidade = Math.random() * 20 + 20; // 20-40 km/h
        else velocidade = Math.random() * 10; // 0-10 km/h (parado/descarga)
        
        points.push({
            expedition_id: expeditionId,
            latitude: point.lat + (Math.random() - 0.5) * 0.002, // Pequena variação
            longitude: point.lng + (Math.random() - 0.5) * 0.002,
            data_gps: timestamp.toISOString(),
            velocidade: Math.round(velocidade),
            precisao: Math.random() * 20 + 5, // 5-25 metros
            descricao: point.desc
        });
    });
    
    return points;
}
// === FUNÇÕES PARA GERENCIAMENTO DE LOJAS COM ENDEREÇOS ===

async function showLojasConfig() {
    await renderLojasConfig();
}

async function renderLojasConfig() {
    const tbody = document.getElementById('lojasConfigBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="6" class="loading"><div class="spinner"></div>Carregando lojas...</td></tr>`;
    
    try {
        const lojasData = await supabaseRequest('lojas?order=codigo,nome');
        tbody.innerHTML = lojasData.map(loja => `
            <tr>
                <td class="font-medium">${loja.codigo}</td>
                <td>${loja.nome}</td>
                <td>${loja.cidade}</td>
                <td class="text-center">${loja.codlojaqr || 'N/A'}</td>
                <td><span class="status-badge ${loja.ativo ? 'status-disponivel' : 'status-cancelado'}">${loja.ativo ? 'Ativa' : 'Inativa'}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editLoja('${loja.id}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteLoja('${loja.id}')">Excluir</button>
                        ${(loja.latitude && loja.longitude) ? 
                            `<button class="btn btn-primary btn-small" onclick="showLojaMap('${loja.id}')">Mapa</button>` : 
                            `<button class="btn btn-secondary btn-small" disabled title="Sem coordenadas">Sem GPS</button>`
                        }
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">Erro ao carregar lojas: ${error.message}</td></tr>`;
    }
}
// --- FUNÇÕES DE EDIÇÃO E EXCLUSÃO ---

async function editFilial(nomeFilial) {
    const filiais = await supabaseRequest(`filiais?nome=eq.${nomeFilial}`, 'GET', null, false);
    if (!filiais || filiais.length === 0) {
        showNotification('Filial não encontrada', 'error');
        return;
    }
    
    const filial = filiais[0];
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Filial';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_filial_nome" value="${filial.nome}">
        <div class="form-group"><label>Nome da Filial:</label><input type="text" id="add_nome" value="${filial.nome}" required readonly></div>
        <div class="form-group"><label>Descrição:</label><input type="text" id="add_descricao" value="${filial.descricao}" required></div>
        <div class="form-group md:col-span-2"><label>Endereço do CD:</label><input type="text" id="add_endereco_cd" value="${filial.endereco_cd || ''}" required></div>
        <div class="form-group"><label>Latitude do CD:</label><input type="number" id="add_latitude_cd" step="0.000001" value="${filial.latitude_cd || ''}"></div>
        <div class="form-group"><label>Longitude do CD:</label><input type="number" id="add_longitude_cd" step="0.000001" value="${filial.longitude_cd || ''}"></div>
        <div class="form-group"><label>Status:</label><select id="add_ativo"><option value="true" ${filial.ativo ? 'selected' : ''}>Ativa</option><option value="false" ${!filial.ativo ? 'selected' : ''}>Inativa</option></select></div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteFilial(nomeFilial) {
    const confirmed = await showYesNoModal(`Deseja excluir a filial "${nomeFilial}"? Esta ação não pode ser desfeita.`);
    if (confirmed) {
        try {
            await supabaseRequest(`filiais?nome=eq.${nomeFilial}`, 'DELETE', null, false);
            showNotification('Filial excluída com sucesso!', 'success');
            renderFiliaisConfig();
        } catch (error) {
            showNotification(`Erro ao excluir filial: ${error.message}`, 'error');
        }
    }
}

async function editDoca(docaId) {
    const doca = docas.find(d => d.id === docaId);
    if (!doca) {
        showNotification('Doca não encontrada', 'error');
        return;
    }
    
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Doca';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_doca_id" value="${doca.id}">
        <div class="form-group"><label>Nome da Doca:</label><input type="text" id="add_nome" value="${doca.nome}" required></div>
        <div class="form-group"><label>Capacidade (Pallets):</label><input type="number" id="add_capacidade_pallets" min="0" value="${doca.capacidade_pallets}" required></div>
        <div class="form-group"><label>Código QR:</label><input type="text" id="add_coddoca" value="${doca.coddoca || ''}" required></div>
        <div class="form-group"><label>Status:</label><select id="add_ativo"><option value="true" ${doca.ativo ? 'selected' : ''}>Ativa</option><option value="false" ${!doca.ativo ? 'selected' : ''}>Inativa</option></select></div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteDoca(docaId) {
    const confirmed = await showYesNoModal('Deseja excluir esta doca? Esta ação não pode ser desfeita.');
    if (confirmed) {
        try {
            await supabaseRequest(`docas?id=eq.${docaId}`, 'DELETE');
            showNotification('Doca excluída com sucesso!', 'success');
            await loadSelectData();
            renderDocasConfig();
        } catch (error) {
            showNotification(`Erro ao excluir doca: ${error.message}`, 'error');
        }
    }
}

async function editLider(liderId) {
    const lider = lideres.find(l => l.id === liderId);
    if (!lider) {
        showNotification('Líder não encontrado', 'error');
        return;
    }
    
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Líder';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_lider_id" value="${lider.id}">
        <div class="form-group"><label>Nome do Líder:</label><input type="text" id="add_nome" value="${lider.nome}" required></div>
        <div class="form-group"><label>Matrícula:</label><input type="text" id="add_codigo_funcionario" value="${lider.codigo_funcionario || ''}" required></div>
        <div class="form-group"><label>Status:</label><select id="add_ativo"><option value="true" ${lider.ativo ? 'selected' : ''}>Ativo</option><option value="false" ${!lider.ativo ? 'selected' : ''}>Inativo</option></select></div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteLider(liderId) {
    const confirmed = await showYesNoModal('Deseja excluir este líder? Esta ação não pode ser desfeita.');
    if (confirmed) {
        try {
            await supabaseRequest(`lideres?id=eq.${liderId}`, 'DELETE');
            showNotification('Líder excluído com sucesso!', 'success');
            await loadSelectData();
            renderLideresConfig();
        } catch (error) {
            showNotification(`Erro ao excluir líder: ${error.message}`, 'error');
        }
    }
}

async function editAcesso(nomeUsuario) {
    const acessosData = await supabaseRequest(`acessos?nome=eq.${nomeUsuario}`, 'GET', null, false);
    if (!acessosData || acessosData.length === 0) {
        showNotification('Acesso não encontrado', 'error');
        return;
    }
    
    const acesso = acessosData[0];
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Acesso';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_acesso_nome" value="${acesso.nome}">
        <div class="form-group"><label>Nome de Usuário:</label><input type="text" id="add_nome" value="${acesso.nome}" required readonly></div>
        <div class="form-group"><label>Nova Senha:</label><input type="password" id="add_senha" placeholder="Deixe em branco para manter a atual"></div>
        <div class="form-group"><label>Tipo de Acesso:</label><select id="add_tipo_acesso" required><option value="ALL" ${acesso.tipo_acesso === 'ALL' ? 'selected' : ''}>ALL (Master)</option><option value="${selectedFilial.nome}" ${acesso.tipo_acesso === selectedFilial.nome ? 'selected' : ''}>${selectedFilial.nome}</option></select></div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteAcesso(nomeUsuario) {
    const confirmed = await showYesNoModal(`Deseja excluir o acesso do usuário "${nomeUsuario}"?`);
    if (confirmed) {
        try {
            await supabaseRequest(`acessos?nome=eq.${nomeUsuario}`, 'DELETE', null, false);
            showNotification('Acesso excluído com sucesso!', 'success');
            renderAcessosConfig();
        } catch (error) {
            showNotification(`Erro ao excluir acesso: ${error.message}`, 'error');
        }
    }
}

async function editLoja(lojaId) {
    const loja = lojas.find(l => l.id === lojaId);
    if (!loja) {
        showNotification('Loja não encontrada', 'error');
        return;
    }
    
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Loja';
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_loja_id" value="${loja.id}">
        <div class="form-group"><label>Nome da Loja:</label><input type="text" id="add_nome" value="${loja.nome}" required></div>
        <div class="form-group"><label>Código da Loja:</label><input type="text" id="add_codigo" value="${loja.codigo}" required></div>
        <div class="form-group"><label>Cidade:</label><input type="text" id="add_cidade" value="${loja.cidade}" required></div>
        <div class="form-group"><label>Código QR:</label><input type="text" id="add_codlojaqr" value="${loja.codlojaqr || ''}" required></div>
        <div class="form-group md:col-span-2"><label>Endereço Completo:</label><input type="text" id="add_endereco_completo" value="${loja.endereco_completo || ''}" placeholder="Rua, Número, Bairro, CEP" required></div>
        <div class="form-group"><label>Latitude:</label><input type="number" id="add_latitude" step="0.000001" value="${loja.latitude || ''}" placeholder="-15.601400"></div>
        <div class="form-group"><label>Longitude:</label><input type="number" id="add_longitude" step="0.000001" value="${loja.longitude || ''}" placeholder="-56.097900"></div>
        <div class="form-group"><label>Status:</label><select id="add_ativo"><option value="true" ${loja.ativo ? 'selected' : ''}>Ativa</option><option value="false" ${!loja.ativo ? 'selected' : ''}>Inativa</option></select></div>
        <div class="text-center mt-4 md:col-span-2">
            <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocation()">📍 Usar Localização Atual</button>
            <button type="button" class="btn btn-primary" onclick="geocodeAddress()">🌍 Buscar por Endereço</button>
        </div>
    `;
    
    modal.style.display = 'flex';
}

async function deleteLoja(lojaId) {
    const confirmed = await showYesNoModal('Deseja excluir esta loja? Esta ação não pode ser desfeita.');
    if (confirmed) {
        try {
            await supabaseRequest(`lojas?id=eq.${lojaId}`, 'DELETE');
            showNotification('Loja excluída com sucesso!', 'success');
            await loadSelectData();
            await renderLojasConfig();
        } catch (error) {
            showNotification(`Erro ao excluir loja: ${error.message}`, 'error');
        }
    }
}

function showLojaMap(lojaId) {
    const loja = lojas.find(l => l.id === lojaId);
    if (!loja || !loja.latitude || !loja.longitude) {
        showNotification('Coordenadas da loja não definidas', 'error');
        return;
    }
    
    document.getElementById('mapModalTitle').textContent = `Localização - ${loja.nome}`;
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(() => {
        initSingleLojaMap(parseFloat(loja.latitude), parseFloat(loja.longitude), loja);
    }, 100);
}

function initSingleLojaMap(lat, lng, loja) {
    if (mapInstance) {
        mapInstance.remove();
    }
    
    mapInstance = L.map('map').setView([lat, lng], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    const lojaIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background: #EF4444; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
        iconSize: [100, 40],
        iconAnchor: [50, 20]
    });
    
    L.marker([lat, lng], { icon: lojaIcon })
        .addTo(mapInstance)
        .bindPopup(`
            <div style="text-align: center;">
                <h3><strong>${loja.nome}</strong></h3>
                <p><strong>Código:</strong> ${loja.codigo}</p>
                <p><strong>Cidade:</strong> ${loja.cidade}</p>
                ${loja.endereco_completo ? `<p><strong>Endereço:</strong> ${loja.endereco_completo}</p>` : ''}
                <p><strong>Coordenadas:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
            </div>
        `).openPopup();
}

async function geocodeAddress() {
    const endereco = document.getElementById('add_endereco_completo').value.trim();
    
    if (!endereco) {
        showNotification('Digite um endereço para buscar as coordenadas', 'error');
        return;
    }
    
    try {
        showNotification('Buscando coordenadas...', 'info');
        
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1&countrycodes=br`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = data[0];
            document.getElementById('add_latitude').value = parseFloat(result.lat).toFixed(6);
            document.getElementById('add_longitude').value = parseFloat(result.lon).toFixed(6);
            showNotification(`Coordenadas encontradas: ${result.display_name}`, 'success');
        } else {
            showNotification('Endereço não encontrado. Verifique o endereço ou use coordenadas manuais.', 'error');
        }
    } catch (error) {
        showNotification('Erro ao buscar coordenadas. Tente novamente ou use coordenadas manuais.', 'error');
        console.error('Erro na geocodificação:', error);
    }
}

function showAllLojasMap() {
    document.getElementById('mapModalTitle').textContent = 'Todas as Lojas Cadastradas';
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(() => {
        initAllLojasMap();
    }, 100);
}

// Cerca da linha 2167
function initAllLojasMap() {
    if (mapInstance) {
        mapInstance.remove();
    }
    
    // Ponto de partida dinâmico da filial
    const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979]; 
    
    mapInstance = L.map('map').setView(cdCoords, 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    const cdIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: #0077B6; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>',
        iconSize: [60, 30],
        iconAnchor: [30, 15]
    });
    
    L.marker(cdCoords, { icon: cdIcon })
        .addTo(mapInstance)
        .bindPopup(`<h3><strong>Centro de Distribuição</strong></h3><p>Filial ${selectedFilial.nome}</p>`);
    
    const bounds = L.latLngBounds();
    bounds.extend(cdCoords);
    
    let lojasComGPS = 0;
    let lojasSemGPS = 0;
    
    lojas.forEach(loja => {
        if (loja.latitude && loja.longitude) {
            lojasComGPS++;
            const lat = parseFloat(loja.latitude);
            const lng = parseFloat(loja.longitude);
            
            let cor = '#10B981';
            if (loja.nome.toLowerCase().includes('fort')) {
                cor = '#EF4444';
            } else if (loja.nome.toLowerCase().includes('comper')) {
                cor = '#0077B6';
            }
            
            const lojaIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: ${cor}; color: white; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
                iconSize: [60, 25],
                iconAnchor: [30, 12]
            });
            
            L.marker([lat, lng], { icon: lojaIcon })
                .addTo(mapInstance)
                .bindPopup(`
                    <div style="text-align: center;">
                        <h3><strong>${loja.nome}</strong></h3>
                        <p><strong>Código:</strong> ${loja.codigo}</p>
                        <p><strong>Cidade:</strong> ${loja.cidade}</p>
                        ${loja.endereco_completo ? `<p><strong>Endereço:</strong><br>${loja.endereco_completo}</p>` : ''}
                        <p><strong>Coordenadas:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                    </div>
                `);
            
            bounds.extend([lat, lng]);
        } else {
            lojasSemGPS++;
        }
    });
    
    if (lojasComGPS > 0) {
        mapInstance.fitBounds(bounds, { padding: [20, 20] });
    }
    
    const infoControl = L.control({ position: 'topleft' });
    infoControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
        div.style.background = 'white';
        div.style.padding = '10px';
        div.style.fontSize = '12px';
        
        let alertText = '';
        if (lojasSemGPS > 0) {
            alertText = `<p style="color: #F59E0B; font-weight: bold; margin-top: 8px;">⚠️ ${lojasSemGPS} loja(s) sem coordenadas definidas</p>`;
        }
        
        div.innerHTML = `
            <div>
                <h4 style="margin: 0 0 8px 0;"><strong>Lojas da Filial ${selectedFilial.nome}</strong></h4>
                <p><strong>Total de Lojas:</strong> ${lojas.length}</p>
                <p><strong>Com GPS:</strong> ${lojasComGPS}</p>
                <p><strong>Sem GPS:</strong> ${lojasSemGPS}</p>
                ${alertText}
                <hr style="margin: 8px 0;">
                <p style="font-size: 10px; color: #666;">
                    🔴 Lojas Fort<br>
                    🔵 Lojas Comper<br> 
                    🟢 Centro de Distribuição
                </p>
            </div>
        `;
        return div;
    };
    infoControl.addTo(mapInstance);
}

function calculateRouteToLoja(lojaId) {
    const loja = lojas.find(l => l.id === lojaId);
    if (!loja || !loja.latitude || !loja.longitude) {
        showNotification('Coordenadas da loja não definidas', 'error');
        return;
    }
    
    closeMapModal();
    
    setTimeout(() => {
        document.getElementById('mapModalTitle').textContent = `Rota: CD → ${loja.nome}`;
        document.getElementById('mapModal').style.display = 'flex';
        
        setTimeout(() => {
            showSimulatedRoute(loja);
        }, 100);
    }, 300);
}

// Cerca da linha 2269
function showSimulatedRoute(loja) {
    if (mapInstance) {
        mapInstance.remove();
    }
    
    // Ponto de partida dinâmico da filial
    const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979]; 
    const lojaCoords = [parseFloat(loja.latitude), parseFloat(loja.longitude)];
    
    const bounds = L.latLngBounds([cdCoords, lojaCoords]);
    mapInstance = L.map('map').fitBounds(bounds, { padding: [50, 50] });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    // Resto da implementação da função...
}
// Novas funções para geolocalização da filial
async function geocodeAddressFilial() {
    const endereco = document.getElementById('add_endereco_cd').value.trim();
    
    if (!endereco) {
        showNotification('Digite um endereço para buscar as coordenadas', 'error');
        return;
    }
    
    try {
        showNotification('Buscando coordenadas...', 'info');
        
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1&countrycodes=br`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = data[0];
            document.getElementById('add_latitude_cd').value = parseFloat(result.lat).toFixed(6);
            document.getElementById('add_longitude_cd').value = parseFloat(result.lon).toFixed(6);
            showNotification(`Coordenadas encontradas: ${result.display_name}`, 'success');
        } else {
            showNotification('Endereço não encontrado. Verifique o endereço.', 'error');
        }
    } catch (error) {
        showNotification('Erro ao buscar coordenadas. Tente novamente.', 'error');
        console.error('Erro na geocodificação:', error);
    }
}

function getCurrentLocationFilial() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('add_latitude_cd').value = position.coords.latitude.toFixed(6);
                document.getElementById('add_longitude_cd').value = position.coords.longitude.toFixed(6);
                showNotification('Localização atual capturada!', 'success');
            },
            (error) => {
                showNotification('Erro ao obter localização: ' + error.message, 'error');
            }
        );
    } else {
        showNotification('Geolocalização não suportada pelo navegador.', 'error');
    }
}
// --- NOVO: FUNÇÃO PARA CALCULAR ROTA SIMULADA ---
async function calculateSimulatedRoute(startLat, startLng, endLat, endLng) {
    const R = 6371e3;
    const φ1 = parseFloat(startLat) * Math.PI / 180;
    const φ2 = parseFloat(endLat) * Math.PI / 180;
    const Δφ = (parseFloat(endLat) - parseFloat(startLat)) * Math.PI / 180;
    const Δλ = (parseFloat(endLng) - parseFloat(startLng)) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    const averageSpeedMetersPerSecond = 40 * 1000 / 3600;
    const duration = distance / averageSpeedMetersPerSecond;

    return {
        distance: distance,
        duration: duration
    };
}
// --- NOVO: FUNÇÃO PARA CALCULAR ROTA REAL VIA API OSRM ---
async function getRouteFromAPI(waypoints) {
    if (!waypoints || waypoints.length < 2) {
        console.error('Pelo menos dois waypoints são necessários para calcular a rota.');
        return null;
    }

    const coordinates = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?geometries=geojson&overview=full&steps=true`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na API de roteamento: ${response.statusText}`);
        }
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            return {
                distance: route.distance, // em metros
                duration: route.duration, // em segundos
                coordinates: route.geometry.coordinates.map(c => [c[1], c[0]])
            };
        }
        return null;
    } catch (error) {
        console.error('Falha ao obter rota da API:', error);
        return null;
    }
}
// NOVO: Funções para o Modal de Ordem de Carregamento

/**
 * Abre o modal para ordenar as lojas de uma nova expedição.
 * @param {string} expeditionId - O ID da expedição recém-criada.
 */
async function openOrdemCarregamentoModal(expeditionId) {
    const modal = document.getElementById('ordemCarregamentoModal');
    const list = document.getElementById('ordemLojasList');
    document.getElementById('ordemExpeditionId').value = expeditionId;
    list.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando lojas...</div>`;
    modal.style.display = 'flex';

    try {
        // Busca os itens da expedição e os dados das lojas associadas
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}&select=*,lojas(codigo,nome)`);
        
        if (!items || items.length === 0) {
            showNotification('Nenhum item encontrado para esta expedição.', 'error');
            closeOrdemCarregamentoModal();
            return;
        }

        // Popula a lista com os itens arrastáveis
        list.innerHTML = items.map(item => `
            <li draggable="true" data-item-id="${item.id}" class="flex items-center">
                <i data-feather="menu" class="drag-handle"></i>
                <div>
                    <strong class="text-gray-800">${item.lojas.codigo} - ${item.lojas.nome}</strong>
                    <div class="text-sm text-gray-500">${item.pallets} Pallets, ${item.rolltrainers} RollTainers</div>
                </div>
            </li>
        `).join('');

        feather.replace(); // Renderiza os ícones (como o de arrastar)

        // Adiciona os event listeners de drag-and-drop
        const draggables = list.querySelectorAll('li[draggable="true"]');
        draggables.forEach(draggable => {
            draggable.addEventListener('dragstart', () => {
                draggable.classList.add('dragging');
            });
            draggable.addEventListener('dragend', () => {
                draggable.classList.remove('dragging');
            });
        });

        list.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            const dragging = document.querySelector('.dragging');
            if (!dragging) return;
            if (afterElement == null) {
                list.appendChild(dragging);
            } else {
                list.insertBefore(dragging, afterElement);
            }
        });

    } catch (error) {
        showNotification(`Erro ao carregar itens da expedição: ${error.message}`, 'error');
        closeOrdemCarregamentoModal();
    }
}

/**
 * Função auxiliar para encontrar o elemento sobre o qual o item está sendo arrastado.
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li[draggable="true"]:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


function closeOrdemCarregamentoModal() {
    document.getElementById('ordemCarregamentoModal').style.display = 'none';
    document.getElementById('ordemLojasList').innerHTML = '';
}

// SUBSTITUA A FUNÇÃO ANTIGA POR ESTA
async function saveOrdemCarregamento() {
    const expeditionId = document.getElementById('ordemExpeditionId').value;
    const orderedItems = document.querySelectorAll('#ordemLojasList li');

    if (orderedItems.length === 0) {
        showNotification('Nenhuma loja para ordenar.', 'error');
        return;
    }

    // Cria um array de objetos para a atualização
    const updates = Array.from(orderedItems).map((item, index) => {
        return {
            id: item.dataset.itemId,
            ordem_entrega: index + 1
        };
    });

    try {
        // Cria uma lista de promessas de atualização, uma para cada item
        const updatePromises = updates.map(update => {
            const endpoint = `expedition_items?id=eq.${update.id}`; // Especifica o ID do item
            const payload = { ordem_entrega: update.ordem_entrega }; // Envia apenas o dado a ser atualizado
            return supabaseRequest(endpoint, 'PATCH', payload, false);
        });

        // Executa todas as atualizações
        await Promise.all(updatePromises);

        showNotification('Ordem de carregamento salva com sucesso!', 'success');
        
        closeOrdemCarregamentoModal();

        // Recarrega os dados
        loadTransportList();
        await loadSelectData(); 
    } catch (error) {
        // A mensagem de erro agora virá do supabaseRequest, que já é detalhada
        // Apenas para garantir, logamos o erro completo no console.
        console.error("Erro completo ao salvar ordem:", error);
    }
}
// --- NOVAS FUNÇÕES DE RENDERIZAÇÃO PARA CONFIGURAÇÕES ---

async function renderFiliaisConfig() {
    const tbody = document.getElementById('filiaisConfigBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div>Carregando filiais...</td></tr>`;
    
    try {
        const filiaisData = await supabaseRequest('filiais?order=nome', 'GET', null, false);
        tbody.innerHTML = filiaisData.map(filial => `
            <tr>
                <td class="font-medium">${filial.nome}</td>
                <td>${filial.descricao || 'N/A'}</td>
                <td class="max-w-xs truncate" title="${filial.endereco_cd || 'Não informado'}">${filial.endereco_cd || 'Não informado'}</td>
                <td><span class="status-badge ${filial.ativo ? 'status-disponivel' : 'status-cancelado'}">${filial.ativo ? 'Ativa' : 'Inativa'}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editFilial('${filial.nome}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteFilial('${filial.nome}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar filiais: ${error.message}</td></tr>`;
    }
}

async function renderDocasConfig() {
    const tbody = document.getElementById('docasConfigBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div>Carregando docas...</td></tr>`;
    
    try {
        const docasData = await supabaseRequest('docas?order=nome');
        tbody.innerHTML = docasData.map(doca => `
            <tr>
                <td class="font-medium">${doca.nome}</td>
                <td class="text-center">${doca.capacidade_pallets}</td>
                <td class="text-center">${doca.coddoca || 'N/A'}</td>
                <td><span class="status-badge status-${doca.status || 'disponivel'}">${getStatusLabel(doca.status || 'disponivel')}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editDoca('${doca.id}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteDoca('${doca.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar docas: ${error.message}</td></tr>`;
    }
}

async function renderLideresConfig() {
    const tbody = document.getElementById('lideresConfigBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando líderes...</td></tr>`;
    
    try {
        const lideresData = await supabaseRequest('lideres?order=nome');
        tbody.innerHTML = lideresData.map(lider => `
            <tr>
                <td class="font-medium">${lider.nome}</td>
                <td>${lider.codigo_funcionario || 'N/A'}</td>
                <td><span class="status-badge ${lider.ativo ? 'status-disponivel' : 'status-cancelado'}">${lider.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editLider('${lider.id}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteLider('${lider.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="alert alert-error">Erro ao carregar líderes: ${error.message}</td></tr>`;
    }
}

function renderPontosInteresseConfig() {
    const tbody = document.getElementById('pontosInteresseConfigBody');
    if (!tbody) return;
    
    if (pontosInteresse.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Nenhum ponto de interesse cadastrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = pontosInteresse.map(ponto => `
        <tr>
            <td class="font-medium">${ponto.nome}</td>
            <td><span class="px-2 py-1 rounded text-xs font-medium" style="background: ${ponto.cor}20; color: ${ponto.cor};">${ponto.tipo}</span></td>
            <td class="text-xs font-mono">${parseFloat(ponto.latitude).toFixed(6)}, ${parseFloat(ponto.longitude).toFixed(6)}</td>
            <td class="text-center">${ponto.raio_deteccao}m</td>
            <td class="text-center"><span class="status-badge ${ponto.ativo ? 'status-disponivel' : 'status-cancelado'}">${ponto.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <div class="flex gap-1">
                    <button class="btn btn-warning btn-small" onclick="editPontoInteresse('${ponto.id}')">Editar</button>
                    <button class="btn btn-danger btn-small" onclick="deletePontoInteresse('${ponto.id}')">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function renderAcessosConfig() {
    const tbody = document.getElementById('acessosConfigBody');
    if (!tbody) return;

    // Apenas usuários master podem gerenciar acessos
    if (!masterUserPermission) {
        tbody.innerHTML = '<tr><td colspan="3" class="alert alert-error">Acesso negado.</td></tr>';
        return;
    }

    tbody.innerHTML = `<tr><td colspan="3" class="loading"><div class="spinner"></div>Carregando acessos...</td></tr>`;

    try {
        // CORREÇÃO: Adicionando 'false' no último parâmetro para desativar o filtro de filial.
        const acessosData = await supabaseRequest('acessos?select=nome,grupo_id!inner(nome)', 'GET', null, false);
        
        tbody.innerHTML = acessosData.map(acesso => `
            <tr>
                <td class="font-medium">${acesso.nome}</td>
                <td><span class="status-badge ${acesso.grupo_id.nome === 'MASTER' ? 'status-disponivel' : 'status-em_uso'}">${acesso.grupo_id.nome}</span></td>
                <td>
                    <div class="flex gap-1">
                        <button class="btn btn-warning btn-small" onclick="editAcesso('${acesso.nome}')">Editar</button>
                        <button class="btn btn-danger btn-small" onclick="deleteAcesso('${acesso.nome}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" class="alert alert-error">Erro ao carregar acessos: ${error.message}</td></tr>`;
    }
}
// Função para mostrar detalhes da expedição
async function showDetalhesExpedicao(expeditionId) {
    const modal = document.getElementById('detalhesExpedicaoModal');
    const content = document.getElementById('detalhesContent');
    
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando detalhes...</div>';
    modal.style.display = 'flex';
    
    try {
        // Buscar dados completos da expedição
        const expedition = await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'GET', null, false);
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`, 'GET', null, false);
        
        if (!expedition || expedition.length === 0) {
            content.innerHTML = '<div class="alert alert-error">Expedição não encontrada.</div>';
            return;
        }
        
        const exp = expedition[0];
        const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
        const motorista = motoristas.find(m => m.id === exp.motorista_id);
        const lider = lideres.find(l => l.id === exp.lider_id);
        
        let planilhaHTML = '';
        
        // Gerar uma página para cada loja
        if (items && items.length > 0) {
            items.forEach((item, index) => {
                const loja = lojas.find(l => l.id === item.loja_id);
                
                // Adicionar quebra de página antes de cada loja (exceto a primeira)
                if (index > 0) {
                    planilhaHTML += '<div style="page-break-before: always;"></div>';
                }
                
                planilhaHTML += `
    <div class="planilha-controle">
        <!-- Cabeçalho da Loja -->
        <div class="planilha-header" style="background: #4a90e2; color: white; font-size: 16px; padding: 10px;">
            LOJA ${loja?.codigo || 'N/A'} - ${loja?.nome || 'N/A'}
        </div>
        
        <!-- Informações da Expedição -->
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
                    <div class="planilha-cell" style="width: 120px;">LÍDER:</div>
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
                    <div class="planilha-value">${exp.data_chegada_veiculo ? new Date(exp.data_chegada_veiculo).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : 'N/A'}</div>
                </div>
                <div class="planilha-row" style="margin-bottom: 6px;">
                    <div class="planilha-cell" style="width: 120px;">FIM CARREG.:</div>
                    <div class="planilha-value">${exp.data_saida_veiculo ? new Date(exp.data_saida_veiculo).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : 'N/A'}</div>
                </div>
            </div>
        </div>
        
        <!-- Números de Carga -->
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
        
        <!-- Horários de Entrega -->
        ${item.data_inicio_descarga || item.data_fim_descarga ? `
            <div style="margin: 10px;">
                <div class="planilha-header" style="background: #e8f4f8; color: #333; padding: 6px; font-size: 12px;">
                    HORÁRIOS DE ENTREGA
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0;">
                    <div class="planilha-cell" style="padding: 8px;">CHEGADA NA LOJA:</div>
                    <div class="planilha-value" style="padding: 8px;">${item.data_inicio_descarga ? new Date(item.data_inicio_descarga).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : 'N/A'}</div>
                    <div class="planilha-cell" style="padding: 8px;">SAÍDA DA LOJA:</div>
                    <div class="planilha-value" style="padding: 8px;">${item.data_fim_descarga ? new Date(item.data_fim_descarga).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : 'N/A'}</div>
                </div>
            </div>
        ` : ''}
    </div>
`;
            });
        } else {
            // Se não houver itens, mostrar mensagem
            planilhaHTML = `
                <div class="planilha-controle">
                    <div class="planilha-header">DETALHES DA EXPEDIÇÃO</div>
                    <div class="alert alert-info">Nenhuma loja encontrada para esta expedição.</div>
                </div>
            `;
        }
        
        content.innerHTML = planilhaHTML;
        
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        content.innerHTML = '<div class="alert alert-error">Erro ao carregar detalhes da expedição.</div>';
    }
}

// Função para fechar modal de detalhes
function closeDetalhesModal() {
    document.getElementById('detalhesExpedicaoModal').style.display = 'none';
}

// Função para imprimir detalhes
function imprimirDetalhes() {
    window.print();
}
// --- FUNCIONALIDADES DA ABA OPERAÇÃO IDENTIFICAÇÃO ---
async function loadOperacao() {
    showSubTab('operacao', 'lancamento', document.querySelector('#operacao .sub-tab'));
}

async function loadIdentificacaoExpedicoes() {
    const container = document.getElementById('expedicoesParaIdentificacao');
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando expedições...</div>`;

    try {
        // Busca expedições que ainda não saíram para entrega
        const expeditions = await supabaseRequest("expeditions?status=in.(aguardando_agrupamento,aguardando_veiculo,em_carregamento,carregado,aguardando_faturamento,faturamento_iniciado,faturado)&order=data_hora.desc");
        const items = await supabaseRequest('expedition_items');

        if (!expeditions || expeditions.length === 0) {
            container.innerHTML = '<div class="alert alert-success">Nenhuma expedição aguardando identificação!</div>';
            return;
        }

        const expeditionsWithItems = expeditions.map(exp => {
            const expItems = items.filter(item => item.expedition_id === exp.id);
            const lider = lideres.find(l => l.id === exp.lider_id);
            const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
            const motorista = motoristas.find(m => m.id === exp.motorista_id);

            return {
                ...exp,
                items: expItems,
                lider_nome: lider?.nome || 'N/A',
                veiculo_placa: veiculo?.placa || 'N/A',
                motorista_nome: motorista?.nome || 'N/A',
                total_pallets: expItems.reduce((sum, item) => sum + (item.pallets || 0), 0),
                total_rolltrainers: expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0)
            };
        });

        // Garante que as lojas estão carregadas antes de renderizar
if (lojas.length === 0) {
    await loadSelectData();
}
renderIdentificacaoExpedicoes(expeditionsWithItems);

    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Erro ao carregar expedições: ${error.message}</div>`;
    }
}

function renderIdentificacaoExpedicoes(expeditions) {
    const container = document.getElementById('expedicoesParaIdentificacao');

    container.innerHTML = expeditions.map(exp => {
        const totalItens = exp.total_pallets + exp.total_rolltrainers;
        const numeroCarga = exp.numeros_carga && exp.numeros_carga.length > 0 ? exp.numeros_carga[0] : 'N/A';
        
        const lojasInfo = exp.items.map(item => {
            const loja = lojas.find(l => l.id === item.loja_id);
            return loja ? `${loja.codigo} - ${loja.nome}` : 'N/A';
        }).join(', ');

        return `
            <div class="identificacao-card">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Expedição ${exp.id}</h3>
                        <p class="text-sm text-gray-500">${new Date(exp.data_hora).toLocaleString('pt-BR')}</p>
                        <p class="text-sm text-gray-600 mt-2"><strong>Lojas:</strong> ${lojasInfo}</p>
                        ${exp.numeros_carga && exp.numeros_carga.length > 0 ? `<p class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1 inline-block">📦 ${exp.numeros_carga.join(', ')}</p>` : ''}
                    </div>
                    <span class="status-badge status-${exp.status}">${getStatusLabel(exp.status)}</span>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                    <div><strong>Líder:</strong> ${exp.lider_nome}</div>
                    <div><strong>Veículo:</strong> ${exp.veiculo_placa}</div>
                    <div><strong>Motorista:</strong> ${exp.motorista_nome}</div>
                    <div><strong>Total Itens:</strong> ${totalItens}</div>
                </div>

                <div class="bg-gray-50 p-4 rounded-lg mb-4">
                    <div class="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <div class="text-2xl font-bold text-blue-600">${exp.total_pallets}</div>
                            <div class="text-xs text-gray-500">Pallets</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-orange-600">${exp.total_rolltrainers}</div>
                            <div class="text-xs text-gray-500">RollTrainers</div>
                        </div>
                    </div>
                </div>

                <div class="text-center">
                    <button class="btn btn-primary" onclick="imprimirIdentificacao('${exp.id}', '${numeroCarga}', '${exp.lider_nome}', ${exp.total_pallets}, ${exp.total_rolltrainers})">
                        🖨️ Imprimir Identificação (${totalItens} etiquetas)
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Substitua a função imprimirIdentificacao existente por esta versão corrigida:

// Substitua a função imprimirIdentificacao existente por esta versão corrigida:

// Substitua a função imprimirIdentificacao existente por esta versão corrigida:

// Substitua a função imprimirIdentificacao existente por esta versão corrigida:

// Substitua a função imprimirIdentificacao existente por esta versão corrigida:

// Substitua a função imprimirIdentificacao existente por esta versão corrigida:

async function imprimirIdentificacao(expeditionId, numeroCarga, liderNome, pallets, rolltrainers) {
    try {
        // Busca os itens da expedição e as informações das lojas
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`);
        
        if (!items || items.length === 0) {
            showNotification('Nenhum item encontrado para esta expedição.', 'error');
            return;
        }
        
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-BR');
        
        // Remove qualquer div de impressão anterior
        const existingPrintDiv = document.getElementById('printIdentificationDiv');
        if (existingPrintDiv) {
            existingPrintDiv.remove();
        }

        // Cria o container de impressão
        const printDiv = document.createElement('div');
        printDiv.id = 'printIdentificationDiv';
        
        let etiquetasHtml = `
            <style>
                @media print {
                    * {
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                        -webkit-print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    
                    @page {
                        size: A4 landscape;
                        margin: 0;
                    }
                    
                    body * {
                        visibility: hidden !important;
                    }
                    
                    #printIdentificationDiv,
                    #printIdentificationDiv * {
                        visibility: visible !important;
                    }
                    
                    #printIdentificationDiv {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        overflow: visible !important;
                        z-index: 9999 !important;
                    }
                    
                    .etiqueta-page {
                        width: 297mm !important;
                        height: 210mm !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        position: relative !important;
                        box-sizing: border-box !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                    }
                    
                    .etiqueta-page:last-child {
                        page-break-after: auto !important;
                    }
                    
                    .etiqueta-container {
                        text-align: center !important;
                        font-family: Arial, sans-serif !important;
                        width: 100% !important;
                        height: 100% !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: center !important;
                        align-items: center !important;
                        padding: 5mm !important; 
                        box-sizing: border-box !important;
                    }
                    
                    .etiqueta-quadro {
                        border: 3px solid #999 !important;
                        padding: 20mm 15mm !important; 
                        background: white !important;
                        width: 100% !important;
                        height: 100% !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        justify-content: center !important;
                        border-radius: 20px !important;
                        box-shadow: inset 0 0 0 2px #ccc !important;
                        box-sizing: border-box !important;
                    }
                    
                    .etiqueta-numero {
                        font-size: 100px !important;
                        font-weight: 900 !important;
                        color: #000 !important;
                        margin: 0 !important;
                        line-height: 0.9 !important;
                        letter-spacing: 3px !important;
                        text-transform: uppercase !important;
                    }
                    
                    .etiqueta-info {
                        font-size: 76px !important; 
                        font-weight: 700 !important;
                        color: #333 !important;
                        margin: 0 !important;
                        line-height: 1.1 !important;
                        letter-spacing: 3px !important;
                        text-transform: uppercase !important;
                    }
                    
                    .etiqueta-data {
                        font-size: 60px !important;
                        font-weight: 700 !important;
                        color: #000 !important;
                        margin: 0 !important;
                        line-height: 1 !important;
                        letter-spacing: 3px !important;
                    }
                    
                    .etiqueta-contador {
                        font-size: 110px !important;
                        font-weight: 900 !important;
                        color: #000 !important;
                        border: 3px solid #999 !important;
                        padding: 25px 50px !important;
                        margin: 0 !important;
                        line-height: 1 !important;
                        display: inline-block !important;
                        border-radius: 15px !important;
                        background: #f0f0f0 !important;
                        letter-spacing: 4px !important;
                        box-shadow: inset 0 0 0 2px #ccc !important;
                        margin-bottom: 25px !important;
                    }
                    
                    .etiqueta-lojas {
                        font-size: 42px !important;
                        font-weight: 700 !important;
                        color: #000 !important;
                        margin: 0 !important;
                        line-height: 1.2 !important;
                        text-align: center !important;
                        max-width: 100% !important;
                        word-wrap: break-word !important;
                        text-transform: uppercase !important;
                        letter-spacing: 2px !important;
                    }

                    hr.etiqueta-divider {
                        border: none !important;
                        border-top: 2px solid #999 !important;
                        width: 90% !important;
                        margin: 25px auto !important;
                        opacity: 1 !important;
                    }
                }
                
                @media screen {
                    #printIdentificationDiv {
                        display: none;
                    }
                }
            </style>
        `;
        
        // Para cada loja da expedição, gerar suas etiquetas separadamente
        for (const item of items) {
            const loja = lojas.find(l => l.id === item.loja_id);
            if (!loja) continue;
            
            const lojaInfo = `${loja.codigo} - ${loja.nome}`;
            const totalItensLoja = (item.pallets || 0) + (item.rolltrainers || 0);
            
            // Criar etiquetas para esta loja específica
            for (let i = 1; i <= totalItensLoja; i++) {
                etiquetasHtml += `
                    <div class="etiqueta-page">
                        <div class="etiqueta-container">
                            <div class="etiqueta-quadro">
                                <div class="etiqueta-numero">${lojaInfo}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-data">${loja.endereco_completo}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-contador">${String(i).padStart(2, '0')}/${String(totalItensLoja).padStart(2, '0')}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-lojas">${liderNome}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-info">CD ${selectedFilial.nome} - ${selectedFilial.descricao}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        printDiv.innerHTML = etiquetasHtml;
        document.body.appendChild(printDiv);
        
        showNotification('Preparando impressão das etiquetas...', 'info');
        
        // Imprime
        setTimeout(() => {
            window.print();
            // Remove o div após a impressão
            setTimeout(() => {
                if (document.getElementById('printIdentificationDiv')) {
                    document.getElementById('printIdentificationDiv').remove();
                }
            }, 2000);
        }, 500);
        
    } catch (error) {
        console.error('Erro ao buscar dados para impressão:', error);
        showNotification('Erro ao carregar dados para impressão: ' + error.message, 'error');
    }
}
       // Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar AOS (animações)
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            once: true,
            easing: 'ease-out-cubic'
        });
    }
    document.getElementById('initialLoginForm').addEventListener('submit', handleInitialLogin);
});

// NOVA FUNÇÃO para lidar com o login inicial (SUBSTITUÍDA)
async function handleInitialLogin(event) {
    event.preventDefault();
    const nome = document.getElementById('initialUser').value.trim();
    const senha = document.getElementById('initialPassword').value;
    const alertContainer = document.getElementById('initialLoginAlert');

    if (!nome || !senha) {
        alertContainer.innerHTML = '<div class="alert alert-error">Usuário e senha são obrigatórios.</div>';
        return;
    }
    alertContainer.innerHTML = '<div class="loading">Autenticando...</div>';

    try {
        const endpoint = `acessos?select=nome,grupo_id&nome=eq.${nome}&senha=eq.${senha}`;
        const result = await supabaseRequest(endpoint, 'GET', null, false);

        if (!result || result.length === 0 || !result[0]) {
            alertContainer.innerHTML = '<div class="alert alert-error">Usuário ou senha incorretos.</div>';
            return;
        }

        const user = result[0];
        currentUser = {
            nome: user.nome,
            grupoId: user.grupo_id
        };

        // Determinar se é um usuário Master e carregar permissões
        // Proteção: verifica se o grupoId existe antes de fazer a requisição
        if (user.grupo_id) {
            const grupo = await supabaseRequest(`grupos_acesso?id=eq.${user.grupo_id}`);
            if (grupo && grupo.length > 0 && grupo[0].nome === 'MASTER') {
                masterUserPermission = true;
            } else {
                const permissoes = await supabaseRequest(`permissoes_grupo?grupo_id=eq.${user.grupo_id}`);
                userPermissions = permissoes.map(p => p.permissao);
            }
        } else {
            // Se o usuário não tem um grupo, não tem permissões
            masterUserPermission = false;
            userPermissions = [];
        }

        // NOVO: Redireciona para a tela de seleção de filial.
        // A validação de permissão para a filial agora ocorre na função selectFilial().
        document.getElementById('initialAuthContainer').style.display = 'none';
        document.getElementById('filialSelectionContainer').style.display = 'block';
        loadFiliais(); 
        
        showNotification(`Bem-vindo, ${currentUser.nome}!`, 'success');

    } catch (err) {
        alertContainer.innerHTML = '<div class="alert alert-error">Erro ao verificar credenciais.</div>';
        console.error(err);
    }
}
// NOVA FUNÇÃO
async function showMainSystem() {
    // Oculta todas as telas de seleção
    document.getElementById('initialAuthContainer').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'none';
    // Exibe a tela principal
    document.getElementById('mainSystem').style.display = 'flex';
}

// Função para permitir ao usuário trocar de filial
function trocarFilial() {
    selectedFilial = null;
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'block';
    loadFiliais();
}
