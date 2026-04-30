const express = require('express');
const { renderLoginPage, login, logout } = require('../controllers/authController');

const router = express.Router();

router.get('/login', renderLoginPage);
router.post('/login', login);
router.post('/logout', logout);

module.exports = router;
