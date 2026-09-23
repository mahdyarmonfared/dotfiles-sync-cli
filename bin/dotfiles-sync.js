#!/usr/bin/env node

/**
 * Dotfiles Sync CLI
 * Command-line runner for inspecting, backing up, diffing, and restoring developer configuration files.
 */

import path from 'node:path';
import os from 'node:os';
import { scanDotfiles } from '../src/scanner.js';
import { createBackup, listBackups, getDefaultBackupDir } from '../src/backup.js';
import { computeDiff } from '../src/differ.js';
import { restoreBackup } from '../src/restore.js';
import { startServer } from '../src/server.js';
import fs from 'node:fs/promises';

const VERSION = '1.0.0';
const args = process.argv.slice(2);
const command = args[0] || 'scan';

function printBanner() {
  console.log(`\x1b[35m╔════════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[35m║\x1b[0m  \x1b[1mDotfiles-Sync v${VERSION}\x1b[0m — Developer Dotfiles Manager     \x1b[35m║\x1b[0m`);
  console.log(`\x1b[35m╚════════════════════════════════════════════════════════╝\x1b[0m\n`);
}

function printHelp() {
  printBanner();
  console.log(`\x1b[1mUSAGE:\x1b[0m`);
  console.log(`  dotfiles-sync [command] [options]\n`);
  console.log(`\x1b[1mCOMMANDS:\x1b[0m`);
  console.log(`  \x1b[32mscan\x1b[0m                    Scan system for recognized dotfiles and secrets`);
  console.log(`  \x1b[32mbackup [options]\x1b[0m        Create a cryptographically signed snapshot of dotfiles`);
  console.log(`  \x1b[32mdiff [file]\x1b[0m             Display colored diff between active system and backup`);
  console.log(`  \x1b[32mrestore [dir]\x1b[0m           Safely restore dotfiles with automatic .bak snapshots`);
  console.log(`  \x1b[32mlist-backups\x1b[0m            List existing snapshot directories`);
  console.log(`  \x1b[32mui [options]\x1b[0m            Launch interactive Web Dashboard (default on port 3007)\n`);
  console.log(`\x1b[1mOPTIONS:\x1b[0m`);
  console.log(`  \x1b[33m-d, --dest <dir>\x1b[0m        Custom destination directory for backup`);
  console.log(`  \x1b[33m-p, --port <number>\x1b[0m     Port for the Web Dashboard (default: 3007)`);
  console.log(`  \x1b[33m--dry-run\x1b[0m               Simulate operations without making changes to disk`);
  console.log(`  \x1b[33m--sanitize\x1b[0m              Automatically redact detected sensitive tokens`);
  console.log(`  \x1b[33m-v, --version\x1b[0m           Show current version`);
  console.log(`  \x1b[33m-h, --help\x1b[0m              Display this help message\n`);
  console.log(`\x1b[1mEXAMPLES:\x1b[0m`);
  console.log(`  $ dotfiles-sync scan`);
  console.log(`  $ dotfiles-sync backup --sanitize`);
  console.log(`  $ dotfiles-sync diff .bashrc`);
  console.log(`  $ dotfiles-sync restore --dry-run`);
  console.log(`  $ dotfiles-sync ui --port 3007\n`);
}

