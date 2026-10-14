const crypto = require('crypto');

const MISTICPAY_URL = 'https://api.misticpay.com/api';

function getCredentials() {
  const clientId = process.env.MISTICPAY_ACCESS_KEY_ID;
  const clientSecret = process.env.MISTICPAY_ACCESS_KEY_SECRET;
  if (!clientId?.startsWith('pk_') || !clientSecret?.startsWith('sk_')) return null;
  return { clientId, clientSecret };
}

function readPaymentToken(token, secret) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof data.transactionId !== 'string' ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(data.transactionId) ||
      !Number.isInteger(data.amountCents) ||
      data.amountCents < 99 ||
      !Number.isInteger(data.expiresAt) ||
      data.expiresAt < Date.now()
    ) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const credentials = getCredentials();
  if (!credentials) {
    return res.status(503).json({ error: 'Pagamento indisponível.' });
  }

  const payment = readPaymentToken(req.body?.paymentToken, credentials.clientSecret);
  if (!payment) {
    return res.status(400).json({ error: 'Identificador de pagamento inválido ou expirado.' });
  }

  try {
    const response = await fetch(`${MISTICPAY_URL}/transactions/check`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transactionId: payment.transactionId }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.transaction?.transactionState) {
      return res.status(502).json({ error: 'Não foi possível consultar o pagamento.' });
    }

    return res.status(200).json({ status: String(result.transaction.transactionState).toUpperCase() });
  } catch {
    return res.status(502).json({ error: 'Não foi possível conectar à MisticPay.' });
  }
};
