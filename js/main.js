import { getState, setState } from './state.js';
window.setState = setState;
import { loadUserPermissions, hasPermission } from './auth.js';
window.loadUserPermissions = loadUserPermissions;
window.hasPermission = hasPermission;
import { supabaseRequest } from './api.js';
import { showNotification } from './ui.js';

// VariÃ¡veis para timers e instÃ¢ncias globais necessÃ¡rias que ainda nÃ£o forÃ£o migradas
window.activeTimers = {};
window.rastreioTimer = null;
window.homeMapTimer = null;

import * as faturamentoModule from './modules/faturamento.js';
import * as motoristasModule from './modules/motoristas.js';
import * as operacaoModule from './modules/operacao.js';
import * as historicoModule from './modules/historico.js';
import * as acompanhamentoModule from './modules/acompanhamento.js';
import * as configuracoesModule from './modules/configuracoes.js';
import * as homeModule from './modules/home.js';
import { showSubTab, getPermittedSubTabs } from './utils.js';

window.showSubTab = showSubTab;
window.getPermittedSubTabs = getPermittedSubTabs;
window.loadFaturamentoData = faturamentoModule.loadFaturamentoData || faturamentoModule.loadFaturamento;
window.loadIdentificacaoExpedicoes = operacaoModule.loadIdentificacaoExpedicoes;
window.loadPontosInteresse = configuracoesModule.loadPontosInteresse;
window.loadHistoricoFaturamento = faturamentoModule.loadHistoricoFaturamento;
window.checkPassword = configuracoesModule.checkPassword;

// Anexando transporte e home
import * as transporteModule from './modules/transporte.js';
window.loadTransportList = transporteModule.loadTransportList;
window.lancarCarga = transporteModule.lancarCarga;
window.agruparEAlocar = transporteModule.agruparEAlocar;
window.atualizarResumoAgrupamento = transporteModule.atualizarResumoAgrupamento;

// FunÃ§Ã£o para exibir a View correta
window.showView = function (viewId, element) {
    if (!element) return;

    const permission = element.dataset.permission;

    let checkPermission = permission;
    if (permission && permission.startsWith('acesso_')) {
        checkPermission = permission;
    } else if (permission) {
        const mappedPermission = permission.replace('acesso_', 'view_');
        if (!hasPermission(permission) && hasPermission(mappedPermission)) {
            checkPermission = mappedPermission;
        } else {
            checkPermission = permission;
        }
    }

    if (checkPermission && !hasPermission(checkPermission)) {
        const alternativePermission = checkPermission.startsWith('acesso_') ?
            checkPermission.replace('acesso_', 'view_') :
            checkPermission;

        if (checkPermission !== alternativePermission && hasPermission(alternativePermission)) {
            // Pass Permitido
        } else {
            showNotification('Você não tem permissão para acessar esta aba.', 'error');
            return;
        }
    }

    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));

    const viewElement = document.getElementById(viewId);
    if (viewElement) viewElement.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');

    Object.values(window.activeTimers).forEach(clearInterval);
    window.activeTimers = {};

    if (window.rastreioTimer) {
        clearInterval(window.rastreioTimer);
        window.rastreioTimer = null;
    }

    if (window.homeMapTimer) {
        clearInterval(window.homeMapTimer);
        window.homeMapTimer = null;
    }

    // Carregamento Lazy - Aqui futuramente chamaremos import()'s
    switch (viewId) {
        case 'home':
            if (homeModule.loadHomeData) homeModule.loadHomeData();
            break;
        case 'transporte':
            if (transporteModule.loadTransportList) transporteModule.loadTransportList();
            break;
        case 'faturamento':
            if (faturamentoModule.loadFaturamento) faturamentoModule.loadFaturamento();
            break;
        case 'motoristas':
            if (motoristasModule.loadMotoristaTab) motoristasModule.loadMotoristaTab();
            break;
        case 'acompanhamento':
            if (acompanhamentoModule.loadAcompanhamento) acompanhamentoModule.loadAcompanhamento();
            break;
        case 'historico':
            if (historicoModule.loadHistorico) historicoModule.loadHistorico();
            break;
        case 'configuracoes':
            if (configuracoesModule.loadConfiguracoes) configuracoesModule.loadConfiguracoes();
            break;
        case 'operacao':
            if (operacaoModule.loadOperacao) operacaoModule.loadOperacao();
            break;
    }

    if (window.feather) window.feather.replace();
};

window.trocarFilial = function () {
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'block';
    // Oculta mapas se existirem
    const mapEl = document.getElementById('map');
    const homeMapEl = document.getElementById('homeMapFullscreenDialog');
    if (mapEl) mapEl.style.display = 'none';
    if (homeMapEl) homeMapEl.style.display = 'none';
};

window.forceRefresh = function () {
    const activeView = document.querySelector('.view-content.active');
    if (activeView) {
        showNotification('Atualizando dados...', 'info', 1500);
        showView(activeView.id, document.querySelector(`.nav-item[href="#${activeView.id}"]`));
    }
};

window.logOut = function () {
    setState('selectedFilial', null);
    setState('userId', null);
    setState('userName', null);
    setState('userPermissions', []);
    setState('masterUserPermission', false);

    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'none';
    document.getElementById('initialAuthContainer').style.display = 'block';

    const loginForm = document.getElementById('initialLoginForm');
    if (loginForm) loginForm.reset();

    localStorage.removeItem('jp_expedicao_user');

    Object.values(window.activeTimers).forEach(clearInterval);
};

// Bootstrap - InicializaÃ§Ã£o da aplicaÃ§Ã£o
document.addEventListener('DOMContentLoaded', () => {
    // Registra Feather Icons se existir
    if (window.feather) window.feather.replace();

    // Configura listeners de login usando o UI
    const loginForm = document.getElementById('initialLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // TODO: Migrar a lÃ³gica brutal de auth aqui... (simulaÃ§Ã£o no prÃ³ximo step)
            console.log('Login mock disparado para migraÃ§Ã£o na prÃ³xima fase.');
        });
    }
});

