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
      url = 'https://nibssbyphoenix.onrender.com/api/validateBvn';
      payload = { bvn, firstName, lastName, dob, phone };
    } else {
      url = 'https://nibssbyphoenix.onrender.com/api/validateNin';
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

module.exports = {
  verifyIdentity
};
