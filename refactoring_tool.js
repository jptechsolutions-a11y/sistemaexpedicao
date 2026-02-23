const fs = require('fs');

const scriptContent = fs.readFileSync('script.js', 'utf8');
const lines = scriptContent.split('\n');

function extractLines(start, end) {
    return lines.slice(start - 1, end).join('\n');
}

let faturamentoCode = extractLines(2637, 2972) + '\n\n' + extractLines(9255, 9291);

const imports = `import { getState, setState } from '../state.js';
import { supabaseRequest } from '../api.js';
import { showNotification } from '../ui.js';
import { getStatusLabel, minutesToHHMM } from '../utils.js';

// Variáveis globais mapeadas para o estado
const getLojas = () => getState('lojas') || [];
const getVeiculos = () => getState('veiculos') || [];
const getMotoristas = () => getState('motoristas') || [];

`;

// Substituições básicas para garantir que as variáveis usem getState
faturamentoCode = faturamentoCode.replace(/\blojas\b/g, 'getLojas()');
faturamentoCode = faturamentoCode.replace(/\bveiculos\b/g, 'getVeiculos()');
faturamentoCode = faturamentoCode.replace(/\bmotoristas\b/g, 'getMotoristas()');
// Corrige caso tenha substituído obj.lojas para obj.getLojas() - mitigação simples
faturamentoCode = faturamentoCode.replace(/\.getLojas\(\)/g, '.lojas');
faturamentoCode = faturamentoCode.replace(/\.getVeiculos\(\)/g, '.veiculos');
faturamentoCode = faturamentoCode.replace(/\.getMotoristas\(\)/g, '.motoristas');

// Substituir showSubTab para o call global e showDetalhesExpedicao
// Já que ainda não extraímos tudo
// Exportar as funções
faturamentoCode = faturamentoCode.replace(/async function load/g, 'export async function load');
faturamentoCode = faturamentoCode.replace(/function render/g, 'export function render');
faturamentoCode = faturamentoCode.replace(/function update/g, 'export function update');
faturamentoCode = faturamentoCode.replace(/async function iniciar/g, 'export async function iniciar');
faturamentoCode = faturamentoCode.replace(/async function finalizar/g, 'export async function finalizar');
faturamentoCode = faturamentoCode.replace(/async function marcarSaiu/g, 'export async function marcarSaiu');

const finalCode = imports + faturamentoCode;
fs.writeFileSync('js/modules/faturamento.js', finalCode);
console.log('faturamento.js gerado com sucesso!');
