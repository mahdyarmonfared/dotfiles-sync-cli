import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanContentForSecrets,
  sanitizeContent,
  isStrictSecretFile,
  matchesIgnore
} from '../src/security.js';

describe('Dotfiles Security & Secret Guard Tests', () => {
  test('isStrictSecretFile correctly identifies dangerous files', () => {
    assert.equal(isStrictSecretFile('.ssh/id_rsa'), true);
    assert.equal(isStrictSecretFile('.ssh/id_ed25519'), true);
    assert.equal(isStrictSecretFile('server.key'), true);
    assert.equal(isStrictSecretFile('.bashrc'), false);
    assert.equal(isStrictSecretFile('.gitconfig'), false);
  });

  test('scanContentForSecrets detects private keys and tokens', () => {
    const content = `
export USER="developer"
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y...
-----END RSA PRIVATE KEY-----
export GITHUB_TOKEN="ghp_123456789012345678901234567890123456"
export OPENAI_KEY="sk-123456789012345678901234567890123456"
`;

    const res = scanContentForSecrets(content);
    assert.equal(res.isSafe, false);
    assert.equal(res.hasCritical, true);
    assert.ok(res.secrets.length >= 3);
  });

  test('sanitizeContent redacts sensitive values cleanly', () => {
    const content = `export GITHUB_TOKEN="ghp_123456789012345678901234567890123456"\nexport DB_PASSWORD="mySuperSecretPassword123"`;
    const sanitized = sanitizeContent(content);

    assert.ok(!sanitized.includes('ghp_123456789012345678901234567890123456'));
    assert.ok(!sanitized.includes('mySuperSecretPassword123'));
    assert.match(sanitized, /\[REDACTED_GITHUB_TOKEN\]/);
    assert.match(sanitized, /\[REDACTED_SECRET\]/);
  });

  test('matchesIgnore respects pattern matching', () => {
    const patterns = ['.cache/', '*.tmp', '.private_config'];
    assert.equal(matchesIgnore('.cache/data', patterns), true);
    assert.equal(matchesIgnore('subfolder/file.tmp', patterns), true);
    assert.equal(matchesIgnore('.private_config', patterns), true);
    assert.equal(matchesIgnore('.bashrc', patterns), false);
  });
});
