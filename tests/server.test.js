import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../src/server.js';

describe('Dotfiles Sync Server API Tests', () => {
  let server;
  let baseUrl;
  let tmpHome;
  let tmpBackupRoot;
  const testPort = 3692;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dotfiles-api-home-'));
    tmpBackupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dotfiles-api-backups-'));

    await fs.writeFile(path.join(tmpHome, '.bashrc'), 'alias ll="ls -la"', 'utf-8');

    server = createServer({
      port: testPort,
      homeDir: tmpHome,
      backupRoot: tmpBackupRoot
    });

    await new Promise((resolve) => server.listen(testPort, resolve));
    baseUrl = `http://localhost:${testPort}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await fs.rm(tmpHome, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tmpBackupRoot, { recursive: true, force: true }).catch(() => {});
  });

  const request = (pathUrl, method = 'GET', body = null) => {
    return new Promise((resolve, reject) => {
      const url = new URL(pathUrl, baseUrl);
      const req = http.request(url, {
        method,
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  test('GET /api/health responds with 200 OK', async () => {
    const res = await request('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'dotfiles-sync-cli');
  });

  test('GET /api/scan returns scanned dotfiles for target home', async () => {
    const res = await request('/api/scan');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.detected >= 1);
  });

  test('POST /api/backup creates a valid snapshot', async () => {
    const res = await request('/api/backup', 'POST', {
      selectedRelPaths: ['.bashrc'],
      sanitize: true
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.filesBackedUp, 1);
  });

  test('GET /api/backups lists created snapshots', async () => {
    const res = await request('/api/backups');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.backups));
    assert.ok(res.body.backups.length >= 1);
  });

  test('POST /api/diff computes diff against backup', async () => {
    const res = await request('/api/diff', 'POST', {
      relPath: '.bashrc'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.relPath, '.bashrc');
    assert.equal(typeof res.body.hasChanges, 'boolean');
  });

  test('POST /api/diff rejects path traversal attempts with 403', async () => {
    const res = await request('/api/diff', 'POST', {
      relPath: '../../../../etc/passwd'
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Path traversal forbidden');
  });
});
