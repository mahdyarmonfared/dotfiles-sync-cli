/**
 * Dotfiles Safe Restore Engine
 * Restores configurations with automated conflict detection, dry-run simulation, and .bak safety snapshots.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Safely restores dotfiles from a specified backup directory.
 * @param {string} backupDir
 * @param {object} [options={}]
 * @param {string} [options.targetHome=os.homedir()]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.force=false]
 * @returns {Promise<{ success: boolean, filesRestored: number, safetyBackups: string[], dryRun: boolean }>}
 */
export async function restoreBackup(backupDir, options = {}) {
  const targetHome = options.targetHome || os.homedir();
  const dryRun = Boolean(options.dryRun);

  const manifestPath = path.join(backupDir, 'manifest.json');
  let manifest;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid or missing manifest.json in backup directory: ${backupDir}`);
  }

  const safetyBackups = [];
  const restoredFiles = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const fileInfo of manifest.files) {
    const srcInBackup = path.resolve(backupDir, fileInfo.relPath);
    const destInHome = path.resolve(targetHome, fileInfo.relPath);

    // Path traversal security check
    if (!destInHome.startsWith(path.resolve(targetHome) + path.sep) && destInHome !== path.resolve(targetHome)) {
      throw new Error(`Security Exception: Path traversal attempt detected for file '${fileInfo.relPath}'`);
    }

    // Check if source exists in backup
    try {
      await fs.access(srcInBackup);
    } catch {
      throw new Error(`Corrupted backup: missing file '${fileInfo.relPath}'`);
    }

    // Safety step: if live file exists, create .bak snapshot
    let liveExists = false;
    try {
      const stat = await fs.stat(destInHome);
      liveExists = stat.isFile();
    } catch {
      liveExists = false;
    }

    if (liveExists) {
      const backupPath = `${destInHome}.bak.${timestamp}`;
      if (!dryRun) {
        await fs.copyFile(destInHome, backupPath);
      }
      safetyBackups.push(backupPath);
    }

    // Write restored file
    if (!dryRun) {
      await fs.mkdir(path.dirname(destInHome), { recursive: true });
      await fs.copyFile(srcInBackup, destInHome);
    }

    restoredFiles.push(fileInfo.relPath);
  }

  return {
    success: true,
    filesRestored: restoredFiles.length,
    restoredFiles,
    safetyBackups,
    dryRun
  };
}
