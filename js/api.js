import { getState } from './state.js';
import { showNotification } from './ui.js';

// supabaseRequest migration
export async function supabaseRequest(endpoint, method = 'GET', data = null, includeFilialFilter = true, upsert = false) {
    const SUPABASE_PROXY_URL = window.SUPABASE_PROXY_URL || '/api/proxy';

    // Separa o endpoint base dos filtros existentes
    const [nomeEndpointBase, filtrosExistentes] = endpoint.split('?', 2);

    // Constrói a URL começando com o proxy e o endpoint base
    let url = `${SUPABASE_PROXY_URL}?endpoint=${nomeEndpointBase}`;

    if (method === 'POST' && upsert) {
        url += '&upsert=true';
    }

    // Adiciona filtros existentes se houver
    if (filtrosExistentes) {
        url += `&${filtrosExistentes}`;
    }

    const tablesWithoutFilialField = [
        'acessos', 'grupos_acesso', 'permissoes_grupo', 'permissoes_sistema',
        'gps_tracking', 'veiculos_status_historico', 'pontos_interesse', 'filiais'
    ];

    const tablesWithTriggerFilial = ['expedition_items'];

    const selectedFilial = getState('selectedFilial');

    // FILTRO DE FILIAL EM GET (LEITURA)
    if (includeFilialFilter && selectedFilial && method === 'GET' &&
        !tablesWithoutFilialField.includes(nomeEndpointBase) &&
        !tablesWithTriggerFilial.includes(nomeEndpointBase)) {
        url += `&filial=eq.${selectedFilial.nome}`;
    }

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    // PROCESSAMENTO DO PAYLOAD
    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        let payload = data;

        // Para expedition_items, NUNCA envia o campo filial (o trigger cuida)
        if (nomeEndpointBase === 'expedition_items') {
            if (Array.isArray(payload)) {
                payload = payload.map(item => {
                    const cleanItem = { ...item };
                    delete cleanItem.filial;
                    delete cleanItem.nome_filial;
                    return cleanItem;
                });
            } else {
                payload = { ...payload };
                delete payload.filial;
                delete payload.nome_filial;
            }
        }
        // Para outras tabelas que precisam de filial, injeta o valor
        else if (includeFilialFilter && selectedFilial &&
            !tablesWithoutFilialField.includes(nomeEndpointBase) &&
            !tablesWithTriggerFilial.includes(nomeEndpointBase)) {
            if (Array.isArray(data)) {
                payload = data.map(item => ({
                    ...item, filial: selectedFilial.nome
                }));
            } else {
                payload = {
                    ...data, filial: selectedFilial.nome
                };
            }
        }

        options.body = JSON.stringify(payload);
        console.log(`[supabaseRequest] Payload sendo enviado para ${nomeEndpointBase}:`, payload);
    }

    if (method === 'PATCH' || method === 'POST') {
        options.headers.Prefer = 'return=representation';
    }

    if (method === 'POST' && upsert) {
        options.headers.Prefer = 'return=representation,resolution=merge-duplicates';
    }

    try {
        console.log(`[supabaseRequest] ${method} ${url}`);

        const response = await fetch(url, options);

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Erro ${response.status}: ${errorText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (response.status === 400) {
                    if (errorJson.message && errorJson.message.includes("Tentativa de inserir campo 'filial'")) {
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
            } catch (e) { }
            throw new Error(errorMessage);
        }

        const contentType = response.headers.get('content-type');
        if (method === 'DELETE' || response.status === 204 || !contentType?.includes('application/json')) {
            return null;
        }

        try {
            const responseData = await response.json();
            return responseData;
        } catch (jsonError) {
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
