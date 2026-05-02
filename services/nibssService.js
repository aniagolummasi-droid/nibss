const DEFAULT_NIBSS_BASE_URL = 'https://nibssbyphoenix.onrender.com';
let cachedTransferToken = null;
let cachedTransferTokenExpiresAt = 0;

const normalizeBaseUrl = (url) => String(url || DEFAULT_NIBSS_BASE_URL).replace(/\/+$/, '');
const nibssUrl = (path) => `${normalizeBaseUrl(process.env.NIBSS_BASE_URL)}${path}`;

const verifyIdentity = async ({ bvn, nin, email, firstName, lastName, dob, phone }) => {
  if (!bvn && !nin) {
    return { success: false, error: 'Either BVN or NIN must be provided' };
  }

  const hasCredentials = process.env.NIBSS_API_KEY && process.env.NIBSS_API_SECRET;
  if (!hasCredentials) {
    const valid = bvn ? /^[0-9]{11}$/.test(bvn) : /^[0-9]{11,14}$/.test(nin);
    return {
      success: valid,
      source: 'mock'
    };
  }

  try {
    let url, payload;

    if (bvn) {
      url = nibssUrl('/api/validateBvn');
      payload = { bvn, firstName, lastName, dob, phone };
    } else {
      url = nibssUrl('/api/validateNin');
      payload = { nin, firstName, lastName, dob };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NIBSS_API_KEY,
        'x-api-secret': process.env.NIBSS_API_SECRET
      },
      body: JSON.stringify(payload)
    });

    let responseBody;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    if (!response.ok) {
      const errorMessage = typeof responseBody === 'object'
        ? responseBody.error || JSON.stringify(responseBody)
        : responseBody;
      console.error('NIBSS verification failed:', response.status, errorMessage);
      return {
        success: false,
        error: `Verification failed: ${response.status} ${typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)}`
      };
    }

    return { success: true, source: 'nibss', details: responseBody };
  } catch (error) {
    console.error('NIBSS verification fetch error:', error);
    return { success: false, error: 'Unable to reach NIBSS onboarding service' };
  }
};

const readResponseBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    return null;
  }

  if (!contentType.includes('application/json')) {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const networkErrorMessage = (serviceName, error) => {
  const causeCode = error && error.cause && error.cause.code;
  const code = causeCode || error.code;

  if (code === 'EAI_AGAIN') {
    return `${serviceName} DNS lookup failed. Check your internet/DNS and try again.`;
  }

  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
    return `${serviceName} connection timed out. The Phoenix service may be slow or unreachable right now.`;
  }

  return `Unable to reach ${serviceName}`;
};

const fetchWithRetry = async (url, options, retries = 1) => {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      const code = error && error.cause && error.cause.code;
      const retryable = ['EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ECONNRESET'].includes(code || error.code);

      if (!retryable || attempt === retries) {
        throw error;
      }

      await wait(700);
    }
  }

  throw lastError;
};

const responseMessage = (body) => {
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  return body.error || body.message || body.ResponseMessage || body.responseMessage || JSON.stringify(body);
};

const isSuccessfulResponse = (body) => {
  if (!body || typeof body !== 'object') {
    return true;
  }

  if (body.success === false || body.IsSuccessful === false || body.status === false) {
    return false;
  }

  const responseCode = body.responseCode || body.ResponseCode || body.code;
  return !responseCode || ['00', '0', '200'].includes(String(responseCode));
};

const extractAccountName = (body) => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body.data || body.Data || body.result || body.Result || body;
  return data.name
    || data.accountName
    || data.account_name
    || data.AccountName
    || data.Name
    || data.customerName
    || data.CustomerName
    || null;
};

const extractBankCode = (body) => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body.data || body.Data || body.result || body.Result || body;
  return data.bankCode
    || data.BankCode
    || data.destinationBankCode
    || data.DestinationBankCode
    || null;
};

const extractBankName = (body) => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body.data || body.Data || body.result || body.Result || body;
  return data.bankName
    || data.BankName
    || data.destinationBankName
    || data.DestinationBankName
    || null;
};

const extractToken = (body) => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body.data || body.Data || body.result || body.Result || body;
  return data.token
    || data.accessToken
    || data.access_token
    || data.jwt
    || data.JWT
    || data.Token
    || null;
};

const decodeJwtExpiry = (token) => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return 0;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.exp ? decoded.exp * 1000 : 0;
  } catch (error) {
    return 0;
  }
};

const loginPayload = () => {
  const email = process.env.NIBSS_AUTH_EMAIL || process.env.NIBSS_FINTECH_EMAIL || process.env.NIBSS_EMAIL;
  const password = process.env.NIBSS_AUTH_PASSWORD || process.env.NIBSS_FINTECH_PASSWORD || process.env.NIBSS_PASSWORD;

  if (!email || !password) {
    return null;
  }

  return {
    email,
    password,
    Email: email,
    Password: password
  };
};

