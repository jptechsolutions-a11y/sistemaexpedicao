 Chart.register(ChartDataLabels);
      
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
let gruposAcesso = [];


// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

// SUBSTITUIR A VERSÃO EXISTENTE DE loadUserPermissions
async function loadUserPermissions(userId, grupoId) {
    masterUserPermission = false;
    let finalPermissionsSet = new Set();
    
    // 1. CHECAGEM DE GRUPO E CARREGAMENTO DE PERMISSÕES
    if (grupoId) {
         try {
             // Carrega o nome do grupo e todas as permissões do grupo em paralelo
             // O último 'false' garante que o filtro de filial NÃO seja aplicado (Correto para permissões)
             const [grupo, permissoesGrupo] = await Promise.all([
                 supabaseRequest(`grupos_acesso?id=eq.${grupoId}&select=nome`, 'GET', null, false),
                 supabaseRequest(`permissoes_grupo?grupo_id=eq.${grupoId}&select=permissao`, 'GET', null, false)
             ]);
             
             // LOG PARA DIAGNÓSTICO
             console.log("Permissões do Grupo lidas do BD (Bruto):", permissoesGrupo);

             // MASTER BYPASS: Se for MASTER, define o bypass e retorna
             if (grupo && grupo.length > 0 && grupo[0].nome === 'MASTER') {
                 masterUserPermission = true;
                 // Adiciona um conjunto básico de permissões para garantir o fluxo de UI
                 userPermissions = ['gerenciar_permissoes', 'acesso_configuracoes', 'acesso_configuracoes_acessos', 'acesso_home'];
                 const todasFiliais = await supabaseRequest('filiais?select=nome&ativo=eq.true', 'GET', null, false);
                 todasFiliais.forEach(f => userPermissions.push(`acesso_filial_${f.nome}`));
                 return; 
             }

             // CARREGA PERMISSÕES DE GRUPOS NORMAIS E SANEIA
             if (permissoesGrupo && Array.isArray(permissoesGrupo)) {
                 // Saneamento: remove espaços e transforma em minúsculas
                 permissoesGrupo.forEach(p => finalPermissionsSet.add(p.permissao.trim().toLowerCase()));
             }
         } catch (e) {
             console.error("ERRO CRÍTICO: Falha ao carregar permissoes_grupo ou grupo_acesso. Possível falha de RLS.", e);
         }
    }
    
    // 🚨 FIX CRÍTICO: Adiciona acesso_home implicitamente para garantir a navegação.
    // O problema da tela vazia é resolvido por esta injeção.
    if (!masterUserPermission) {
        finalPermissionsSet.add('acesso_home');
    }
    
    // 2. IMPLICAR PERMISSÕES PAI A PARTIR DE SUB-PERMISSÕES
    // Garante que se tem 'acesso_faturamento_ativo', também terá 'acesso_faturamento'.
    const explicitPermissions = Array.from(finalPermissionsSet);
    explicitPermissions.forEach(p => {
        const parts = p.split('_');
        if (parts.length > 2 && parts[0] === 'acesso') {
            finalPermissionsSet.add(`${parts[0]}_${parts[1]}`);
        }
    });

    // 3. Checagem do Master por Permissão
    if (finalPermissionsSet.has('gerenciar_permissoes')) {
         masterUserPermission = true;
         try {
             const todasFiliais = await supabaseRequest('filiais?select=nome&ativo=eq.true', 'GET', null, false);
             todasFiliais.forEach(f => finalPermissionsSet.add(`acesso_filial_${f.nome}`));
         } catch (e) {
             console.error("ERRO MASTER: Falha ao adicionar filiais.", e);
         }
    }
    
    userPermissions = Array.from(finalPermissionsSet);
    
    // LOG FINAL
    console.log("Permissões FINAIS (Saneadas e Implícitas):", userPermissions);
}

function hasPermission(permission) {
    if (masterUserPermission) {
        return true;
    }
    
    // 🚨 FIX CRÍTICO: Garante que a permissão procurada está sempre saneada.
    const requiredPermission = permission.trim().toLowerCase();
    
    // O array userPermissions já é populado com .trim().toLowerCase() na loadUserPermissions
    return userPermissions.includes(requiredPermission);
}

// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

