const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const localEnv = path.resolve(process.cwd(), '.env');
const sharedAuthEnv = path.resolve(__dirname, '../../authguardv2-node/.env');
dotenv.config({ path: fs.existsSync(localEnv) ? localEnv : sharedAuthEnv });
// MMMS shares connection credentials with AuthGuard but always owns a separate database.
process.env.DB_NAME = process.env.MMMS_DB_NAME || 'mmms';

if (process.env.NODE_ENV !== 'development' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error('JWT_SECRET must be configured with at least 32 characters');
const app = require('./app');
const { sequelize } = require('./models');
const port = Number(process.env.MMMS_PORT || (fs.existsSync(localEnv) ? process.env.PORT : 7010) || 7010);

async function start() {
  await sequelize.authenticate();
  const server = app.listen(port, () => console.log(`MMMS API listening on port ${port}`));
  const shutdown = async () => server.close(async () => { await sequelize.close(); process.exit(0); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => { console.error('Unable to start MMMS API:', error); process.exitCode = 1; });
