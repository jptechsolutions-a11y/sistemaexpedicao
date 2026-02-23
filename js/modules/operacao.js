import { getState, setState } from '../state.js';
import { supabaseRequest } from '../api.js';
import { showNotification } from '../ui.js';
import { getStatusLabel, minutesToHHMM } from '../utils.js';

let modalState = { action: null, scannedValue: null, mainId: null, secondaryId: null, expectedCode: null };
let html5QrCodeScanner = null;
let scannerIsRunning = false;
let allIdentificacaoExpeditions = [];

export async function openQrModal(action, mainId, code, secondaryId = null) {
    modalState = { action, mainId, secondaryId, expectedCode: code, scannedValue: null };
    const modal = document.getElementById('qrModal');
    document.getElementById('qrModalTitle').textContent = `Escanear QR Code`;
    document.getElementById('qrModalMessage').textContent = `Aponte a câmera para o QR Code do local (código: ${code}).`;
    modal.style.display = 'flex';

    if (html5QrCodeScanner) await stopScannerSafely();
    // Verifica se Html5Qrcode está disponível publicamente
    if (typeof Html5Qrcode !== 'undefined') {
        html5QrCodeScanner = new Html5Qrcode("qr-reader");
        try {
            await html5QrCodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, () => { });
            scannerIsRunning = true;
        } catch (err) {
            document.getElementById('qr-reader').innerHTML = '<p class="text-red-500">Erro ao iniciar câmera. Use a inserção manual.</p>';
            document.getElementById('manualInputContainer').style.display = 'block';
        }
    } else {
        document.getElementById('qr-reader').innerHTML = '<p class="text-red-500">Biblioteca de QR Code não carregada.</p>';
        document.getElementById('manualInputContainer').style.display = 'block';
    }
}

export function onScanSuccess(decodedText) {
    if (modalState.scannedValue !== decodedText) {
        modalState.scannedValue = decodedText;
        document.getElementById('scannedValue').textContent = decodedText;
        document.getElementById('qr-result-display').style.display = 'block';
        document.getElementById('confirmQrBtn').disabled = false;
        stopScannerSafely();
    }
}

export async function stopScannerSafely() {
    if (html5QrCodeScanner && scannerIsRunning) {
        try { await html5QrCodeScanner.stop(); } catch (e) { }
        scannerIsRunning = false;
    }
}

export function closeQrModal() {
    stopScannerSafely();
    document.getElementById('qrModal').style.display = 'none';
}

export async function handleQrScan() {
    let value = modalState.scannedValue || document.getElementById('qrCodeInput').value.trim();
    if (value.toLowerCase() !== modalState.expectedCode.toLowerCase()) {
        showNotification(`QR Code incorreto! Esperado: "${modalState.expectedCode}"`, 'error');
        return;
    }
    closeQrModal();
    switch (modalState.action) {
        case 'iniciar': if (window.startLoading) await window.startLoading(modalState.mainId); break;
        case 'finalizar': await finishLoading(modalState.mainId); break;
        case 'iniciar_descarga': await iniciarDescarga(modalState.mainId); break;
        case 'finalizar_descarga': await finalizarDescarga(modalState.mainId); break;
    }
}

