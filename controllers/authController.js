const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const login = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const customer = await Customer.findOne({ email });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found. Please onboard first.' });
    }

    const token = jwt.sign(
      {
        customerId: customer._id,
        email: customer.email
      },
      process.env.JWT_SECRET || 'supersecretkey',
      { expiresIn: '12h' }
    );

    res.json({ token, customer: { id: customer._id, email: customer.email, verified: customer.verified } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

module.exports = { login };