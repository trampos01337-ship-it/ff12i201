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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const credentials = getCredentials();
  if (!credentials) {
    return res.status(503).json({ error: 'Pagamento indisponível. Configure as chaves MisticPay.' });
  }

  const { username, robux } = req.body || {};
  const cleanUsername = String(username || '').trim();
  const amount = Number(robux);

  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'Nome de usuário Roblox inválido.' });
  }
  if (!Number.isInteger(amount) || amount < 30 || amount > 100000) {
    return res.status(400).json({ error: 'A quantidade deve estar entre 30 e 100.000 Robux.' });
  }

  const amountCents = Math.ceil(amount / 1000) * 99;
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
        description: `Taxa de entrega de ${amount} Robux para @${cleanUsername}`,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.data?.transactionId) {
      return res.status(502).json({ error: 'A MisticPay não conseguiu criar a cobrança.' });
    }

    const payment = result.data;
    return res.status(201).json({
      paymentToken: createPaymentToken(payment.transactionId, amountCents, credentials.clientSecret),
      amountCents,
      copyPaste: payment.copyPaste || '',
      qrCodeBase64: payment.qrCodeBase64 || '',
    });
  } catch {
    return res.status(502).json({ error: 'Não foi possível conectar à MisticPay.' });
  }
};
