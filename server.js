require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const QRCode  = require('qrcode');

// === (NOVO) logger estruturado ===
const pinoHttp = require('pino-http');
const logger = require('./logger');

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

const SORTEIO_HEADERS = {
  accessid: process.env.SORTEIO_ACCESS_ID,
  accesskey: process.env.SORTEIO_ACCESS_KEY
};

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://sandbox.paymentgateway.ideamaker.com.br/';
const gateway2Auth = Buffer.from(':' + process.env.GATEWAY_KEY).toString('base64');
const GATEWAY_HEADER = { 'Content-Type': 'application/json', Authorization: [`Basic ${gateway2Auth}`] };

// Mapeia paymentId -> protocolo para confirmar atendimento via webhook
const paymentProtocols = new Map();

// Cloudflare Turnstile
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';

async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET_KEY) return true;
  try {
    const params = new URLSearchParams();
    params.append('secret', TURNSTILE_SECRET_KEY);
    params.append('response', token);
    if (ip) params.append('remoteip', ip);
    const resp = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return resp.data.success;
  } catch (err) {
    logger.error({ msg: 'Turnstile verify error', error: err.response?.data || err.message });
    return false;
  }
}

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
    logger.error({
      msg: 'Falha ao simular pagamento',
      amount, id,
      requestBody,
      error: err.response?.data || err.message
    });
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

// 2) (NOVO) pino-http antes das rotas, para logar cada request/response
app.use(pinoHttp({
  logger,
  autoLogging: { ignorePaths: ['/health'] },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      id: req.id,
      // cabeçalhos minimizados (sem sensíveis)
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for']
      }
    }),
    res: (res) => ({ statusCode: res.statusCode })
  }
}));

// 3) (inalterado) Roteador por subdomínio ANTES do static
app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] || req.hostname || '').toLowerCase();

  const isAsset = path.extname(req.path) !== '';
  if (isAsset || req.path.startsWith('/api')) return next();

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

// 4) Static depois: /js, /css, imgs, etc.
app.use(express.static(path.join(__dirname, 'public')));

// Healthcheck
app.get('/health', (req, res) => res.status(200).send('OK'));

// Checkout também acessível em /compra no domínio raiz
app.get('/compra', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// ---------- API ----------
app.get('/api/turnstile/sitekey', (req, res) => {
  return res.json({ siteKey: TURNSTILE_SITE_KEY });
});

app.post('/api/purchase', async (req, res) => {
  const { amount, cpf, protocolo } = req.body;
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
        customCode: paymentId
      },
      { headers: GATEWAY_HEADER }
    );

    const qrImage = await QRCode.toDataURL(gw.data.qrCode);

    // guarda protocolo associado ao pagamento para confirmar via webhook
    if (protocolo) {
      paymentProtocols.set(paymentId, protocolo);
      if (gw.data.id) paymentProtocols.set(gw.data.id, protocolo);
    }

    req.log.info({ msg: 'Pix criado', paymentId, gatewayId: gw.data.gatewayId, amount: gw.data.amount });

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
    req.log.error({
      msg: 'Falha ao gerar pagamento',
      error: err.response?.data || err.message
    });
    return res.status(500).json({ error: 'Falha ao gerar pagamento.' });
  }
});

app.post('/api/simulate-payment', async (req, res) => {
  const { id, amount } = req.body;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  await simulatePayment(id, amount);
  req.log.info({ msg: 'Simulação de pagamento disparada', id, amount });
  res.json({ ok: true });
});

app.get('/api/payment-status', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    req.log.warn({ msg: 'Consulta status sem id' });
    return res.status(400).json({ error: 'É preciso enviar o id do pagamento.' });
  }
  try {
    const gw = await axios.get(`${GATEWAY_URL}/pix/${id}`, { headers: GATEWAY_HEADER });

    const qrCodeData = gw.data.metadata?.qrCode || gw.data.qrCode;
    const qrImage    = await QRCode.toDataURL(qrCodeData);
    const expireSec  = gw.data.expire || 300;
    const createdAt  = new Date(gw.data.createdAt).getTime();
    const expiresAt  = createdAt + expireSec * 1000;

    req.log.info({ msg: 'Status do pagamento consultado', id, status: gw.data.status });

    return res.json({ ...gw.data, qrImage, expiresAt });
  } catch (err) {
    req.log.error({ msg: 'Falha ao consultar pagamento', id, error: err.response?.data || err.message });
    return res.status(500).json({ error: 'Falha ao consultar pagamento.' });
  }
});

// Recebe notificações de pagamento do gateway
app.post('/webhook/idea/gateway', async (req, res) => {
  const event = req.body?.data?.payload?.event || req.body?.event || req.body;
  const pix   = event?.data?.pix;
  const status = pix?.status;
  const paymentId = pix?.paymentId || pix?.id;

  if (status === 'paid' && paymentId) {
    const protocolo = paymentProtocols.get(paymentId);
    if (protocolo) {
      try {
        await axios.post(
          `${BASE_URL}/servicos/vendas/titulos/confirmaAtendimento`,
          { protocolo, aprovado: true },
          { headers: PROMO_HEADERS }
        );
        req.log.info({ msg: 'Pagamento confirmado via webhook', paymentId, protocolo });
        paymentProtocols.delete(paymentId);
      } catch (err) {
        req.log.error({ msg: 'Falha ao confirmar via webhook', paymentId, protocolo, error: err.response?.data || err.message });
      }
    } else {
      req.log.warn({ msg: 'Protocolo não encontrado para paymentId', paymentId });
    }
  }

  res.json({ ok: true });
});

