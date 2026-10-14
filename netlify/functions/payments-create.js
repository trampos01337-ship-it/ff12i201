// netlify/functions/payments-create.js
const crypto = require('crypto');

const MISTICPAY_URL = 'https://api.misticpay.com/api';
const PAYER_NAME = 'Cliente';
const PAYER_DOCUMENT = process.env.MISTICPAY_PAYER_DOCUMENT || '12345678909';

function getCredentials() {
  const clientId = process.env.MISTICPAY_ACCESS_KEY_ID;
  const clientSecret = process.env.MISTICPAY_ACCESS_KEY_SECRET;
  if (!clientId?.startsWith('pk_') || !clientSecret?.startsWith('sk_')) return null;
  return { clientId, clientSecret };
}

function createPaymentToken(transactionId, amountCents, secret) {
  const payload = Buffer.from(JSON.stringify({
    transactionId,
    amountCents,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  const credentials = getCredentials();
  if (!credentials) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'Pagamento indisponível. Configure as chaves MisticPay.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const username = String(body.username || '').trim();
  const robux = Number(body.robux);

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nome de usuário Roblox inválido.' }) };
  }
  if (!Number.isInteger(robux) || robux < 30 || robux > 100000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A quantidade deve estar entre 30 e 100.000 Robux.' }) };
  }

  const amountCents = Math.ceil(robux / 1000) * 99;
  const transactionId = crypto.randomUUID();

  try {
    const response = await fetch(`${MISTICPAY_URL}/transactions/create`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountCents / 100,
        payerName: PAYER_NAME,
        payerDocument: PAYER_DOCUMENT,
        transactionId,
        description: `Taxa de entrega de ${robux} Robux para @${username}`,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.data?.transactionId) {
      return { statusCode: 502, body: JSON.stringify({ error: 'A MisticPay não conseguiu criar a cobrança.' }) };
    }

    const payment = result.data;
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentToken: createPaymentToken(payment.transactionId, amountCents, credentials.clientSecret),
        amountCents,
        copyPaste: payment.copyPaste || '',
        qrCodeBase64: payment.qrCodeBase64 || '',
      }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Não foi possível conectar à MisticPay.' }) };
  }
};
