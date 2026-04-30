const { v4: uuidv4 } = require('uuid');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { verifyIdentity } = require('../services/nibssService');

const onboardCustomer = async (req, res) => {
  const { firstName, lastName, email, phone, dob, address, bvn, nin } = req.body;

  if (!firstName || !lastName || !email || !phone || !dob || !address) {
    return res.status(400).json({ error: 'Missing required onboarding fields' });
  }

  if (!bvn && !nin) {
    return res.status(400).json({ error: 'BVN or NIN is required for verification' });
  }

  try {
    const existing = await Customer.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'A customer with this email already exists' });
    }

    const verification = await verifyIdentity({ bvn, nin, email, firstName, lastName, dob, phone });
    if (!verification.success) {
      return res.status(400).json({ error: verification.error || 'Verification failed' });
    }

    const customer = new Customer({
      firstName,
      lastName,
      email,
      phone,
      dob,
      address,
      bvn,
      nin,
      verified: true
    });

    await customer.save();

    return res.status(201).json({
      message: 'Customer onboarded and verified successfully',
      customerId: customer._id,
      verified: true,
      verificationSource: verification.source
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to complete onboarding' });
  }
};

const createAccount = async (req, res) => {
  const customer = req.customer;

  try {
    const existingAccount = await Account.findOne({ customerId: customer._id });
    if (existingAccount) {
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
      reference,
      type: 'credit',
      category: 'initial-deposit',
      amount: 15000,
      status: 'completed',
      narration: 'Account pre-funded with ₦15,000'
    });

    await transaction.save();

    return res.status(201).json({
      accountId: account._id,
      accountNumber,
      balance: account.balance,
      createdAt: account.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to create account' });
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
  onboardCustomer,
  createAccount,
  getBalance,
  getTransactionHistory,
  getTransactionStatus
};