const { v4: uuidv4 } = require('uuid');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');

const OUR_BANK_CODE = process.env.BANK_CODE || '775';
const isFormPost = (req) => req.is('application/x-www-form-urlencoded');

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
  const { accountNumber, bankCode } = req.body;
  if (!accountNumber || !bankCode) {
    return res.status(400).json({ error: 'accountNumber and bankCode are required' });
  }

  try {
    if (bankCode === OUR_BANK_CODE) {
      const account = await Account.findOne({ accountNumber }).populate('customerId', 'firstName lastName');
      if (!account) {
        return res.status(404).json({ error: 'Recipient account not found in our bank' });
      }
      return res.json({ accountNumber: account.accountNumber, name: `${account.customerId.firstName} ${account.customerId.lastName}` });
    } else {
      return res.json({ accountNumber, bankCode, name: 'External Recipient' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Name enquiry failed' });
  }
};

const transfer = async (req, res) => {
  const { toAccountNumber, bankCode, narration } = req.body;
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

    const destinationBankCode = bankCode || OUR_BANK_CODE;
    const reference = `TRF-${uuidv4()}`;

    const finalizeTransfer = async (status, destinationAccount, counterpartyName) => {
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

      return res.json({ reference, status, amount, from: sourceAccount.accountNumber, to: toAccountNumber, bankCode: destinationBankCode, balance: sourceAccount.balance });
    };

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
      await finalizeTransfer('completed', null, 'External Recipient');
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
