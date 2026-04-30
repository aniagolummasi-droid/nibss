const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const { nameEnquiry, transfer } = require('../controllers/accountController');

const router = express.Router();

router.use(authenticate);
router.post('/payments/name-enquiry', nameEnquiry);
router.post('/payments/transfer', transfer);

module.exports = router;