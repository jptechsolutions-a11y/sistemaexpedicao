/**
 * Formata minutos para o formato HH:MM
 */
export function minutesToHHMM(minutes) {
    if (minutes === null || isNaN(minutes) || minutes < 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Retorna o label amigável para um status de expedição
 */
export function getStatusLabel(status) {
    const labels = {
        'aguardando_veiculo': 'Aguardando Veículo',
        'transito_para_doca': 'Trânsito para Doca',
        'em_carregamento': 'Em Carregamento',
        'carregado': 'Carregado',
        'faturamento_iniciado': 'Faturando',
        'faturado': 'Faturado',
        'faturamento_concluido': 'Faturamento Concluído',
        'em_conferencia': 'Em Conferência',
        'liberado_viagem': 'Liberado para Viagem',
        'em_viagem': 'Em Viagem',
        'saiu_para_entrega': 'Saiu para Entrega',
        'entregue': 'Entregue',
        'cancelado': 'Cancelado',
        'retornando_cd': 'Retornando ao CD',
        'retornando_com_imobilizado': 'Retornando c/ Imobilizado',
        'descarregando_imobilizado': 'Descarregando Imobilizado',
        'em_carregamento_faturando': 'Carregando/Faturando'
    };
    return labels[status] || (status ? status.replace(/_/g, ' ') : '-');
}

/**
 * Formata data ISO para BR locale com hora
 */
export function formatarDataHora(dataString) {
    if (!dataString) return '-';
    try {
        const data = new Date(dataString);
        return data.toLocaleString('pt-BR');
    } catch {
        return dataString;
    }
}

/**
 * Função global showSubTab
 */
export function showSubTab(abaId, subTabId, element) {
    document.querySelectorAll('#' + abaId + ' .sub-tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });

    document.querySelectorAll('#' + abaId + ' .sub-tabs button').forEach(btn => btn.classList.remove('active'));

    if (element) element.classList.add('active');

    const activeContent = document.getElementById(subTabId);
    if (activeContent) {
        activeContent.style.display = 'block';
        setTimeout(() => activeContent.classList.add('active'), 10);
    }

    if (subTabId === 'faturamentoAtivo' && window.loadFaturamentoData) {
        window.loadFaturamentoData(subTabId);
    } else if (subTabId === 'identificacao' && window.loadIdentificacaoExpedicoes) {
        window.loadIdentificacaoExpedicoes();
    } else if (subTabId === 'historicoFaturamento' && window.loadHistoricoFaturamento) {
        window.loadHistoricoFaturamento();
    }
}

/**
 * Retorna as sub-abas permitidas
 */
export function getPermittedSubTabs(viewId) {
    const subTabsMap = {
        'faturamento': ['faturamentoAtivo', 'historicoFaturamento'],
        'operacao': ['lancamento', 'identificacao']
    };
    
    if (!subTabsMap[viewId]) return [];
    
    // Simplificando o filtro real de permissões que estava aqui
    return subTabsMap[viewId];
}
