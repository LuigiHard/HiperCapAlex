// servidor Express
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const QRCode  = require('qrcode');

const app         = express();
const PORT        = process.env.PORT || 3000;
const BASE_URL    = process.env.HIPERCAP_BASE_URL;
const AUTH_HEADER = { 'x-api-key': process.env.HIPERCAP_KEY };
const PROMO_HEADERS = {
  CustomerId: process.env.HIPERCAP_CUSTOMER_ID,
  CustomerKey: process.env.HIPERCAP_CUSTOMER_KEY
};
const GATEWAY_URL    = 'https://sandbox-paymentgateway.ideamaker.com.br';
const GATEWAY_HEADER = {
  Authorization: 'Basic OmZha2UtaG9tb2wtY2xpZW50',
  'Content-Type': 'application/json'
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1) Registra atendimento e gera Pix via gateway
app.post('/api/purchase', async (req, res) => {
  const { cpf, phone } = req.body;
  try {
    const atendimento = await axios.post(
      `${BASE_URL}/servicos/vendas/titulos/registraAtendimento`,
      {
        codProduto: 'hipercapbrasil',
        chaveClienteExterno: 'teste_ideaMaker',
        tipoPagamento: 'pix',
        quantidade: 1,
        pessoa: { cpf, celular: phone },
        vendedor: { distribuidor: 'teste', pdv: 'teste' }
      },
      { headers: AUTH_HEADER }
    );

    const amount = atendimento.data.valor || 599;
    const paymentId = atendimento.data.idAtendimento?.toString() ||
                      `p${Date.now()}`;

    const gw = await axios.post(
      `${GATEWAY_URL}/pix`,
      {
        amount,
        expire: 3600,
        paymentId,
        instructions: 'Apcap da Sorte, pague e concorra. Li e concordo com o regulamento da promoção disponível no site e verso do produto.',
        customCode: 'buy:apcapdasorte:site'
      },
      { headers: GATEWAY_HEADER }
    );

    const qrImage = await QRCode.toDataURL(gw.data.qrCode);

    return res.json({
      gatewayId: gw.data.id,
      status: gw.data.status,
      qrCode: gw.data.qrCode,
      qrImage
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao gerar pagamento.' });
  }
});

// 2) Consulta status de pagamento no gateway
app.get('/api/payment-status', async (req, res) => {
  const { id } = req.query;
  try {
    const gw = await axios.get(`${GATEWAY_URL}/pix/${id}`, {
      headers: GATEWAY_HEADER
    });
    const qrImage = await QRCode.toDataURL(gw.data.metadata.qrCode || gw.data.qrCode);
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

// Servir páginas HTML estáticas para cada rota
app.get(['/checkout','/consulta','/results'], (req, res) => {
  const page = req.path.slice(1) + '.html';  // mapeia '/checkout' → 'checkout.html'
  res.sendFile(path.join(__dirname, 'public', page));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
