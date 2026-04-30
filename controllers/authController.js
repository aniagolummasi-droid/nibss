const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const isFormPost = (req) => req.is('application/x-www-form-urlencoded');

const renderLoginPage = (req, res) => {
  res.render('login', {
    title: 'Customer Login',
    form: {},
    error: null
  });
};

const login = async (req, res) => {
  const { email } = req.body;
  const renderHtml = isFormPost(req);

  const renderError = (status, error) => {
    if (!renderHtml) {
      return res.status(status).json({ error });
    }

    return res.status(status).render('login', {
      title: 'Customer Login',
      form: req.body,
      error
    });
  };

  if (!email) {
    return renderError(400, 'Email is required');
  }

  try {
    const customer = await Customer.findOne({ email });
    if (!customer) {
      return renderError(404, 'Customer not found. Please onboard first.');
    }

    const token = jwt.sign(
      {
        customerId: customer._id,
        email: customer.email
      },
      process.env.JWT_SECRET || 'supersecretkey',
      { expiresIn: '12h' }
    );

    if (renderHtml) {
      res.cookie('triakwheel_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000
      });

      return res.redirect('/customer/dashboard');
    }

    return res.json({ token, customer: { id: customer._id, email: customer.email, verified: customer.verified } });
  } catch (error) {
    if (renderHtml) {
      return res.status(500).render('login', {
        title: 'Customer Login',
        form: req.body,
        error: 'Login failed'
      });
    }

    return res.status(500).json({ error: 'Login failed' });
  }
};

const logout = (req, res) => {
  res.clearCookie('triakwheel_token');
  res.redirect('/auth/login');
};

module.exports = {
  renderLoginPage,
  login,
  logout
};
