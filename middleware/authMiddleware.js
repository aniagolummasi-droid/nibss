const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const getCookieValue = (req, name) => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const target = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return target ? decodeURIComponent(target.split('=').slice(1).join('=')) : null;
};

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : getCookieValue(req, 'triakwheel_token');

  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    }

    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    const customer = await Customer.findById(payload.customerId);
    if (!customer) {
      if (req.accepts('html')) {
        return res.redirect('/auth/login');
      }

      return res.status(401).json({ error: 'Customer not found' });
    }
    req.customer = customer;
    next();
  } catch (error) {
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    }

    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authenticate;
