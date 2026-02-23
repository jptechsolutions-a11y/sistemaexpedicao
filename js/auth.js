import { getState, setState } from './state.js';
import { supabaseRequest } from './api.js';

/**
 * Carrega as permissões do usuário a partir do banco de dados (Supabase).
 */
export async function loadUserPermissions(userId, grupoId) {
    setState('masterUserPermission', false);
    let masterUserPermission = false;
    let finalPermissionsSet = new Set();

    // 1. CHECAGEM DE GRUPO E CARREGAMENTO DE PERMISSÕES
    if (grupoId) {
        try {
            // O último 'false' garante que o filtro de filial NÃO seja aplicado
            const [grupo, permissoesGrupo] = await Promise.all([
                supabaseRequest(`grupos_acesso?id=eq.${grupoId}&select=nome`, 'GET', null, false),
                supabaseRequest(`permissoes_grupo?grupo_id=eq.${grupoId}&select=permissao`, 'GET', null, false)
            ]);

            console.log("Permissões do Grupo lidas do BD (Bruto):", permissoesGrupo);

            // MASTER BYPASS
            if (grupo && grupo.length > 0 && grupo[0].nome === 'MASTER') {
                masterUserPermission = true;
                setState('masterUserPermission', true);

                let userPermissions = ['gerenciar_permissoes', 'acesso_configuracoes', 'acesso_configuracoes_acessos', 'acesso_home'];
                const todasFiliais = await supabaseRequest('filiais?select=nome&ativo=eq.true', 'GET', null, false);
                todasFiliais.forEach(f => userPermissions.push(`acesso_filial_${f.nome}`));

                setState('userPermissions', userPermissions);
                return;
            }

            // CARREGA PERMISSÕES NORMAIS
            if (permissoesGrupo && Array.isArray(permissoesGrupo)) {
                permissoesGrupo.forEach(p => finalPermissionsSet.add(p.permissao.trim().toLowerCase()));
            }
        } catch (e) {
            console.error("ERRO CRÍTICO: Falha ao carregar permissoes_grupo ou grupo_acesso.", e);
        }
    }

    if (!masterUserPermission) {
        finalPermissionsSet.add('acesso_home');
    }

    // 2. IMPLICAR PERMISSÕES PAI
    const explicitPermissions = Array.from(finalPermissionsSet);
    explicitPermissions.forEach(p => {
        const parts = p.split('_');
        if (parts.length > 2 && parts[0] === 'acesso') {
            finalPermissionsSet.add(`${parts[0]}_${parts[1]}`);
        }
    });

    // 3. Checagem do Master por Permissão
    if (finalPermissionsSet.has('gerenciar_permissoes')) {
        setState('masterUserPermission', true);
        try {
            const todasFiliais = await supabaseRequest('filiais?select=nome&ativo=eq.true', 'GET', null, false);
            todasFiliais.forEach(f => finalPermissionsSet.add(`acesso_filial_${f.nome}`));
        } catch (e) {
            console.error("ERRO MASTER: Falha ao adicionar filiais.", e);
        }
    }

    const userPermissions = Array.from(finalPermissionsSet);
    setState('userPermissions', userPermissions);

    console.log("Permissões FINAIS (Saneadas e Implícitas):", userPermissions);
}

/**
 * Verifica se o usuário atual tem a permissão solicitada.
 */
export function hasPermission(permission) {
    if (getState('masterUserPermission')) {
        return true;
    }

    const requiredPermission = permission.trim().toLowerCase();
    const userPermissions = getState('userPermissions') || [];

    return userPermissions.includes(requiredPermission);
}
