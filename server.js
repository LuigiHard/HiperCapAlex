require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const QRCode  = require('qrcode');

const isDev = process.env.NODE_ENV !== 'production';
const app = express();

app.set('trust proxy', 1);
const DOMAIN_BASE = process.env.DOMAIN_BASE || 'fazumcap.com';
const PORT = process.env.PORT || 1337;
const HOST = process.env.HOST || '0.0.0.0';

const BASE_URL = process.env.HIPERCAP_BASE_URL;
const PROMO_HEADERS = {
  CustomerId:  process.env.HIPERCAP_CUSTOMER_ID,
  CustomerKey: process.env.HIPERCAP_CUSTOMER_KEY,
  'Content-Type': 'application/json'
};

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://sandbox.paymentgateway.ideamaker.com.br/';
const gateway2Auth = Buffer.from(':' + process.env.GATEWAY_KEY).toString('base64');
const GATEWAY_HEADER = { 'Content-Type': 'application/json', Authorization: [`Basic ${gateway2Auth}`] };

// ---------- FUNÇÕES AUX ----------
async function simulatePayment(id, amount) {
  const createdAt = new Date().toISOString();
  const requestBody = {
    event: {
      type: 'pix',
      createdAt,
      data: { pix: { id, amount, amountPaid: amount, status: 'paid' } }
    }
  };
  try {
    await axios.post(`${GATEWAY_URL}/webhook/idea/gateway`, requestBody, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(`Falha ao simular pagamento ${amount}, id=${id}`,
      'Request body:', JSON.stringify(requestBody),
      'Error:', err.response?.data || err.message);
  }
}

function generatePaymentId() {
  const timestamp = Date.now().toString(36);
  const randomStr =
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2);
  const baseId = ('p' + timestamp + randomStr).replace(/[^a-zA-Z0-9]/g, '');
  return baseId.substring(0, Math.min(35, Math.max(26, baseId.length)));
}

// ---------- ORDEM IMPORTA! ----------
// 1) JSON parser primeiro
app.use(express.json());

// 2) (NOVO) Roteador por subdomínio *antes* do static.
//    Assim a raiz "/" do subdomínio não é capturada pelo index.html do static.
app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] || req.hostname || '').toLowerCase();

  // não intercepta assets (qualquer coisa com extensão) nem /api
  const isAsset = path.extname(req.path) !== '';
  if (isAsset || req.path.startsWith('/api')) return next();

  // só na raiz
  const isRoot = req.path === '/' || req.path === '';
  if (!isRoot) return next();

  if (host.startsWith('compra.')) {
    return res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
  }
  if (host.startsWith('consulta.')) {
    return res.sendFile(path.join(__dirname, 'public', 'consulta.html'));
  }
  if (host.startsWith('resultados.')) {
    return res.sendFile(path.join(__dirname, 'public', 'results.html'));
  }

  return next();
});

// 3) Static depois, para servir /js, /css, imagens, etc.
app.use(express.static(path.join(__dirname, 'public')));

// Healthcheck
app.get('/health', (req, res) => res.status(200).send('OK'));

