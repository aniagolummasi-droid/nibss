const errorHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON body:', err.message);
    return res.status(400).json({ error: 'Invalid JSON body', message: err.message });
  }

  console.error(err.stack || err);
  res.status(500).json({ error: 'Something went wrong!' });
};

module.exports = errorHandler;