app.post('/api/coupons/:page/:limit', async (req, res) => {
  const { page, limit } = req.params;
  const { cpf, produtos, cfToken } = req.body;

  const requireCaptcha = page === '1' && limit === '1';
  if (requireCaptcha) {
    if (!cfToken) {
      req.log.warn({ msg: 'Captcha ausente', page, limit });
      return res.status(400).json({ error: 'Captcha requerido.' });
    }
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const valid = await verifyTurnstile(cfToken, ip);
    if (!valid) {
      req.log.warn({ msg: 'Captcha inválido', ip });
      return res.status(400).json({ error: 'Falha na validação do captcha.' });
    }
  }

  try {
    const resp = await axios.post(
      `${BASE_URL}/servicos/consulta/cupons/${page}/${limit}`,
      { cpf, produtos },
      { headers: PROMO_HEADERS }
    );
    req.log.info({ msg: 'Consulta de cupons (paginação)', page, limit, cpf, produtosCount: produtos?.length || 0 });
    return res.json(resp.data);
  } catch (err) {
    req.log.error({ msg: 'Falha ao buscar cupons', page, limit, cpf, error: err.response?.data || err.message });
    return res.status(500).json({ error: 'Falha ao buscar cupons.' });
  }
});

app.get('/api/coupons', async (req, res) => {
  const { cpf } = req.query;
  try {
    const hip = await axios.get(`${BASE_URL}/v1/consulta?cpf=${cpf}`, { headers: PROMO_HEADERS });
    req.log.info({ msg: 'Consulta cupons v1', cpf });
    return res.json(hip.data);
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
      req.log.info({ msg: 'Consulta cupons fallback', cpf, produtos: compras.length });
      return res.json({ compras, fallbackData: fb.data });
    } catch (fbErr) {
      const status = err.response?.status || 500;
      if (status === 400 || status === 404) {
        return res.status(400).json({ error: 'Usuário não encontrado.' });
      }
      req.log.error({
        msg: 'Falha no fallback de cupons',
        cpf,
        errorPrimary: err.response?.data || err.message,
        errorFallback: fbErr.response?.data || fbErr.message
      });
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
    req.log.info({ msg: 'Promoção obtida' });
    return res.json(resp.data);
  } catch (err) {
    req.log.error({ msg: 'Falha ao obter promoção', error: err.response?.data || err.message });
    return res.status(500).json({ error: 'Falha ao obter promoção.' });
  }
});

app.get('/api/sorteio', async (req, res) => {
  try {
    const resp = await axios.get(
      `${process.env.SORTEIO_URL}/sorteios/dados-sorteio`,
      { params: { idPraca: 30 }, headers: SORTEIO_HEADERS }
    );
    req.log.info({ msg: 'Dados de sorteio obtidos' });
    return res.json(resp.data);
  } catch (err) {
    req.log.error({ msg: 'Falha ao obter dados de sorteio', error: err.response?.data || err.message });
    return res.status(500).json({ error: 'Falha ao obter dados de sorteio.' });
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
    req.log.info({ msg: 'Resultado de promoção obtido', idPromocao });
    return res.json(resp.data);
  } catch (err) {
    req.log.error({ msg: 'Falha ao obter resultado', idPromocao, error: err.response?.data || err.message });
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
    req.log.info({ msg: 'Atendimento registrado', cpf, phone, quantity, index });
    return res.json(atendimento.data);
  } catch (err) {
    req.log.error({ msg: 'Falha ao registrar atendimento', cpf, phone, quantity, error: err.response?.data || err.message });
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
    req.log.info({ msg: 'Atendimento confirmado', protocolo });
    return res.json(conf.data);
  } catch (err) {
    req.log.error({ msg: 'Falha ao confirmar atendimento', protocolo, error: err.response?.data || err.message });
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
  logger.info({ msg: 'Server running', host: HOST, port: PORT });
});

// ---------- LOGS AXIOS (revisados p/ logger + redaction) ----------
function safeHeaders(h) {
  if (!h) return h;
  const copy = { ...h };
  // apague/mascare campos sensíveis:
  delete copy.authorization;
  delete copy.Authorization;
  delete copy.CustomerKey;
  delete copy.customerkey;
  return copy;
}

axios.interceptors.request.use(req => {
  logger.info({
    msg: 'AXIOS REQUEST',
    url: req.url,
    method: (req.method || '').toUpperCase(),
    data: req.data,
    headers: safeHeaders(req.headers)
  });
  return req;
}, err => {
  logger.error({ msg: 'AXIOS REQUEST ERROR', error: err.message });
  return Promise.reject(err);
});

axios.interceptors.response.use(res => {
  logger.info({
    msg: 'AXIOS RESPONSE',
    url: res.config?.url,
    status: res.status,
    data: res.data
  });
  return res;
}, err => {
  logger.error({
    msg: 'AXIOS ERROR',
    url: err.config?.url,
    status: err.response?.status,
    error: err.response?.data || err.message
  });
  return Promise.reject(err);
});