export async function finishLoading(expeditionId) {
    try {
        const [currentExp] = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=status`);
        if (!currentExp) {
            throw new Error('Expedição não encontrada.');
        }

        const updateData = {
            data_saida_veiculo: new Date().toISOString()
        };

        if (currentExp.status === 'faturado') {
            // Permanece faturado
        } else {
            updateData.status = 'carregado';
        }

        await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', updateData);
        showNotification('Carregamento finalizado com sucesso!', 'success');

        if (document.getElementById('motoristas').classList.contains('active') && window.consultarExpedicoesPorPlaca) {
            window.consultarExpedicoesPorPlaca();
        } else if (document.getElementById('acompanhamento').classList.contains('active') && window.loadAcompanhamento) {
            window.loadAcompanhamento();
        } else if (document.getElementById('faturamento').classList.contains('active') && window.loadFaturamento) {
            window.loadFaturamento();
        }

    } catch (error) {
        showNotification('Erro ao finalizar carregamento: ' + error.message, 'error');
    }
}

export async function iniciarDescarga(itemId) {
    try {
        await supabaseRequest(`expedition_items?id=eq.${itemId}`, 'PATCH', { status_descarga: 'em_descarga', data_inicio_descarga: new Date().toISOString() });
        showNotification('Descarga iniciada!', 'success');
        if (window.consultarExpedicoesPorPlaca) window.consultarExpedicoesPorPlaca();
    } catch (error) {
        showNotification('Erro ao iniciar descarga: ' + error.message, 'error');
    }
}

export async function finalizarDescarga(itemId) {
    try {
        await supabaseRequest(`expedition_items?id=eq.${itemId}`, 'PATCH', { status_descarga: 'descarregado', data_fim_descarga: new Date().toISOString() });

        const itemData = await supabaseRequest(`expedition_items?id=eq.${itemId}&select=expedition_id`);
        const expeditionId = itemData[0].expedition_id;
        const allItems = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`);

        if (allItems.every(item => item.status_descarga === 'descarregado')) {
            await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'PATCH', { status: 'entregue' });
            let comImobilizado = false;
            if (window.showYesNoModal) comImobilizado = await window.showYesNoModal('Retornando com imobilizados?');
            const novoStatus = comImobilizado ? 'retornando_com_imobilizado' : 'retornando_cd';

            const expDetails = await supabaseRequest(`expeditions?id=eq.${expeditionId}&select=motorista_id,veiculo_id`);
            const motoristaId = expDetails[0].motorista_id;
            const veiculoId = expDetails[0].veiculo_id;

            if (motoristaId) {
                await supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: novoStatus }, false);
            }
            if (veiculoId) {
                await supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: novoStatus }, false);
            }

            showNotification(`Última entrega finalizada! Viagem concluída.`, 'success');
        } else {
            showNotification('Descarga da loja finalizada!', 'success');
        }
        if (window.consultarExpedicoesPorPlaca) window.consultarExpedicoesPorPlaca();
    } catch (error) {
        showNotification('Erro ao finalizar descarga: ' + error.message, 'error');
    }
}

export async function loadOperacao() {
    const permittedOperacaoTabs = window.getPermittedSubTabs ? window.getPermittedSubTabs('operacao') : ['lancamento'];
    if (permittedOperacaoTabs.length > 0) {
        const initialSubTab = permittedOperacaoTabs.length === 1 ? permittedOperacaoTabs[0] : 'lancamento';
        const initialElement = document.querySelector(`#operacao .sub-tabs button[onclick*="'${initialSubTab}'"]`);
        if (window.showSubTab) window.showSubTab('operacao', initialSubTab, initialElement);
    }
}

export async function loadIdentificacaoExpedicoes() {
    const container = document.getElementById('expedicoesParaIdentificacao');
    const filterSelect = document.getElementById('identificacaoLojaFilter');
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando expedições...</div>`;
    filterSelect.length = 1;

    try {
        const expeditions = await supabaseRequest("expeditions?status=in.(aguardando_agrupamento,aguardando_veiculo,em_carregamento,carregado,aguardando_faturamento,faturamento_iniciado,faturado)&order=data_hora.desc");
        const items = await supabaseRequest('expedition_items');

        if (!expeditions || expeditions.length === 0) {
            container.innerHTML = '<div class="alert alert-success">Nenhuma expedição aguardando identificação!</div>';
            allIdentificacaoExpeditions = [];
            return;
        }

        const lideres = getState('lideres') || [];
        const veiculos = getState('veiculos') || [];
        const motoristas = getState('motoristas') || [];
        const lojas = getState('lojas') || [];

        allIdentificacaoExpeditions = expeditions.map(exp => {
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
        }).filter(exp => exp.items.length > 0);

        const uniqueLojas = {};
        allIdentificacaoExpeditions.forEach(exp => {
            exp.items.forEach(item => {
                const loja = lojas.find(l => l.id === item.loja_id);
                if (loja && !uniqueLojas[loja.id]) {
                    uniqueLojas[loja.id] = `${loja.codigo} - ${loja.nome}`;
                }
            });
        });

        const sortedLojas = Object.entries(uniqueLojas).sort(([, nameA], [, nameB]) => nameA.localeCompare(nameB));

        sortedLojas.forEach(([id, name]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            filterSelect.appendChild(option);
        });

        if (lojas.length === 0 && window.loadSelectData) {
            await window.loadSelectData();
        }

        applyIdentificacaoFilter();

    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Erro ao carregar expedições: ${error.message}</div>`;
        allIdentificacaoExpeditions = [];
    }
}