async function supabaseRequest(endpoint, method = 'GET', data = null, includeFilialFilter = true, upsert = false) {
    
    // Separa o endpoint base dos filtros existentes
    const [nomeEndpointBase, filtrosExistentes] = endpoint.split('?', 2);
    
    // Constrói a URL começando com o proxy e o endpoint base
    let url = `${SUPABASE_PROXY_URL}?endpoint=${nomeEndpointBase}`; 
    
    // 🚨 CORREÇÃO CRÍTICA APLICADA NOVAMENTE: 
    // Adiciona flag de upsert. Esta é uma QUERY PARAMETER do PROXY, não um filtro do Supabase.
    if (method === 'POST' && upsert) {
        url += '&upsert=true';
    }
    
    // Adiciona filtros existentes se houver
    if (filtrosExistentes) {
        url += `&${filtrosExistentes}`;
    }
    
    // 🚨 CORREÇÃO CRÍTICA: expedition_items TEM campo filial mas é preenchido via trigger 🚨
    const tablesWithoutFilialField = [
        'acessos',
        'grupos_acesso', 
        'permissoes_grupo',
        'permissoes_sistema',
        'gps_tracking',
        'veiculos_status_historico',
        'pontos_interesse',
        'filiais'
    ];
    
    // Tabelas que têm campo filial mas não devem receber no payload (trigger cuida)
    const tablesWithTriggerFilial = [
        'expedition_items' // Tem trigger que preenche automaticamente
    ];
    
    // 🚨 FILTRO DE FILIAL EM GET (LEITURA) 🚨
    if (includeFilialFilter && selectedFilial && method === 'GET' && 
        !tablesWithoutFilialField.includes(nomeEndpointBase) && 
        !tablesWithTriggerFilial.includes(nomeEndpointBase)) {
        url += `&filial=eq.${selectedFilial.nome}`;
    }
    
    // Configura as opções da requisição
    const options = { 
        method, 
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        } 
    }; 
    
    // 🚨 PROCESSAMENTO DO PAYLOAD - NÃO ENVIAR FILIAL PARA expedition_items 🚨
    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) { 
        let payload = data;
        
        // Para expedition_items, NUNCA envia o campo filial (o trigger cuida)
        if (nomeEndpointBase === 'expedition_items') {
            if (Array.isArray(payload)) {
                payload = payload.map(item => {
                    const cleanItem = {...item};
                    delete cleanItem.filial; // Remove completamente o campo filial
                    delete cleanItem.nome_filial; // Remove se existir
                    return cleanItem;
                });
            } else {
                payload = {...payload};
                delete payload.filial; // Remove completamente o campo filial
                delete payload.nome_filial; // Remove se existir
            }
        } 
        // Para outras tabelas que precisam de filial, injeta o valor
        else if (includeFilialFilter && selectedFilial && 
                 !tablesWithoutFilialField.includes(nomeEndpointBase) && 
                 !tablesWithTriggerFilial.includes(nomeEndpointBase)) {
            if (Array.isArray(data)) {
                payload = data.map(item => ({ 
                    ...item, 
                    filial: selectedFilial.nome 
                }));
            } else {
                payload = { 
                    ...data, 
                    filial: selectedFilial.nome 
                }; 
            }
        }
        
        // Converte o payload para JSON string
        options.body = JSON.stringify(payload);
        
        // Log do payload para debug
        console.log(`[supabaseRequest] Payload sendo enviado para ${nomeEndpointBase}:`, payload);
    } 
    
    // Configura header Prefer para retornar dados após operação
    if (method === 'PATCH' || method === 'POST') {
        options.headers.Prefer = 'return=representation';
    }
    
    // Se for upsert, adiciona a preferência específica
    // O PROXY já lida com esta flag, mas é bom ter uma verificação final
    if (method === 'POST' && upsert) {
        options.headers.Prefer = 'return=representation,resolution=merge-duplicates';
    }

    try {
        // Log para debug
        console.log(`[supabaseRequest] ${method} ${url}`, {
            endpoint: nomeEndpointBase,
            hasFilialFilter: includeFilialFilter,
            selectedFilial: selectedFilial?.nome
        });
        
        // Faz a requisição
        const response = await fetch(url, options);
        
        // Tratamento de erros HTTP
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Erro ${response.status}: ${errorText}`;
            
            try {
                const errorJson = JSON.parse(errorText);
                
                if (response.status === 400) {
                    console.error('[supabaseRequest] Erro 400 detalhado:', errorJson);
                    
                    if (errorJson.message && errorJson.message.includes('Tentativa de inserir campo \'filial\'')) {
                        errorMessage = `Erro: O campo filial está sendo enviado incorretamente para ${nomeEndpointBase}`;
                    } else if (errorJson.message && errorJson.message.includes('nome_filial')) {
                        errorMessage = `Erro: Campo 'nome_filial' não existe na tabela`;
                    } else {
                        errorMessage = `Erro 400: ${errorJson.message || errorJson.details || errorText}`;
                    }
                } else if (response.status === 401) {
                    errorMessage = `Erro 401: Não autorizado. Verifique as credenciais.`;
                } else if (response.status === 403) {
                    errorMessage = `Erro 403: Sem permissão RLS para ${nomeEndpointBase}.`;
                } else if (response.status === 404) {
                    errorMessage = `Erro 404: Endpoint '${nomeEndpointBase}' não encontrado.`;
                } else if (response.status === 409) {
                    errorMessage = `Erro 409: Registro duplicado.`;
                } else {
                    errorMessage = `Erro ${response.status}: ${errorJson.message || errorText}`;
                }
            } catch (e) { 
                console.error('Erro ao fazer parse da resposta de erro:', e);
            }
            
            throw new Error(errorMessage);
        }
        
        // Processa a resposta bem-sucedida
        const contentType = response.headers.get('content-type');
        
        if (method === 'DELETE' || response.status === 204 || !contentType?.includes('application/json')) {
            return null;
        }
        
        try {
            const responseData = await response.json();
            console.log(`[supabaseRequest] Sucesso:`, {
                endpoint: nomeEndpointBase,
                recordsReturned: Array.isArray(responseData) ? responseData.length : 1
            });
            return responseData;
        } catch (jsonError) {
            console.error('[supabaseRequest] Erro ao fazer parse do JSON:', jsonError);
            return null;
        }
        
    } catch (error) {
        console.error(`[supabaseRequest] Falha na requisição:`, error);
        
        if (typeof showNotification === 'function') {
            let userMessage = 'Erro de comunicação com o servidor.';
            
            if (error.message.includes('401')) {
                userMessage = 'Erro de autenticação. Faça login novamente.';
            } else if (error.message.includes('400')) {
                userMessage = 'Dados inválidos. Verifique o preenchimento.';
            } else if (error.message.includes('Failed to fetch')) {
                userMessage = 'Sem conexão com o servidor.';
            }
            
            showNotification(userMessage, 'error');
        }
        
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

   

// SUBSTITUIR A VERSÃO EXISTENTE DE showView (Aprox. linha 200 no script.js)
function showView(viewId, element) {
  
    const permission = element.dataset.permission; 
    
    // 🚨 FIX CRÍTICO: Aplica o mapeamento de permissão para garantir que a checagem dupla funcione 🚨
    let checkPermission = permission;
    if (permission && permission.startsWith('acesso_')) {
        // Tenta checar o termo original do HTML ('acesso_faturamento')
        checkPermission = permission;
    } else if (permission) {
     
        const mappedPermission = permission.replace('acesso_', 'view_');
        
        
        if (!hasPermission(permission) && hasPermission(mappedPermission)) {
            checkPermission = mappedPermission;
        } else {
            checkPermission = permission; // Volta para o original se o mapeado não ajudar
        }
    }


    // 1. Verificar permissão usando o termo ajustado/mapeado
    if (checkPermission && !hasPermission(checkPermission)) {
        // Para garantir, fazemos a checagem dupla manual novamente:
        const alternativePermission = checkPermission.startsWith('acesso_') ? 
            checkPermission.replace('acesso_', 'view_') : 
            checkPermission; // Se for 'view_', mantém

        if (checkPermission !== alternativePermission && hasPermission(alternativePermission)) {
             // O usuário tem a permissão 'view_', então o acesso é permitido.
             // Não fazemos nada e o fluxo continua.
        } else {
             // A checagem falhou e não há alternativa válida no array de permissões.
             showNotification('Você não tem permissão para acessar esta aba.', 'error');
             return;
        }
    }

    // A partir daqui, o acesso está liberado:
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

// NOVO: Função para determinar e aplicar o acesso à filial
async function determineFilialAccess() {
    // 1. Identificar todas as filiais permitidas para o usuário
    const allowedFiliais = filiais.filter(f => hasPermission(`acesso_filial_${f.nome}`));

    if (allowedFiliais.length === 1) {
        // Redirecionamento Automático: Apenas uma filial permitida
        showNotification(`Acesso único à filial ${allowedFiliais[0].nome}. Redirecionando...`, 'info', 1500);
        await selectFilial(allowedFiliais[0]); // Pula a tela de seleção e vai direto
    } else if (allowedFiliais.length > 1) {
        // Múltiplas filiais: Exibe a tela de seleção, mas apenas com as permitidas
        document.getElementById('initialAuthContainer').style.display = 'none';
        document.getElementById('filialSelectionContainer').style.display = 'block';
        renderFiliaisSelection(allowedFiliais);
    } else {
        // Nenhuma filial permitida
        document.getElementById('initialLoginAlert').innerHTML = '<div class="alert alert-error">Você não possui permissão para acessar nenhuma filial. Contate o administrador.</div>';
        document.getElementById('initialAuthContainer').style.display = 'block';
    }
}


       // SUBSTITUIR A VERSÃO EXISTENTE DE loadFiliais
async function loadFiliais() {
    try {
        // 1. Carrega TODAS as filiais ativas para cache
        const filiaisData = await supabaseRequest('filiais?select=nome,descricao,ativo,latitude_cd,longitude_cd&ativo=eq.true&order=nome', 'GET', null, false);
        filiais = filiaisData || [];
        
        // 2. Determina quais filiais o usuário pode acessar e decide se redireciona
        await determineFilialAccess();
        
    } catch (error) {
        document.getElementById('filiaisGrid').innerHTML = `<p class="text-red-500">Erro ao carregar dados de filiais.</p>`;
    }
}


// Em script.js, SUBSTITUA esta função

async function selectFilial(filial) {
    // Verificar permissão para la filial
    if (!hasPermission(`acesso_filial_${filial.nome}`)) {
        showNotification('Você não tem permissão para acessar esta filial.', 'error');
        return;
    }

    try {
        // Busca os dados completos da filial (sem filtro de filial na busca)
        const fullFilialData = await supabaseRequest(`filiais?nome=eq.${filial.nome}`, 'GET', null, false);
        selectedFilial = fullFilialData[0];
    } catch (error) {
        showNotification('Erro ao carregar dados da filial. Verifique as configurações.', 'error');
        return;
    }
    
    document.getElementById('sidebarFilial').textContent = selectedFilial.nome;
    
    // 1. Inicia a transição para a tela principal
    await showMainSystem();
    
    // 2. Carrega todos os dados estáticos e dinâmicos (abas)
    await loadAllTabData();
    await loadPontosInteresse();

    // 🚨 NOVO FIX: Filtra as sub-abas ANTES de filtrar as abas principais 🚨
    filterSubTabs();
    
    // 3. Filtra as abas de navegação e determina qual a primeira a ser mostrada
    const firstPermittedViewId = filterNavigationMenu(); 

    if (firstPermittedViewId) {
        // Mostra a primeira aba permitida
        const firstNavItem = document.querySelector(`.nav-item[href="#${firstPermittedViewId}"]`);
        
        showView(firstPermittedViewId, firstNavItem);
        
        if (firstPermittedViewId === 'home') {
             setTimeout(() => {
                const homeAutoRefreshCheckbox = document.getElementById('homeAutoRefresh');
                if (homeAutoRefreshCheckbox) {
                    homeAutoRefreshCheckbox.checked = true;
                    toggleHomeAutoRefresh();
                }
            }, 2000);
        }
        
    } else {
        // Se não houver nenhuma permissão de aba (erro de acesso final)
        document.getElementById('home').classList.add('active'); // Garante que a div está visível
        document.getElementById('home').innerHTML = '<div class="alert alert-error">Seu grupo de acesso não possui permissão para visualizar nenhuma aba. Contate o administrador.</div>';
    }
    
    showNotification(`Bem-vindo à filial: ${selectedFilial.nome}!`, 'success');
    
    // CORREÇÃO: MOVIDO PARA O FINAL DA FUNÇÃO PARA EXECUTAR SEMPRE
    document.getElementById('chat-fab').style.display = 'flex';
    
    // 🚨 CHAMADA FINAL PARA GARANTIR VISIBILIDADE 🚨
    toggleFilialLinkVisibility();
}

// SUBSTITUIR A FUNÇÃO loadAllTabData COMPLETA
async function loadAllTabData() {
            
    document.getElementById('operacao').innerHTML = `
<h1 class="text-3xl font-bold text-gray-800 mb-6">Operação</h1>

<div class="sub-tabs">
    <button class="sub-tab active" onclick="showSubTab('operacao', 'lancamento', this)" data-permission="acesso_operacao_lancamento">Lançamento</button>
    <button class="sub-tab" onclick="showSubTab('operacao', 'identificacao', this)" data-permission="acesso_operacao_identificacao">Identificação</button>
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
                 <label for="lancar_liderSelect">Conferente:</label>
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
    <button class="sub-tab active" onclick="showSubTab('faturamento', 'faturamentoAtivo', this)" data-permission="acesso_faturamento_ativo">Faturamento Ativo</button>
    <button class="sub-tab" onclick="showSubTab('faturamento', 'historicoFaturamento', this)" data-permission="acesso_faturamento_historico">Histórico de Faturamento</button>
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
            <button class="sub-tab active" onclick="showSubTab('motoristas', 'statusFrota', this)" data-permission="acesso_motoristas_status">Status da Frota</button>
            <button class="sub-tab" onclick="showSubTab('motoristas', 'relatorioMotoristas', this)" data-permission="acesso_motoristas_relatorio">Relatório</button>
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
            
             <div class="filters-section my-4" style="padding: 12px;">
                <div class="filters-grid" style="grid-template-columns: 1fr;">
                     <div class="form-group" style="grid-column: span 1 / span 1; margin-bottom: 0;">
                        <label for="motoristaStatusFilter">Filtrar por Status:</label>
                        <select id="motoristaStatusFilter" onchange="applyMotoristaStatusFilter()" class="w-full">
                            <option value="">Todos os Status</option>
                            <option value="disponivel">Disponível</option>
                            <option value="em_viagem,saiu_para_entrega">Em Atividade (Viagem/Descarga)</option>
                            <option value="retornando_cd,retornando_com_imobilizado,descarregando_imobilizado">Retornando/Desc. Imobilizado</option>
                            <option value="folga">Folga</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="motoristasStatusList">
                 <div class="loading"><div class="spinner"></div>Carregando status...</div>
            </div>
        </div>

        <div id="relatorioMotoristas" class="sub-tab-content">
            <h2 class="text-2xl font-bold text-gray-800 mb-4">Relatório de Produtividade</h2>
            
            <div class="filters-section">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Filtros de Período</h3>
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
                <div class="text-right mt-4">
                    <button class="btn btn-primary btn-small" onclick="generateMotoristaReports()">Gerar Relatório</button>
                </div>
            </div>

            <div id="motoristaReportSummary" class="stats-grid">
                 <div class="stat-card"><div class="stat-number">0</div><div class="stat-label">Motoristas Ativos</div></div>
                <div class="stat-card" style="background: var(--secondary-gradient);"><div class="stat-number">0</div><div class="stat-label">Total Viagens</div></div>
                <div class="stat-card" style="background: var(--accent-gradient);"><div class="stat-number">0</div><div class="stat-label">Total Entregas</div></div>
                <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);"><div class="stat-number">0</div><div class="stat-label">Total Pallets</div></div>
                <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);"><div class="stat-number">0</div><div class="stat-label">Média Entregas/Motorista</div></div>
            </div>
            
            <div class="space-y-8 mt-8">
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <h3 class="text-lg font-semibold text-center mb-4">Ranking de Entregas (Top 10)</h3>
                    <div class="relative" style="height: 350px; width: 100%;">
                        <canvas id="motoristasRankingChart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <h3 class="text-lg font-semibold text-center mb-4">Detalhes da Produtividade</h3>
                    <div class="table-container bg-white rounded-lg shadow-md" id="motoristaTableContainer">
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
                                <tr><td colspan="9" class="text-center py-8 text-gray-500">Aguardando geração do relatório...</td></tr>
                            </tbody>
                         </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('acompanhamento').innerHTML = `
         <h1 class="text-3xl font-bold text-gray-800 mb-6">Acompanhamento de Tempos</h1>
       <div class="sub-tabs">
<button class="sub-tab active" onclick="showSubTab('acompanhamento', 'expedicoesEmAndamento', this)" data-permission="acesso_acompanhamento_expedicoes">Expedições</button>
<button class="sub-tab" onclick="showSubTab('acompanhamento', 'rastreio', this)" data-permission="acesso_acompanhamento_rastreio">Rastreio</button>
<button class="sub-tab" onclick="showSubTab('acompanhamento', 'frota', this)" data-permission="acesso_acompanhamento_frota">Frota</button>
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
                <table class="w-full"> 
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
            <button class="sub-tab active" onclick="showSubTab('historico', 'listaEntregas', this)" data-permission="acesso_historico_entregas">Entregas</button>
            <button class="sub-tab" onclick="showSubTab('historico', 'indicadores', this)" data-permission="acesso_historico_indicadores">Indicadores</button>
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
            <h2 class="text-3xl font-bold text-gray-800 mb-6 text-center">Revisão de Indicadores (KPI Review)</h2>
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
                     <div class="form-group md:col-span-1">
                        <label for="indicadoresSearchInput">Pesquisar Loja/Placa:</label>
                        <input type="text" id="indicadoresSearchInput" placeholder="Filtro nos gráficos..." onkeyup="applyHistoricoFilters()">
                    </div>
                </div>
            </div>
            
            <h3 class="text-xl font-semibold text-gray-700 mb-4">Volume e Eficiência</h3>
            <div id="indicadoresVolumeStats" class="stats-grid mb-8 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                </div>
            
            <h3 class="text-xl font-semibold text-gray-700 mb-4">Tempos Operacionais (Média)</h3>
            <div id="indicadoresTimeSummary" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4 mb-8">
                </div>
            
            <h3 class="text-xl font-semibold text-gray-700 mb-4">Análise Detalhada</h3>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <div class="bg-white p-4 rounded-lg shadow-md" data-aos="fade-right">
                    <h3 class="text-lg font-semibold text-center mb-4">Ranking de Lojas por Tempo de Descarga</h3>
                    <div class="relative" style="height: 400px;">
                        <canvas id="lojasRankingChart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow-md" data-aos="fade-left">
                    <h3 class="text-lg font-semibold text-center mb-4">Distribuição de Entregas (Fort x Comper)</h3>
                    <div class="relative mx-auto" style="height: 400px; max-width: 450px;">
                        <canvas id="entregasChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                 <div class="bg-white p-4 rounded-lg shadow-md" data-aos="fade-up">
                    <h3 class="text-lg font-semibold text-center mb-4">Total de Entregas por Loja (Volume de Saídas)</h3>
                    <div class="relative" style="height: 400px;">
                        <canvas id="totalEntregasLojaChart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow-md" data-aos="fade-up" data-aos-delay="100">
                    <h3 class="text-lg font-semibold text-center mb-4">Participação % no Total de Entregas</h3>
                    <div class="relative mx-auto" style="height: 400px; max-width: 450px;">
                        <canvas id="participacaoEntregasLojaChart"></canvas>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 gap-8 mt-8">
                <div class="bg-white p-4 rounded-lg shadow-md lg:col-span-1" data-aos="fade-up">
                    <h3 class="text-lg font-semibold text-center mb-4">Total de Pallets por Loja</h3>
                    <div class="relative" style="height: 400px;">
                        <canvas id="palletsPorLojaChart"></canvas>
                    </div>
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
        <button class="sub-tab active" onclick="showSubTab('configuracoes', 'filiais', this)" data-permission="acesso_configuracoes_filiais">Filiais</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'lojas', this)" data-permission="acesso_configuracoes_lojas">Lojas</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'docas', this)" data-permission="acesso_configuracoes_docas">Docas</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'veiculos', this)" data-permission="acesso_configuracoes_veiculos">Veículos</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'motoristasConfig', this)" data-permission="acesso_configuracoes_motoristas">Motoristas</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'lideres', this)" data-permission="acesso_configuracoes_lideres">Líderes</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'pontosInteresse', this)" data-permission="acesso_configuracoes_pontos">Pontos</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'acessos', this)" data-permission="acesso_configuracoes_acessos">Acessos</button>
        <button class="sub-tab" onclick="showSubTab('configuracoes', 'sistema', this)" data-permission="acesso_configuracoes_sistema">Sistema</button>
    </div>

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

    <div id="pontosInteresse" class="sub-tab-content">
        <div class="transport-card">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-semibold">Gerenciar Pontos de Interesse</h3>
                <div class="flex gap-2">
                    <button class="btn btn-primary" onclick="showPontosInteresseMap()">Ver no Mapa</button>
                    <button class="btn btn-success" onclick="showAddForm('pontoInteresse')">+ Novo Ponto</button>
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

    <div id="acessos" class="sub-tab-content">
        <div class="transport-card">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-semibold">Gerenciar Acessos</h3>
                <div class="flex gap-2">
                    <button class="btn btn-primary" onclick="showAddForm('grupo')">+ Novo Grupo</button>
                    <button class="btn btn-success" onclick="showAddForm('acesso')">+ Novo Usuário</button>
                </div>
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

    <div id="sistema" class="sub-tab-content">
        <div class="transport-card">
            <h3 class="text-xl font-semibold mb-4">Status do Sistema</h3>
            <pre id="systemStatus" class="bg-gray-100 p-4 rounded-md text-sm whitespace-pre-wrap"></pre>
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
            liderSelect.innerHTML = '<option value="">Selecione o Conferente</option>';
            lideres.forEach(lider => {
                liderSelect.innerHTML += `<option value="${lider.id}">${lider.nome}</option>`;
            });
        }
    });
}
        
        function getStatusLabel(status) {
    const labels = {
        // ... (seus status existentes)
        'faturamento_iniciado': 'Faturando', 'faturado': 'Faturado',
        // NOVO STATUS COMBINADO
        'em_carregamento_faturando': 'Carregando/Faturando',
        // ... (o resto dos status)
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
    
    // Pega apenas os top 5 e ordena por entregas
    const top5 = [...motoristasData]
        .sort((a, b) => b.entregas - a.entregas)
        .slice(0, 5);
    
    const data = {
        labels: top5.map(m => m.nome),
        datasets: [{
            label: 'Entregas',
            data: top5.map(m => m.entregas),
            backgroundColor: [
                'rgba(255, 215, 0, 0.8)',    // Ouro - 1º lugar
                'rgba(192, 192, 192, 0.8)',  // Prata - 2º lugar
                'rgba(205, 127, 50, 0.8)',   // Bronze - 3º lugar
                'rgba(0, 212, 170, 0.8)',    // Turquesa - 4º
                'rgba(0, 119, 182, 0.8)'     // Azul - 5º
            ],
            borderColor: [
                'rgba(255, 215, 0, 1)',
                'rgba(192, 192, 192, 1)',
                'rgba(205, 127, 50, 1)',
                'rgba(0, 212, 170, 1)',
                'rgba(0, 119, 182, 1)'
            ],
            borderWidth: 2,
            borderRadius: 6,
            barThickness: 35 // 🚨 Tamanho fixo das barras
        }]
    };

    renderChart('frotaProdutividadeChart', 'bar', data, {
        indexAxis: 'y', // Barras horizontais
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                display: false 
            },
            tooltip: {
                enabled: true, // 🚨 Habilita apenas o tooltip padrão
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: {
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    size: 13
                },
                callbacks: {
                    label: function(context) {
                        return `Entregas: ${context.raw}`;
                    }
                }
            },
            datalabels: {
                display: true,
                color: '#FFFFFF',
                font: { 
                    weight: 'bold',
                    size: 16
                },
                anchor: 'center',
                align: 'center',
                formatter: (value) => value // Mostra apenas o número
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                max: Math.max(...top5.map(m => m.entregas)) * 1.15, // 15% de margem
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.05)',
                    drawBorder: false
                },
                ticks: {
                    font: {
                        size: 12
                    },
                    stepSize: 1
                },
                title: {
                    display: false
                }
            },
            y: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    font: {
                        size: 13,
                        weight: '500'
                    },
                    color: '#374151',
                    padding: 10,
                    autoSkip: false
                }
            }
        },
        layout: {
            padding: {
                left: 15,
                right: 35,
                top: 15,
                bottom: 15
            }
        },
        animation: {
            duration: 800,
            easing: 'easeInOutQuart'
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

      // SUBSTITUIR A FUNÇÃO loadFaturamento
async function loadFaturamento() {
    // Busca e aplica a lógica para auto-abrir a única sub-aba permitida
    const permittedFaturamentoTabs = getPermittedSubTabs('faturamento');
    
    if (permittedFaturamentoTabs.length > 0) {
        const initialSubTab = permittedFaturamentoTabs.length === 1 ? permittedFaturamentoTabs[0] : 'faturamentoAtivo';
        const initialElement = document.querySelector(`#faturamento .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        
        // NOVO: Garantir que o elemento exista e que a função showSubTab seja chamada
        if (initialElement) {
            showSubTab('faturamento', initialSubTab, initialElement);
        } else {
             // Fallback: Se o botão não for encontrado (filtrado), chama a função de carregamento manual para garantir o estado
             await loadFaturamentoData(initialSubTab);
        }
    }
}

      // Substitua a função renderFaturamentoList existente por esta

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
        
        // Lógica de Status Aprimorada
        // ESTADO FINAL: Ambos concluídos
        if (exp.status === 'faturado' && exp.data_saida_veiculo) {
            statusInfo = `<div class="text-green-600 font-semibold mb-2">✅ Carregado e Faturado</div>`;
            actionButtons = `<button class="btn btn-warning" onclick="marcarSaiuEntrega('${exp.id}')">Marcar Saída</button>`;
        }
        // CASO 1: Faturado, mas aguardando fim do carregamento
        else if (exp.status === 'faturado' && !exp.data_saida_veiculo) {
            statusInfo = `<div class="text-blue-600 font-semibold mb-2">✅ Faturado (Aguardando Fim do Carregamento)</div>`;
            actionButtons = `<button class="btn btn-secondary" disabled title="Finalize o carregamento na tela de Motoristas para liberar a saída">Aguardando Carregamento</button>`;
        }
        // CASO 2: Carregado, mas aguardando faturamento
        else if (exp.status === 'carregado' || exp.status === 'aguardando_faturamento') {
            statusInfo = `<div class="text-blue-600 font-semibold mb-2">🚚 Carregado (Aguardando Faturamento)</div>`;
            actionButtons = `<button class="btn btn-success" onclick="iniciarFaturamento('${exp.id}')">Iniciar Faturamento</button>`;
        }
        // CASO 3: Faturamento em andamento (com ou sem carregamento simultâneo)
        else if (exp.status === 'faturamento_iniciado' || exp.status === 'em_carregamento_faturando') {
            const iniciadoEm = exp.data_inicio_faturamento ? new Date(exp.data_inicio_faturamento) : null;
            const tempoFaturamento = iniciadoEm ? Math.round((new Date() - iniciadoEm) / 60000) : 0;
            const faturandoTexto = exp.status === 'em_carregamento_faturando' ? 'Carregando e Faturando' : 'Faturamento em andamento';
            statusInfo = `<div class="text-yellow-600 font-semibold mb-2">📄 ${faturandoTexto} há ${minutesToHHMM(tempoFaturamento)}</div>`;
            actionButtons = `<button class="btn btn-primary" onclick="finalizarFaturamento('${exp.id}')">Finalizar Faturamento</button>`;
        }
        // CASO 4: Apenas carregando (faturamento ainda não iniciado)
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

        function updateFaturamentoStats(expeditions) {
    // NOVO: Conta a partir de 'em_carregamento' e 'carregado' que aguardam faturamento
    document.getElementById('totalCarregadas').textContent = expeditions.filter(e => 
        e.status === 'em_carregamento' || 
        e.status === 'carregado' || 
        e.status === 'aguardando_faturamento'
    ).length;
    
    // NOVO: Inclui o status combinado 'em_carregamento_faturando'
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

    async function iniciarFaturamento(expeditionId) {
    try {
        const currentExp = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=status`);
        const currentStatus = currentExp[0].status;
        
        let newStatus;
        if (currentStatus === 'em_carregamento') {
             // NOVO: Define o status combinado se o carregamento estiver em andamento
             newStatus = 'em_carregamento_faturando'; 
        } else if (currentStatus === 'carregado' || currentStatus === 'aguardando_faturamento') {
             // Fluxo normal: inicia o faturamento após o carregamento
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



// SUBSTITUIR A FUNÇÃO showSubTab (INCLUINDO A NOVA CHAMADA)
function showSubTab(tabName, subTabName, element) {
    // Permissão lida do atributo data-permission do botão clicado
    const permission = element ? element.dataset.permission : null; 
    
    // Apenas faz a checagem se o botão realmente tiver uma permissão e o usuário não for MASTER
    if (permission && !masterUserPermission) {
        const requiredPermission = permission.trim().toLowerCase();
        const mappedPermission = requiredPermission.replace('acesso_', 'view_'); // Ex: 'view_faturamento_ativo'
        
        // Se não tem a permissão do HTML NEM a permissão mapeada do BD (que deveria ter sido filtrada antes, mas checamos para segurança)
        if (!userPermissions.includes(requiredPermission) && !userPermissions.includes(mappedPermission)) {
             showNotification('Você não tem permissão para acessar esta seção.', 'error');
             return; 
        }
    }

    const tabContent = document.getElementById(tabName);
    if (!tabContent) return;
    
    // Desativa todas as sub-abas e conteúdos para começar
    tabContent.querySelectorAll('.sub-tab').forEach(tab => tab.classList.remove('active'));
    tabContent.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));

    // Ativa a sub-aba clicada
    if(element) element.classList.add('active');
    document.getElementById(subTabName).classList.add('active');
    
    // Lógica para carregar os dados específicos da sub-aba (mantida)
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
    } else if (tabName === 'faturamento') {
        // 🚨 NOVO: Chama a função de dados de faturamento (Faturamento Ativo ou Histórico)
        if (subTabName === 'faturamentoAtivo') {
            loadFaturamentoData('faturamentoAtivo');
        } else if (subTabName === 'historicoFaturamento') {
            loadHistoricoFaturamento();
        }
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
    } else if (tabName === 'motoristas') {
        // 🚨 NOVO: Chama a função de dados de motoristas (Status da Frota ou Relatório)
        if (subTabName === 'statusFrota') {
            renderMotoristasStatusList(); // Função que carrega e renderiza o status da frota
        } else if (subTabName === 'relatorioMotoristas') {
            generateMotoristaReports();
        }
    }
    feather.replace();
}

// Novo: Mapa de Permissões de Sub-Abas e Views que contêm sub-abas
const subTabViewIds = new Set(['operacao', 'faturamento', 'motoristas', 'acompanhamento', 'historico', 'configuracoes']);
const subTabPermissionMap = {
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


function getPermittedSubTabs(viewId) {
    if (!subTabPermissionMap[viewId]) return [];
    
    const permittedSubTabs = [];
    const subTabs = subTabPermissionMap[viewId];
    
    for (const subTabId in subTabs) {
        const requiredPermission = subTabs[subTabId]; // Ex: 'acesso_faturamento_ativo'
        const mappedPermission = requiredPermission.replace('acesso_', 'view_'); // Ex: 'view_faturamento_ativo'
        
        // Checa a permissão do HTML e a permissão mapeada do banco
        if (hasPermission(requiredPermission) || hasPermission(mappedPermission)) {
            permittedSubTabs.push(subTabId);
        }
    }
    return permittedSubTabs;
}



   // SUBSTITUIR A FUNÇÃO loadMotoristaTab
async function loadMotoristaTab() {
    // Busca e aplica a lógica para auto-abrir a única sub-aba permitida
    const permittedMotoristasTabs = getPermittedSubTabs('motoristas');
    
    if (permittedMotoristasTabs.length > 0) {
        const initialSubTab = permittedMotoristasTabs.length === 1 ? permittedMotoristasTabs[0] : 'statusFrota';
        const initialElement = document.querySelector(`#motoristas .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        
        if (initialElement) {
            showSubTab('motoristas', initialSubTab, initialElement);
        } else {
             // Fallback: Se o botão não for encontrado, chama a função de carregamento manual
             await renderMotoristasStatusList();
        }
    }
    
    // Configurar datas padrão
    const hoje = new Date();
    // Inicia com o dia de hoje, não os últimos 30 dias para evitar sobrecarga inicial
    const hojeFormatado = hoje.toISOString().split('T')[0];
    const dataInicio = document.getElementById('relatorioMotoristaDataInicio');
    const dataFim = document.getElementById('relatorioMotoristaDataFim');
    if (dataInicio && !dataInicio.value) dataInicio.value = hojeFormatado;
    if (dataFim && !dataFim.value) dataFim.value = hojeFormatado;
}

// SUBSTITUIR A FUNÇÃO renderMotoristasStatusList COMPLETA (aproximadamente linha 2246)
async function renderMotoristasStatusList() {
    const container = document.getElementById('motoristasStatusList');
    if (!container) return;
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando status...</div>`;
    Object.values(activeTimers).forEach(clearInterval);
    activeTimers = {};

    const [activeExpeditions, recentlyCompletedExpeditions, allItems] = await Promise.all([
         // Busca expedições ativas
         supabaseRequest(`expeditions?status=not.in.(entregue,cancelado)`),
         // Busca expedições recentemente concluídas (para achar o último veículo de quem retornou)
         supabaseRequest(`expeditions?status=eq.entregue&order=data_hora.desc&limit=50`),
         supabaseRequest('expedition_items')
    ]);
    
    // Contagem de status para o Dashboard
    const dispCount = motoristas.filter(m => m.status === 'disponivel').length;
    const ativoCount = motoristas.filter(m => ['em_viagem', 'descarregando_imobilizado', 'saiu_para_entrega'].includes(m.status)).length;
    const retornandoCount = motoristas.filter(m => ['retornando_cd', 'retornando_com_imobilizado'].includes(m.status)).length;
    
    // Mapeia motoristas com status e info do veículo
    const motoristasComStatus = motoristas.map(m => {
        const activeExp = activeExpeditions.find(exp => exp.motorista_id === m.id);
        let veiculoPlaca = 'N/A';
        let veiculoId = null;
        let displayStatus = m.status; // Status padrão do motorista
        
        if (activeExp) {
            // 1. Se tem expedição ativa, o status é o da expedição (ex: saiu_para_entrega)
            veiculoId = activeExp.veiculo_id;
            veiculoPlaca = veiculos.find(v => v.id === veiculoId)?.placa || 'N/A';
            displayStatus = activeExp.status; // Exibe o status da expedição
            return { ...m, displayStatus, veiculoPlaca, veiculoId, activeExp: { ...activeExp, items: allItems.filter(i => i.expedition_id === activeExp.id) } };
        } 
        
        // 2. Se o motorista está em um status de retorno, tenta achar o último veículo
        if (['retornando_cd', 'retornando_com_imobilizado', 'descarregando_imobilizado'].includes(m.status)) {
             const lastExp = recentlyCompletedExpeditions.find(exp => exp.motorista_id === m.id);
             veiculoId = lastExp?.veiculo_id;
             veiculoPlaca = veiculos.find(v => v.id === veiculoId)?.placa || 'N/A';
        }
        
        // Retorna status normal (disponivel, folga, etc.)
        return { ...m, displayStatus, veiculoPlaca, veiculoId };
    });

    motoristasComStatus.sort((a, b) => a.nome.localeCompare(b.nome));

    // HTML principal (sem o filtro, que foi movido)
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
    
    // Armazena o array completo (não filtrado) na memória para o filtro
    window.motoristasDataCache = motoristasComStatus; 
    
    // Iniciar timers
    motoristasComStatus.forEach(m => {
        if (m.activeExp && m.displayStatus === 'saiu_para_entrega') {
             startMotoristaTimer(m);
        }
    });
}




// SUBSTITUA TODA E QUALQUER DEFINIÇÃO DESTA FUNÇÃO PELA ABAIXO:
function renderMotoristasListHtml(motoristasData) {
    if (motoristasData.length === 0) {
        return '<div class="alert alert-info mt-4">Nenhum motorista encontrado com o filtro selecionado.</div>';
    }
    
    return motoristasData.map(m => {
        let actionButton = '';
        
        // Determinar classe CSS baseada no status
        let placaClass = 'placa-destaque';
        if (m.displayStatus === 'saiu_para_entrega' || m.displayStatus === 'em_viagem') {
            placaClass += ' em-viagem';
        } else if (m.displayStatus === 'retornando_cd' || m.displayStatus === 'retornando_com_imobilizado') {
            placaClass += ' retornando';
        } else if (m.displayStatus === 'disponivel') {
            placaClass += ' disponivel';
        }
        
        // Placa animada com destaque
        const veiculoPlacaNoNome = m.veiculoPlaca && m.veiculoPlaca !== 'N/A' ? 
            `<span class="${placaClass}" title="Veículo: ${m.veiculoPlaca}">${m.veiculoPlaca}</span>` : '';

        // AÇÕES PERMITIDAS NA ABA MOTORISTAS (APENAS CHEGADA E DESCARGA IMOBILIZADO)
        
        // 1. Chegada no CD (para quem está retornando)
        if ((m.displayStatus === 'retornando_cd' || m.displayStatus === 'retornando_com_imobilizado') && m.veiculoId) {
            actionButton = `<button class="btn btn-primary btn-small" onclick="marcarRetornoCD('${m.id}', '${m.veiculoId}')">Cheguei no CD</button>`;
        } 
        // 2. Finalizar Descarga de Imobilizado
        else if (m.displayStatus === 'descarregando_imobilizado' && m.veiculoId) {
            actionButton = `<button class="btn btn-warning btn-small" onclick="finalizarDescargaImobilizado('${m.id}', '${m.veiculoId}')">Finalizar Descarga</button>`;
        }
        
        // O BLOCO DE LÓGICA DO CARREGAMENTO FOI REMOVIDO DEFINITIVAMENTE.
        // Nenhuma lógica para 'aguardando_veiculo' ou 'em_carregamento' deve existir aqui.

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


// SUBSTITUIR A FUNÇÃO renderMotoristaRankingChart COMPLETA
function renderMotoristaRankingChart(motoristasData) {
    if (!motoristasData || motoristasData.length === 0) {
        destroyChart('motoristasRankingChart');
        return;
    }
    
    // Pega apenas os top 10 e ordena por entregas
    const top10 = [...motoristasData]
        .sort((a, b) => b.entregas - a.entregas)
        .slice(0, 10);
    
    const data = {
        labels: top10.map(m => m.nome),
        datasets: [{
            label: 'Entregas',
            data: top10.map(m => m.entregas),
            backgroundColor: [
                'rgba(255, 215, 0, 0.8)',    // Ouro - 1º
                'rgba(192, 192, 192, 0.8)',  // Prata - 2º
                'rgba(205, 127, 50, 0.8)',   // Bronze - 3º
                'rgba(0, 212, 170, 0.8)',    // 4º
                'rgba(0, 180, 216, 0.8)',    // 5º
                'rgba(0, 119, 182, 0.8)',    // 6º
                'rgba(114, 9, 183, 0.8)',    // 7º
                'rgba(166, 99, 204, 0.8)',   // 8º
                'rgba(247, 127, 0, 0.8)',    // 9º
                'rgba(252, 191, 73, 0.8)'    // 10º
            ],
            borderColor: 'rgba(255, 255, 255, 1)',
            borderWidth: 2,
            borderRadius: 8
        }]
    };

    renderChart('motoristasRankingChart', 'bar', data, {
        indexAxis: 'y', // Barras horizontais
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                display: false 
            },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: {
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    size: 13
                },
                callbacks: {
                    label: function(context) {
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
                font: { 
                    weight: 'bold',
                    size: 14
                },
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
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.05)',
                    drawBorder: false
                },
                ticks: {
                    font: {
                        size: 12
                    },
                    stepSize: 1
                }
            },
            y: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    font: {
                        size: 12,
                        weight: '500'
                    },
                    color: '#374151',
                    padding: 8,
                    autoSkip: false
                }
            }
        },
        layout: {
            padding: {
                left: 10,
                right: 40,
                top: 10,
                bottom: 10
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

       
       // Adicione esta nova função ao seu arquivo script.js

async function finishLoading(expeditionId) {
    try {
        // 1. Pega o status atual da expedição antes de fazer qualquer alteração
        const [currentExp] = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=status`);
        if (!currentExp) {
            throw new Error('Expedição não encontrada.');
        }

        const updateData = {
            data_saida_veiculo: new Date().toISOString()
        };

        // 2. Lógica principal: Decide o novo status com base no estado atual
        // Se o faturamento JÁ terminou (status 'faturado'), NÃO mude o status.
        // Apenas registre a data de fim do carregamento. A interface irá combinar os dois estados para liberar a saída.
        if (currentExp.status === 'faturado') {
            // O status permanece 'faturado'. A UI combinará isso com a nova 'data_saida_veiculo'.
        } else {
            // Se o faturamento ainda não terminou, o novo status é 'carregado', indicando que agora aguarda o faturamento.
            updateData.status = 'carregado';
        }

        await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', updateData);
        showNotification('Carregamento finalizado com sucesso!', 'success');

        // Recarrega a view ativa para refletir a mudança
        if (document.getElementById('motoristas').classList.contains('active')) {
             consultarExpedicoesPorPlaca();
        } else if (document.getElementById('acompanhamento').classList.contains('active')) {
            loadAcompanhamento();
        } else if (document.getElementById('faturamento').classList.contains('active')) {
            loadFaturamento();
        }

    } catch (error) {
        showNotification('Erro ao finalizar carregamento: ' + error.message, 'error');
    }
}

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
            
            // 🚨 AJUSTE CRÍTICO: Buscar o veiculo_id E o motorista_id
            const expDetails = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=motorista_id,veiculo_id`);
            const motoristaId = expDetails[0].motorista_id;
            const veiculoId = expDetails[0].veiculo_id;
            
            // 1. Atualiza status do Motorista
            if (motoristaId) {
                await supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: novoStatus }, false);
            }
            
            // 2. NOVO CÓDIGO: Atualiza status do Veículo para o mesmo status de retorno
            if (veiculoId) {
                await supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: novoStatus }, false);
            }
            
            showNotification(`Última entrega finalizada! Viagem concluída.`, 'success');
        } else {
            showNotification('Descarga da loja finalizada!', 'success');
        }
        consultarExpedicoesPorPlaca();
    } catch(error) {
        showNotification('Erro ao finalizar descarga: ' + error.message, 'error');
    }
}
        
       // SUBSTITUIR A FUNÇÃO loadAcompanhamento
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
        
        // SUBSTITUIR A FUNÇÃO renderAcompanhamentoTable COMPLETA
function renderAcompanhamentoTable(expeditions) {
    const tbody = document.getElementById('acompanhamentoBody');
    if (expeditions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-8 text-gray-500">Nenhuma expedição encontrada para os filtros selecionados.</td></tr>';
        return;
    }

    tbody.innerHTML = expeditions.map(exp => {
        const ocupacaoPerc = Math.round(exp.ocupacao || 0);
        let barColor = 'progress-green';
        
        // NOVO: Cores de alerta para a barra de progresso simples
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
                <td style="min-width: 120px;">
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
            
        rastreioData = results;
        rastreioData.push(...returningResults);
        
        rastreioData = rastreioData.filter(Boolean);
        
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
     // SUBSTITUIR A FUNÇÃO loadHistorico
async function loadHistorico() {
    const permittedHistoricoTabs = getPermittedSubTabs('historico');
    
    if (permittedHistoricoTabs.length > 0) {
        const initialSubTab = permittedHistoricoTabs.length === 1 ? permittedHistoricoTabs[0] : 'listaEntregas';
        const initialElement = document.querySelector(`#historico .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        showSubTab('historico', initialSubTab, initialElement);
    }
    
    const container = document.getElementById('historicoList');
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando histórico...</div>`;
    try {
        // 🚨 FIX CRÍTICO: Adicionar limit=1000 para garantir que todos os registros sejam carregados
        const expeditions = await supabaseRequest('expeditions?status=eq.entregue&order=data_hora.desc&limit=1000');
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

      // SUBSTITUIR A FUNÇÃO renderHistorico COMPLETA (CORRIGIDA)
function renderHistorico(data) {
    const container = document.getElementById('historicoList');
    if (data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Nenhum registro encontrado para os filtros.</div>';
        return;
    }

    container.innerHTML = data.map(exp => {
        // 1. CÁLCULO DE TEMPOS DA EXPEDIÇÃO (Tudo em minutos)
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


        // 2. ROTEIRO DE ENTREGAS E CÁLCULO DE TEMPOS DE TRÂNSITO/LOJA
        if (exp.items && exp.items.length > 0) {
             // Ordena para garantir a ordem correta na renderização e cálculo
             exp.items.sort((a, b) => (a.ordem_entrega || 999) - (b.ordem_entrega || 999)).forEach((item, index) => {
                const loja = lojas.find(l => l.id === item.loja_id);
                const t_chegada = item.data_inicio_descarga ? new Date(item.data_inicio_descarga) : null;
                const t_saida = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
                
                let tempoEmLojaMin = 0;
                let tempoTransitoMin = 0;

                // Calcula o Tempo em Trânsito (do último ponto de saída até a chegada atual)
                if (t_chegada && lastDeparture) {
                    tempoTransitoMin = (t_chegada - lastDeparture) / 60000;
                    totalTempoEmTransito += tempoTransitoMin;
                }
                
                // Calcula o Tempo em Loja (descarga)
                if (t_saida && t_chegada) {
                    tempoEmLojaMin = (t_saida - t_chegada) / 60000;
                    totalTempoEmLoja += tempoEmLojaMin;
                    lastDeparture = t_saida; // Atualiza o último ponto de saída
                }

                // Determina a cor da badge de tempo em loja (descarga)
                let tempoLojaClass = '';
                if (tempoEmLojaMin > 60) tempoLojaClass = 'bg-red-100 text-red-800'; // Vermelho se > 1h
                else if (tempoEmLojaMin > 30) tempoLojaClass = 'bg-yellow-100 text-yellow-800'; // Amarelo se > 30min
                else if (tempoEmLojaMin > 0) tempoLojaClass = 'bg-green-100 text-green-800'; // Verde
                
                // Garante que rolltrainers e pallets sejam exibidos como 0 se nulos
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

        // 3. RENDERIZAÇÃO DO CARD COMPLETO
        
        // Define a cor da ocupação
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
                            <button class="btn btn-primary btn-small" onclick="showDetalhesExpedicao('${exp.id}')">Detalhes</button>
                            <button class="btn btn-danger btn-small" onclick="deleteHistoricoExpedition('${exp.id}')">Excluir</button>
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

 // SUBSTITUIR A FUNÇÃO generateHistoricoIndicators COMPLETA
function generateHistoricoIndicators(data) {
    const timeSummaryContainer = document.getElementById('indicadoresTimeSummary');
    const volumeStatsContainer = document.getElementById('indicadoresVolumeStats');
    
    if (data.length === 0) {
        timeSummaryContainer.innerHTML = '<div class="alert alert-info md:col-span-5">Sem dados de expedições concluídas para o período selecionado.</div>';
        volumeStatsContainer.innerHTML = '';
        destroyChart('lojasRankingChart');
        destroyChart('entregasChart');
        destroyChart('totalEntregasLojaChart');
        destroyChart('participacaoEntregasLojaChart');
        destroyChart('palletsPorLojaChart'); 
        return;
    }
    
    const calcularMedia = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const totalViagens = data.length;
    
    // VARIÁVEIS DE AGRUPAMENTO
    let temposAlocar = [];
    let temposChegadaDoca = [];
    let temposCarregamento = [];
    let temposFaturamento = []; 
    let temposEmTransito = []; 
    let temposEmLoja = [];
    
    // Estrutura principal para Ranking e Participação. O array 'tempos' é crítico para o ranking.
    let lojasData = {}; 
    let entregasFort = 0, entregasComper = 0;
    let totalEntregas = 0;
    let totalPallets = 0;
    let totalRolls = 0;
    let ocupacoes = [];
    let lojasAtendidas = new Set();
    const entregasDiarias = {}; // Mantida para o gráfico de evolução, se necessário
    const datasExpedicao = new Set();
    const dataFimFiltro = document.getElementById('indicadoresFiltroDataFim').value || new Date().toISOString().split('T')[0];
    
    data.forEach(exp => {
        const dataExp = new Date(exp.data_hora).toISOString().split('T')[0];
        datasExpedicao.add(dataExp);
        
        // 1. CÁLCULOS DE TEMPO INTERNO (Pátio)
        if (exp.data_alocacao_veiculo) temposAlocar.push((new Date(exp.data_alocacao_veiculo) - new Date(exp.data_hora)) / 60000);
        if (exp.data_chegada_veiculo && exp.data_alocacao_veiculo) temposChegadaDoca.push((new Date(exp.data_chegada_veiculo) - new Date(exp.data_alocacao_veiculo)) / 60000);
        if (exp.data_chegada_veiculo && exp.data_saida_veiculo) temposCarregamento.push((new Date(exp.data_saida_veiculo) - new Date(exp.data_chegada_veiculo)) / 60000);
        if (exp.data_inicio_faturamento && exp.data_fim_faturamento) temposFaturamento.push((new Date(exp.data_fim_faturamento) - new Date(exp.data_inicio_faturamento)) / 60000);
        
        // 2. CÁLCULOS DE VOLUME E TEMPO EXTERNO
        let ultimaData = exp.data_saida_entrega ? new Date(exp.data_saida_entrega) : new Date(exp.data_saida_veiculo);
        let totalTransitoViagem = 0;
        let totalLojaViagem = 0;
        
        const veiculo = exp.veiculo_id ? veiculos.find(v => v.id === exp.veiculo_id) : null;
        let cargaPalletExp = 0;
        let cargaRollExp = 0;

        exp.items.sort((a, b) => (a.ordem_entrega || 999) - (b.ordem_entrega || 999)).forEach(item => {
            // Conta totais GERAIS
            totalPallets += item.pallets || 0;
            totalRolls += item.rolltrainers || 0;
            cargaPalletExp += item.pallets || 0;
            cargaRollExp += item.rolltrainers || 0;
            
            // Para o cálculo de tempos de loja e trânsito
            const t_chegada = item.data_inicio_descarga ? new Date(item.data_inicio_descarga) : null;
            const t_saida = item.data_fim_descarga ? new Date(item.data_fim_descarga) : null;
            const tempoEmLoja = t_saida && t_chegada ? (t_saida - t_chegada) / 60000 : 0;
            const tempoTransito = ultimaData && t_chegada ? (t_chegada - ultimaData) / 60000 : 0;
            
            if (tempoEmLoja > 0) {
                totalLojaViagem += tempoEmLoja;
                const loja = lojas.find(l => l.id === item.loja_id);
                if(loja) {
                    lojasAtendidas.add(loja.id);
                    // Inicializa a estrutura da loja
                    if (!lojasData[loja.id]) {
                        lojasData[loja.id] = { nome: `${loja.codigo} - ${loja.nome}`, totalEntregas: 0, totalTempo: 0, totalPallets: 0, tempos: [] }; // Adicionado 'tempos'
                    }
                    lojasData[loja.id].totalTempo += tempoEmLoja;
                    lojasData[loja.id].totalPallets += item.pallets || 0;
                    lojasData[loja.id].tempos.push(tempoEmLoja); // Adiciona o tempo para o cálculo do Ranking
                    
                    if (loja.nome.toLowerCase().includes('fort')) entregasFort++;
                    else if (loja.nome.toLowerCase().includes('comper')) entregasComper++;
                }
            }
            if (tempoTransito > 0) totalTransitoViagem += tempoTransito;
            if (t_saida) ultimaData = t_saida;
        });
        
        // CORREÇÃO CRÍTICA (Item 4): A contagem de Entregas/Saídas deve ser por EXPEDIÇÃO/ITEM finalizado
        if (exp.status === 'entregue') {
            exp.items.forEach(item => {
                const loja = lojas.find(l => l.id === item.loja_id);
                if (loja && item.status_descarga === 'descarregado') {
                     // Conta 1 "saída" por item de expedição descarregado (reflete a lógica de 1 loja = 1 item)
                    lojasData[loja.id].totalEntregas++; 
                    totalEntregas++; 
                }
            });
            // Mantida para o gráfico de Evolução (se fosse usado)
            entregasDiarias[dataExp] = (entregasDiarias[dataExp] || 0) + exp.items.length;
        }

        if (totalLojaViagem > 0) temposEmLoja.push(totalLojaViagem);
        if (totalTransitoViagem > 0) temposEmTransito.push(totalTransitoViagem);

        if (veiculo && veiculo.capacidade_pallets > 0) {
            const cargaTotal = cargaPalletExp + (cargaRollExp / 2);
            ocupacoes.push((cargaTotal / veiculo.capacidade_pallets) * 100);
        }
    });
    
    // CÁLCULO DAS MÉDIAS FINAIS
    const mediaAlocar = calcularMedia(temposAlocar);
    const mediaChegadaDoca = calcularMedia(temposChegadaDoca);
    const mediaCarregamento = calcularMedia(temposCarregamento);
    const mediaFaturamento = calcularMedia(temposFaturamento);
    const mediaEmTransito = calcularMedia(temposEmTransito);
    const mediaEmLoja = calcularMedia(temposEmLoja);
    const mediaOcupacao = calcularMedia(ocupacoes);
    
    // T.M. TOTAL INTERNO (E2E): Ociosidade + Chegada Doca + Carregamento + Faturamento
    const mediaTempoInternoTotal = mediaAlocar + mediaChegadaDoca + mediaCarregamento + mediaFaturamento;

    
    // PROCESSAMENTO PARA GRÁFICOS
    const lojasRankingData = Object.values(lojasData).map(loja => ({
        ...loja,
        // Garante que o tempo médio por loja (para o Ranking) seja calculado a partir de todos os 'tempos'
        tempoMedio: calcularMedia(loja.tempos) 
    })).filter(l => l.totalEntregas > 0); 
    
    // -----------------------------------------------------
    // RENDERIZAÇÃO
    // -----------------------------------------------------
    
    // ... (Blocos de Volume e Tempos permanecem os mesmos)
    
    // 1. Bloco de Volume e Eficiência (6 Indicadores)
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

    // 2. Bloco de Tempos por Grupo (5 Colunas)
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
    
    // 3. Renderização dos Gráficos
    // CORREÇÃO DO RANKING (Item 2)
    renderLojasRankingChart(lojasRankingData.filter(l => l.tempoMedio > 0).sort((a, b) => b.tempoMedio - a.tempoMedio).slice(0, 10));
    renderEntregasChart(entregasFort, entregasComper);
    
    // NOVOS GRÁFICOS
    renderTotalEntregasLojaChart(lojasRankingData);
    renderParticipacaoEntregasLojaChart(lojasRankingData); // Novo gráfico de Pizza (Ajustado no código abaixo)
    renderPalletsPorLojaChart(lojasRankingData); // Novo gráfico
    
    // REMOVIDO renderEvolucaoEntregasDiaChart (Item 5)

}

// =======================================================
// NOVAS FUNÇÕES DE RENDERIZAÇÃO DE GRÁFICOS (PARA ADICIONAR)
// =======================================================

function renderTotalEntregasLojaChart(lojasData) {
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
                    label: function(context) {
                        return `Saídas: ${context.raw}`;
                    }
                }
            }
        }
    });
}


// SUBSTITUIR A FUNÇÃO renderParticipacaoEntregasLojaChart COMPLETA
function renderParticipacaoEntregasLojaChart(lojasData) {
    const dataFiltrada = lojasData.filter(l => l.totalEntregas > 0).sort((a, b) => b.totalEntregas - a.totalEntregas);
    if (dataFiltrada.length === 0) {
        destroyChart('participacaoEntregasLojaChart');
        return;
    }

    const totalGeral = dataFiltrada.reduce((sum, l) => sum + l.totalEntregas, 0);
    
    // REQUISITO: TOP 5 e REMOVER FATIA 'OUTRAS LOJAS'
    const topN = 5;
    const topLojas = dataFiltrada.slice(0, topN);
    
    let labels = topLojas.map(l => l.nome);
    let data = topLojas.map(l => l.totalEntregas);
    // Cores específicas para Fort/Comper
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

function renderPalletsPorLojaChart(lojasData) {
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
                    label: function(context) {
                        return `Pallets: ${context.raw}`;
                    }
                }
            }
        }
    });
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

// SUBSTITUIR A FUNÇÃO openEditModal COMPLETA
async function openEditModal(expeditionId) {
    const isMaster = masterUserPermission;
    
    // 1. Verificar Permissão Principal: Checagem robusta de múltiplas nomenclaturas
    const requiredPermissions = [
        'edit_expeditions',     // Plural inglês (Mais comum no seu BD para ações)
        'edit_expedition',      // Singular inglês (Alternativa comum)
        'editar_expedicao',     // Português (Como está no Gerenciar Permissões)
        'view_editar_expedicao',// Prefixado (Fallback)
        'acesso_editar_expedicao' // Prefixado (Fallback)
    ];
    
    let canEdit = isMaster;

    // Se o usuário não for MASTER, checa todas as variações da permissão de edição
    if (!canEdit) {
        for (const perm of requiredPermissions) {
            if (hasPermission(perm)) {
                canEdit = true;
                break;
            }
        }
    }

    if (!canEdit) {
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

    // 2. Aplicar Restrição de Status (SÓ PARA USUÁRIOS NORMAIS) - Master Bypass OK
    if (!isMaster && (expedition.status === 'saiu_para_entrega' || expedition.status === 'entregue')) {
        showNotification('Esta expedição não pode mais ser editada, pois já saiu para entrega.', 'error');
        return;
    }
    
    // 3. Se não é Master, e o status é avançado, pedimos autenticação para garantir
    if (!isMaster && (expedition.status === 'faturado' || expedition.status === 'faturamento_iniciado')) {
        showNotification('Acesso a esta expedição requer autenticação adicional.', 'info');
        showAuthEditModal(expeditionId);
        return;
    }

    // 4. Fluxo de Edição Normal
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
    liderSelect.innerHTML = '<option value="">Selecione o Conferente</option>';
    lideres.forEach(l => {
        liderSelect.innerHTML += `<option value="${l.id}">${l.nome}</option>`;
    });
}

        function closeEditModal() {
            document.getElementById('editExpeditionModal').style.display = 'none';
        }

       // Função para adicionar uma nova linha de loja no modal de edição
function addEditLojaLine(item = null) {
    editLojaLineCounter++;
    const container = document.getElementById('editLojasContainer');
    const newLine = document.createElement('div');
    // Ajustado para 5 colunas (Loja, Pallets, RollTrainers, Remover)
    newLine.className = 'grid grid-cols-1 md:grid-cols-5 gap-4 items-end';
    newLine.dataset.editIndex = editLojaLineCounter;
    
    // Inclui campo RollTrainers (com a classe 'edit-rolls-input')
    newLine.innerHTML = `
        <div class="form-group md:col-span-2"><label>Loja:</label><select class="edit-loja-select w-full">${lojas.map(l => `<option value="${l.id}">${l.codigo} - ${l.nome}</option>`).join('')}</select></div>
        <div class="form-group"><label>Pallets:</label><input type="number" class="edit-pallets-input w-full" min="0"></div>
        <div class="form-group"><label>RollTrainers:</label><input type="number" class="edit-rolls-input w-full" min="0"></div>
        <div><button type="button" class="btn btn-danger btn-small w-full" onclick="removeEditLojaLine(${editLojaLineCounter})">Remover</button></div>
    `;
    container.appendChild(newLine);
    
    if(item) {
        newLine.querySelector('.edit-loja-select').value = item.loja_id;
        newLine.querySelector('.edit-pallets-input').value = item.pallets;
        // Preenche o campo RollTrainers com o valor existente
        newLine.querySelector('.edit-rolls-input').value = item.rolltrainers || 0; 
    }
}
        
        function removeEditLojaLine(index) {
            document.querySelector(`[data-edit-index="${index}"]`)?.remove();
        }

// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

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
    rolltrainers: parseInt(row.querySelector('.edit-rolls-input').value) || 0 // NOVO: Coleta RollTrainers
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
      // 🚨 FIX CRÍTICO: Garante que a exclusão não envie filtro de filial (4º parâmetro = false)
      updatePromises.push(
        supabaseRequest(`expedition_items?id=eq.${item.id}`, 'DELETE', null, false)
      );
    }

    // Itens a serem adicionados ou atualizados
    for (const newItem of newItemsData) {
      const existingItem = originalItems.find(originalItem => originalItem.loja_id === newItem.loja_id);
      
      if (existingItem) {
        // Se já existe, verifica e atualiza
        const payload = {};
        let needsUpdate = false;

        if (existingItem.pallets !== newItem.pallets) {
          payload.pallets = newItem.pallets;
          needsUpdate = true;
        }

        // NOVO: Verifica RollTrainers
        if (existingItem.rolltrainers !== newItem.rolltrainers) {
          payload.rolltrainers = newItem.rolltrainers;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
            // 🚨 FIX CRÍTICO: Garante que o PATCH não envie filtro de filial (4º parâmetro = false)
            updatePromises.push(
                supabaseRequest(`expedition_items?id=eq.${existingItem.id}`, 'PATCH', payload, false)
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
        // 🚨 FIX CRÍTICO: Garante que o POST não envie filtro de filial (4º parâmetro = false)
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

// SUBSTITUIR A FUNÇÃO deleteExpedition COMPLETA
async function deleteExpedition(expeditionId) {
    const isMaster = masterUserPermission;

    // 1. Verificar Permissão Principal
    const requiredPermission = 'excluir_expedicao'; // Termo em português, mas mantemos o fallback
    let canDelete = isMaster || hasPermission(requiredPermission);
    
    // 🚨 FIX CRÍTICO: Checa formas alternativas de permissão de ação.
    if (!canDelete) {
        // Ex: Se o BD tem o código de ação em inglês (delete_expeditions/delete_expedition)
        canDelete = hasPermission('delete_expeditions') || hasPermission('delete_expedition');
    }

    if (!canDelete) {
        showNotification('Você não tem permissão para excluir expedições.', 'error');
        return;
    }

    const expeditionToDel = allExpeditions.find(e => e.id === expeditionId);
    if (!expeditionToDel) {
        showNotification('Erro: Expedição não encontrada para exclusão.', 'error');
        return;
    }

    // 2. Aplicar Restrição de Status (SÓ PARA USUÁRIOS NORMAIS) - Master Bypass OK
    if (!isMaster && (expeditionToDel.status === 'saiu_para_entrega' || expeditionToDel.status === 'entregue')) {
        showNotification('Esta expedição não pode ser excluída, pois já saiu para entrega.', 'error');
        return;
    }

    const confirmed = await showYesNoModal('Deseja realmente excluir esta expedição? Esta ação não pode ser desfeita e liberará os recursos alocados.');
    if (confirmed) {
        try {
            const updatePromises = [];

            // 3. Liberar Recursos Alocados
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

  async function loadConfiguracoes() {
    if (!currentUser) {
        document.getElementById('passwordFormContainer').style.display = 'block';
        document.getElementById('configuracoesContent').style.display = 'none';
        document.getElementById('passwordInput').value = '';
        document.getElementById('userInput').value = '';
        return;
    }

    if (gruposAcesso.length === 0) {
        try {
            gruposAcesso = await supabaseRequest('grupos_acesso?order=nome', 'GET', null, false);
        } catch (error) {
            console.error('Erro ao carregar grupos de acesso:', error);
            showNotification('Erro ao carregar grupos de acesso.', 'error');
        }
    }
    
    document.getElementById('passwordFormContainer').style.display = 'none';
    document.getElementById('configuracoesContent').style.display = 'block';
    updateSystemStatus();
    
    const permittedConfiguracoesTabs = getPermittedSubTabs('configuracoes');
    
    if (permittedConfiguracoesTabs.length > 0) {
        const initialSubTab = permittedConfiguracoesTabs.length === 1 ? permittedConfiguracoesTabs[0] : 'filiais';
        const initialElement = document.querySelector(`#configuracoes .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        showSubTab('configuracoes', initialSubTab, initialElement);
    }
}

        // SUBSTITUIR A VERSÃO EXISTENTE DE checkPassword
