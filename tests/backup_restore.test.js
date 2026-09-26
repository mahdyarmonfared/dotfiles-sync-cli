import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createBackup, listBackups } from '../src/backup.js';
import { restoreBackup } from '../src/restore.js';

describe('Dotfiles Backup & Restore Integration Tests', () => {
  let tmpHome;
  let tmpBackupDir;
  let tmpRestoreHome;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dotfiles-backup-home-'));
    tmpBackupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotfiles-backup-dest-'));
    tmpRestoreHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dotfiles-restore-home-'));

    // Populate mock home
    await fs.writeFile(path.join(tmpHome, '.bashrc'), 'export TEST_VAR="original_bashrc"', 'utf-8');
    await fs.writeFile(path.join(tmpHome, '.gitconfig'), '[user]\n  name = Alex Morgan\n', 'utf-8');
  });

  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tmpBackupDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tmpRestoreHome, { recursive: true, force: true }).catch(() => {});
  });

  test('createBackup creates structured snapshot and manifest', async () => {
    const dest = path.join(tmpBackupDir, 'snapshot-1');
    const result = await createBackup({
      homeDir: tmpHome,
      destDir: dest,
      sanitize: true
    });

    assert.equal(result.success, true);
    assert.equal(result.dryRun, false);
    assert.ok(result.filesBackedUp >= 2);

    // Verify files on disk
    const bashrcOnDisk = await fs.readFile(path.join(dest, '.bashrc'), 'utf-8');
    assert.match(bashrcOnDisk, /export TEST_VAR="original_bashrc"/);

    // Verify manifest
    const manifestRaw = await fs.readFile(path.join(dest, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    assert.equal(manifest.filesCount, result.filesBackedUp);
    assert.ok(manifest.files.some(f => f.relPath === '.bashrc'));
  });

  test('createBackup respects dry-run mode without modifying disk', async () => {
    const dryRunDest = path.join(tmpBackupDir, 'snapshot-dry');
    const result = await createBackup({
      homeDir: tmpHome,
      destDir: dryRunDest,
      dryRun: true
    });

    assert.equal(result.dryRun, true);
    let exists = true;
    try {
      await fs.stat(dryRunDest);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, 'Dry-run should not create destination directory on disk');
  });

  test('restoreBackup restores files and generates .bak safety copies', async () => {
    const dest = path.join(tmpBackupDir, 'snapshot-1');

    // Pre-populate target home with pre-existing .bashrc
    await fs.writeFile(path.join(tmpRestoreHome, '.bashrc'), '# Existing local bashrc that should be backed up', 'utf-8');

    const result = await restoreBackup(dest, {
      targetHome: tmpRestoreHome
    });

    assert.equal(result.success, true);
    assert.ok(result.filesRestored >= 2);
    assert.equal(result.safetyBackups.length, 1, 'Should have created exactly 1 .bak copy for pre-existing .bashrc');

    // Verify restored content
    const restoredContent = await fs.readFile(path.join(tmpRestoreHome, '.bashrc'), 'utf-8');
    assert.match(restoredContent, /original_bashrc/);

    // Verify safety file exists
    const safetyFile = result.safetyBackups[0];
    const safetyContent = await fs.readFile(safetyFile, 'utf-8');
    assert.match(safetyContent, /Existing local bashrc/);
  });

  test('restoreBackup throws on path traversal attempt in manifest', async () => {
    const maliciousDir = path.join(tmpBackupDir, 'snapshot-malicious');
    await fs.mkdir(maliciousDir, { recursive: true });
    await fs.writeFile(path.join(maliciousDir, 'manifest.json'), JSON.stringify({
      version: '1.0.0',
      files: [{ relPath: '../../../../etc/shadow' }]
    }), 'utf-8');

    await assert.rejects(
      async () => restoreBackup(maliciousDir, { targetHome: tmpRestoreHome }),
      /Security Exception: Path traversal attempt detected/
    );
  });
});