// Checkout também acessível em /compra no domínio raiz
app.get('/compra', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// ---------- API ----------
app.post('/api/purchase', async (req, res) => {
  const { amount, cpf } = req.body;
  const paymentId     = generatePaymentId();
  const expireSeconds = 300; // 5 min
  const expiresAt     = Date.now() + expireSeconds * 1000;

  try {
    const gw = await axios.post(
      `${GATEWAY_URL}/pix`,
      {
        amount,
        expire: expireSeconds,
        paymentId,
        instructions: 'Hiper Cap Brasil',
        customer: { name: paymentId, documentNumber: cpf },
        customCode: 'teste-efi-2025'
      },
      { headers: GATEWAY_HEADER }
    );

    const qrImage = await QRCode.toDataURL(gw.data.qrCode);

    return res.json({
      id: gw.data.id,
      paymentId,
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

app.post('/api/simulate-payment', async (req, res) => {
  const { id, amount } = req.body;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  await simulatePayment(id, amount);
  res.json({ ok: true });
});

app.get('/api/payment-status', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    console.error('Nenhum id fornecido para consulta de status.');
    return res.status(400).json({ error: 'É preciso enviar o id do pagamento.' });
  }
  try {
    const gw = await axios.get(`${GATEWAY_URL}/pix/${id}`, { headers: GATEWAY_HEADER });

    const qrCodeData = gw.data.metadata?.qrCode || gw.data.qrCode;
    const qrImage    = await QRCode.toDataURL(qrCodeData);
    const expireSec  = gw.data.expire || 300;
    const createdAt  = new Date(gw.data.createdAt).getTime();
    const expiresAt  = createdAt + expireSec * 1000;

    return res.json({ ...gw.data, qrImage, expiresAt });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao consultar pagamento.' });
  }
});

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

app.get('/api/coupons', async (req, res) => {
  const { cpf } = req.query;
  try {
    const hip = await axios.get(`${BASE_URL}/v1/consulta?cpf=${cpf}`, { headers: PROMO_HEADERS });
    return res.json(hip.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao buscar cupons.' });
  }
});

app.get('/api/user/:cpf', async (req, res) => {
  const { cpf } = req.params;
  try {
    const resp = await axios.get(`${BASE_URL}/servicos/consulta/usuario/${cpf}`, { headers: PROMO_HEADERS });
    return res.json(resp.data);
  } catch (err) {
    try {
      const fb = await axios.post(
        `${BASE_URL}/servicos/consulta/cupons/1/10`,
        { cpf, produtos: ['hipercapbrasil'] },
        { headers: PROMO_HEADERS }
      );
      const compras = Object.keys(fb.data).map(p => ({ produto: p }));
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

app.get('/api/promotion', async (req, res) => {
  try {
    const resp = await axios.get(
      `${BASE_URL}/servicos/consulta/promocao/hipercapbrasil`,
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao obter promoção.' });
  }
});

// Obtém resultado de promoções finalizadas
app.get('/api/result/:idPromocao', async (req, res) => {
  const { idPromocao } = req.params;
  try {
    const resp = await axios.get(
      `${BASE_URL}/servicos/resultado/promocao/${idPromocao}`,
      { headers: PROMO_HEADERS }
    );
    return res.json(resp.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao obter resultado.' });
  }
});

app.post('/api/attend', async (req, res) => {
  const { cpf, phone, quantity } = req.body;
  
  // Generate sequential index based on timestamp and random component
  const timestamp = Date.now();
  const randomComponent = Math.floor(Math.random() * 1000);
  const index = parseInt(timestamp.toString().slice(-6) + randomComponent.toString().padStart(3, '0'));
  
  try {
    const atendimento = await axios.post(
      `${BASE_URL}/servicos/vendas/titulos/registraAtendimento`,
      {
        codProduto: 'hipercapbrasil',
        chaveClienteExterno: `alpes${index}`,
        tipoPagamento: 'pix',
        quantidade: quantity,
        pessoa: { cpf, celular: phone },
        vendedor: { distribuidor: "grupo_alpes", pdv: "site-fazumcap" }
      },
      { headers: PROMO_HEADERS }
    );
    return res.json(atendimento.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao registrar atendimento.' });
  }
});

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

// Redirecionamentos legados
const legacyMap = {
  '/checkout':   'compra',
  '/consulta':   'consulta',
  '/results':    'resultados',
  '/resultados': 'resultados'
};
app.get(Object.keys(legacyMap), (req, res) => {
  const sub = legacyMap[req.path];
  return res.redirect(301, `https://${sub}.${DOMAIN_BASE}`);
});

// Live reload apenas em dev
if (isDev) {
  const livereload = require('livereload');
  livereload.createServer().watch(path.join(__dirname, 'public'));
  const connectLiveReload = require('connect-livereload');
  app.use(connectLiveReload());
}

// Start
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});

// ---------- LOGS AXIOS ----------
axios.interceptors.response.use(res => {
  console.log('\n[AXIOS RESPONSE]');
  console.log(`URL: ${res.config.url}`);
  console.log('Status:', res.status);
  if (res.data) {
    if (typeof res.data === 'object') {
      console.log('Data:', JSON.stringify(res.data, null, 2));
    } else {
      console.log('Data:', res.data);
    }
  }
  return res;
}, err => {
  console.error('\n[AXIOS ERROR]');
  console.error('URL:', err.config?.url);
  console.error('Status:', err.response?.status);
  console.error('Message:', err.message);
  return Promise.reject(err);
});

axios.interceptors.request.use(req => {
  console.log('\n[AXIOS REQUEST]');
  console.log(`URL: ${req.url}`);
  console.log('Method:', req.method.toUpperCase());
  if (req.data) {
    console.log('Data:', JSON.stringify(req.data, null, 2));
  }
  if (req.headers) {
    console.log('Headers:', req.headers);
  }
  return req;
}, err => {
  console.error('\n[AXIOS REQUEST ERROR]');
  console.error('Message:', err.message);
  return Promise.reject(err);
});