async function checkPassword() {
    const nome = document.getElementById('userInput').value.trim();
    const senha = document.getElementById('passwordInput').value;

    if (!nome || !senha) {
        showAlert('passwordAlert', 'Nome e senha são obrigatórios.', 'error');
        return;
    }

    try {
        const endpoint = `acessos?select=id,nome,grupo_id&nome=eq.${nome}&senha=eq.${senha}`;
        const result = await supabaseRequest(endpoint, 'GET', null, false);

        if (!result || result.length === 0) {
            showAlert('passwordAlert', 'Nome de usuário ou senha incorretos.', 'error');
            document.getElementById('passwordInput').value = '';
            return;
        }

        const user = result[0];
        currentUser = {
            id: user.id,
            nome: user.nome,
            grupoId: user.grupo_id
        };

        // NOVO: Carregar as permissões do usuário
        await loadUserPermissions(currentUser.id, currentUser.grupoId);

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
        
      // Substitua a função showAddForm no seu script.js (cerca da linha 2689)
// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

function showAddForm(type, itemToEdit = null) {
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    fieldsContainer.innerHTML = ''; // Limpa campos anteriores

    let formHtml = '';
    
    // Adiciona lógica de edição
    const isEditing = itemToEdit && typeof itemToEdit === 'object';
    const editData = isEditing ? itemToEdit : {};
    
    // Atualiza o texto do botão salvar
    const saveButton = document.querySelector('#addFormModal button[type="submit"]');
    if (saveButton) {
        saveButton.textContent = isEditing ? 'Salvar Edição' : 'Salvar';
    }


    if (type === 'filial') {
        title.textContent = isEditing ? `Editar Filial: ${editData.nome}` : `Adicionar Nova Filial`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_filial_nome" value="${editData.nome}">` : ''}
            <div class="form-group"><label>Nome da Filial (Ex: 464):</label><input type="text" id="add_nome" value="${editData.nome || ''}" required ${isEditing ? 'readonly' : ''}></div>
            <div class="form-group"><label>Descrição (Ex: MT):</label><input type="text" id="add_descricao" value="${editData.descricao || ''}" required></div>
            <div class="form-group md:col-span-2"><label>Endereço do CD (Ponto de Partida):</label><input type="text" id="add_endereco_cd" value="${editData.endereco_cd || ''}" placeholder="Rua, Número, Cidade" required></div>
            <div class="form-group"><label>Latitude do CD:</label><input type="number" id="add_latitude_cd" step="0.000001" value="${editData.latitude_cd || ''}" placeholder="-15.601400"></div>
            <div class="form-group"><label>Longitude do CD:</label><input type="number" id="add_longitude_cd" step="0.000001" value="${editData.longitude_cd || ''}" placeholder="-56.097900"></div>
            <div class="form-group"><label>Status:</label><select id="add_ativo">
                <option value="true" ${editData.ativo !== false ? 'selected' : ''}>Ativa</option>
                <option value="false" ${editData.ativo === false ? 'selected' : ''}>Inativa</option>
            </select></div>
            <div class="text-center mt-4 md:col-span-2">
                <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocationFilial()">📍 Usar Localização Atual</button>
                <button type="button" class="btn btn-primary" onclick="geocodeAddressFilial()">🌍 Buscar por Endereço</button>
            </div>
        `;
    } else if (type === 'loja') {
        title.textContent = isEditing ? `Editar Loja: ${editData.nome}` : `Adicionar Nova Loja`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_loja_id" value="${editData.id}">` : ''}
            <div class="form-group"><label>Nome da Loja:</label><input type="text" id="add_nome" value="${editData.nome || ''}" required></div>
            <div class="form-group"><label>Código da Loja:</label><input type="text" id="add_codigo" value="${editData.codigo || ''}" required></div>
            <div class="form-group"><label>Cidade:</label><input type="text" id="add_cidade" value="${editData.cidade || ''}" required></div>
            <div class="form-group"><label>Código QR:</label><input type="text" id="add_codlojaqr" value="${editData.codlojaqr || ''}" required></div>
            <div class="form-group md:col-span-2"><label>Endereço Completo:</label><input type="text" id="add_endereco_completo" value="${editData.endereco_completo || ''}" placeholder="Rua, Número, Bairro, CEP" required></div>
            <div class="form-group"><label>Latitude:</label><input type="number" id="add_latitude" step="0.000001" value="${editData.latitude || ''}" placeholder="-15.601400"></div>
            <div class="form-group"><label>Longitude:</label><input type="number" id="add_longitude" step="0.000001" value="${editData.longitude || ''}" placeholder="-56.097900"></div>
            <div class="form-group"><label>Status:</label><select id="add_ativo">
                <option value="true" ${editData.ativo !== false ? 'selected' : ''}>Ativa</option>
                <option value="false" ${editData.ativo === false ? 'selected' : ''}>Inativa</option>
            </select></div>
            <div class="text-center mt-4 md:col-span-2">
                <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocation()">📍 Usar Localização Atual</button>
                <button type="button" class="btn btn-primary" onclick="geocodeAddress()">🌍 Buscar por Endereço</button>
            </div>
        `;
    } else if (type === 'doca') {
        title.textContent = isEditing ? `Editar Doca: ${editData.nome}` : `Adicionar Nova Doca`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_doca_id" value="${editData.id}">` : ''}
            <div class="form-group"><label>Nome da Doca:</label><input type="text" id="add_nome" value="${editData.nome || ''}" required></div>
            <div class="form-group"><label>Capacidade (Pallets):</label><input type="number" id="add_capacidade_pallets" min="0" value="${editData.capacidade_pallets || ''}" required></div>
            <div class="form-group"><label>Código QR:</label><input type="text" id="add_coddoca" value="${editData.coddoca || ''}" required></div>
             <div class="form-group"><label>Status:</label><select id="add_ativo">
                <option value="true" ${editData.ativo !== false ? 'selected' : ''}>Ativa</option>
                <option value="false" ${editData.ativo === false ? 'selected' : ''}>Inativa</option>
            </select></div>
        `;
    } else if (type === 'lider') {
        title.textContent = isEditing ? `Editar Líder: ${editData.nome}` : `Adicionar Novo Líder`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_lider_id" value="${editData.id}">` : ''}
            <div class="form-group"><label>Nome do Líder:</label><input type="text" id="add_nome" value="${editData.nome || ''}" required></div>
            <div class="form-group"><label>Matrícula:</label><input type="text" id="add_codigo_funcionario" value="${editData.codigo_funcionario || ''}" required></div>
            <div class="form-group"><label>Status:</label><select id="add_ativo">
                <option value="true" ${editData.ativo !== false ? 'selected' : ''}>Ativa</option>
                <option value="false" ${editData.ativo === false ? 'selected' : ''}>Inativa</option>
            </select></div>
        `;
    } else if (type === 'veiculo') {
        title.textContent = isEditing ? `Editar Veículo: ${editData.placa}` : `Adicionar Novo Veículo`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_veiculo_id" value="${editData.id}">` : ''}
            <div class="form-group"><label>Placa:</label><input type="text" id="add_placa" value="${editData.placa || ''}" required></div>
            <div class="form-group"><label>Modelo:</label><input type="text" id="add_modelo" value="${editData.modelo || ''}" required></div>
            <div class="form-group"><label>Capacidade (Pallets):</label><input type="number" id="add_capacidade_pallets" min="1" value="${editData.capacidade_pallets || ''}" required></div>
            <div class="form-group"><label>Tipo:</label><select id="add_tipo" required>
                <option value="JJS" ${editData.tipo === 'JJS' ? 'selected' : ''}>JJS</option>
                <option value="PERLOG" ${editData.tipo === 'PERLOG' ? 'selected' : ''}>PERLOG</option>
            </select></div>
            <div class="form-group"><label>Status:</label><select id="add_status" required>
                <option value="disponivel" ${editData.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
                <option value="em_uso" ${editData.status === 'em_uso' ? 'selected' : ''}>Em Uso</option>
                <option value="manutencao" ${editData.status === 'manutencao' ? 'selected' : ''}>Manutenção</option>
            </select></div>
        `;
    } else if (type === 'motorista') {
        title.textContent = isEditing ? `Editar Motorista: ${editData.nome}` : `Adicionar Novo Motorista`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_motorista_id" value="${editData.id}">` : ''}
            <div class="form-group"><label>Nome:</label><input type="text" id="add_nome" value="${editData.nome || ''}" required></div>
            <div class="form-group"><label>Produtivo (Matrícula):</label><input type="text" id="add_produtivo" value="${editData.PRODUTIVO || ''}" required></div>
            <div class="form-group"><label>Status:</label><select id="add_status" required>
                <option value="disponivel" ${editData.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
                <option value="em_viagem" ${editData.status === 'em_viagem' ? 'selected' : ''}>Em Viagem</option>
                <option value="folga" ${editData.status === 'folga' ? 'selected' : ''}>Folga</option>
            </select></div>
        `;
    } else if (type === 'grupo') { // LÓGICA DO GRUPO (CRIAÇÃO E EDIÇÃO)
        title.textContent = isEditing ? `Editar Grupo: ${editData.nome}` : `Adicionar Novo Grupo`;
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_grupo_id" value="${editData.id}">` : ''}
            <div class="form-group"><label>Nome do Grupo:</label><input type="text" id="add_nome" value="${editData.nome || ''}" required></div>
        `;
    } else if (type === 'acesso') { // LÓGICA DE USUÁRIO
        title.textContent = isEditing ? `Editar Usuário: ${editData.nome}` : `Adicionar Novo Usuário`;
        // Usar gruposAcesso global para preencher o select
        const gruposHtml = gruposAcesso.map(g => `<option value="${g.id}" ${editData.grupo_id === g.id ? 'selected' : ''}>${g.nome}</option>`).join('');
        
        // Se estiver editando, o itemToEdit.nome será o valor de 'acesso' a ser editado
        const nomeAcesso = editData.nome || '';
        
        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_acesso_id" value="${editData.id || ''}">` : ''}
            <div class="form-group"><label>Nome de Usuário:</label><input type="text" id="add_nome" value="${nomeAcesso}" required></div>
            <div class="form-group"><label>${isEditing ? 'Nova Senha:' : 'Senha:'}</label><input type="password" id="add_senha" ${!isEditing ? 'required' : ''} placeholder="${isEditing ? 'Deixe em branco para manter a atual' : ''}"></div>
            <div class="form-group"><label>Grupo de Acesso:</label><select id="add_grupo_id" required>
                <option value="">Selecione um Grupo</option>
                ${gruposHtml}
            </select></div>
        `;
    } else if (type === 'pontoInteresse') {
        title.textContent = isEditing ? `Editar Ponto: ${editData.nome}` : 'Adicionar Ponto de Interesse';
         // Lógica do select de lojas para preencher campos (apenas para a criação)
        const lojasOptions = lojas.map(loja => `<option value="${loja.id}">${loja.codigo} - ${loja.nome}</option>`).join('');

        formHtml = `
            ${isEditing ? `<input type="hidden" id="edit_ponto_id" value="${editData.id}">` : ''}
            <div class="form-group md:col-span-2" ${isEditing ? 'style="display:none;"' : ''}>
                <label>Selecionar Loja (opcional):</label>
                <select id="add_loja_id" class="w-full">
                    <option value="">-- Ou insira um ponto manualmente --</option>
                    ${lojasOptions}
                </select>
            </div>
            <div class="form-group"><label>Nome do Ponto:</label><input type="text" id="add_nome" value="${editData.nome || ''}" placeholder="Ex: CD Principal, Loja 123, etc." required></div>
            <div class="form-group"><label>Tipo:</label><select id="add_tipo" required>
                <option value="CD" ${editData.tipo === 'CD' ? 'selected' : ''}>Centro de Distribuição</option>
                <option value="LOJA" ${editData.tipo === 'LOJA' ? 'selected' : ''}>Loja</option>
                <option value="POSTO" ${editData.tipo === 'POSTO' ? 'selected' : ''}>Posto de Combustível</option>
                <option value="CASA" ${editData.tipo === 'CASA' ? 'selected' : ''}>Casa/Residência</option>
                <option value="OUTRO" ${editData.tipo === 'OUTRO' ? 'selected' : ''}>Outro</option>
            </select></div>
            <div class="form-group"><label>Latitude:</label><input type="number" id="add_latitude" step="0.000001" value="${editData.latitude || ''}" placeholder="-15.601400" required></div>
            <div class="form-group"><label>Longitude:</label><input type="number" id="add_longitude" step="0.000001" value="${editData.longitude || ''}" placeholder="-56.097900" required></div>
            <div class="form-group"><label>Raio de Detecção (metros):</label><input type="number" id="add_raio_deteccao" min="50" max="2000" value="${editData.raio_deteccao || 200}" required></div>
            <div class="form-group"><label>Cor no Mapa:</label><select id="add_cor">
                <option value="#0077B6" ${editData.cor === '#0077B6' ? 'selected' : ''}>Azul</option>
                <option value="#EF4444" ${editData.cor === '#EF4444' ? 'selected' : ''}>Vermelho</option>
                <option value="#10B981" ${editData.cor === '#10B981' ? 'selected' : ''}>Verde</option>
                <option value="#F59E0B" ${editData.cor === '#F59E0B' ? 'selected' : ''}>Laranja</option>
                <option value="#8B5CF6" ${editData.cor === '#8B5CF6' ? 'selected' : ''}>Roxo</option>
                <option value="#EC4899" ${editData.cor === '#EC4899' ? 'selected' : ''}>Rosa</option>
            </select></div>
            <div class="form-group"><label>Status:</label><select id="add_ativo">
                <option value="true" ${editData.ativo !== false ? 'selected' : ''}>Ativo</option>
                <option value="false" ${editData.ativo === false ? 'selected' : ''}>Inativo</option>
            </select></div>
            <div class="text-center mt-4 md:col-span-2">
                <button type="button" class="btn btn-secondary mr-2" onclick="getCurrentLocation()">📍 Usar Localização Atual</button>
            </div>
        `;
    }
    
    fieldsContainer.innerHTML = formHtml;
    modal.style.display = 'flex';
    
    // NOVO: Adicionar listener para o select de loja no Ponto de Interesse (apenas no modo de adição)
    if (type === 'pontoInteresse' && !isEditing) {
        const lojaSelect = document.getElementById('add_loja_id');
        if (lojaSelect) {
            lojaSelect.addEventListener('change', (e) => {
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
        }
    }
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
        else if (title.includes('Grupo')) success = await saveGroup(); // NOVO
        else if (title.includes('Acesso') || title.includes('Usuário')) success = await saveAcesso(); // Ajuste no texto
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
    
    // 🚨 AJUSTE CRÍTICO: Se estiver editando, não envie o código do funcionário 
    // para evitar o erro de violação de chave única (409).
    if (isEdit) {
        delete data.codigo_funcionario; 
        
        await supabaseRequest(`lideres?id=eq.${liderId}`, 'PATCH', data);
        showNotification('atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('lideres', 'POST', data);
        showNotification('cadastrado com sucesso!', 'success');
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
      // SUBSTITUIR A VERSÃO EXISTENTE DE saveAcesso
async function saveAcesso() {
    const isEdit = !!document.getElementById('edit_acesso_id');
    const userId = isEdit ? document.getElementById('edit_acesso_id').value : null;
    
    const data = { 
        nome: document.getElementById('add_nome').value, 
        grupo_id: document.getElementById('add_grupo_id').value || null,
        // Mantém tipo_acesso por compatibilidade, mas o campo de input foi removido
        tipo_acesso: 'CUSTOM' 
    };
    
    const senha = document.getElementById('add_senha').value;
    if (!isEdit || senha.trim()) {
        data.senha = senha || document.getElementById('add_nome').value; // usar nome como senha padrão se vazio
    }
    
    if (isEdit) {
        await supabaseRequest(`acessos?id=eq.${userId}`, 'PATCH', data, false);
        showNotification('Usuário atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('acessos', 'POST', data, false);
        showNotification('Usuário cadastrado com sucesso!', 'success');
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



// SUBSTITUIR A FUNÇÃO initTrajectoryMap COMPLETA
async function initTrajectoryMap(expeditionId, vehiclePlaca) {
    try {
        if (mapInstance) {
            mapInstance.remove();
        }

        const expeditionItems = await supabaseRequest(
            `expedition_items?expedition_id=eq.${expeditionId}&order=ordem_entrega.asc,data_inicio_descarga.asc`,
            'GET', null, false
        );
        
        if (!expeditionItems || expeditionItems.length === 0) {
            showNotification('Não há pontos de entrega para traçar a rota.', 'info');
            const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
            mapInstance = L.map('map').setView(cdCoords, 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
            setTimeout(() => { mapInstance.invalidateSize(); }, 200); 
            return;
        }

        // 1. CONSTRUIR WAYPOINTS (CD + LOJAS)
        const waypoints = [
            L.latLng(selectedFilial.latitude_cd, selectedFilial.longitude_cd)
        ];
        
        expeditionItems.forEach(item => {
            const loja = lojas.find(l => l.id === item.loja_id);
            if (loja && loja.latitude && loja.longitude) {
                waypoints.push(L.latLng(loja.latitude, loja.longitude));
            }
        });

        // Se não houver pontos suficientes para traçar rota
        if (waypoints.length < 2) {
             showNotification('Não há coordenadas de loja válidas para traçar a rota.', 'info');
             const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
             mapInstance = L.map('map').setView(cdCoords, 11);
             L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
             setTimeout(() => { mapInstance.invalidateSize(); }, 200); 
             return;
        }

        // 2. CRIAR MAPA
        mapInstance = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance);
        
        // 3. CRIAR ROTEAMENTO COM TRATAMENTO DE ERRO ROBUSTO
        const routingControl = L.Routing.control({
            waypoints: waypoints,
            createMarker: function(i, waypoint, n) {
                 let iconHtml = '';
                if (i === 0) {
                    iconHtml = '<div style="background: #0077B6; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>';
                } else {
                    const loja = lojas.find(l => l.id === expeditionItems[i-1].loja_id); 
                    iconHtml = `<div style="background: #EF4444; color: white; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">#${i} - ${loja?.codigo || 'N/A'}</div>`;
                }
                
                const markerIcon = L.divIcon({
                    className: 'custom-marker',
                    html: iconHtml,
                    iconSize: [80, 25],
                    iconAnchor: [40, 12]
                });
                return L.marker(waypoint.latLng, {
                    icon: markerIcon
                }).bindPopup(`<b>${waypoint.name || `Ponto ${i+1}`}</b>`);
            },
            routeWhileDragging: false,
            autoRoute: true,
            lineOptions: { 
                styles: [{ color: '#0077B6', weight: 6, opacity: 0.8 }] 
            },
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                timeout: 30000 // 30 segundos de timeout
            }),
            showAlternatives: false,
            fitSelectedRoutes: true,
            show: false // Esconde o painel de instruções
        }).addTo(mapInstance);
        
        // 4. TRATAMENTO DE SUCESSO
        routingControl.on('routesfound', function(e) {
            const route = e.routes[0];
            const distance = route.summary.totalDistance / 1000;
            const duration = route.summary.totalTime / 60;
            
            // Ajustar o zoom do mapa para a rota completa
            try {
                const bounds = route.bounds || L.latLngBounds(waypoints);
                mapInstance.fitBounds(bounds, { padding: [30, 30] });
            } catch (err) {
                console.warn('Erro ao ajustar bounds, usando waypoints:', err);
                const fallbackBounds = L.latLngBounds(waypoints);
                mapInstance.fitBounds(fallbackBounds, { padding: [30, 30] });
            }

            // Cria o painel de estatísticas
            const statsControl = L.control({ position: 'topright' });
            statsControl.onAdd = function() {
                const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
                div.style.background = 'white';
                div.style.padding = '10px';
                div.style.fontSize = '12px';
                
                div.innerHTML = `
                    <p><b>Estatísticas da Rota</b></p>
                    <p><strong>Veículo:</strong> ${vehiclePlaca}</p>
                    <p><strong>Distância:</strong> ${distance.toFixed(1)} km</p>
                    <p><strong>Tempo Estimado:</strong> ${minutesToHHMM(duration)}</p>
                    <p><strong>Paradas:</strong> ${waypoints.length - 1}</p>
                `;
                return div;
            };
            statsControl.addTo(mapInstance);
            
            showNotification('Rota calculada com sucesso!', 'success', 2000);
        });
        
        // 5. TRATAMENTO DE ERRO CRÍTICO
        routingControl.on('routingerror', function(e) {
             console.error("Erro no Routing Machine:", e.error);
             
             // Remove o controle com erro
             try {
                 mapInstance.removeControl(routingControl);
             } catch (err) {
                 console.warn('Erro ao remover controle:', err);
             }
             
             // Ajusta zoom para os waypoints mesmo sem rota
             const boundsWaypoints = L.latLngBounds(waypoints);
             if (boundsWaypoints.isValid()) {
                 mapInstance.fitBounds(boundsWaypoints, { padding: [30, 30] });
             }
             
             // Adiciona linha reta entre os pontos como fallback
             const fallbackPolyline = L.polyline(waypoints, {
                 color: '#F59E0B',
                 weight: 4,
                 opacity: 0.6,
                 dashArray: '10, 10'
             }).addTo(mapInstance);
             
             // Painel de aviso
             const warningControl = L.control({ position: 'topright' });
             warningControl.onAdd = function() {
                 const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
                 div.style.background = '#FEF3C7';
                 div.style.border = '2px solid #F59E0B';
                 div.style.padding = '10px';
                 div.style.fontSize = '12px';
                 div.style.maxWidth = '250px';
                 
                 div.innerHTML = `
                     <p><b>⚠️ Rota Simplificada</b></p>
                     <p style="margin: 5px 0;">O serviço OSRM falhou. Linha reta exibida.</p>
                     <p><strong>Veículo:</strong> ${vehiclePlaca}</p>
                     <p><strong>Paradas:</strong> ${waypoints.length - 1}</p>
                 `;
                 return div;
             };
             warningControl.addTo(mapInstance);
             
             showNotification('Rota simplificada: Serviço OSRM instável. Linha reta exibida.', 'error', 5000);
        });

        // 6. ESCONDER PAINEL DE INSTRUÇÕES
        const routingAlt = document.querySelector('.leaflet-routing-alt');
        if (routingAlt) routingAlt.style.display = 'none';

        // 7. GARANTIA DE EXIBIÇÃO
        setTimeout(() => { 
            if (mapInstance) {
                mapInstance.invalidateSize(); 
            }
        }, 500); 
        
    } catch (error) {
        console.error('Erro fatal ao carregar trajeto:', error);
        closeMapModal();
        showNotification('Erro fatal ao carregar dados do trajeto.', 'error');
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
        showNotification('não encontrado', 'error');
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
            showNotification('excluído com sucesso!', 'success');
            await loadSelectData();
            renderLideresConfig();
        } catch (error) {
            showNotification(`Erro ao excluir líder: ${error.message}`, 'error');
        }
    }
}

