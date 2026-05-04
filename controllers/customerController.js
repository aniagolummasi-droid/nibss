const { v4: uuidv4 } = require('uuid');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { verifyIdentity } = require('../services/nibssService');

const shouldRenderHtml = (req) => req.is('application/x-www-form-urlencoded');

const formatCurrency = (amount) => `NGN ${Number(amount || 0).toLocaleString('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const getOnboardingErrorMessage = (error) => {
  if (error && error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';

    if (duplicateField === 'kycID') {
      return 'A customer with this BVN or NIN already exists';
    }

    if (duplicateField === 'email') {
      return 'A customer with this email already exists';
    }

    return `A customer with this ${duplicateField} already exists`;
  }

  if (error && error.name === 'ValidationError') {
    return Object.values(error.errors).map((fieldError) => fieldError.message).join(', ');
  }

  return 'Unable to complete onboarding';
};

const renderOnboardingPage = (req, res) => {
  res.render('customer-onboarding', {
    title: 'Customer Onboarding',
    form: {},
    error: null,
    success: null
  });
};

const onboardCustomer = async (req, res) => {
  const { firstName, lastName, email, phone, dob, address, bvn, nin } = req.body;
  const renderHtml = shouldRenderHtml(req);
  const kycID = bvn || nin;

  const renderFormError = (status, error) => {
    if (!renderHtml) {
      return res.status(status).json({ error });
    }

    return res.status(status).render('customer-onboarding', {
      title: 'Customer Onboarding',
      form: req.body,
      error,
      success: null
    });
  };

  if (!firstName || !lastName || !email) {
    return renderFormError(400, 'First name, last name, and email are required');
  }

  try {
    const existing = await Customer.findOne({ email });
    if (existing) {
      return renderFormError(409, 'A customer with this email already exists');
    }

    if (kycID) {
      const existingKyc = await Customer.findOne({ kycID });
      if (existingKyc) {
        return renderFormError(409, 'A customer with this BVN or NIN already exists');
      }
    }

    const verification = (bvn || nin) 
      ? await verifyIdentity({ bvn, nin, email, firstName, lastName, dob, phone })
      : { success: true, source: 'basic-onboarding' };

    if (!verification.success) {
      return renderFormError(400, verification.error || 'Verification failed');
    }

    const customer = new Customer({
      firstName,
      lastName,
      email,
      phone,
      dob,
      address,
      kycID,
      bvn,
      nin,
      verified: true
    });

    await customer.save();

    if (renderHtml) {
      return res.status(201).render('customer-onboarding', {
        title: 'Customer Onboarding',
        form: {},
        error: null,
        success: {
          message: 'Customer onboarded and verified successfully',
          customerId: customer._id,
          verificationSource: verification.source
        }
      });
    }

    return res.status(201).json({
      message: 'Customer onboarded and verified successfully',
      customerId: customer._id,
      verified: true,
      verificationSource: verification.source
    });
  } catch (error) {
    console.error('Onboarding failed:', error);
    const message = getOnboardingErrorMessage(error);
    const status = error && error.code === 11000 ? 409 : 500;

    if (renderHtml) {
      return res.status(status).render('customer-onboarding', {
        title: 'Customer Onboarding',
        form: req.body,
        error: message,
        success: null
      });
    }

    return res.status(status).json({ error: message });
  }
};

const renderDashboard = async (req, res) => {
  const customer = req.customer;

  try {
    const account = await Account.findOne({ customerId: customer._id });
    const transactions = account
      ? await Transaction.find({ accountId: account._id }).sort({ createdAt: -1 }).limit(10)
      : [];

    return res.render('dashboard', {
      title: 'Customer Dashboard',
      customer,
      account,
      transactions,
      formatCurrency,
      flash: req.query.message || null,
      error: req.query.error || null
    });
  } catch (error) {
    return res.status(500).render('dashboard', {
      title: 'Customer Dashboard',
      customer,
      account: null,
      transactions: [],
      formatCurrency,
      flash: null,
      error: 'Unable to load dashboard'
    });
  }
};

const createAccount = async (req, res) => {
  const customer = req.customer;
  const renderHtml = shouldRenderHtml(req);

  try {
    const existingAccount = await Account.findOne({ customerId: customer._id });
    if (existingAccount) {
      if (renderHtml) {
        return res.redirect('/customer/dashboard?error=Customer%20already%20has%20an%20account');
      }

      return res.status(409).json({ error: 'Customer already has an account' });
    }

    const accountNumber = `1000${Math.floor(100000 + Math.random() * 900000)}`;
    const account = new Account({
      customerId: customer._id,
      accountNumber,
      balance: 15000
    });

    await account.save();

    const reference = `INIT-${uuidv4()}`;
    const transaction = new Transaction({
      accountId: account._id,
      transactionId: reference,
      reference,
      type: 'credit',
      category: 'initial-deposit',
      amount: 15000,
      status: 'completed',
      narration: 'Account pre-funded with NGN 15,000'
    });

    await transaction.save();

    if (renderHtml) {
      return res.redirect('/customer/dashboard?message=Account%20created%20successfully');
    }

    return res.status(201).json({
      accountId: account._id,
      accountNumber,
      balance: account.balance,
      createdAt: account.createdAt
    });
  } catch (error) {
    if (renderHtml) {
      return res.redirect('/customer/dashboard?error=Unable%20to%20create%20account');
    }

    return res.status(500).json({ error: 'Unable to create account' });
  }
};

const getBalance = async (req, res) => {
  const customer = req.customer;

  try {
    const account = await Account.findOne({ customerId: customer._id });
    if (!account) {
      return res.status(404).json({ error: 'No account found for this customer' });
    }

    res.json({ accountNumber: account.accountNumber, balance: account.balance });
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve account' });
  }
};

const getTransactionHistory = async (req, res) => {
  const customer = req.customer;

  try {
    const account = await Account.findOne({ customerId: customer._id });
    if (!account) {
      return res.status(404).json({ error: 'No account found for this customer' });
    }

    const transactions = await Transaction.find({ accountId: account._id }).sort({ createdAt: -1 });
    res.json({ accountNumber: account.accountNumber, transactions });
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve transactions' });
  }
};

const getTransactionStatus = async (req, res) => {
  const { reference } = req.params;
  const customer = req.customer;

  try {
    const account = await Account.findOne({ customerId: customer._id });
    if (!account) {
      return res.status(404).json({ error: 'No account found for this customer' });
    }

    const transaction = await Transaction.findOne({ accountId: account._id, reference });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve transaction status' });
  }
};

module.exports = {
  renderOnboardingPage,
  renderDashboard,
  onboardCustomer,
  createAccount,
  getBalance,
  getTransactionHistory,
  getTransactionStatus
};
