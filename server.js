require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const QRCode  = require('qrcode');


const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  const livereload = require('livereload');
  livereload.createServer().watch(path.join(__dirname, 'public'));
}

const app = express();
if (isDev) {
  const connectLiveReload = require('connect-livereload');
  app.use(connectLiveReload());
}

const PORT        = process.env.PORT || 3000;
const BASE_URL    = process.env.HIPERCAP_BASE_URL;
const PROMO_HEADERS = {
  CustomerId: process.env.HIPERCAP_CUSTOMER_ID,
  CustomerKey: process.env.HIPERCAP_CUSTOMER_KEY,
  'Content-Type': 'application/json'
};
const GATEWAY_URL    = process.env.GATEWAY_URL || 'https://sandbox.paymentgateway.ideamaker.com.br/';
// Prepara os headers utilizados nas chamadas ao Gateway.
// "GATEWAY_KEY_2" representa a senha usada na aba Authorization do Postman
// (usuário em branco). Para simular esse comportamento, enviamos dois
// valores para o cabeçalho Authorization.
const gateway2Auth = Buffer.from(':' + process.env.GATEWAY_KEY_2).toString('base64');
const GATEWAY_HEADER = {
  'Content-Type': 'application/json',
  Authorization: [`Basic ${gateway2Auth}`]
};

// envia evento de pagamento para o ambiente de testes
async function simulatePayment(id, amount) {
  const createdAt = new Date().toISOString();
  const requestBody = {
    event: {
      type: 'pix',
      createdAt: createdAt,
      data: { pix: { id, amount, amountPaid: amount, status: 'paid' } }
    }
  };
  
  try {
    await axios.post(
      `${GATEWAY_URL}/webhook/idea/gateway`,
      requestBody,
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(`Falha ao simular pagamento ${amount}, id=${id}`, 
      'Request body:', JSON.stringify(requestBody), 
      'Error:', err.response?.data || err.message);
  }
}


app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// helper: gera um paymentId customizado para enviar ao gateway
function generatePaymentId() {
  const timestamp = Date.now().toString(36);
  const randomStr =
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2);
  const baseId = ('p' + timestamp + randomStr).replace(/[^a-zA-Z0-9]/g, '');
  return baseId.substring(0, Math.min(35, Math.max(26, baseId.length)));
}

