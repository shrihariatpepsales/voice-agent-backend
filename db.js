const mongoose = require('mongoose');

let isConnected = false;

async function connectToDatabase() {
  if (isConnected) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voice_agent';

  mongoose.set('strictQuery', true);

  try {
    const dbName = process.env.MONGODB_DB || 'voice_agent';
    await mongoose.connect(uri, { dbName });
    isConnected = true;
    return mongoose.connection;
  } catch (err) {
    console.error('[db] MongoDB connection error', err);
    throw err;
  }
}

module.exports = {
  connectToDatabase,
};


