import { supabaseRequest } from '../api.js';
import { getState } from '../state.js';
import { showNotification } from '../ui.js';
import { minutesToHHMM } from '../utils.js';

const getGlobal = (key) => typeof window !== 'undefined' ? window[key] : getState()[key];

let homeMapInstance = null;
let homeMapTimer = null;

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
            barThickness: 35 // ?? Tamanho fixo das barras
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
                enabled: true, // ?? Habilita apenas o tooltip padrão
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
            html: '<div style="background: #0077B6; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">?? CD</div>',
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
                    html: `<div style="background: ${cor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">?? ${loja.codigo}</div>`,
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
            html: '<div style="background: #0077B6; color: white; padding: 8px 16px; border-radius: 10px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">?? CD</div>',
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
                    html: `<div style="background: ${cor}; color: white; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">?? ${loja.codigo}</div>`,
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

    

window.loadHomeData = loadHomeData;
window.initHomeMap = typeof initHomeMap !== 'undefined' ? initHomeMap : null;
window.toggleHomeAutoRefresh = typeof toggleHomeAutoRefresh !== 'undefined' ? toggleHomeAutoRefresh : null;
window.showHomeMapFullscreen = typeof showHomeMapFullscreen !== 'undefined' ? showHomeMapFullscreen : null;
