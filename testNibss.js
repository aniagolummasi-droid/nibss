const url = 'https://nibssbyphoenix.onrender.com/api/onboarding/verify';
(async () => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    console.log('status', res.status);
    console.log(await res.text());
  } catch (e) {
    console.error('fetch error', e.message);
  }
})();
