require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const QRCode  = require('qrcode');

const isDev = process.env.NODE_ENV === 'production';
let liveReloadServer;
if (isDev) {
  const livereload = require('livereload');
  liveReloadServer = livereload.createServer();
  liveReloadServer.watch(path.join(__dirname, 'public'));
}

const isDev = process.env.NODE_ENV === 'production';
let liveReloadServer;
if (isDev) {
  const livereload = require('livereload');
  liveReloadServer = livereload.createServer();
  liveReloadServer.watch(path.join(__dirname, 'public'));
}

const app = express();
if (isDev) {
  const connectLiveReload = require('connect-livereload');
  app.use(connectLiveReload());
}

const PORT           = process.env.PORT || 3000;
const BASE_URL       = process.env.HIPERCAP_BASE_URL;
const AUTH_HEADER    = { 'x-api-key': process.env.HIPERCAP_KEY };
const PROMO_HEADERS  = {
  CustomerId: process.env.HIPERCAP_CUSTOMER_ID,
  CustomerKey: process.env.HIPERCAP_CUSTOMER_KEY
};
const GATEWAY_URL    = process.env.GATEWAY_URL || 'https://sandbox.paymentgateway.ideamaker.com.br/';
const GATEWAY_HEADER = {
  'Content-Type': 'application/json',
  'Authorization': `Basic ${process.env.GATEWAY_KEY}`
};

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
  const { amount } = req.body;
  const paymentId = generatePaymentId();

  try {
    const gw = await axios.post(
      `${GATEWAY_URL}/pix`,
      {
        amount,
        expire: 3600,
        paymentId,
        instructions: 'Apcap da Sorte, pague e concorra.',
        customCode: 'buy:apcapdasorte:site'
      },
      { headers: GATEWAY_HEADER }
    );

    console.log(`Created payment request. paymentId=${paymentId} at ${new Date().toISOString()}`);

    const qrImage = await QRCode.toDataURL(gw.data.qrCode);

    return res.json({
      id: gw.data.id,               // ← ESTE é o ID que usaremos para status
      paymentId,                    // ← você ainda pode guardar se quiser
      gatewayId: gw.data.gatewayId,
      amount: gw.data.amount,
      qrCode: gw.data.qrCode,
      status: gw.data.status,
      qrImage
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao gerar pagamento.' });
  }
});

// 2) Consulta status de pagamento — usa apenas `id`
app.get('/api/payment-status', async (req, res) => {
  console.log('payment-status query →', req.query);

  const { id } = req.query;
  if (!id) {
    console.error('Nenhum id fornecido para consulta de status.');
    return res.status(400).json({ error: 'É preciso enviar o id do pagamento.' });
  }

  console.log(`Consultando status para id=${id} às ${new Date().toISOString()}`);
  try {
    const gw = await axios.get(`${GATEWAY_URL}/pix/${id}`, {
      headers: GATEWAY_HEADER
    });

    console.log(`Status para id=${id}: ${gw.data.status}`);

    const qrCodeData = gw.data.metadata?.qrCode || gw.data.qrCode;
    const qrImage    = await QRCode.toDataURL(qrCodeData);

    return res.json({
      ...gw.data,
      qrImage
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao consultar pagamento.' });
  }
});

// 3) Consulta cupons adquiridos pelo CPF
app.get('/api/coupons', async (req, res) => {
  const { cpf } = req.query;
  try {
    const hip = await axios.get(
      `${BASE_URL}/v1/consulta?cpf=${cpf}`,
      { headers: AUTH_HEADER }
    );
    return res.json(hip.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao buscar cupons.' });
  }
});

// 4) Detalhes da promoção
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

// 5) Registra atendimento (após pagamento aprovado)
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
      { headers: AUTH_HEADER }
    );
    return res.json(atendimento.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao registrar atendimento.' });
  }
});

// Servir páginas HTML estáticas
app.get(['/checkout','/consulta','/results'], (req, res) => {
  const page = req.path.slice(1) + '.html';
  res.sendFile(path.join(__dirname, 'public', page));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
