const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');

const localEnv = path.resolve(process.cwd(), '.env');
const sharedAuthEnv = path.resolve(__dirname, '../../../authguardv2-node/.env');
dotenv.config({ path: fs.existsSync(localEnv) ? localEnv : sharedAuthEnv });
process.env.DB_NAME = process.env.MMMS_DB_NAME || 'mmms';

const useSsl = process.env.DB_SSL === 'true';
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false,
  dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {},
});

module.exports = sequelize;