export function applyIdentificacaoFilter() {
    const selectedLojaId = document.getElementById('identificacaoLojaFilter')?.value;
    let filteredData = allIdentificacaoExpeditions;

    if (selectedLojaId) {
        filteredData = allIdentificacaoExpeditions.filter(exp =>
            exp.items.some(item => item.loja_id === selectedLojaId)
        );
    }

    renderIdentificacaoExpedicoes(filteredData);
}

export function renderIdentificacaoExpedicoes(expeditionsToRender) {
    const container = document.getElementById('expedicoesParaIdentificacao');

    if (!expeditionsToRender || expeditionsToRender.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhuma expedição encontrada para o filtro selecionado.</div>';
        return;
    }

    const lojas = getState('lojas') || [];

    container.innerHTML = expeditionsToRender.map(exp => {
        const totalItens = exp.total_pallets + exp.total_rolltrainers;
        const lojasInfo = exp.items.map(item => {
            const loja = lojas.find(l => l.id === item.loja_id);
            return loja ? `${loja.codigo} (${item.pallets || 0}P/${item.rolltrainers || 0}R)` : 'N/A';
        }).join(', ');

        return `
            <div class="identificacao-card">
                <div class="flex justify-between items-start mb-4">
                    <div>
                       
                        <h3 class="text-lg font-bold text-gray-800">Identificação de Expedição</h3>
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
                    <button class="btn btn-primary" onclick="window.openImprimirIdentificacaoModal('${exp.id}')">
                        🖨️ Imprimir Identificação (${totalItens} etiquetas)
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export async function imprimirIdentificacao(expeditionId, numeroCarga, liderNome, lojaId = null) {
    try {
        let endpoint = `expedition_items?expedition_id=eq.${expeditionId}`;
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

        const existingPrintDiv = document.getElementById('printIdentificationDiv');
        if (existingPrintDiv) existingPrintDiv.remove();

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
                        line-height: 1.1 !important;
                        letter-spacing: 3px !important;
                        text-transform: uppercase !important;
                    }

                    .etiqueta-data {
                        font-size: 60px !important;
                        font-weight: 700 !important;
                        color: #000 !important;
                        line-height: 1 !important;
                        letter-spacing: 3px !important;
                    }

                    .etiqueta-contador {
                        font-size: 110px !important;
                        font-weight: 900 !important;
                        color: #000 !important;
                        border: 3px solid #999 !important;
                        padding: 25px 50px !important;
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
                        line-height: 1.2 !important;
                        text-align: center !important;
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
                    #printIdentificationDiv { display: none; }
                }
            </style>
        `;

        const filial = getState('selectedFilial') || {};
        const lojas = getState('lojas') || [];

        for (const item of items) {
            const loja = lojas.find(l => l.id === item.loja_id);
            if (!loja) continue;

            const lojaInfo = `${loja.codigo} - ${loja.nome}`;
            const totalItensLoja = (item.pallets || 0) + (item.rolltrainers || 0);

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
                                <div class="etiqueta-info">CD ${filial.nome || ''} - ${filial.descricao || ''}</div>
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

        setTimeout(() => {
            window.print();
            setTimeout(() => {
                const pd = document.getElementById('printIdentificationDiv');
                if (pd) pd.remove();
            }, 2000);
        }, 500);

    } catch (error) {
        showNotification('Erro ao carregar dados para impressão: ' + error.message, 'error');
    }
}

// Attach to window 
window.openQrModal = openQrModal;
window.closeQrModal = closeQrModal;
window.handleQrScan = handleQrScan;
window.finishLoading = finishLoading;
window.iniciarDescarga = iniciarDescarga;
window.finalizarDescarga = finalizarDescarga;
window.loadOperacao = loadOperacao;
window.loadIdentificacaoExpedicoes = loadIdentificacaoExpedicoes;
window.applyIdentificacaoFilter = applyIdentificacaoFilter;
window.imprimirIdentificacao = imprimirIdentificacao;
