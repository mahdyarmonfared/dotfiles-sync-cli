/**
 * Dotfiles Sync Main Package Entry Point
 */

export { scanDotfiles, KNOWN_TARGETS, loadIgnorePatterns } from './scanner.js';
export { scanContentForSecrets, sanitizeContent, isStrictSecretFile, matchesIgnore } from './security.js';
export { createBackup, listBackups, getDefaultBackupDir, calculateHash } from './backup.js';
export { computeDiff } from './differ.js';
export { restoreBackup } from './restore.js';
export { createServer, startServer } from './server.js';