async function main() {
  if (args.includes('-h') || args.includes('--help') || command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version') || command === 'version') {
    console.log(`dotfiles-sync-cli v${VERSION}`);
    process.exit(0);
  }

  // 1. Scan command
  if (command === 'scan') {
    printBanner();
    console.log(`Scanning home directory: \x1b[34m${os.homedir()}\x1b[0m\n`);
    const items = await scanDotfiles();

    console.log(`\x1b[1mCATEGORY   STATUS  SECURITY   SIZE       FILE\x1b[0m`);
    console.log(`─────────────────────────────────────────────────────────────`);

    let foundCount = 0;
    for (const item of items) {
      if (item.exists) {
        foundCount++;
        const status = `\x1b[32m✔ Found\x1b[0m `;
        const sec = item.isSafe ? `\x1b[32mSafe\x1b[0m     ` : `\x1b[31m⚠ Warning\x1b[0m`;
        const sizeStr = `${(item.size / 1024).toFixed(1)} KB`.padEnd(10);
        console.log(`${item.category.padEnd(10)} ${status} ${sec} ${sizeStr} ${item.relPath}`);
      }
    }

    console.log(`─────────────────────────────────────────────────────────────`);
    console.log(`Total detected configs: \x1b[1m\x1b[32m${foundCount}\x1b[0m / ${items.length}\n`);
    return;
  }

  // 2. Backup command
  if (command === 'backup') {
    printBanner();
    const dryRun = args.includes('--dry-run');
    const sanitize = args.includes('--sanitize');
    let destDir = null;
    const destIdx = args.findIndex(a => a === '-d' || a === '--dest');
    if (destIdx !== -1 && args[destIdx + 1]) {
      destDir = args[destIdx + 1];
    }

    console.log(`Initiating backup${dryRun ? ' \x1b[33m(DRY-RUN)\x1b[0m' : ''}…`);
    try {
      const res = await createBackup({ destDir, sanitize, dryRun });
      console.log(`\x1b[32m✔ Snapshot successfully created!\x1b[0m`);
      console.log(`  • Destination: \x1b[34m${res.backupPath}\x1b[0m`);
      console.log(`  • Files saved: \x1b[1m${res.filesBackedUp}\x1b[0m`);
      console.log(`  • Sanitized:   \x1b[1m${sanitize ? 'Yes (Tokens redacted)' : 'No'}\x1b[0m\n`);
    } catch (err) {
      console.error(`\x1b[31m✖ Backup failed:\x1b[0m ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // 3. Diff command
  if (command === 'diff') {
    const targetFile = args[1] && !args[1].startsWith('-') ? args[1] : null;
    const backups = await listBackups();
    if (backups.length === 0) {
      console.error('\x1b[31m✖ No backups found to diff against. Run `dotfiles-sync backup` first.\x1b[0m');
      process.exit(1);
    }

    const latest = backups[0];
    console.log(`Comparing active configs with latest backup (\x1b[34m${latest.dirName}\x1b[0m):\n`);

    const filesToDiff = targetFile ? [targetFile] : latest.manifest.files.map(f => f.relPath);

    for (const rel of filesToDiff) {
      const livePath = path.join(os.homedir(), rel);
      const backupPath = path.join(latest.dirPath, rel);

      let liveContent = '';
      let backupContent = '';

      try { liveContent = await fs.readFile(livePath, 'utf-8'); } catch {}
      try { backupContent = await fs.readFile(backupPath, 'utf-8'); } catch {}

      const diff = computeDiff(backupContent, liveContent, `Backup:${rel}`, `Active:${rel}`);
      if (diff.hasChanges) {
        console.log(`\x1b[1m=== Diff for ${rel} (+${diff.additions} / -${diff.deletions}) ===\x1b[0m`);
        for (const line of diff.lines) {
          if (line.type === 'add') console.log(`\x1b[32m+ ${line.text}\x1b[0m`);
          else if (line.type === 'del') console.log(`\x1b[31m- ${line.text}\x1b[0m`);
        }
        console.log('');
      } else {
        console.log(`\x1b[90m✔ ${rel} is identical\x1b[0m`);
      }
    }
    return;
  }

  // 4. Restore command
  if (command === 'restore') {
    printBanner();
    const dryRun = args.includes('--dry-run');
    const backups = await listBackups();
    if (backups.length === 0) {
      console.error('\x1b[31m✖ No backups found to restore from.\x1b[0m');
      process.exit(1);
    }

    const targetDir = args[1] && !args[1].startsWith('-') ? args[1] : backups[0].dirPath;
    console.log(`Restoring from: \x1b[34m${targetDir}\x1b[0m${dryRun ? ' \x1b[33m(DRY-RUN)\x1b[0m' : ''}\n`);

    try {
      const res = await restoreBackup(targetDir, { dryRun });
      console.log(`\x1b[32m✔ Restore completed successfully!\x1b[0m`);
      console.log(`  • Files restored:     \x1b[1m${res.filesRestored}\x1b[0m`);
      console.log(`  • Safety backups (.bak): \x1b[1m${res.safetyBackups.length}\x1b[0m\n`);
      if (res.safetyBackups.length > 0) {
        console.log(`Safety copies created before overwrite:`);
        for (const bak of res.safetyBackups) {
          console.log(`   \x1b[90m↳ ${bak}\x1b[0m`);
        }
        console.log('');
      }
    } catch (err) {
      console.error(`\x1b[31m✖ Restore failed:\x1b[0m ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // 5. List backups
  if (command === 'list-backups') {
    printBanner();
    const backups = await listBackups();
    if (backups.length === 0) {
      console.log(`No backups located in ${getDefaultBackupDir()}`);
      return;
    }

    console.log(`Found \x1b[1m\x1b[32m${backups.length}\x1b[0m backup snapshots:\n`);
    for (const b of backups) {
      console.log(`  \x1b[1m\x1b[34m${b.dirName}\x1b[0m`);
      console.log(`  • Date:     ${new Date(b.manifest.createdAt).toLocaleString()}`);
      console.log(`  • Files:    ${b.manifest.filesCount}`);
      console.log(`  • Hostname: ${b.manifest.hostname} (${b.manifest.platform})`);
      console.log(`  • Path:     \x1b[90m${b.dirPath}\x1b[0m\n`);
    }
    return;
  }

  // 6. Launch Web UI
  if (command === 'ui') {
    let port = 3007;
    const portIdx = args.findIndex(a => a === '-p' || a === '--port');
    if (portIdx !== -1 && args[portIdx + 1]) {
      port = parseInt(args[portIdx + 1], 10) || 3007;
    }

    printBanner();
    try {
      const { port: actualPort } = await startServer(port);
      console.log(`\x1b[32m✔\x1b[0m Dotfiles Sync Dashboard running at: \x1b[1m\x1b[35mhttp://localhost:${actualPort}\x1b[0m`);
      console.log(`\x1b[90m  Press Ctrl+C to terminate the server.\x1b[0m\n`);
    } catch (err) {
      console.error(`\x1b[31m✖ Error starting server:\x1b[0m ${err.message}`);
      process.exit(1);
    }
    return;
  }

  console.error(`\x1b[31m✖ Unknown command '${command}'. Use --help for usage.\x1b[0m`);
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
