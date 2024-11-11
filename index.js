const axios = require('axios');
const sql = require('mssql');
const moment = require('moment');

// Configuração da conexão com o SQL Server
const config = {
    user: 'sa',                  // Usuário do SQL Server
    password: 'Galaxyy123.',       // Senha do SQL Server
    server: 'localhost',         // Servidor (localhost na VPS)
    database: 'PedidosPlatinum', // Nome do banco de dados
    options: {
        encrypt: false,          // Desativado, já que não estamos usando SSL localmente
        enableArithAbort: true
    }
};

// 1. Configurações da API Platinum Kids
const username = 'AganciaToff';
const password = 'b92a1b5ba71db20fc82a0ce75ff994ce8e1ff434';

// 2. Função para conectar ao banco de dados
async function connectToDatabase() {
    try {
        await sql.connect(config);
        console.log('Conexão com o SQL Server estabelecida com sucesso.');
    } catch (err) {
        console.error('Erro ao conectar ao SQL Server:', err);
    }
}

// 3. Função para inserir ou atualizar pedidos no banco de dados
async function inserirOuAtualizarPedidos(pedidos) {
    for (const pedido of pedidos) {
        try {
            await sql.query`
                MERGE Pedidos AS target
                USING (VALUES (
                    ${pedido.id}, ${pedido.dataHora}, ${pedido.cliente.nome},
                    ${pedido.valorTotal}, ${pedido.cliente.cpfCnpj}, ${pedido.codigo},
                    ${pedido.valorProduto}, ${pedido.valorFrete}, ${pedido.valorDesconto},
                    ${pedido.cliente.id}, ${pedido.formaPagamento}, ${pedido.condicaoPagamento},
                    ${pedido.situacaoNome}, ${pedido.loja.id}
                )) AS source (id, dataHora, nomeCliente, valorTotal, cpfCnpj, codigo, valorProduto, valorFrete, valorDesconto, clienteId, formaPagamento, condicaoPagamento, situacao, lojaId)
                ON (target.id = source.id)
                WHEN MATCHED THEN
                    UPDATE SET 
                        dataHora = source.dataHora, 
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
                    VALUES (source.id, source.dataHora, source.nomeCliente, source.valorTotal, source.cpfCnpj, source.codigo, source.valorProduto, source.valorFrete, source.valorDesconto, source.clienteId, source.formaPagamento, source.condicaoPagamento, source.situacao, source.lojaId);
            `;
        } catch (error) {
            console.error('Erro ao inserir/atualizar pedido:', error);
        }
    }
}

// 4. Função principal para buscar e atualizar pedidos
async function executar() {
    console.log('Iniciando busca por novos pedidos...');
    const pedidos = await fetchTodosPedidos();

    if (pedidos.length > 0) {
        await inserirOuAtualizarPedidos(pedidos);
    } else {
        console.log('Nenhum pedido encontrado.');
    }
}

// Iniciar o processo
connectToDatabase().then(() => {
    setInterval(executar, 1800000); // Executa a cada 30 minutos
});
