const { v4: uuidv4 } = require('uuid');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');

const OUR_BANK_CODE = process.env.BANK_CODE || '775';

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
  const { toAccountNumber, amount, bankCode, narration } = req.body;
  if (!toAccountNumber || !amount || amount <= 0) {
    return res.status(400).json({ error: 'toAccountNumber and positive amount are required' });
  }

  const customer = req.customer;

  try {
    const sourceAccount = await Account.findOne({ customerId: customer._id });
    if (!sourceAccount) {
      return res.status(404).json({ error: 'Source account not found' });
    }
    if (sourceAccount.balance < amount) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const destinationBankCode = bankCode || OUR_BANK_CODE;
    const reference = `TRF-${uuidv4()}`;

    const finalizeTransfer = async (status, destinationAccount, counterpartyName) => {
      sourceAccount.balance -= amount;
      await sourceAccount.save();

      const debitTransaction = new Transaction({
        accountId: sourceAccount._id,
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

      if (destinationAccount) {
        destinationAccount.balance += amount;
        await destinationAccount.save();

        const creditTransaction = new Transaction({
          accountId: destinationAccount._id,
          reference,
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
      }

      return res.json({ reference, status, amount, from: sourceAccount.accountNumber, to: toAccountNumber, bankCode: destinationBankCode, balance: sourceAccount.balance });
    };

    if (destinationBankCode === OUR_BANK_CODE) {
      const destinationAccount = await Account.findOne({ accountNumber: toAccountNumber });
      if (!destinationAccount) {
        return res.status(404).json({ error: 'Destination account not found for intra-bank transfer' });
      }
      if (destinationAccount._id.toString() === sourceAccount._id.toString()) {
        return res.status(400).json({ error: 'Cannot transfer to the same account' });
      }

      await finalizeTransfer('completed', destinationAccount, `${destinationAccount.accountNumber}`);
    } else {
      await finalizeTransfer('completed', null, 'External Recipient');
    }
  } catch (error) {
    res.status(500).json({ error: 'Unable to complete transfer' });
  }
};

module.exports = {
  nameEnquiry,
  transfer
};