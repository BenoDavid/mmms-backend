const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('production PostgreSQL requires TLS unless explicitly disabled for a private local network', () => {
  const read = (value) => JSON.parse(execFileSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./config/config').production))"], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, DB_SSL: value }, encoding: 'utf8',
  }).trim().split('\n').at(-1));
  assert.equal(read('false').dialectOptions, undefined);
  assert.equal(read('true').dialectOptions.ssl.require, true);
  assert.equal(read('').dialectOptions.ssl.require, true);
});