// 1) Gera Pix via gateway
app.post('/api/purchase', async (req, res) => {
  const { amount, cpf } = req.body;
  const paymentId    = generatePaymentId();
  const expireSeconds = 300; // 5 minutos
  const expiresAt     = Date.now() + expireSeconds * 1000;

  try {
    const requestBody = {
      amount,
      expire: expireSeconds,
      paymentId,
      instructions: 'Apcap da Sorte, pague e concorra.',
      customer: {
        name: paymentId,
        documentNumber: cpf,
        customCode: 'teste-efi-2025'
      }
    };


    const gw = await axios.post(
      `${GATEWAY_URL}/pix`,
      {
        amount,
        expire: expireSeconds,
        paymentId,
        instructions: 'Apcap da Sorte, pague e concorra.',
        customer: {
          name: paymentId,
          documentNumber: cpf,
        },
        customCode: 'teste-efi-2025'
      },
      { headers: GATEWAY_HEADER }
    );


    const qrImage = await QRCode.toDataURL(gw.data.qrCode);
    const qrCode = gw.data.qrCode;
    const status = gw.data.status;

    return res.json({
      id: gw.data.id,               // ← ESTE é o ID que usaremos para status
      paymentId,                    // ← você ainda pode guardar se quiser
      gatewayId: gw.data.gatewayId,
      amount: gw.data.amount,
      qrCode: gw.data.qrCode,
      status: gw.data.status,
      qrImage,
      expiresAt
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao gerar pagamento.' });
  }
});

// Endpoint para acionar a simulação de pagamento PIX
app.post('/api/simulate-payment', async (req, res) => {
  const { id, amount } = req.body;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  await simulatePayment(id, amount);
  res.json({ ok: true });
});

// 2) Consulta status de pagamento — TEMPORARIAMENTE DESATIVADO
app.get('/api/payment-status', async (req, res) => {
  

  const { id } = req.query;
  if (!id) {
    console.error('Nenhum id fornecido para consulta de status.');
    return res.status(400).json({ error: 'É preciso enviar o id do pagamento.' });
  }

  try {
    const gw = await axios.get(`${GATEWAY_URL}/pix/${id}`, {
      headers: GATEWAY_HEADER
    });


    const qrCodeData = gw.data.metadata?.qrCode || gw.data.qrCode;
    const qrImage    = await QRCode.toDataURL(qrCodeData);
    const expireSec  = gw.data.expire || 300;
    const createdAt  = new Date(gw.data.createdAt).getTime();
    const expiresAt  = createdAt + expireSec * 1000;

    return res.json({
      ...gw.data,
      qrImage,
      expiresAt
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao consultar pagamento.' });
  }
  
});

// 3) Consulta cupons adquiridos pelo CPF - nova versão paginada
app.post('/api/coupons/:page/:limit', async (req, res) => {
  const { page, limit } = req.params;
  const { cpf, produtos } = req.body;
  try {
    const resp = await axios.post(
      `${BASE_URL}/servicos/consulta/cupons/${page}/${limit}`,
      { cpf, produtos },
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao buscar cupons.' });
  }
});

// rota antiga mantida para compatibilidade
app.get('/api/coupons', async (req, res) => {
  const { cpf } = req.query;
  try {
    const hip = await axios.get(
      `${BASE_URL}/v1/consulta?cpf=${cpf}`,
      { headers: PROMO_HEADERS }
    );
    return res.json(hip.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao buscar cupons.' });
  }
});

// 4) Consulta dados do usuário
app.get('/api/user/:cpf', async (req, res) => {
  const { cpf } = req.params;
  try {
    const resp = await axios.get(
      `${BASE_URL}/servicos/consulta/usuario/${cpf}`,
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    // tenta fallback consultando cupons diretamente
    try {
      const fb = await axios.post(
        `${BASE_URL}/servicos/consulta/cupons/1/10`,
        { cpf, produtos: ['hipercapbrasil'] },
        { headers: PROMO_HEADERS }
      );
      // monta array de compras apenas com o nome do produto
      const compras = Object.keys(fb.data).map(p => ({ produto: p }));
      // ordena cupons por data mais recente
      Object.values(fb.data).forEach(arr => {
        arr.sort((a, b) => {
          const da = new Date(a.dataCupom.split('/').reverse().join('-'));
          const db = new Date(b.dataCupom.split('/').reverse().join('-'));
          return db - da;
        });
      });
      return res.json({ compras, fallbackData: fb.data });
    } catch (fbErr) {
      const status = err.response?.status || 500;
      if (status === 400 || status === 404) {
        return res.status(400).json({ error: 'Usuário não encontrado.' });
      }
      console.error(err.response?.data || err.message);
      console.error(fbErr.response?.data || fbErr.message);
      return res.status(500).json({ error: 'Falha ao consultar usuário.' });
    }
  }
});

// 5) Detalhes da promoção
app.get('/api/promotion', async (req, res) => {
  try {
    const resp = await axios.get(
      'https://sandbox.apiv3.ideamaker.com.br/servicos/consulta/promocao/hipercapbrasil',
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao obter promoção.' });
  }
});

// 5.1) Lista de promoções finalizadas
app.get('/api/promo-results', async (req, res) => {
  try {
    const resp = await axios.get(
      `https://sandbox.apiv3.ideamaker.com.br/servicos/resultado/promocao/vidacap`,
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao obter promoções.' });
  }
});

// 5.2) Detalhes de resultado da promoção por ID
app.get('/api/promo-results/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resp = await axios.get(
      `https://sandbox.apiv3.ideamaker.com.br/servicos/resultado/promocao/${id}`,
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao obter resultado.' });
  }
});


// 6) Registra atendimento (após pagamento aprovado)
app.post('/api/attend', async (req, res) => {
  const { cpf, phone, quantity } = req.body;
  try {
    const atendimento = await axios.post(
      `${BASE_URL}/servicos/vendas/titulos/registraAtendimento`,
      {
        codProduto: 'hipercapbrasil',
        chaveClienteExterno: 'teste_ideaMaker',
        tipoPagamento: 'pix',
        quantidade: quantity || 1,
        pessoa: { cpf, celular: phone },
        vendedor: { distribuidor: 'teste', pdv: 'teste' }
      },
      { headers: PROMO_HEADERS }
    );
    return res.json(atendimento.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao registrar atendimento.' });
  }
});

// 7) Confirma atendimento quando pagamento aprovado
app.post('/api/confirm', async (req, res) => {
  const { protocolo } = req.body;
  try {
    const conf = await axios.post(
      `${BASE_URL}/servicos/vendas/titulos/confirmaAtendimento`,
      { protocolo, aprovado: true },
      { headers: PROMO_HEADERS }
    );
    return res.json(conf.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao confirmar atendimento.' });
  }
});

// ============================
//  PÁGINAS POR SUBDOMÍNIO
// ============================
app.use((req, res, next) => {
  const sub = req.subdomains[0];
  if (sub === 'compra') {
    return res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
  }
  if (sub === 'consulta') {
    return res.sendFile(path.join(__dirname, 'public', 'consulta.html'));
  }
  if (sub === 'resultados') {
    return res.sendFile(path.join(__dirname, 'public', 'results.html'));
  }
  next();
});

// ============================
//  ROTAS LOCAIS (DESENVOLVIMENTO)
// ============================
app.get(['/checkout', '/consulta', '/results'], (req, res) => {
  const page = req.path.slice(1) + '.html';
  res.sendFile(path.join(__dirname, 'public', page));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
