const axios = require('axios');
const { google } = require('googleapis');
const moment = require('moment');

// 1. Configurações da API Platinum Kids
const username = 'AganciaToff'; // Username da nova API
const password = 'b92a1b5ba71db20fc82a0ce75ff994ce8e1ff434'; // Senha da nova API

// 2. Autenticação da Google Sheets API
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json', // Caminho para o arquivo JSON das credenciais
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets('v4');

// 3. Função para pegar pedidos de todas as páginas da API Platinum Kids
async function fetchTodosPedidos() {
    let pedidos = [];
    let page = 1;
    let hasMore = true;
    const encodedAuthString = Buffer.from(`${username}:${password}`).toString('base64');
    const url = 'https://api.platinumkids.com.br/loja/v1/pedido';

    while (hasMore) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Basic ${encodedAuthString}`,
                    'Accept-Encoding': 'gzip'
                },
                params: {
                    dataHoraInicio: moment().startOf('month').toISOString(), // Pegar o início do mês
                    dataHoraFim: moment().endOf('month').toISOString(),      // Pegar o fim do mês
                    limite: 100,  // Limite por página
                    origem: 1,
                    pagina: page  // Página atual
                }
            });

            const data = response.data.data;
            pedidos = pedidos.concat(data);
            page++;
            hasMore = page <= response.data.pagina_total;

        } catch (error) {
            console.error('Erro ao buscar pedidos:', error);
            break;
        }
    }

    return pedidos;
}

// 4. Função para obter os IDs já presentes na planilha
async function getPedidosExistentes() {
    const client = await auth.getClient();
    const spreadsheetId = '1EwWKubnC0M8No3AWEgppGDgs7cuKAG6sEMnLqkxEluk'; // ID da planilha do Google Sheets
    const range = 'Pedidos Platinum!A2:A'; // Intervalo onde os IDs estão

    try {
        const response = await sheets.spreadsheets.values.get({
            auth: client,
            spreadsheetId: spreadsheetId,
            range: range,
        });

        const rows = response.data.values || [];
        const idsExistentes = rows.map(row => row[0]); // Pegar os IDs da primeira coluna
        return idsExistentes;

    } catch (error) {
        console.error('Erro ao buscar IDs existentes na planilha:', error);
        return [];
    }
}

// 5. Função para preencher o Google Sheets com novos pedidos
async function preencherGoogleSheets(pedidos) {
    const client = await auth.getClient();
    const spreadsheetId = '1EwWKubnC0M8No3AWEgppGDgs7cuKAG6sEMnLqkxEluk'; // ID da planilha do Google Sheets
    const range = 'Pedidos Platinum!A2'; // Intervalo onde os dados serão inseridos

    const idsExistentes = await getPedidosExistentes();

    // Filtrar pedidos que ainda não estão na planilha
    const novosPedidos = pedidos.filter(pedido => !idsExistentes.includes(pedido.id.toString()));

    if (novosPedidos.length === 0) {
        console.log('Nenhum pedido novo encontrado.');
        return;
    }

    // Adicionar as colunas necessárias, de acordo com o JSON de retorno da API Platinum Kids
    const valores = novosPedidos.map(pedido => [
        pedido.id,                       // ID do pedido
        pedido.dataHora,                 // Data e hora do pedido
        pedido.cliente.nome,             // Nome do cliente
        pedido.valorTotal,               // Valor total do pedido
        pedido.cliente.cpfCnpj,          // CPF/CNPJ do cliente
        pedido.codigo,                   // Código do pedido
        pedido.valorProduto,             // Valor do produto
        pedido.valorFrete,               // Valor do frete
        pedido.valorDesconto,            // Valor do desconto
        pedido.cliente.id,               // ID do cliente
        pedido.formaPagamento,           // Nome da forma de pagamento
        pedido.condicaoPagamento,        // Condição de pagamento
        pedido.situacaoNome,             // Situação do pedido
        pedido.loja.id                   // ID da loja
    ]);

    const resource = {
        values: valores
    };

    try {
        const response = await sheets.spreadsheets.values.append({
            auth: client,
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: resource
        });
        console.log(`${response.data.updates.updatedCells} células adicionadas com sucesso.`);
    } catch (error) {
        console.error('Erro ao atualizar o Google Sheets:', error);
    }
}

// 6. Função principal para executar o processo
async function executar() {
    console.log('Iniciando busca por novos pedidos...');

    // Busca os pedidos do mês atual na API Platinum Kids
    const pedidos = await fetchTodosPedidos();
    if (pedidos.length > 0) {
        // Preenche a planilha Google Sheets com os novos pedidos
        await preencherGoogleSheets(pedidos);
    } else {
        console.log('Nenhum pedido encontrado.');
    }
}

// 7. Executa o processo a cada 1 minuto
setInterval(() => {
    executar();
}, 60000); // 60.000ms = 1 minuto
