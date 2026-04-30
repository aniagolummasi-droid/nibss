const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  transactionId: { type: String, required: true, unique: true },
  reference: { type: String, required: true, unique: true },
  type: { type: String, required: true }, // 'debit' or 'credit'
  category: { type: String, required: true }, // 'transfer', 'initial-deposit', etc.
  amount: { type: Number, required: true },
  counterpartyAccount: String,
  counterpartyName: String,
  bankCode: String,
  status: { type: String, required: true, default: 'pending' },
  narration: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
