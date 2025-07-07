// server.js
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');

const app         = express();
const PORT        = process.env.PORT || 3000;
const BASE_URL    = process.env.HIPERCAP_BASE_URL;
const AUTH_HEADER = { 'x-api-key': process.env.HIPERCAP_KEY };

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1) Generate a new Pix order
app.post('/api/purchase', async (req, res) => {
  const { cpf, phone, quantity } = req.body;
  try {
    const hip = await axios.post(
      `${BASE_URL}/v1/pedido`,
      { cpf, celular: phone, qtdeTitulos: quantity },
      { headers: AUTH_HEADER }
    );
    return res.json({
      orderId: hip.data.idPedido,
      amount: hip.data.valor
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao gerar pedido.' });
  }
});

// 2) Fetch the Pix QR code for a given order
app.get('/api/pix', async (req, res) => {
  const { orderId } = req.query;
  try {
    const hip = await axios.get(
      `${BASE_URL}/v1/pedido/${orderId}/pix`,
      { headers: AUTH_HEADER }
    );
    return res.json({
      pixEMV:    hip.data.pixEMV,
      pixQRCode: hip.data.pixQRCode
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: 'Falha ao obter QR code.' });
  }
});

// 3) Lookup purchased titles by CPF
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

// Serve static HTML pages for each route
app.get(['/checkout','/consulta','/results'], (req, res) => {
  const page = req.path.slice(1) + '.html';  // maps '/checkout' → 'checkout.html'
  res.sendFile(path.join(__dirname, 'public', page));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