// SUBSTITUIR A VERSÃO EXISTENTE DE editAcesso
async function editAcesso(nomeUsuario) {
    // Busca o ID e o grupo_id para edição
    const acessosData = await supabaseRequest(`acessos?select=id,nome,grupo_id&nome=eq.${nomeUsuario}`, 'GET', null, false);
    if (!acessosData || acessosData.length === 0) {
        showNotification('Acesso não encontrado', 'error');
        return;
    }
    
    const acesso = acessosData[0];
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    
    title.textContent = 'Editar Acesso';
    const gruposHtml = gruposAcesso.map(g => `<option value="${g.id}" ${acesso.grupo_id === g.id ? 'selected' : ''}>${g.nome}</option>`).join('');
    
    fieldsContainer.innerHTML = `
        <input type="hidden" id="edit_acesso_id" value="${acesso.id}">
        <div class="form-group"><label>Nome de Usuário:</label><input type="text" id="add_nome" value="${acesso.nome}" required></div>
        <div class="form-group"><label>Nova Senha:</label><input type="password" id="add_senha" placeholder="Deixe em branco para manter a atual"></div>
        <div class="form-group"><label>Grupo de Acesso:</label><select id="add_grupo_id" required>
            <option value="">Selecione um Grupo</option>
            ${gruposHtml}
        </select></div>
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


// SUBSTITUIR A VERSÃO EXISTENTE DE getRouteFromAPI
async function getRouteFromAPI(waypoints) {
    if (!waypoints || waypoints.length < 2) {
        return null;
    }

    const coordinates = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?geometries=geojson&overview=full&steps=true`;

    try {
        const response = await fetch(url);
        
        if (response.status === 429) {
            // Limite de requisições. Lançar erro para que o allSettled capture.
            throw new Error('Limite de requisições OSRM (429)'); 
        }
        
        if (!response.ok) {
            // Outros erros HTTP (404, 500, etc.)
            throw new Error(`Erro na API de roteamento: ${response.status}`);
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
        // Rota não encontrada
        return null;
    } catch (error) {
        // 🚨 FIX CRÍTICO: Tratamento de erro de rede (Failed to fetch/Timeout) 🚨
        console.error('Falha crítica de rede/conexão OSRM:', error);
        // Lança o erro para que o Promise.allSettled capture como 'rejected' e o fluxo continue.
        throw new Error('Falha de conexão OSRM: A rota não pôde ser calculada.'); 
    }
}


// NOVO CÓDIGO: Função para Snap-to-Road (Map Matching)
async function getMapMatchedRoute(coordinates) {
    if (coordinates.length < 2) return null;
    
    // Converte a lista de objetos LatLng em strings "lng,lat;lng,lat"
    const coordsString = coordinates.map(p => `${p.lng},${p.lat}`).join(';');
    // Usa o endpoint Map Matching do OSRM para ajustar a rota às vias
    const url = `https://router.project-osrm.org/match/v1/driving/${coordsString}?geometries=geojson&steps=false&tidy=true`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OSRM Match Failed: ${response.status}`);
        
        const data = await response.json();
        if (data.matchings && data.matchings.length > 0) {
            // Retorna as coordenadas ajustadas à rua
            return data.matchings[0].geometry.coordinates.map(c => [c[1], c[0]]);
        }
        return null;
    } catch (error) {
        console.error('Falha no Map Matching OSRM:', error);
        throw new Error('Falha no Map Matching: Servidor OSRM instável.');
    }
}
// NOVO: Função auxiliar para o Drag and Drop
function getDragAfterElement(container, y) {
    // Retorna todos os elementos arrastáveis que NÃO estão sendo arrastados
    const draggableElements = [...container.querySelectorAll('li[draggable="true"]:not(.dragging)')];

    // Encontra o elemento mais próximo do ponto Y do cursor
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        // Calcula a distância do meio do elemento até o cursor Y
        const offset = y - box.top - box.height / 2;
        
        // Se a distância for negativa e mais próxima do zero (acima do meio do elemento)
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: -Infinity }).element;
}

// ... O resto do seu script.js continua aqui

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



function closeOrdemCarregamentoModal() {
    document.getElementById('ordemCarregamentoModal').style.display = 'none';
    document.getElementById('ordemLojasList').innerHTML = '';
}

// SUBSTITUA A FUNÇÃO saveOrdemCarregamento COMPLETA
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
            // 🚨 FIX CRÍTICO: Passa 'false' para não tentar injetar 'filial' no payload do item
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
        showNotification(`Erro ao salvar ordem de carregamento: ${error.message}`, 'error');
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

// SUBSTITUIR A VERSÃO EXISTENTE DE renderAcessosConfig (Cerca da linha 3290)
async function renderAcessosConfig() {
    const tbody = document.getElementById('acessosConfigBody');
    if (!tbody) return;

    if (!masterUserPermission) {
        tbody.innerHTML = '<tr><td colspan="3" class="alert alert-error">Acesso negado. Apenas usuários MASTER podem gerenciar acessos e permissões.</td></tr>';
        return;
    }

    tbody.innerHTML = `<tr><td colspan="3" class="loading"><div class="spinner"></div>Carregando usuários e grupos...</td></tr>`;

    try {
        // 1. Carregar Grupos de Acesso
        const gruposData = await supabaseRequest('grupos_acesso?order=nome', 'GET', null, false);
        let gruposHtml = '<tr><td colspan="3" class="font-bold text-center bg-gray-200">GRUPOS DE ACESSO</td></tr>';
        
        gruposData.forEach(grupo => {
            // Usamos JSON.stringify e o replace para passar o objeto como string para o onclick
            const grupoJson = JSON.stringify(grupo).replace(/"/g, "'"); 
            gruposHtml += `
                <tr class="hover:bg-gray-50">
                    <td class="font-medium">${grupo.nome}</td>
                    <td><span class="status-badge status-disponivel">GRUPO</span></td>
                    <td>
                        <div class="flex gap-1">
                            <button class="btn btn-primary btn-small" onclick="managePermissionsModal('${grupo.id}', '${grupo.nome}', 'grupo')">Permissões</button>
                            <button class="btn btn-warning btn-small" onclick="showAddForm('grupo', ${grupoJson})">Editar</button>
                            <button class="btn btn-danger btn-small" onclick="deleteGroup('${grupo.id}')">Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        // 2. Carregar Usuários Individuais
        const acessosData = await supabaseRequest('acessos?select=id,nome,grupo_id(nome)&order=nome', 'GET', null, false);
        let acessosHtml = '<tr><td colspan="3" class="font-bold text-center bg-gray-200">USUÁRIOS INDIVIDUAIS</td></tr>';

        acessosData.forEach(acesso => {
            const grupoNome = acesso.grupo_id && typeof acesso.grupo_id === 'object' && acesso.grupo_id.nome 
                             ? acesso.grupo_id.nome 
                             : 'SEM GRUPO';

            acessosHtml += `
                <tr class="hover:bg-gray-50">
                    <td class="font-medium">${acesso.nome}</td>
                    <td><span class="status-badge status-em_uso">${grupoNome}</span></td>
                    <td>
                        <div class="flex gap-1">
                            <button class="btn btn-primary btn-small" onclick="managePermissionsModal('${acesso.id}', '${acesso.nome}', 'usuario')">Permissões</button>
                            <button class="btn btn-warning btn-small" onclick="editAcesso('${acesso.nome}')">Editar</button>
                            <button class="btn btn-danger btn-small" onclick="deleteAcesso('${acesso.nome}')">Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = gruposHtml + acessosHtml;
        
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
    const permittedOperacaoTabs = getPermittedSubTabs('operacao');
    if (permittedOperacaoTabs.length > 0) {
        // Abre a única sub-aba permitida ou a padrão 'lancamento'
        const initialSubTab = permittedOperacaoTabs.length === 1 ? permittedOperacaoTabs[0] : 'lancamento';
        const initialElement = document.querySelector(`#operacao .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        showSubTab('operacao', initialSubTab, initialElement);
    }
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

// SUBSTITUIR A FUNÇÃO renderIdentificacaoExpedicoes COMPLETA
function renderIdentificacaoExpedicoes(expeditions) {
    const container = document.getElementById('expedicoesParaIdentificacao');

    container.innerHTML = expeditions.map(exp => {
        const totalItens = exp.total_pallets + exp.total_rolltrainers;
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
                    <div><strong>Conferente:</strong> ${exp.lider_nome}</div>
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
                    <button class="btn btn-primary" onclick="openImprimirIdentificacaoModal('${exp.id}')">
                        🖨️ Imprimir Identificação (${totalItens} etiquetas)
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

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

async function handleInitialLogin(event) {
    event.preventDefault();
    // ✅ AJUSTE APLICADO: Use .trim() na senha para remover espaços em branco
    const nome = document.getElementById('initialUser').value.trim();
    const senha = document.getElementById('initialPassword').value.trim(); 
    const alertContainer = document.getElementById('initialLoginAlert');

    if (!nome || !senha) {
        alertContainer.innerHTML = '<div class="alert alert-error">Usuário e senha são obrigatórios.</div>';
        return;
    }
    alertContainer.innerHTML = '<div class="loading">Autenticando...</div>';

    try {
        // GARANTIA: Reseta o estado global antes da autenticação
        selectedFilial = null;

        // ✅ CORREÇÃO CRÍTICA: SEPARAÇÃO DO ENDPOINT E DOS FILTROS.
        // A URL final que o proxy da Vercel receberá será: /api/proxy?endpoint=acessos&select=...
        const nomeEndpointBase = 'acessos';
        const filtros = `select=id,nome,grupo_id&nome=eq.${nome}&senha=eq.${senha}`;
        
        const authUrl = `${SUPABASE_PROXY_URL}?endpoint=${nomeEndpointBase}&${filtros}`;
        
        const authResponse = await fetch(authUrl, {
            method: 'GET',
            headers: headers 
        });

        if (!authResponse.ok) {
            const errorText = await authResponse.text();
            throw new Error(`Erro ${authResponse.status} na autenticação: ${errorText}`);
        }
        
        const result = await authResponse.json();

        // VALIDAÇÃO CRÍTICA: Se a resposta for vazia, significa falha na autenticação
        if (!result || result.length === 0 || !result[0]) {
            alertContainer.innerHTML = '<div class="alert alert-error">Usuário ou senha incorretos.</div>';
            return;
        }

        const user = result[0];
        currentUser = {
            id: user.id,
            nome: user.nome,
            grupoId: user.grupo_id
        };

        // 1. Carregar as permissões do usuário (Grupo + Individual)
        await loadUserPermissions(currentUser.id, currentUser.grupoId);
        
        // 2. Se o usuário é Master, ele ganha acesso a todas as filiais
        if (masterUserPermission) {
            const todasFiliais = await supabaseRequest('filiais?select=nome&ativo=eq.true', 'GET', null, false);
            todasFiliais.forEach(f => userPermissions.push(`acesso_filial_${f.nome}`));
        }

        // 3. Carrega as filiais ativas e determina o acesso/redirecionamento
        await loadFiliais(); 

        showNotification(`Bem-vindo, ${currentUser.nome}!`, 'success');

    } catch (err) {
        let msg = 'Erro ao verificar credenciais. Verifique a conexão.';
        if (err.message.includes('401')) {
             msg = `Erro crítico (401). Verifique se a sua chave 'SUPABASE_ANON_KEY' está incorreta.`;
        }
        alertContainer.innerHTML = `<div class="alert alert-error">${msg}</div>`;
        console.error(err);
    }
}

// SUBSTITUIR A VERSÃO EXISTENTE DE showMainSystem
async function showMainSystem() {
    // Oculta todas as telas de seleção
    document.getElementById('initialAuthContainer').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'none';
    // Exibe a tela principal
    document.getElementById('mainSystem').style.display = 'flex';
    
    // 🚨 NOVO: Garante que a visibilidade do link 'Trocar Filial' seja checada no momento da exibição
    toggleFilialLinkVisibility();
}

// Função para permitir ao usuário trocar de filial
function trocarFilial() {
    selectedFilial = null;
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'block';
    loadFiliais();
}


// NOVO: Funções para CRUD de Grupos de Acesso
function showAddGroupForm(grupo = null) {
    const modal = document.getElementById('addFormModal');
    const title = document.getElementById('addFormTitle');
    const fieldsContainer = document.getElementById('addFormFields');
    fieldsContainer.innerHTML = '';
    
    title.textContent = grupo ? `Editar Grupo: ${grupo.nome}` : `Adicionar Novo Grupo`;
    
    // O campo 'grupo' é para salvar via handleSave.
    fieldsContainer.innerHTML = `
        ${grupo ? `<input type="hidden" id="edit_grupo_id" value="${grupo.id}">` : ''}
        <div class="form-group"><label>Nome do Grupo:</label><input type="text" id="add_nome" value="${grupo ? grupo.nome : ''}" required></div>
    `;
    
    modal.style.display = 'flex';
}

// NOVO: Função de salvar Grupo
async function saveGroup() {
    const isEdit = !!document.getElementById('edit_grupo_id');
    const grupoId = isEdit ? document.getElementById('edit_grupo_id').value : null;
    const nome = document.getElementById('add_nome').value;

    const data = { nome };
    
    if (isEdit) {
        await supabaseRequest(`grupos_acesso?id=eq.${grupoId}`, 'PATCH', data, false);
        showNotification('Grupo atualizado com sucesso!', 'success');
    } else {
        await supabaseRequest('grupos_acesso', 'POST', data, false);
        showNotification('Grupo cadastrado com sucesso!', 'success');
    }
    // Recarrega o array global de grupos e a tabela de configurações
    gruposAcesso = await supabaseRequest('grupos_acesso?order=nome', 'GET', null, false);
    renderAcessosConfig();
    return true;
}

// NOVAS FUNÇÕES: CRUD DE GRUPOS E GESTÃO DE PERMISSÕES
async function editGroup(grupoId) {
    try {
        const grupo = await supabaseRequest(`grupos_acesso?id=eq.${grupoId}`, 'GET', null, false);
        if (grupo && grupo.length > 0) {
            showAddGroupForm(grupo[0]);
        }
    } catch (error) { showNotification('Erro ao carregar grupo.', 'error'); }
}

async function deleteGroup(grupoId) {
    const confirmed = await showYesNoModal('Deseja excluir este grupo? Usuários ligados a ele ficarão sem grupo.');
    if (confirmed) {
        try {
            await supabaseRequest(`grupos_acesso?id=eq.${grupoId}`, 'DELETE', null, false);
            showNotification('Grupo excluído!', 'success');
            renderAcessosConfig();
        } catch (error) { showNotification(`Erro ao excluir grupo: ${error.message}`, 'error'); }
    }
}

function closePermissionsModal() {
    document.getElementById('permissionsModal').style.display = 'none';
}



// SUBSTITUIR A VERSÃO EXISTENTE DE managePermissionsModal
async function managePermissionsModal(targetId, targetName, targetType) {
    const modal = document.getElementById('permissionsModal');
    const title = document.getElementById('permissionsModalTitle');
    const subtitle = document.getElementById('permissionsModalSubtitle');
    const list = document.getElementById('permissionsList');

    document.getElementById('permissionsTargetId').value = targetId;
    document.getElementById('permissionsTargetType').value = targetType;
    title.textContent = `Gerenciar Permissões`;
    subtitle.textContent = targetType === 'grupo' ? `Configurando o Grupo: ${targetName}` : `Visualizando Permissões (Apenas Grupo): ${targetName}`;
    list.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando permissões...</div>`;
    modal.style.display = 'flex';

    try {
        // 1. Buscar todas as permissões base do sistema e filiais
        const allPermissionsBase = await supabaseRequest('permissoes_sistema?ativa=eq.true&order=categoria,nome', 'GET', null, false);
        const allFiliais = await supabaseRequest('filiais?ativo=eq.true&order=nome', 'GET', null, false);
        
        // 🚨 FIX CRÍTICO: ADICIONAR PERMISSÕES DE SUB-ABA MANUALMENTE 🚨
        let allPermissions = [...allPermissionsBase];
        
        // Mapeia todas as permissões de sub-aba do hardcoded map
        for (const viewId in subTabPermissionMap) {
            for (const subTabId in subTabPermissionMap[viewId]) {
                const code = subTabPermissionMap[viewId][subTabId];
                const name = subTabId.replace(/([A-Z])/g, ' $1').toLowerCase(); // Transforma 'faturamentoAtivo' em 'faturamento ativo'
                const viewNome = viewId.charAt(0).toUpperCase() + viewId.slice(1);
                
                // Cria um objeto no formato esperado pela renderização
                allPermissions.push({
                    codigo: code,
                    nome: `Visualizar ${name}`,
                    descricao: `Acesso à sub-aba ${name} na aba ${viewNome}`,
                    categoria: 'Sub-Aba' // Nova categoria para organização
                });
            }
        }
        
        // Classifica novamente a lista completa por categoria e nome
        allPermissions.sort((a, b) => {
            if (a.categoria !== b.categoria) {
                // Prioriza as categorias Filial e Sub-Aba no topo
                const order = { 'Acessos de Filial': 1, 'Sub-Aba': 2, 'Aba': 3, 'Ação': 4 };
                return (order[a.categoria] || 99) - (order[b.categoria] || 99);
            }
            return a.nome.localeCompare(b.nome);
        });
        
        // Fim do bloco de construção da lista mestra
        // ====================================================================

        let currentPermissions = [];
        let isReadOnly = targetType !== 'grupo'; 

        if (targetType === 'grupo') {
            const result = await supabaseRequest(`permissoes_grupo?grupo_id=eq.${targetId}&select=permissao`, 'GET', null, false);
            currentPermissions = result ? result.map(p => p.permissao) : [];
        } else {
            const userAccess = await supabaseRequest(`acessos?id=eq.${targetId}&select=grupo_id`, 'GET', null, false);
            const grupoId = userAccess[0]?.grupo_id;

            if (grupoId) {
                const result = await supabaseRequest(`permissoes_grupo?grupo_id=eq.${grupoId}&select=permissao`, 'GET', null, false);
                currentPermissions = result ? result.map(p => p.permissao) : [];
            }
        }

        let html = '';
        let currentCategory = '';
        
        const saveButton = document.querySelector('#permissionsModal .btn-success');
        if (saveButton) saveButton.style.display = isReadOnly ? 'none' : 'block';
        
        // ====================================================================
        // A) RENDERIZAR PERMISSÕES DE ACESSO À FILIAL
        // ====================================================================
        html += `<h4 class="font-bold text-lg text-gray-700 mt-4 mb-2 border-b pb-1">Acessos de Filial</h4>`;
        
        allFiliais.forEach(filial => {
            const permissionCode = `acesso_filial_${filial.nome}`;
            const permissao = { codigo: permissionCode, nome: `Filial ${filial.nome} (${filial.descricao})`, descricao: `Permissão de login na Filial ${filial.nome}` };
            const isChecked = currentPermissions.includes(permissao.codigo);
            const statusDisplay = isChecked ? '<span class="text-green-600 font-bold">PERMITIDO</span>' : '<span class="text-red-600 font-bold">NEGADO</span>';

            html += `
                <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                    <label class="flex items-center space-x-3 cursor-pointer">
                        <input type="checkbox" data-permission-code="${permissao.codigo}" class="h-5 w-5 rounded border-gray-300 text-blue-600" ${isChecked ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
                        <span class="text-sm font-medium text-gray-700">${permissao.nome}</span>
                        <span class="text-xs text-gray-500 ml-2" title="${permissao.descricao}">${permissao.descricao}</span>
                    </label>
                    <span class="text-xs text-gray-500">${isReadOnly ? statusDisplay : ''}</span>
                </div>
            `;
        });
        
        // ====================================================================
        // B) RENDERIZAR OUTRAS PERMISSÕES DO SISTEMA (ABAS, SUB-ABAS, AÇÕES)
        // ====================================================================

        allPermissions.forEach(p => {
            if (p.categoria !== currentCategory) {
                currentCategory = p.categoria;
                // Evita repetir a categoria "Acessos de Filial"
                if (currentCategory !== 'Acessos de Filial') {
                    html += `<h4 class="font-bold text-lg text-gray-700 mt-4 mb-2 border-b pb-1">${p.categoria}</h4>`;
                }
            }
            
            const isChecked = currentPermissions.includes(p.codigo);
            const statusDisplay = isChecked ? '<span class="text-green-600 font-bold">PERMITIDO</span>' : '<span class="text-red-600 font-bold">NEGADO</span>';

            html += `
                <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                    <label class="flex items-center space-x-3 cursor-pointer">
                        <input type="checkbox" data-permission-code="${p.codigo}" class="h-5 w-5 rounded border-gray-300 text-blue-600" ${isChecked ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
                        <span class="text-sm font-medium text-gray-700">${p.nome}</span>
                        <span class="text-xs text-gray-500 ml-2" title="${p.descricao}">${p.descricao}</span>
                    </label>
                    <span class="text-xs text-gray-500">${isReadOnly ? statusDisplay : ''}</span>
                </div>
            `;
        });

        list.innerHTML = html;
    } catch (error) {
        list.innerHTML = `<div class="alert alert-error">Erro ao carregar dados de permissão: ${error.message}</div>`;
        console.error(error);
    }
}

// SUBSTITUIR A VERSÃO EXISTENTE DE savePermissions
async function savePermissions() {
    const targetId = document.getElementById('permissionsTargetId').value;
    const targetType = document.getElementById('permissionsTargetType').value;
    const checkboxes = document.querySelectorAll('#permissionsList input[type="checkbox"]');
    const alert = document.getElementById('permissionsAlert');
    alert.innerHTML = '';
    
    // Apenas grupos podem ter permissões salvas. Usuários são apenas para visualização.
    if (targetType !== 'grupo') {
        showNotification('Permissões de usuário individual não são mais permitidas. Use apenas Grupos.', 'error');
        closePermissionsModal();
        return;
    }
    
    try {
        await saveGroupPermissions(targetId, checkboxes, alert);

        showNotification('Permissões salvas com sucesso!', 'success');
        closePermissionsModal();
    } catch (error) {
        alert.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
        console.error('Erro ao salvar permissões:', error);
    }
}



async function saveGroupPermissions(grupoId, checkboxes, alert) {
    const permissionsToSave = [];
    const permissionsToRemove = [];
    
    checkboxes.forEach(cb => {
        const code = cb.dataset.permissionCode;
        if (cb.checked) {
            permissionsToSave.push({ grupo_id: grupoId, permissao: code });
        } else {
            permissionsToRemove.push(code);
        }
    });

    // 1. Deletar permissões que foram desmarcadas
    if (permissionsToRemove.length > 0) {
        await supabaseRequest(`permissoes_grupo?grupo_id=eq.${grupoId}&permissao=in.(${permissionsToRemove.join(',')})`, 'DELETE', null, false);
    }

    // 2. Inserir/Atualizar permissões selecionadas usando Upsert em lote
    if (permissionsToSave.length > 0) {
        // 🚨 AJUSTE CRÍTICO: Força o UPSERT no 5º parâmetro (true) para evitar erro 409/duplicata de grupo 🚨
        await supabaseRequest('permissoes_grupo', 'POST', permissionsToSave, false, true);
    }
}
// NOVO: Função para renderizar as filiais permitidas na tela de seleção
function renderFiliaisSelection(allowedFiliais) {
    const grid = document.getElementById('filiaisGrid');
    grid.innerHTML = '';
    
    allowedFiliais.forEach(filial => {
        const card = document.createElement('div');
        card.className = 'filial-card';
        card.onclick = () => selectFilial(filial);
        card.innerHTML = `<h3>${filial.nome}</h3><p>${filial.descricao || 'Descrição não informada'}</p>`;
        grid.appendChild(card);
    });
}


// SUBSTITUIR A VERSÃO EXISTENTE DE filterNavigationMenu
function filterNavigationMenu() {
    const navItems = document.querySelectorAll('.nav-item');
    let firstPermittedViewId = null;

    navItems.forEach(item => {
        const href = item.getAttribute('href');
        
        // 🚨 FIX CRÍTICO: Garante que o item de navegação possui um href válido.
        if (!href || href.length <= 1) {
             item.style.display = 'none'; // Esconde o item inválido para segurança
             return;
        }
        
        const viewId = href.substring(1);
        const htmlPermission = item.dataset.permission; // Ex: 'acesso_faturamento'
        
        let isPermitted = true;

        if (htmlPermission) {
            // 1. Checa a permissão principal (incluindo o mapeamento 'view_')
            let isPrincipalPermitted = hasPermission(htmlPermission);
            
            if (!isPrincipalPermitted) {
                // Tenta checar a permissão mapeada do BD ('acesso_' -> 'view_')
                const mappedPermission = htmlPermission.replace('acesso_', 'view_');
                if (hasPermission(mappedPermission)) {
                    isPrincipalPermitted = true;
                }
            }
            
            isPermitted = isPrincipalPermitted;

            // 2. Se for uma aba com sub-abas, aplica o filtro de sub-abas (só se a principal já estiver OK)
            if (isPermitted && subTabViewIds.has(viewId)) {
                const permittedSubTabs = getPermittedSubTabs(viewId);
                if (permittedSubTabs.length === 0) {
                    // Requisito: Esconder aba principal se não houver sub-abas permitidas
                    isPermitted = false;
                }
            }
        } 
        
        if (!isPermitted) {
            item.style.display = 'none';
        } else {
            item.style.display = 'flex'; 
            if (!firstPermittedViewId) {
                firstPermittedViewId = viewId;
            }
        }
    });
    return firstPermittedViewId;
}

// NOVA FUNÇÃO: Filtra sub-abas após a injeção do HTML
function filterSubTabs() {
    const subTabItems = document.querySelectorAll('.sub-tab');

    subTabItems.forEach(item => {
        const htmlPermission = item.dataset.permission; 
        
        if (!htmlPermission) {
            // Se não houver data-permission, assume que deve aparecer (ex: botão de filtro, etc.)
            item.style.display = 'flex'; 
            return;
        }

        let isPermitted = false;
        
        // O valor do 'onclick' é o viewId (ex: 'faturamentoAtivo')
        const viewIdMatch = item.getAttribute('onclick').match(/'([^']*)','([^']*)'/);
        const subTabContentId = viewIdMatch ? viewIdMatch[2] : null; 

        // 1. Checa a permissão conforme está no HTML (Ex: 'acesso_faturamento_ativo')
        if (hasPermission(htmlPermission)) {
            isPermitted = true;
        } else {
            // 2. Mapeia o nome da permissão para o padrão 'view_' do BD e checa novamente
            const mappedPermission = htmlPermission.replace('acesso_', 'view_');
            if (hasPermission(mappedPermission)) {
                isPermitted = true;
            }
        }

        if (!isPermitted) {
            item.style.display = 'none';
            
            // Garante que o conteúdo da sub-aba também seja escondido se for a aba ativa
            if (subTabContentId) {
                const subTabContent = document.getElementById(subTabContentId);
                if (subTabContent) {
                    subTabContent.style.display = 'none';
                    subTabContent.classList.remove('active'); // Garante que não fique ativo
                }
            }
        } else {
            item.style.display = 'flex';
        }
    });
}

async function loadFaturamentoData(subTabName = 'faturamentoAtivo') {
    const container = document.getElementById('faturamentoList');
    if (!container) return;

    if (subTabName === 'faturamentoAtivo') {
         container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando expedições...</div>`;

        try {
            // AJUSTE CRÍTICO: Incluir 'em_carregamento' e 'carregado' (e o novo status)
            const expeditions = await supabaseRequest("expeditions?status=in.(em_carregamento,carregado,aguardando_faturamento,faturamento_iniciado,faturado,em_carregamento_faturando)&order=data_hora.asc");
            const items = await supabaseRequest('expedition_items');


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


// SUBSTITUIR A FUNÇÃO applyMotoristaStatusFilter COMPLETA
function applyMotoristaStatusFilter() {
    const filterValue = document.getElementById('motoristaStatusFilter').value;
    const allMotoristas = window.motoristasDataCache || [];
    
    let filteredList = allMotoristas;

    if (filterValue) {
        // Trata múltiplos status separados por vírgula (Ex: retornando_cd,retornando_com_imobilizado)
        const statuses = filterValue.split(',').map(s => s.trim());
        
        if (statuses.length > 0 && statuses[0]) {
            // Filtra motoristas cujos status estão na lista de filtros
            filteredList = allMotoristas.filter(m => statuses.includes(m.displayStatus));
        }
    }
    
    const listContainer = document.getElementById('motoristaListFiltered');
    if(listContainer) {
        listContainer.innerHTML = renderMotoristasListHtml(filteredList);
    }
    
    // Garante que os timers sejam reiniciados apenas para os motoristas visíveis
    filteredList.forEach(m => {
        if (m.activeExp && m.displayStatus === 'saiu_para_entrega') {
             startMotoristaTimer(m);
        }
    });
}

// NOVO CÓDIGO: Função auxiliar para iniciar o timer do motorista (extraída para limpeza)
function startMotoristaTimer(m) {
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



// NOVO: Função para abrir o modal de seleção de impressão
async function openImprimirIdentificacaoModal(expeditionId) {
    const modal = document.getElementById('printIdentificationModal');
    const lojaList = document.getElementById('printLojaList');
    
    document.getElementById('currentPrintExpeditionId').value = expeditionId;
    document.getElementById('printExpeditionIdDisplay').textContent = expeditionId;
    
    // Resetar o estado do modal
    document.getElementById('lojaSelectionContainer').style.display = 'none';
    const secondaryBtn = document.querySelector('#printIdentificationModal .btn-secondary');
    if (secondaryBtn) secondaryBtn.style.display = 'block';
    lojaList.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando lojas...</div>`;
    modal.style.display = 'flex';
    
    try {
        // Busca os itens da expedição e os dados das lojas associadas
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}&select=id,loja_id,pallets,rolltrainers,lojas(codigo,nome)`);
        
        if (!items || items.length === 0) {
            lojaList.innerHTML = '<div class="alert alert-info">Nenhum item encontrado para esta expedição.</div>';
            return;
        }

        let lojasHtml = '';
        items.forEach(item => {
            const totalItensLoja = (item.pallets || 0) + (item.rolltrainers || 0);
            lojasHtml += `
                <div class="flex justify-between items-center bg-white p-3 rounded-md shadow-sm">
                    <div class="text-left">
                        <strong class="text-gray-800">${item.lojas.codigo} - ${item.lojas.nome}</strong>
                        <div class="text-sm text-gray-500">${item.pallets}P + ${item.rolltrainers}R (${totalItensLoja} etiquetas)</div>
                    </div>
                    <button class="btn btn-success btn-small" onclick="handlePrintChoice('${item.loja_id}')">
                        🖨️ Imprimir Loja
                    </button>
                </div>
            `;
        });

        lojaList.innerHTML = lojasHtml;
        
    } catch (error) {
        lojaList.innerHTML = `<div class="alert alert-error">Erro ao carregar lojas: ${error.message}</div>`;
    }
}

function closePrintIdentificationModal() {
    document.getElementById('printIdentificationModal').style.display = 'none';
}

async function handlePrintChoice(lojaId) {
    const expeditionId = document.getElementById('currentPrintExpeditionId').value;
    
    // 1. Busca informações adicionais necessárias para a impressão
    const expeditionData = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=lider_id,numeros_carga`);
    const lider = expeditionData[0].lider_id ? lideres.find(l => l.id === expeditionData[0].lider_id) : { nome: 'N/A' };
    const numeroCarga = expeditionData[0].numeros_carga && expeditionData[0].numeros_carga.length > 0 ? expeditionData[0].numeros_carga[0] : 'N/A';

    closePrintIdentificationModal();
    
    // 2. Chama a função de impressão modificada (passando o ID da loja como filtro)
    imprimirIdentificacao(expeditionId, numeroCarga, lider.nome, lojaId);
}
// SUBSTITUIR A FUNÇÃO imprimirIdentificacao existente por esta versão corrigida:
async function imprimirIdentificacao(expeditionId, numeroCarga, liderNome, lojaId = null) {
    try {
        // 1. Busca os itens da expedição e as informações das lojas
        let endpoint = `expedition_items?expedition_id=eq.${expeditionId}`;
        
        // Aplica o filtro de loja, se fornecido
        if (lojaId) {
            endpoint += `&loja_id=eq.${lojaId}`;
        }
        
        const items = await supabaseRequest(endpoint);
        
        if (!items || items.length === 0) {
            showNotification(lojaId ? 'Nenhum item encontrado para esta loja.' : 'Nenhum item encontrado para esta expedição.', 'error');
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
        
        const filial = selectedFilial;
        
        // Para cada item/loja da expedição, gerar suas etiquetas separadamente
        for (const item of items) {
            const loja = lojas.find(l => l.id === item.loja_id);
            if (!loja) continue;
            
            const lojaInfo = `${loja.codigo} - ${loja.nome}`;
            // A quantidade total de etiquetas é a soma de Pallets e RollTrainers
            const totalItensLoja = (item.pallets || 0) + (item.rolltrainers || 0);
            
            // Criar etiquetas para esta loja específica
            for (let i = 1; i <= totalItensLoja; i++) {
                etiquetasHtml += `
                    <div class="etiqueta-page">
                        <div class="etiqueta-container">
                            <div class="etiqueta-quadro">
                                <div class="etiqueta-numero">${lojaInfo}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-data">${loja.endereco_completo || 'Endereço não informado'}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-contador">${String(i).padStart(2, '0')}/${String(totalItensLoja).padStart(2, '0')}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-lojas">Conferente: ${liderNome}</div>
                                <hr class="etiqueta-divider">
                                <div class="etiqueta-info">CD ${filial.nome} - ${filial.descricao}</div>
                                <div class="text-xs text-gray-500 mt-4">Carga: ${numeroCarga} | Expedição: ${expeditionId} | Data: ${dataFormatada}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        printDiv.innerHTML = etiquetasHtml;
        document.body.appendChild(printDiv);
        
        showNotification(lojaId ? `Preparando impressão para ${lojas.find(l => l.id === lojaId)?.nome || 'Loja'}.` : 'Preparando impressão de todas as etiquetas.', 'info');
        
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

// NOVA FUNÇÃO: Checa e controla a visibilidade do link "Trocar Filial"
function toggleFilialLinkVisibility() {
    const link = document.getElementById('trocarFilialLink');
    if (!link) return;

    // 1. Identifica todas as filiais permitidas para o usuário
    const allowedFiliais = filiais.filter(f => hasPermission(`acesso_filial_${f.nome}`));

    // 2. Torna o link visível se o usuário puder acessar mais de uma filial (SUA REGRA)
    if (allowedFiliais.length > 1) {
        link.style.display = 'flex'; // Torna visível (usando 'flex' para manter o layout do nav-item)
    } else {
        link.style.display = 'none'; // Esconde o link
    }
}

// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

// ... (Adicionar no final do arquivo)

// ========================================
// NOVAS FUNÇÕES DE CONTROLE (LOGOUT / REFRESH)
// ========================================

/**
 * Força a atualização de todos os dados da view ativa e recarrega selects.
 */
async function forceRefresh() {
    showNotification('Atualizando dados e selects...', 'info');
    
    // 1. Recarrega dados estáticos (Lojas, Veículos, etc.)
    await loadSelectData();

    // 2. Garante que a view atual seja recarregada
    const activeNavItem = document.querySelector('.nav-item.active');
    const activeViewId = activeNavItem ? activeNavItem.getAttribute('href').substring(1) : 'home';
    
    // Chamamos showView novamente para recarregar os dados da aba ativa
    // Passamos o elemento ativo para que o showView não mude o foco
    showView(activeViewId, activeNavItem); 
    
    showNotification('Dados atualizados com sucesso!', 'success');
}


/**
 * Desloga o usuário e volta para a tela de autenticação inicial.
 */
function logOut() {
    // 1. Limpa o estado global
    selectedFilial = null;
    currentUser = null;
    userPermissions = [];
    masterUserPermission = false;
    
    // 2. Limpa timers
    if (rastreioTimer) clearInterval(rastreioTimer);
    if (homeMapTimer) clearInterval(homeMapTimer);
    Object.values(activeTimers).forEach(clearInterval);
    activeTimers = {};
    
    // 3. Oculta telas do sistema
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'none';

    document.getElementById('chat-fab').style.display = 'none';
    // 4. Exibe a tela de login inicial
    document.getElementById('initialAuthContainer').style.display = 'flex';
    document.getElementById('initialLoginForm').reset();
    document.getElementById('initialLoginAlert').innerHTML = '';

    showNotification('Sessão encerrada.', 'info');
}

// Em script.js, SUBSTITUA todo o bloco de código do chat pelo código abaixo

// ========================================
// === LÓGICA DO CHAT DE COMUNICAÇÃO ======
// ========================================

// Variáveis globais do Chat
let chatIsOpen = false;
let allChatUsers = [];
let allChatGroups = [];
let currentChatChannelId = null;
let chatRealtimeSubscription = null;
let lastMessageTimestamp = new Date(0).toISOString(); // Inicia com uma data antiga

// Inicialização dos elementos do Chat
document.addEventListener('DOMContentLoaded', () => {
    const fab = document.getElementById('chat-fab');
    const closeBtn = document.getElementById('close-chat-btn');
    const sendBtn = document.getElementById('chat-send-btn');
    const messageInput = document.getElementById('chat-message-input');
    const newDmBtn = document.getElementById('new-dm-btn');
    const logoutChatBtn = document.getElementById('chat-logout');

    if (fab) fab.addEventListener('click', toggleChatWindow);
    if (closeBtn) closeBtn.addEventListener('click', toggleChatWindow);
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        // NOVO: Listener para menções
        messageInput.addEventListener('keyup', handleMentionInput);
    }
    if (newDmBtn) newDmBtn.addEventListener('click', openNewDmModal);
    if (logoutChatBtn) logoutChatBtn.addEventListener('click', logOut);
});

async function toggleChatWindow() {
    const chatWindow = document.getElementById('chat-window');
    chatIsOpen = !chatIsOpen;
    chatWindow.classList.toggle('open', chatIsOpen);

    if (chatIsOpen) {
        document.getElementById('chat-notification-dot').style.display = 'none';
        if (!currentChatChannelId) {
            await initializeChat();
        }
    }
    feather.replace();
}

async function initializeChat() {
    if (!currentUser) {
        showNotification("Faça login para usar o chat.", "error");
        return;
    }
    document.getElementById('chat-current-user-name').textContent = currentUser.nome;

    try {
        const [usersData, groupsData] = await Promise.all([
            supabaseRequest('acessos?select=id,nome', 'GET', null, false),
            supabaseRequest('grupos_acesso?select=id,nome', 'GET', null, false)
        ]);
        allChatUsers = usersData || [];
        allChatGroups = groupsData || [];
        
        // NOVO: Garante a existência do canal #geral
        await ensureGeneralChannelExists();
        
        await loadChatChannels();

        // Inicia a escuta de novas mensagens em todos os canais
        subscribeToAllMessages(); 
    } catch (error) {
        console.error("Erro ao inicializar o chat:", error);
        showNotification("Não foi possível carregar os dados do chat.", "error");
    }
}

// NOVO: Função para criar o canal #geral se ele não existir
async function ensureGeneralChannelExists() {
    try {
        const existingGeneral = await supabaseRequest(`chat_channels?name=eq.geral&is_direct_message=eq.false`, 'GET', null, false);
        if (existingGeneral && existingGeneral.length > 0) {
            console.log('Canal #geral já existe.');
            return;
        }

        console.log('Criando canal #geral...');
        const newChannel = await supabaseRequest('chat_channels', 'POST', { name: 'geral', is_direct_message: false }, false);
        const newChannelId = newChannel[0].id;

        const allUsers = await supabaseRequest('acessos?select=id', 'GET', null, false);
        const membersToAdd = allUsers.map(user => ({ channel_id: newChannelId, user_id: user.id }));

        if (membersToAdd.length > 0) {
            await supabaseRequest('channel_members', 'POST', membersToAdd, false);
        }
        showNotification('Canal #geral criado para a equipe!', 'success');

    } catch (error) {
        console.error('Erro ao verificar/criar canal #geral:', error);
    }
}

async function loadChatChannels() {
    const channelsList = document.getElementById('chat-channels-list');
    channelsList.innerHTML = '<div class="loading">Carregando...</div>';
    try {
        const channels = await supabaseRequest('chat_channels?order=last_message_at.desc', 'GET', null, false);
        channelsList.innerHTML = channels.map(channel => `
            <div class="channel-item" data-channel-id="${channel.id}" onclick="selectChannel('${channel.id}', '${channel.name}')">
                <span>${channel.is_direct_message ? '👤' : '#'}</span>
                ${channel.name}
            </div>
        `).join('');

        const generalChannel = channels.find(c => c.name === 'geral' && !c.is_direct_message);
        if (generalChannel && !currentChatChannelId) {
            selectChannel(generalChannel.id, generalChannel.name);
        }
    } catch (error) {
        channelsList.innerHTML = '<div class="alert alert-error">Erro ao carregar canais.</div>';
    }
}

async function selectChannel(channelId, channelName) {
    currentChatChannelId = channelId;
    document.getElementById('chat-channel-name').textContent = channelName;
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.toggle('active', item.dataset.channelId === channelId);
    });

    await loadMessagesForChannel(channelId);
}

async function loadMessagesForChannel(channelId) {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div class="loading">Carregando mensagens...</div>';
    try {
        const messages = await supabaseRequest(`chat_messages?channel_id=eq.${channelId}&select=*,acessos(nome)&order=created_at.asc`, 'GET', null, false);
        renderMessages(messages, false);
        if (messages.length > 0) {
            const latestTimestamp = messages[messages.length - 1].created_at;
            if (new Date(latestTimestamp) > new Date(lastMessageTimestamp)) {
                lastMessageTimestamp = latestTimestamp;
            }
        }
    } catch (error) {
        messagesContainer.innerHTML = '<div class="alert alert-error">Erro ao carregar mensagens.</div>';
    }
}

function renderMessages(messages, append = false) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!append) messagesContainer.innerHTML = '';
    
    messages.forEach(msg => {
        const isCurrentUser = msg.user_id === currentUser.id;
        const senderName = msg.acessos ? msg.acessos.nome : 'Sistema';
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isCurrentUser ? 'current-user' : ''} ${msg.message_type === 'system' ? 'system' : ''}`;
        messageDiv.innerHTML = `
            <div class="chat-message-content">
                ${!isCurrentUser && msg.message_type !== 'system' ? `<div class="chat-message-header">${senderName}</div>` : ''}
                <div class="chat-message-text">${formatMessageContent(msg.content)}</div>
                <div class="chat-message-time">${new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatMessageContent(content) {
    const escapedContent = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escapedContent.replace(/@\[(.*?)\]\((.*?)\)/g, '<span class="mention">@$1</span>');
}

async function sendMessage() {
    const input = document.getElementById('chat-message-input');
    let content = input.value.trim();
    if (!content || !currentChatChannelId) return;

    if (content.startsWith('/')) {
        await handleChatCommand(content);
        input.value = '';
        return;
    }
    
    const messageData = {
        channel_id: currentChatChannelId,
        user_id: currentUser.id,
        content: content
    };

    try {
        await supabaseRequest('chat_messages', 'POST', messageData, false);
        input.value = '';
    } catch (error) {
        showNotification("Erro ao enviar mensagem.", "error");
    }
}

async function handleChatCommand(command) {
    let systemMessage = '';
    if (command === '/cargas') {
        const expeditions = await supabaseRequest('expeditions?status=not.eq.entregue&order=data_hora.desc');
        systemMessage = '**Resumo de Cargas Ativas:**\n\n';
        if (!expeditions || expeditions.length === 0) {
            systemMessage += 'Nenhuma expedição ativa no momento.';
        } else {
            expeditions.forEach(exp => {
                const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                systemMessage += `- **Placa:** ${veiculo?.placa || 'N/A'} | **Status:** ${getStatusLabel(exp.status)}\n`;
            });
        }
    } else if (command === '/frota') {
        const disponiveis = motoristas.filter(m => m.status === 'disponivel').length;
        const emViagem = motoristas.filter(m => ['em_viagem', 'saiu_para_entrega'].includes(m.status)).length;
        const retornando = motoristas.filter(m => ['retornando_cd', 'retornando_com_imobilizado'].includes(m.status)).length;
        systemMessage = `**Status da Frota (Motoristas):**\n- ✅ Disponíveis: ${disponiveis}\n- 🚚 Em Viagem: ${emViagem}\n- ↩️ Retornando: ${retornando}`;
    } else {
        systemMessage = `Comando desconhecido: "${command}"`;
    }

    const messageData = {
        channel_id: currentChatChannelId,
        user_id: currentUser.id,
        content: systemMessage,
        message_type: 'system'
    };
    await supabaseRequest('chat_messages', 'POST', messageData, false);
}

// CORREÇÃO: Escuta global de mensagens com encodeURIComponent
function subscribeToAllMessages() {
    if (chatRealtimeSubscription) {
        chatRealtimeSubscription.unsubscribe();
        chatRealtimeSubscription = null;
    }

    console.log("(Simulação) Escuta global de mensagens iniciada.");
    
    chatRealtimeSubscription = {
        interval: setInterval(async () => {
            if (!currentUser) return;

            // *** CORREÇÃO APLICADA AQUI ***
            const encodedTimestamp = encodeURIComponent(lastMessageTimestamp);
            
            const newMessages = await supabaseRequest(
                `chat_messages?created_at=gt.${encodedTimestamp}&select=*,acessos(nome)`, 
                'GET', null, false
            );

            if (newMessages && newMessages.length > 0) {
                lastMessageTimestamp = newMessages[newMessages.length - 1].created_at;

                const incomingMessages = newMessages.filter(msg => msg.user_id !== currentUser.id);
                const myMessages = newMessages.filter(msg => msg.user_id === currentUser.id);

                if (currentChatChannelId && myMessages.some(m => m.channel_id === currentChatChannelId)) {
                    renderMessages(myMessages.filter(m => m.channel_id === currentChatChannelId), true);
                }

                if (incomingMessages.length > 0) {
                    if (currentChatChannelId && incomingMessages.some(m => m.channel_id === currentChatChannelId)) {
                        renderMessages(incomingMessages.filter(m => m.channel_id === currentChatChannelId), true);
                    }

                    if (!chatIsOpen) {
                        document.getElementById('chat-notification-dot').style.display = 'block';
                        const lastIncoming = incomingMessages[incomingMessages.length - 1];
                        const senderName = lastIncoming.acessos ? lastIncoming.acessos.nome : 'Usuário';
                        const snippet = lastIncoming.content.length > 40 ? lastIncoming.content.substring(0, 40) + '...' : lastIncoming.content;
                        showNotification(`<strong>${senderName}:</strong> ${snippet}`, 'info');
                    }
                }
            }
        }, 5000),
        unsubscribe: function() { clearInterval(this.interval); }
    };
}

// --- NOVO: Funções para Menções ---
function handleMentionInput(e) {
    const input = e.target;
    const suggestionsBox = document.getElementById('mention-suggestions');
    const text = input.value;
    const cursorPos = input.selectionStart;
    const atMatch = text.substring(0, cursorPos).match(/@(\w*)$/);

    if (atMatch) {
        const query = atMatch[1].toLowerCase();
        const filteredUsers = allChatUsers.filter(u => u.nome.toLowerCase().includes(query) && u.id !== currentUser.id);
        
        if (filteredUsers.length > 0) {
            suggestionsBox.innerHTML = filteredUsers.map(u => 
                `<div class="mention-item" onclick="selectMention('${u.nome}', 'user:${u.id}')">${u.nome}</div>`
            ).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function selectMention(name, id) {
    const input = document.getElementById('chat-message-input');
    const suggestionsBox = document.getElementById('mention-suggestions');
    const text = input.value;
    const cursorPos = input.selectionStart;
    
    const textBefore = text.substring(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);

    if (atMatch) {
        const startIndex = atMatch.index;
        const mentionText = `@[${name}](${id}) `;
        
        input.value = text.substring(0, startIndex) + mentionText + text.substring(cursorPos);
        
        input.focus();
        const newCursorPos = startIndex + mentionText.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
    }
    
    suggestionsBox.style.display = 'none';
}

// --- Funções para Mensagens Diretas (DM) ---
function openNewDmModal() {
    const select = document.getElementById('dmUserSelect');
    select.innerHTML = '<option value="">Selecione...</option>';
    allChatUsers.forEach(user => {
        if (user.id !== currentUser.id) {
            select.innerHTML += `<option value="${user.id}">${user.nome}</option>`;
        }
    });
    document.getElementById('newDmModal').style.display = 'flex';
}

function closeNewDmModal() {
    document.getElementById('newDmModal').style.display = 'none';
}

async function startDirectMessage() {
    const selectedUserId = document.getElementById('dmUserSelect').value;
    if (!selectedUserId) return;
    const selectedUser = allChatUsers.find(u => u.id == selectedUserId);
    if (!selectedUser) return;

    try {
        const channelName = `DM: ${currentUser.nome} & ${selectedUser.nome}`;
        const newChannel = await supabaseRequest('chat_channels', 'POST', { name: channelName, is_direct_message: true }, false);
        const newChannelId = newChannel[0].id;
        
        await supabaseRequest('channel_members', 'POST', [
            { channel_id: newChannelId, user_id: currentUser.id },
            { channel_id: newChannelId, user_id: selectedUserId }
        ], false);

        showNotification(`Conversa com ${selectedUser.nome} iniciada!`, 'success');
        closeNewDmModal();
        await loadChatChannels();
        selectChannel(newChannelId, channelName);
    } catch(error) {
        showNotification("Erro ao criar conversa.", "error");
    }
}
