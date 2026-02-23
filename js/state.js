// Variáveis de estado global (migradas do script.js)

export const state = {
    lojas: [],
    docas: [],
    lideres: [],
    veiculos: [],
    motoristas: [],
    filiais: [],
    selectedFilial: null,
    userId: null,
    userName: null,
    userPermissions: [],
    masterUserPermission: false,
    gruposAcesso: [],
    allIdentificacaoExpeditions: []
};

// Métodos para atualizar o estado
export const setState = (key, value) => {
    if (Object.prototype.hasOwnProperty.call(state, key)) {
        state[key] = value;
    } else {
        console.warn(`Tentativa de atualizar chave de estado inexistente: ${key}`);
    }
};

export const getState = (key) => {
    return state[key];
};
