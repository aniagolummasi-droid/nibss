const { v4: uuidv4 } = require('uuid');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const { externalNameEnquiry, externalTransfer } = require('../services/nibssService');

const OUR_BANK_CODE = process.env.BANK_CODE || '775';
const isFormPost = (req) => req.is('application/x-www-form-urlencoded');
const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');
const normalizeBankCode = (value) => String(value || '').trim();

const formatCurrency = (amount) => `NGN ${Number(amount || 0).toLocaleString('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const renderTransferPage = async (req, res) => {
  try {
    const account = await Account.findOne({ customerId: req.customer._id });
    return res.render('transfer', {
      title: 'Make Transfer',
      customer: req.customer,
      account,
      form: {},
      error: null,
      formatCurrency,
      defaultBankCode: OUR_BANK_CODE
    });
  } catch (error) {
    return res.status(500).render('transfer', {
      title: 'Make Transfer',
      customer: req.customer,
      account: null,
      form: {},
      error: 'Unable to load transfer page',
      formatCurrency,
      defaultBankCode: OUR_BANK_CODE
    });
  }
};

const renderTransferError = async (req, res, status, error) => {
  const account = await Account.findOne({ customerId: req.customer._id });
  return res.status(status).render('transfer', {
    title: 'Make Transfer',
    customer: req.customer,
    account,
    form: req.body,
    error,
    formatCurrency,
    defaultBankCode: OUR_BANK_CODE
  });
};

const rollbackTransferBalances = async (sourceAccount, sourceBalanceBefore, destinationAccount, destinationBalanceBefore) => {
  sourceAccount.balance = sourceBalanceBefore;
  await sourceAccount.save();

  if (destinationAccount) {
    destinationAccount.balance = destinationBalanceBefore;
    await destinationAccount.save();
  }
};

const nameEnquiry = async (req, res) => {
  const accountNumber = normalizeDigits(req.body.accountNumber);
  const bankCode = normalizeBankCode(req.body.bankCode);

  if (!accountNumber) {
    return res.status(400).json({ error: 'accountNumber is required' });
  }

  try {
    if (!bankCode) {
      const account = await Account.findOne({ accountNumber }).populate('customerId', 'firstName lastName');
      if (account) {
        return res.json({
          accountNumber: account.accountNumber,
          bankCode: OUR_BANK_CODE,
          bankName: process.env.BANK_NAME || 'Our Bank',
          name: `${account.customerId.firstName} ${account.customerId.lastName}`
        });
      }
    }

    if (bankCode === OUR_BANK_CODE) {
      const account = await Account.findOne({ accountNumber }).populate('customerId', 'firstName lastName');
      if (!account) {
        return res.status(404).json({ error: 'Recipient account not found in our bank' });
      }
      return res.json({
        accountNumber: account.accountNumber,
        bankCode: OUR_BANK_CODE,
        bankName: process.env.BANK_NAME || 'Our Bank',
        name: `${account.customerId.firstName} ${account.customerId.lastName}`
      });
    } else {
      const enquiry = await externalNameEnquiry({ accountNumber, bankCode });
      if (!enquiry.success) {
        return res.status(enquiry.status || 400).json({ error: enquiry.error || 'Recipient account could not be verified' });
      }

      return res.json({
        accountNumber,
        bankCode: enquiry.bankCode || bankCode,
        bankName: enquiry.bankName,
        name: enquiry.name,
        source: enquiry.source
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Name enquiry failed' });
  }
};

const transfer = async (req, res) => {
  const { narration } = req.body;
  const toAccountNumber = normalizeDigits(req.body.toAccountNumber);
  const bankCode = normalizeBankCode(req.body.bankCode);
  const amount = Number(req.body.amount);
  const renderHtml = isFormPost(req);

  if (!toAccountNumber || !amount || amount <= 0) {
    if (renderHtml) {
      return renderTransferError(req, res, 400, 'toAccountNumber and positive amount are required');
    }

    return res.status(400).json({ error: 'toAccountNumber and positive amount are required' });
  }

  const customer = req.customer;

  try {
    const sourceAccount = await Account.findOne({ customerId: customer._id });
    if (!sourceAccount) {
      if (renderHtml) {
        return renderTransferError(req, res, 404, 'Source account not found');
      }

      return res.status(404).json({ error: 'Source account not found' });
    }
    if (sourceAccount.balance < amount) {
      if (renderHtml) {
        return renderTransferError(req, res, 400, 'Insufficient funds');
      }

      return res.status(400).json({ error: 'Insufficient funds' });
    }

    let destinationBankCode = bankCode;
    const reference = `TRF-${uuidv4()}`;

    const finalizeTransfer = async (status, destinationAccount, counterpartyName, externalTransferResult = null) => {
      const sourceBalanceBefore = sourceAccount.balance;
      const destinationBalanceBefore = destinationAccount ? destinationAccount.balance : null;
      let balancesChanged = false;
      const createdTransactionIds = [];

      try {
        sourceAccount.balance -= amount;
        await sourceAccount.save();

        if (destinationAccount) {
          destinationAccount.balance += amount;
          await destinationAccount.save();
        }

        balancesChanged = true;

        const debitTransaction = new Transaction({
          accountId: sourceAccount._id,
          transactionId: reference,
          reference,
          type: 'debit',
          category: destinationBankCode === OUR_BANK_CODE ? 'intra-bank' : 'inter-bank',
          amount,
          counterpartyAccount: toAccountNumber,
          counterpartyName,
          bankCode: destinationBankCode,
          status,
          narration: narration || 'Transfer'
        });

        await debitTransaction.save();
        createdTransactionIds.push(debitTransaction._id);

        if (destinationAccount) {
          const creditReference = `${reference}-CR`;
          const creditTransaction = new Transaction({
            accountId: destinationAccount._id,
            transactionId: creditReference,
            reference: creditReference,
            type: 'credit',
            category: 'transfer',
            amount,
            counterpartyAccount: sourceAccount.accountNumber,
            counterpartyName: `${customer.firstName} ${customer.lastName}`,
            bankCode: OUR_BANK_CODE,
            status: 'completed',
            narration: `Received transfer from ${customer.firstName}`
          });

          await creditTransaction.save();
          createdTransactionIds.push(creditTransaction._id);
        }
      } catch (error) {
        if (createdTransactionIds.length) {
          await Transaction.deleteMany({ _id: { $in: createdTransactionIds } });
        }

        if (balancesChanged) {
          await rollbackTransferBalances(sourceAccount, sourceBalanceBefore, destinationAccount, destinationBalanceBefore);
        }

        throw error;
      }

      if (renderHtml) {
        return res.redirect(`/customer/dashboard?message=Transfer%20completed%20successfully.%20Reference:%20${encodeURIComponent(reference)}`);
      }

      return res.json({
        reference,
        status,
        amount,
        from: sourceAccount.accountNumber,
        to: toAccountNumber,
        bankCode: destinationBankCode,
        balance: sourceAccount.balance,
        providerReference: externalTransferResult && externalTransferResult.providerReference
      });
    };

    const handleExternalTransfer = async (resolvedBankCode = destinationBankCode, resolvedEnquiry = null) => {
      destinationBankCode = resolvedBankCode;
      const enquiry = resolvedEnquiry || await externalNameEnquiry({ accountNumber: toAccountNumber, bankCode: destinationBankCode });
      if (!enquiry.success) {
        if (renderHtml) {
          return renderTransferError(req, res, enquiry.status || 400, enquiry.error || 'Recipient account could not be verified');
        }

        return res.status(enquiry.status || 400).json({ error: enquiry.error || 'Recipient account could not be verified' });
      }

      destinationBankCode = enquiry.bankCode || destinationBankCode;
      if (!destinationBankCode) {
        if (renderHtml) {
          return renderTransferError(req, res, 400, 'Recipient bank code could not be resolved');
        }

        return res.status(400).json({ error: 'Recipient bank code could not be resolved' });
      }

      const transferResult = await externalTransfer({
        reference,
        amount,
        narration: narration || 'Transfer',
        sourceAccountNumber: sourceAccount.accountNumber,
        destinationAccountNumber: toAccountNumber,
        destinationBankCode,
        recipientName: enquiry.name
      });

      if (!transferResult.success) {
        if (renderHtml) {
          return renderTransferError(req, res, transferResult.status || 502, transferResult.error || 'External transfer failed');
        }

        return res.status(transferResult.status || 502).json({ error: transferResult.error || 'External transfer failed' });
      }

      return finalizeTransfer('completed', null, enquiry.name, transferResult);
    };

    if (!destinationBankCode) {
      const destinationAccount = await Account.findOne({ accountNumber: toAccountNumber });
      if (destinationAccount) {
        if (destinationAccount._id.toString() === sourceAccount._id.toString()) {
          if (renderHtml) {
            return renderTransferError(req, res, 400, 'Cannot transfer to the same account');
          }

          return res.status(400).json({ error: 'Cannot transfer to the same account' });
        }

        destinationBankCode = OUR_BANK_CODE;
        return finalizeTransfer('completed', destinationAccount, `${destinationAccount.accountNumber}`);
      }

      const enquiry = await externalNameEnquiry({ accountNumber: toAccountNumber });
      if (!enquiry.success) {
        if (renderHtml) {
          return renderTransferError(req, res, enquiry.status || 400, enquiry.error || 'Recipient account could not be verified');
        }

        return res.status(enquiry.status || 400).json({ error: enquiry.error || 'Recipient account could not be verified' });
      }

      return handleExternalTransfer(enquiry.bankCode, enquiry);
    }

    if (destinationBankCode === OUR_BANK_CODE) {
      const destinationAccount = await Account.findOne({ accountNumber: toAccountNumber });
      if (!destinationAccount) {
        if (renderHtml) {
          return renderTransferError(req, res, 404, 'Destination account not found for intra-bank transfer');
        }

        return res.status(404).json({ error: 'Destination account not found for intra-bank transfer' });
      }
      if (destinationAccount._id.toString() === sourceAccount._id.toString()) {
        if (renderHtml) {
          return renderTransferError(req, res, 400, 'Cannot transfer to the same account');
        }

        return res.status(400).json({ error: 'Cannot transfer to the same account' });
      }

      await finalizeTransfer('completed', destinationAccount, `${destinationAccount.accountNumber}`);
    } else {
      await handleExternalTransfer(destinationBankCode);
    }
  } catch (error) {
    console.error('Transfer failed:', error);

    if (renderHtml) {
      return renderTransferError(req, res, 500, 'Unable to complete transfer');
    }

    return res.status(500).json({ error: 'Unable to complete transfer' });
  }
};

module.exports = {
  renderTransferPage,
  nameEnquiry,
  transfer
};
