const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const localEnv = path.resolve(process.cwd(), '.env');
const sharedAuthEnv = path.resolve(__dirname, '../../authguardv2-node/.env');
dotenv.config({ path: fs.existsSync(localEnv) ? localEnv : sharedAuthEnv });
process.env.DB_NAME = process.env.MMMS_DB_NAME || 'mmms';

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
};

module.exports = { development: base, test: base, production: { ...base, dialectOptions: { ssl: { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } } } };
