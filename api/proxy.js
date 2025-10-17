// jptechsolutions-a11y/sistemaexpedicao/sistemaexpedicao-TESTES/api/proxy.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

export default async (req, res) => {
    const { endpoint, upsert } = req.query; 

    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({ error: 'Configuração do Supabase ausente. Verifique as variáveis de ambiente.' });
    }

    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint');
    
    // ✅ CORREÇÃO: Remove o parâmetro 'upsert' para não ser enviado ao Supabase
    searchParams.delete('upsert');

    const tablesWithoutFilial = [
        'expedition_items', 'acessos', 'grupos_acesso', 'permissoes_grupo', 
        'permissoes_sistema', 'gps_tracking', 'veiculos_status_historico', 'pontos_interesse'
    ];
    
    if (req.method !== 'GET' && tablesWithoutFilial.includes(endpoint)) {
        searchParams.delete('filial');
        searchParams.delete('nome_filial');
    }

    const fullUrl = `${url}?${searchParams.toString()}`;

    const options = {
        method: req.method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Prefer': req.headers.prefer || 'return=representation'
        },
    };

    if (req.body && ['POST', 'PATCH', 'PUT'].includes(req.method)) {
        let bodyContent = req.body;
        const tablesWithTriggerFilial = ['expedition_items'];
        
        if (typeof bodyContent === 'string') {
            try { bodyContent = JSON.parse(bodyContent); } catch (e) {}
        }
        
        if (tablesWithTriggerFilial.includes(endpoint) && typeof bodyContent === 'object') {
            if (Array.isArray(bodyContent)) {
                bodyContent = bodyContent.map(item => {
                    const cleanItem = {...item};
                    delete cleanItem.filial;
                    delete cleanItem.nome_filial;
                    return cleanItem;
                });
            } else {
                delete bodyContent.filial;
                delete bodyContent.nome_filial;
            }
        }
        
        options.body = typeof bodyContent === 'string' ? bodyContent : JSON.stringify(bodyContent);
    }
    
    // ✅ LÓGICA MANTIDA: Usa o 'upsert' da query original para definir o header
    if (req.method === 'POST' && upsert === 'true') {
        options.headers.Prefer = 'return=representation,resolution=merge-duplicates';
    }

    try {
        console.log('Proxy request to:', fullUrl);
        const response = await fetch(fullUrl, options);
        const responseBody = await response.text(); 
        
        if (!response.ok) {
            console.error('Supabase error:', response.status, responseBody);
            let errorJson;
            try { errorJson = JSON.parse(responseBody); } 
            catch (e) { return res.status(response.status).json({ error: responseBody || 'Erro desconhecido do Supabase' }); }
            return res.status(response.status).json(errorJson);
        }
        
        if (responseBody) {
            return res.status(response.status).json(JSON.parse(responseBody));
        } else {
            return res.status(response.status).end();
        }
        
    } catch (error) {
        console.error('Erro ao proxear requisição:', error);
        res.status(500).json({ error: 'Falha ao comunicar com o Supabase', details: error.message });
    }
};
