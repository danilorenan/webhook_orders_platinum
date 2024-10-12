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

// 4. Função para obter os IDs e situações já presentes na planilha
async function getPedidosExistentesComSituacao() {
    const client = await auth.getClient();
    const spreadsheetId = '1EwWKubnC0M8No3AWEgppGDgs7cuKAG6sEMnLqkxEluk'; // ID da planilha do Google Sheets
    const range = 'Pedidos Platinum!A2:N'; // Intervalo onde os IDs e situações estão

    try {
        const response = await sheets.spreadsheets.values.get({
            auth: client,
            spreadsheetId: spreadsheetId,
            range: range,
        });

        const rows = response.data.values || [];
        const pedidosExistentes = rows.map(row => ({
            id: row[0],             // ID do pedido
            situacao: row[12],      // Situação do pedido
            rowNumber: rows.indexOf(row) + 2 // Posição da linha na planilha (A2 seria 2)
        }));
        return pedidosExistentes;

    } catch (error) {
        console.error('Erro ao buscar IDs e situações existentes na planilha:', error);
        return [];
    }
}

// 5. Função para atualizar situações alteradas no Google Sheets
async function atualizarSituacoes(pedidosAlterados) {
    const client = await auth.getClient();
    const spreadsheetId = '1EwWKubnC0M8No3AWEgppGDgs7cuKAG6sEMnLqkxEluk'; // ID da planilha do Google Sheets

    const requests = pedidosAlterados.map(pedido => ({
        range: `Pedidos Platinum!M${pedido.rowNumber}`,  // Coluna M onde está a situação
        values: [[pedido.novaSituacao]]  // A nova situação do pedido
    }));

    const data = requests.map(req => ({ range: req.range, values: req.values }));

    try {
        const response = await sheets.spreadsheets.values.batchUpdate({
            auth: client,
            spreadsheetId: spreadsheetId,
            resource: {
                data: data,
                valueInputOption: 'USER_ENTERED'
            }
        });
        console.log(`${response.data.totalUpdatedCells} células de situação atualizadas com sucesso.`);
    } catch (error) {
        console.error('Erro ao atualizar situações no Google Sheets:', error);
    }
}

// 6. Função para verificar se houve mudança de situação dos pedidos
async function verificarMudancasDeSituacao(pedidosExistentes) {
    // Busca todos os pedidos da API novamente para verificar mudanças
    const pedidosAtuais = await fetchTodosPedidos();

    // Verifica quais pedidos tiveram mudança de situação
    const pedidosAlterados = pedidosExistentes.reduce((alterados, pedidoExistente) => {
        const pedidoAtual = pedidosAtuais.find(pedido => pedido.id.toString() === pedidoExistente.id);
        if (pedidoAtual && pedidoAtual.situacaoNome !== pedidoExistente.situacao) {
            alterados.push({
                id: pedidoAtual.id,
                novaSituacao: pedidoAtual.situacaoNome,
                rowNumber: pedidoExistente.rowNumber // Localiza a linha do pedido na planilha
            });
        }
        return alterados;
    }, []);

    // Atualiza apenas os pedidos que tiveram mudança de situação
    if (pedidosAlterados.length > 0) {
        await atualizarSituacoes(pedidosAlterados);
    } else {
        console.log('Nenhuma situação de pedido foi alterada.');
    }
}

// 7. Função para preencher o Google Sheets com novos pedidos
async function preencherGoogleSheets(pedidos) {
    const client = await auth.getClient();
    const spreadsheetId = '1EwWKubnC0M8No3AWEgppGDgs7cuKAG6sEMnLqkxEluk'; // ID da planilha do Google Sheets
    const range = 'Pedidos Platinum!A2'; // Intervalo onde os dados serão inseridos

    const idsExistentes = await getPedidosExistentesComSituacao();

    // Filtrar pedidos que ainda não estão na planilha
    const novosPedidos = pedidos.filter(pedido => !idsExistentes.some(existente => existente.id === pedido.id.toString()));

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

// 8. Função principal para executar o processo
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

    // Verifica se há mudanças de situação nos pedidos já existentes
    const pedidosExistentes = await getPedidosExistentesComSituacao();
    await verificarMudancasDeSituacao(pedidosExistentes);
}

// 9. Executa o processo a cada 1 minuto
setInterval(() => {
    executar();
}, 60000); // 60.000ms = 1 minuto
