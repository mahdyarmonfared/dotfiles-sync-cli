/**
 * Dotfiles Backup Manager
 * Safely snapshots configurations with cryptographic SHA-256 verification and structured manifests.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { scanDotfiles } from './scanner.js';
import { sanitizeContent } from './security.js';

/**
 * Calculates SHA-256 hash of a file or string.
 * @param {string|Buffer} content
 * @returns {string}
 */
export function calculateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Default backup directory location in user home.
 */
export function getDefaultBackupDir() {
  return path.join(os.homedir(), '.dotfiles-backups');
}

/**
 * Creates a timestamped backup of selected or detected dotfiles.
 * @param {object} options
 * @param {string} [options.homeDir=os.homedir()]
 * @param {string} [options.destDir]
 * @param {string[]} [options.selectedRelPaths]
 * @param {boolean} [options.sanitize=false]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{ success: boolean, backupPath: string, manifest: object, filesBackedUp: number, dryRun: boolean }>}
 */
export async function createBackup(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const dryRun = Boolean(options.dryRun);
  const sanitize = Boolean(options.sanitize);

  const scanned = await scanDotfiles(homeDir, options);
  const existingFiles = scanned.filter(f => f.exists && !f.isExcluded);

  // Filter if user provided a specific selection
  const targetsToBackup = options.selectedRelPaths
    ? existingFiles.filter(f => options.selectedRelPaths.includes(f.relPath))
    : existingFiles;

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, '-');
  const backupParent = options.backupRoot || getDefaultBackupDir();
  const backupRootDir = options.destDir || path.join(backupParent, `backup-${timestampStr}`);

  const manifest = {
    version: '1.0.0',
    createdAt: now.toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    homeDir,
    sanitized: sanitize,
    filesCount: targetsToBackup.length,
    files: []
  };

  if (!dryRun) {
    await fs.mkdir(backupRootDir, { recursive: true });
  }

  for (const item of targetsToBackup) {
    const srcPath = item.absPath;
    const destPath = path.join(backupRootDir, item.relPath);

    let rawContent = '';
    try {
      rawContent = await fs.readFile(srcPath, 'utf-8');
    } catch (err) {
      console.warn(`[dotfiles-sync] Skipping unreadable file ${item.relPath}: ${err.message}`);
      continue;
    }
    let finalContent = rawContent;
    let wasModified = false;

    if (sanitize) {
      finalContent = sanitizeContent(rawContent);
      wasModified = finalContent !== rawContent;
    }

    const sha256 = calculateHash(finalContent);

    if (!dryRun) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, finalContent, 'utf-8');
    }

    manifest.files.push({
      relPath: item.relPath,
      size: Buffer.byteLength(finalContent),
      sha256,
      sanitized: wasModified,
      category: item.category
    });
  }

  if (!dryRun) {
    await fs.writeFile(
      path.join(backupRootDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
  }

  return {
    success: true,
    backupPath: backupRootDir,
    manifest,
    filesBackedUp: manifest.files.length,
    dryRun
  };
}

/**
 * Lists available backups in the backup root directory.
 * @param {string} [backupRoot=getDefaultBackupDir()]
 * @returns {Promise<Array<object>>}
 */
export async function listBackups(backupRoot = getDefaultBackupDir()) {
  try {
    const entries = await fs.readdir(backupRoot, { withFileTypes: true });
    const backups = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const dirPath = path.join(backupRoot, ent.name);
        const manifestPath = path.join(dirPath, 'manifest.json');
        try {
          const raw = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(raw);
          backups.push({
            dirName: ent.name,
            dirPath,
            manifest
          });
        } catch {
          // Directory without valid manifest
        }
      }
    }

    // Sort newest first
    backups.sort((a, b) => new Date(b.manifest.createdAt) - new Date(a.manifest.createdAt));
    return backups;
  } catch {
    return [];
  }
}
