/**
 * Dotfiles Sync Web Server & REST API
 * Lightweight Node native HTTP server on port 3007 for managing, backing up, diffing, and restoring dotfiles.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanDotfiles } from './scanner.js';
import { createBackup, listBackups, getDefaultBackupDir } from './backup.js';
import { computeDiff } from './differ.js';
import { restoreBackup } from './restore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '../web');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/**
 * Creates and configures the Dotfiles Sync HTTP server.
 * @param {object} [options]
 * @returns {http.Server}
 */
export function createServer(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const backupRoot = options.backupRoot || getDefaultBackupDir();

  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify(data));
    };

    const readBody = async () => {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return { raw };
      }
    };

    try {
      // 1. Health check
      if (pathname === '/api/health') {
        return sendJson(200, {
          status: 'ok',
          service: 'dotfiles-sync-cli',
          port: options.port || 3007,
          homeDir,
          timestamp: new Date().toISOString()
        });
      }

      // 2. Scan dotfiles
      if (pathname === '/api/scan' && req.method === 'GET') {
        const items = await scanDotfiles(homeDir, options);
        return sendJson(200, {
          homeDir,
          total: items.length,
          detected: items.filter(i => i.exists).length,
          items
        });
      }

      // 3. List backups
      if (pathname === '/api/backups' && req.method === 'GET') {
        const backups = await listBackups(backupRoot);
        return sendJson(200, { backups, backupRoot });
      }

      // 4. Create backup
      if (pathname === '/api/backup' && req.method === 'POST') {
        const body = await readBody();
        const result = await createBackup({
          homeDir,
          backupRoot,
          destDir: body.destDir,
          selectedRelPaths: body.selectedRelPaths,
          sanitize: body.sanitize,
          dryRun: body.dryRun
        });
        return sendJson(200, result);
      }

      // 5. Compute Diff
      if (pathname === '/api/diff' && req.method === 'POST') {
        const body = await readBody();
        const relPath = body.relPath;
        let backupDir = body.backupDir;

        if (!relPath) {
          return sendJson(400, { error: 'Missing relPath parameter' });
        }

        // If no backupDir provided, use latest backup
        if (!backupDir) {
          const backups = await listBackups(backupRoot);
          if (backups.length > 0) {
            backupDir = backups[0].dirPath;
          }
        }

        const livePath = path.join(homeDir, relPath);
        let liveContent = '';
        try {
          liveContent = await fs.readFile(livePath, 'utf-8');
        } catch {
          liveContent = '';
        }

        let backupContent = '';
        if (backupDir) {
          const backupFilePath = path.join(backupDir, relPath);
          try {
            backupContent = await fs.readFile(backupFilePath, 'utf-8');
          } catch {
            backupContent = '';
          }
        }

        const diffResult = computeDiff(backupContent, liveContent, 'Backup', 'Active');
        return sendJson(200, {
          relPath,
          backupDir,
          ...diffResult
        });
      }

      // 6. Restore backup
      if (pathname === '/api/restore' && req.method === 'POST') {
        const body = await readBody();
        let backupDir = body.backupDir;

        if (!backupDir) {
          const backups = await listBackups(backupRoot);
          if (backups.length === 0) {
            return sendJson(400, { error: 'No backups found to restore' });
          }
          backupDir = backups[0].dirPath;
        }

        const result = await restoreBackup(backupDir, {
          targetHome: homeDir,
          dryRun: body.dryRun,
          force: body.force
        });
        return sendJson(200, result);
      }

      // 7. Static file serving from web/
      let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
      if (!filePath.startsWith(WEB_DIR)) {
        res.writeHead(403);
        return res.end('Access Denied');
      }

      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      }
    } catch (err) {
      sendJson(500, { error: err.message || 'Internal server error' });
    }
  });
}

/**
 * Starts the Dotfiles Sync server on the specified port.
 * @param {number} [port=3007]
 * @param {object} [options={}]
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
export function startServer(port = 3007, options = {}) {
  return new Promise((resolve, reject) => {
    const server = createServer({ port, ...options });
    server.listen(port, () => {
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}
