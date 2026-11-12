const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const localEnv = path.resolve(process.cwd(), '.env');
const sharedAuthEnv = path.resolve(__dirname, '../../authguardv2-node/.env');
dotenv.config({ path: fs.existsSync(localEnv) ? localEnv : sharedAuthEnv });

const databaseName = process.env.MMMS_DB_NAME || 'mmms';
const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
});

async function createDatabase() {
  await client.connect();
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (existing.rowCount === 0) {
    // databaseName comes from local configuration and is safely identifier-quoted here.
    const identifier = `"${databaseName.replaceAll('"', '""')}"`;
    await client.query(`CREATE DATABASE ${identifier}`);
    console.log(`Created PostgreSQL database ${databaseName}`);
  } else {
    console.log(`PostgreSQL database ${databaseName} already exists`);
  }
}

createDatabase()
  .catch((error) => {
    console.error(`Unable to create PostgreSQL database ${databaseName}:`, error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
