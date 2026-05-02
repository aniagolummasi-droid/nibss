const mongoose = require('mongoose');

const connectDB = async () => {
  const primaryUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mma-bank';
  const fallbackUri = process.env.MONGO_FALLBACK_URI;

  try {
    const conn = await mongoose.connect(primaryUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    if (!fallbackUri || fallbackUri === primaryUri) {
      console.error('MongoDB connection error:', error);
      process.exit(1);
    }

    console.warn(`Primary MongoDB connection failed: ${error.message}`);
    console.warn('Trying fallback MongoDB connection...');

    try {
      const conn = await mongoose.connect(fallbackUri);
      console.log(`MongoDB Connected using fallback: ${conn.connection.host}`);
    } catch (fallbackError) {
      console.error('MongoDB connection error:', fallbackError);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
