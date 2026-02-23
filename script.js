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
let allIdentificacaoExpeditions = []; // Guarda a lista completa para o filtro

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


// SUBSTITUIR A FUNÇÃO selectFilial COMPLETA
// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/script.js

// SUBSTITUIR A FUNÇÃO selectFilial COMPLETA (ADICIONANDO A CHAMADA NO FINAL)
async function selectFilial(filial) {
    // Verificar permissão para a filial
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
        
        // NOVO AJUSTE: Se a aba principal for carregada, mas todas as sub-abas forem filtradas,
        // garantimos que o conteúdo da aba principal (que agora é o container de sub-abas)
        // ainda mostre alguma mensagem se necessário.
        
        showView(firstPermittedViewId, firstNavItem);
        
        // Configura o refresh automático da Home (se for a primeira aba permitida)
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

    <div class="filters-section mb-4">
        <div class="form-group">
            <label for="identificacaoLojaFilter">Filtrar por Loja:</label>
            <select id="identificacaoLojaFilter" onchange="applyIdentificacaoFilter()">
                <option value="">Todas as Lojas</option>
                </select>
        </div>
    </div>
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
        <th>Data/Hora</th><th>Lojas/Cargas</th><th>Pallets</th><th>Rolls</th><th>Doca</th> <th>Status</th><th>Veículo</th><th>Ocupação</th><th>Motorista</th><th>Tempos</th><th>Ações</th>
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



async function openImprimirIdentificacaoModal(expeditionId) {
    const modal = document.getElementById('printIdentificationModal');
    const lojaList = document.getElementById('printLojaList');

    document.getElementById('currentPrintExpeditionId').value = expeditionId;
    document.getElementById('printExpeditionIdDisplay').textContent = expeditionId;

    // Resetar o estado do modal (ANTES de exibir)
    document.getElementById('lojaSelectionContainer').style.display = 'none';
    const secondaryBtn = document.querySelector('#printIdentificationModal .btn-secondary');
    if (secondaryBtn) secondaryBtn.style.display = 'block';
    lojaList.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando lojas...</div>`;
    // modal.style.display = 'flex'; // <-- NÃO exibir o modal ainda

    try {
        // Busca os itens da expedição e os dados das lojas associadas
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}&select=id,loja_id,pallets,rolltrainers,lojas(codigo,nome)`);

        if (!items || items.length === 0) {
            // Se não houver itens, apenas mostra notificação e não abre modal
            showNotification('Nenhum item encontrado para esta expedição.', 'error');
            closePrintIdentificationModal(); // Garante que o modal feche se estiver aberto por algum motivo
            return;
        }

        // ***** NOVO: LÓGICA PARA IMPRESSÃO DIRETA *****
        if (items.length === 1) {
            // Apenas uma loja, imprime diretamente
            showNotification('Apenas uma loja. Imprimindo diretamente...', 'info', 2000);
            handlePrintChoice(items[0].loja_id); // Chama a função de impressão com o ID da única loja
            return; // Sai da função para não mostrar o modal
        }
        // ***** FIM DA NOVA LÓGICA *****

        // Se chegou aqui, há mais de uma loja, então mostra o modal
        modal.style.display = 'flex'; // <-- Exibe o modal AGORA

        // Popula a lista de lojas (código existente)
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
         // Se der erro ao buscar, mostra no local da lista e fecha o modal se precisar
        lojaList.innerHTML = `<div class="alert alert-error">Erro ao carregar lojas: ${error.message}</div>`;
         // Se o modal já estiver visível por algum motivo, esconde
         if (modal.style.display === 'flex') {
             // Pode adicionar um botão para fechar ou fechar automaticamente
             setTimeout(closePrintIdentificationModal, 3000);
         }
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
                                <div class="text-xs text-gray-500 mt-4">
                                    ${numeroCarga !== 'N/A' ? `Carga: ${numeroCarga} | ` : ''}Data: ${dataFormatada}
                                </div>
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

    // 4. Exibe a tela de login inicial
    document.getElementById('initialAuthContainer').style.display = 'flex';
    document.getElementById('initialLoginForm').reset();
    document.getElementById('initialLoginAlert').innerHTML = '';

    showNotification('Sessão encerrada.', 'info');
}

