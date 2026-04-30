const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const {
  onboardCustomer,
  createAccount,
  getBalance,
  getTransactionHistory,
  getTransactionStatus
} = require('../controllers/customerController');

const router = express.Router();

router.post('/onboarding', onboardCustomer);
router.use(authenticate);
router.post('/accounts', createAccount);
router.get('/accounts/balance', getBalance);
router.get('/transactions/history', getTransactionHistory);
router.get('/transactions/status/:reference', getTransactionStatus);

module.exports = router;