const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'script.js');
let content = fs.readFileSync(scriptPath, 'utf8');
const lines = content.split('\n');

// The lines we want to extract: 5071 to 7336 (inclusive, 1-based, so index 5070 to 7335)
const startIndex = 5070;
const endIndex = 7335;

const extractedLines = lines.slice(startIndex, endIndex + 1);

// Keep the rest
const newScriptLines = [...lines.slice(0, startIndex), ...lines.slice(endIndex + 1)];

fs.writeFileSync(scriptPath, newScriptLines.join('\n'), 'utf8');

// Prepare configuracoes.js
const header = import { supabaseRequest } from '../api.js';
import { getState, setState } from '../state.js';
import { loadUserPermissions } from '../auth.js';
import { getStatusLabel, getPermittedSubTabs, showSubTab, showNotification, showYesNoModal } from '../utils.js';

// Temporarily map globals to window
const { veiculos, motoristas, lojas, docas, lideres, gruposAcesso } = window;
let currentUser = window.currentUser || null;
let selectedFilial = window.selectedFilial || null;
let pontosInteresse = window.pontosInteresse || [];
let masterUserPermission = window.masterUserPermission || false;
let rastreioData = window.rastreioData || [];

;

const footer = 

// Expor tudo para global
const funcsToExpose = ['loadConfiguracoes', 'checkPassword', 'showAlert', 'showAddForm', 'hideAddForm', 
'handleSave', 'saveFilial', 'saveLoja', 'saveDoca', 'saveLider', 'saveVeiculo', 'saveMotorista', 'saveAcesso', 
'renderVeiculosConfig', 'editVeiculo', 'deleteVeiculo', 'editMotorista', 'deleteMotorista', 'renderMotoristasConfig', 
'updateSystemStatus', 'showLocationMap', 'showAllVehiclesMap', 'initAllVehiclesAndLojasMap', 'initMap', 
'initAllVehiclesMap', 'closeMapModal', 'showTrajectoryMap', 'initTrajectoryMap', 'calculateTripStats', 'loadPontosInteresse', 
'renderPontosInteresseTable', 'showAddPontoInteresse', 'getCurrentLocation', 'savePontoInteresse', 'addPontosInteresseToMap', 
'showPontosInteresseMap', 'initPontosInteresseMap', 'checkProximityToPontosInteresse', 'calculateDistance', 'editPontoInteresse', 
'deletePontoInteresse', 'showLojasConfig', 'renderLojasConfig', 'editFilial', 'deleteFilial', 'editDoca', 'deleteDoca', 
'editLider', 'deleteLider', 'editAcesso', 'deleteAcesso', 'editLoja', 'deleteLoja', 'showLojaMap', 'initSingleLojaMap', 
'geocodeAddress', 'showAllLojasMap', 'initAllLojasMap', 'calculateRouteToLoja', 'geocodeAddressFilial', 'getCurrentLocationFilial', 
'getRouteFromAPI', 'getMapMatchedRoute', 'getDragAfterElement', 'openOrdemCarregamentoModal', 'closeOrdemCarregamentoModal', 
'saveOrdemCarregamento', 'renderFiliaisConfig', 'renderDocasConfig', 'renderLideresConfig', 'renderPontosInteresseConfig', 
'renderAcessosConfig', 'managePermissionsModal', 'deleteGroup'];

funcsToExpose.forEach(f => {
    if (typeof eval(f) === 'function') {
        window[f] = eval(f);
    }
});

// Atualizar referências locais no window
setInterval(() => {
    window.currentUser = currentUser;
    window.pontosInteresse = pontosInteresse;
}, 1000);
;

const configPath = path.join(__dirname, 'js', 'modules', 'configuracoes.js');
fs.writeFileSync(configPath, header + extractedLines.join('\n') + footer, 'utf8');

console.log('Extração concluída com sucesso!');
