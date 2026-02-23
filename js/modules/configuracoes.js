import { supabaseRequest } from '../api.js';
import { getState, setState } from '../state.js';
import { loadUserPermissions } from '../auth.js';
import { getStatusLabel, getPermittedSubTabs, showSubTab, showNotification, showYesNoModal } from '../utils.js';

const getGlobal = (key) => typeof window !== 'undefined' ? window[key] : getState()[key];

Object.defineProperty(window, 'currentUser', { get: () => getGlobal('currentUser'), set: (v) => window.currentUser = v });
Object.defineProperty(window, 'pontosInteresse', { get: () => getGlobal('pontosInteresse'), set: (v) => window.pontosInteresse = v });

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

// Expor funções para global
window.loadConfiguracoes = loadConfiguracoes;
window.checkPassword = checkPassword;
window.showAlert = showAlert;
window.showAddForm = showAddForm;
window.hideAddForm = hideAddForm;
window.handleSave = handleSave;
window.saveFilial = saveFilial;
window.saveLoja = saveLoja;
window.saveDoca = saveDoca;
window.saveLider = saveLider;
window.saveVeiculo = saveVeiculo;
window.saveMotorista = saveMotorista;
window.saveAcesso = saveAcesso;
window.renderVeiculosConfig = renderVeiculosConfig;
window.editVeiculo = editVeiculo;
window.deleteVeiculo = deleteVeiculo;
window.editMotorista = editMotorista;
window.deleteMotorista = deleteMotorista;
window.renderMotoristasConfig = renderMotoristasConfig;
window.updateSystemStatus = updateSystemStatus;
window.showLocationMap = showLocationMap;
window.showAllVehiclesMap = showAllVehiclesMap;
window.initAllVehiclesAndLojasMap = initAllVehiclesAndLojasMap;
window.initMap = initMap;
window.initAllVehiclesMap = initAllVehiclesMap;
window.closeMapModal = closeMapModal;
window.showTrajectoryMap = typeof showTrajectoryMap !== 'undefined' ? showTrajectoryMap : null;
window.initTrajectoryMap = typeof initTrajectoryMap !== 'undefined' ? initTrajectoryMap : null;
window.calculateTripStats = typeof calculateTripStats !== 'undefined' ? calculateTripStats : null;
window.loadPontosInteresse = loadPontosInteresse;
window.renderPontosInteresseTable = renderPontosInteresseTable;
window.showAddPontoInteresse = showAddPontoInteresse;
window.getCurrentLocation = getCurrentLocation;
window.savePontoInteresse = savePontoInteresse;
window.addPontosInteresseToMap = typeof addPontosInteresseToMap !== 'undefined' ? addPontosInteresseToMap : null;
window.showPontosInteresseMap = typeof showPontosInteresseMap !== 'undefined' ? showPontosInteresseMap : null;
window.initPontosInteresseMap = typeof initPontosInteresseMap !== 'undefined' ? initPontosInteresseMap : null;
window.checkProximityToPontosInteresse = typeof checkProximityToPontosInteresse !== 'undefined' ? checkProximityToPontosInteresse : null;
window.calculateDistance = typeof calculateDistance !== 'undefined' ? calculateDistance : null;
window.editPontoInteresse = typeof editPontoInteresse !== 'undefined' ? editPontoInteresse : null;
window.deletePontoInteresse = typeof deletePontoInteresse !== 'undefined' ? deletePontoInteresse : null;
window.showLojasConfig = typeof showLojasConfig !== 'undefined' ? showLojasConfig : null;
window.renderLojasConfig = typeof renderLojasConfig !== 'undefined' ? renderLojasConfig : null;
window.editFilial = typeof editFilial !== 'undefined' ? editFilial : null;
window.deleteFilial = typeof deleteFilial !== 'undefined' ? deleteFilial : null;
window.editDoca = typeof editDoca !== 'undefined' ? editDoca : null;
window.deleteDoca = typeof deleteDoca !== 'undefined' ? deleteDoca : null;
window.editLider = typeof editLider !== 'undefined' ? editLider : null;
window.deleteLider = typeof deleteLider !== 'undefined' ? deleteLider : null;
window.editAcesso = typeof editAcesso !== 'undefined' ? editAcesso : null;
window.deleteAcesso = typeof deleteAcesso !== 'undefined' ? deleteAcesso : null;
window.editLoja = typeof editLoja !== 'undefined' ? editLoja : null;
window.deleteLoja = typeof deleteLoja !== 'undefined' ? deleteLoja : null;
window.showLojaMap = typeof showLojaMap !== 'undefined' ? showLojaMap : null;
window.initSingleLojaMap = typeof initSingleLojaMap !== 'undefined' ? initSingleLojaMap : null;
window.geocodeAddress = typeof geocodeAddress !== 'undefined' ? geocodeAddress : null;
window.showAllLojasMap = typeof showAllLojasMap !== 'undefined' ? showAllLojasMap : null;
window.initAllLojasMap = typeof initAllLojasMap !== 'undefined' ? initAllLojasMap : null;
window.calculateRouteToLoja = typeof calculateRouteToLoja !== 'undefined' ? calculateRouteToLoja : null;
window.geocodeAddressFilial = typeof geocodeAddressFilial !== 'undefined' ? geocodeAddressFilial : null;
window.getCurrentLocationFilial = typeof getCurrentLocationFilial !== 'undefined' ? getCurrentLocationFilial : null;
window.getRouteFromAPI = typeof getRouteFromAPI !== 'undefined' ? getRouteFromAPI : null;
window.getMapMatchedRoute = typeof getMapMatchedRoute !== 'undefined' ? getMapMatchedRoute : null;
window.getDragAfterElement = typeof getDragAfterElement !== 'undefined' ? getDragAfterElement : null;
window.openOrdemCarregamentoModal = openOrdemCarregamentoModal;
window.closeOrdemCarregamentoModal = closeOrdemCarregamentoModal;
window.saveOrdemCarregamento = saveOrdemCarregamento;
window.renderFiliaisConfig = renderFiliaisConfig;
window.renderDocasConfig = renderDocasConfig;
window.renderLideresConfig = renderLideresConfig;
window.renderPontosInteresseConfig = renderPontosInteresseConfig;
window.renderAcessosConfig = renderAcessosConfig;
