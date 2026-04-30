require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const accountRoutes = require('./routes/accountRoutes');
const errorHandler = require('./middleware/errorMiddleware');

const app = express();
app.use(express.json());

connectDB();

app.use('/auth', authRoutes);
app.use('/customer', customerRoutes);
app.use('/account', accountRoutes);

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Digital banking backend listening on port ${PORT}`);
});