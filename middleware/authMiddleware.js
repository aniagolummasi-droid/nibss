const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    const customer = await Customer.findById(payload.customerId);
    if (!customer) {
      return res.status(401).json({ error: 'Customer not found' });
    }
    req.customer = customer;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authenticate;