const getTransferToken = async () => {
  if (process.env.NIBSS_TRANSFER_TOKEN) {
    return { success: true, token: process.env.NIBSS_TRANSFER_TOKEN };
  }

  if (cachedTransferToken && cachedTransferTokenExpiresAt > Date.now() + 60000) {
    return { success: true, token: cachedTransferToken };
  }

  const payload = loginPayload();
  if (!payload) {
    return {
      success: false,
      status: 500,
      error: 'NIBSS transfer token is not configured. Set NIBSS_TRANSFER_TOKEN or NIBSS_AUTH_EMAIL/NIBSS_AUTH_PASSWORD.'
    };
  }

  try {
    const response = await fetchWithRetry(process.env.NIBSS_AUTH_URL || nibssUrl('/api/auth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await readResponseBody(response);

    if (!response.ok || !isSuccessfulResponse(body)) {
      return {
        success: false,
        status: response.status,
        error: responseMessage(body) || 'NIBSS login failed'
      };
    }

    const token = extractToken(body);
    if (!token) {
      return { success: false, status: 502, error: 'NIBSS login response did not include a token' };
    }

    cachedTransferToken = token;
    cachedTransferTokenExpiresAt = decodeJwtExpiry(token) || Date.now() + (10 * 60 * 1000);
    return { success: true, token };
  } catch (error) {
    console.warn('NIBSS login fetch error:', error.cause ? error.cause.code : error.message);
    return { success: false, status: 502, error: networkErrorMessage('NIBSS login service', error) };
  }
};

const externalHeaders = async ({ authorized = false } = {}) => {
  const headers = { 'Content-Type': 'application/json' };

  if (process.env.NIBSS_API_KEY) {
    headers['x-api-key'] = process.env.NIBSS_API_KEY;
  }

  if (process.env.NIBSS_API_SECRET) {
    headers['x-api-secret'] = process.env.NIBSS_API_SECRET;
  }

  if (authorized) {
    const tokenResult = await getTransferToken();
    if (!tokenResult.success) {
      return tokenResult;
    }

    headers.Authorization = `Bearer ${tokenResult.token}`;
  }

  return { success: true, headers };
};

const externalNameEnquiry = async ({ accountNumber, bankCode }) => {
  const configuredUrl = process.env.NIBSS_NAME_ENQUIRY_URL;
  const query = bankCode ? `?bankCode=${encodeURIComponent(bankCode)}` : '';
  const url = configuredUrl || `${nibssUrl(`/api/account/name-enquiry/${encodeURIComponent(accountNumber)}`)}${query}`;
  const headersResult = await externalHeaders({ authorized: true });

  if (!headersResult.success) {
    return headersResult;
  }

  try {
    const requestOptions = configuredUrl
      ? {
        method: 'POST',
        headers: headersResult.headers,
        body: JSON.stringify({
          accountNumber,
          bankCode,
          AccountNumber: accountNumber,
          BankCode: bankCode
        })
      }
      : {
        method: 'GET',
        headers: headersResult.headers
      };

    const response = await fetchWithRetry(url, requestOptions);
    const body = await readResponseBody(response);

    if (!response.ok || !isSuccessfulResponse(body)) {
      return {
        success: false,
        status: response.status,
        error: responseMessage(body) || 'NIBSS name enquiry failed'
      };
    }

    return {
      success: true,
      source: 'nibss',
      name: extractAccountName(body) || 'External Recipient',
      bankCode: extractBankCode(body) || bankCode || null,
      bankName: extractBankName(body) || null,
      details: body
    };
  } catch (error) {
    console.warn('NIBSS name enquiry fetch error:', error.cause ? error.cause.code : error.message);
    return { success: false, status: 502, error: networkErrorMessage('NIBSS name enquiry service', error) };
  }
};

const extractProviderReference = (body) => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body.data || body.Data || body.result || body.Result || body;
  return data.providerReference
    || data.sessionId
    || data.SessionID
    || data.transactionId
    || data.TransactionId
    || data.reference
    || data.Reference
    || null;
};

const externalTransfer = async ({
  reference,
  amount,
  narration,
  sourceAccountNumber,
  destinationAccountNumber,
  destinationBankCode,
  recipientName
}) => {
  const url = process.env.NIBSS_TRANSFER_URL || nibssUrl('/api/transfer');
  const headersResult = await externalHeaders({ authorized: true });

  if (!headersResult.success) {
    return headersResult;
  }

  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: headersResult.headers,
      body: JSON.stringify({
        from: sourceAccountNumber,
        to: destinationAccountNumber,
        amount: String(amount),
        reference,
        transactionId: reference,
        transactionID: reference,
        xref: reference,
        Amount: amount,
        narration,
        fromAccountNumber: sourceAccountNumber,
        toAccountNumber: destinationAccountNumber,
        sourceAccountNumber,
        senderAccountNumber: sourceAccountNumber,
        sourceBankCode: process.env.BANK_CODE,
        senderBankCode: process.env.BANK_CODE,
        destinationAccountNumber,
        recipientAccountNumber: destinationAccountNumber,
        accountNumber: destinationAccountNumber,
        destinationBankCode,
        recipientBankCode: destinationBankCode,
        bankCode: destinationBankCode,
        recipientName
      })
    });
    const body = await readResponseBody(response);

    if (!response.ok || !isSuccessfulResponse(body)) {
      console.warn('NIBSS transfer rejected:', {
        status: response.status,
        body,
        payload: {
          from: sourceAccountNumber,
          to: destinationAccountNumber,
          amount: String(amount)
        }
      });

      return {
        success: false,
        status: response.status,
        error: responseMessage(body) || 'NIBSS transfer failed'
      };
    }

    return {
      success: true,
      source: 'nibss',
      providerReference: extractProviderReference(body),
      details: body
    };
  } catch (error) {
    console.warn('NIBSS transfer fetch error:', error.cause ? error.cause.code : error.message);
    return { success: false, status: 502, error: networkErrorMessage('NIBSS transfer service', error) };
  }
};

module.exports = {
  verifyIdentity,
  externalNameEnquiry,
  externalTransfer
};
