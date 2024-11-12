const axios = require('axios');
const sql = require('mssql');
const moment = require('moment');

// Configuração da conexão com o SQL Server
const config = {
    user: 'sa',                  // Usuário do SQL Server
    password: 'Galaxyy123.',      // Senha do SQL Server
    server: 'localhost',          // Servidor (localhost na VPS)
    database: 'PedidosPlatinum',  // Nome do banco de dados
    options: {
        encrypt: false,           // Desativado, já que não estamos usando SSL localmente
        enableArithAbort: true
    }
};

// Configurações da API Platinum Kids
const username = 'AganciaToff';
const password = 'b92a1b5ba71db20fc82a0ce75ff994ce8e1ff434';
const encodedAuthString = Buffer.from(`${username}:${password}`).toString('base64');
const url = 'https://api.platinumkids.com.br/loja/v1/pedido';

let ultimaBusca = moment().startOf('month'); // Inicialmente, busca desde o início do mês

// Função para conectar ao banco de dados
async function connectToDatabase() {
    try {
        await sql.connect(config);
        console.log('Conexão com o SQL Server estabelecida com sucesso.');
    } catch (err) {
        console.error('Erro ao conectar ao SQL Server:', err);
    }
}

// Função para buscar pedidos com retry e backoff exponencial
async function fetchPedidosComRetry(params, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Basic ${encodedAuthString}`,
                    'Accept-Encoding': 'gzip'
                },
                params: params
            });
            return response.data.data;
        } catch (error) {
            if (i === retries - 1) {
                console.error('Falha na requisição após múltiplas tentativas:', error);
                throw error;
            }
            console.warn(`Erro na tentativa ${i + 1}, esperando para tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i))); // Exponential backoff
        }
    }
}

// Função para buscar pedidos incrementais desde a última execução
async function fetchNovosPedidos() {
    let pedidos = [];
    let page = 1;
    let hasMore = true;

    const params = {
        dataHoraInicio: ultimaBusca.toISOString(),
        dataHoraFim: moment().toISOString(),
        limite: 100,
        origem: 1,
    };

    while (hasMore) {
        params.pagina = page;
        const novosPedidos = await fetchPedidosComRetry(params);
        pedidos = pedidos.concat(novosPedidos);
        page++;
        hasMore = page <= novosPedidos.pagina_total; // Verifica se há mais páginas

        if (pedidos.length >= 1000) { // Limita a quantidade de dados por vez
            break;
        }
    }

    ultimaBusca = moment(); // Atualiza o timestamp da última busca
    return pedidos;
}

// Função para inserir ou atualizar pedidos no banco de dados
async function inserirOuAtualizarPedidos(pedidos) {
    for (const pedido of pedidos) {
        try {
            // Converte a data para o formato correto antes de inserir
            const dataHoraFormatada = moment(pedido.dataHora).format('YYYY-MM-DDTHH:mm:ss');

            await sql.query`
                MERGE Pedidos AS target
                USING (VALUES (
                    ${pedido.id}, ${dataHoraFormatada}, ${pedido.cliente.nome},
                    ${pedido.valorTotal}, ${pedido.cliente.cpfCnpj}, ${pedido.codigo},
                    ${pedido.valorProduto}, ${pedido.valorFrete}, ${pedido.valorDesconto},
                    ${pedido.cliente.id}, ${pedido.formaPagamento}, ${pedido.condicaoPagamento},
                    ${pedido.situacaoNome}, ${pedido.loja.id}
                )) AS source (id, dataHora, nomeCliente, valorTotal, cpfCnpj, codigo, valorProduto, valorFrete, valorDesconto, clienteId, formaPagamento, condicaoPagamento, situacao, lojaId)
                ON (target.id = source.id)
                WHEN MATCHED THEN
                    UPDATE SET 
                        dataHora = CONVERT(datetime, source.dataHora, 126),
                        nomeCliente = source.nomeCliente, 
                        valorTotal = source.valorTotal, 
                        cpfCnpj = source.cpfCnpj, 
                        codigo = source.codigo, 
                        valorProduto = source.valorProduto, 
                        valorFrete = source.valorFrete, 
                        valorDesconto = source.valorDesconto, 
                        clienteId = source.clienteId, 
                        formaPagamento = source.formaPagamento, 
                        condicaoPagamento = source.condicaoPagamento, 
                        situacao = source.situacao, 
                        lojaId = source.lojaId
                WHEN NOT MATCHED THEN
                    INSERT (id, dataHora, nomeCliente, valorTotal, cpfCnpj, codigo, valorProduto, valorFrete, valorDesconto, clienteId, formaPagamento, condicaoPagamento, situacao, lojaId)
                    VALUES (source.id, CONVERT(datetime, source.dataHora, 126), source.nomeCliente, source.valorTotal, source.cpfCnpj, source.codigo, source.valorProduto, source.valorFrete, source.valorDesconto, source.clienteId, source.formaPagamento, source.condicaoPagamento, source.situacao, source.lojaId);
            `;
        } catch (error) {
            console.error('Erro ao inserir/atualizar pedido:', error);
        }
    }
}

// Função principal para buscar e atualizar pedidos
async function executar() {
    console.log('Iniciando busca por novos pedidos...');
    try {
        const pedidos = await fetchNovosPedidos();
        
        // Adicionando log para verificar os dados recebidos
        console.log(`Pedidos recebidos: ${JSON.stringify(pedidos, null, 2)}`);

        if (pedidos.length > 0) {
            await inserirOuAtualizarPedidos(pedidos);
            console.log(`${pedidos.length} pedidos inseridos/atualizados com sucesso.`);
        } else {
            console.log('Nenhum pedido novo encontrado.');
        }
    } catch (error) {
        console.error('Erro durante a execução:', error);
    }
}

// Iniciar o processo
connectToDatabase().then(() => {
    executar(); // Executa imediatamente
    setInterval(executar, 1800000); // Executa a cada 30 minutos
});
