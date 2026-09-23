/**
 * Dotfiles Scanner Engine
 * Discovers developer configuration files across Shell, Git, Editors, and CLI utilities.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isStrictSecretFile, scanContentForSecrets, matchesIgnore } from './security.js';

export const KNOWN_TARGETS = [
  // 1. Shell Configurations
  { id: 'bashrc', category: 'Shell', relPath: '.bashrc', description: 'Bash interactive shell configuration' },
  { id: 'bash_aliases', category: 'Shell', relPath: '.bash_aliases', description: 'Bash command aliases' },
  { id: 'bash_profile', category: 'Shell', relPath: '.bash_profile', description: 'Bash login profile' },
  { id: 'profile', category: 'Shell', relPath: '.profile', description: 'POSIX environment profile' },
  { id: 'zshrc', category: 'Shell', relPath: '.zshrc', description: 'ZSH interactive shell configuration' },
  { id: 'zprofile', category: 'Shell', relPath: '.zprofile', description: 'ZSH login profile' },
  { id: 'zshenv', category: 'Shell', relPath: '.zshenv', description: 'ZSH environment definitions' },
  { id: 'inputrc', category: 'Shell', relPath: '.inputrc', description: 'GNU Readline terminal keybindings' },

  // 2. Git Configurations
  { id: 'gitconfig', category: 'Git', relPath: '.gitconfig', description: 'Global Git configuration' },
  { id: 'gitignore_global', category: 'Git', relPath: '.gitignore_global', description: 'Global Git ignore rules' },

  // 3. Editors & IDEs
  { id: 'vimrc', category: 'Editor', relPath: '.vimrc', description: 'Vim editor configuration' },
  { id: 'nvim_init_lua', category: 'Editor', relPath: '.config/nvim/init.lua', description: 'Neovim Lua configuration' },
  { id: 'nvim_init_vim', category: 'Editor', relPath: '.config/nvim/init.vim', description: 'Neovim VimScript configuration' },
  { id: 'vscode_settings', category: 'Editor', relPath: '.config/Code/User/settings.json', description: 'VS Code user settings' },
  { id: 'vscode_keybindings', category: 'Editor', relPath: '.config/Code/User/keybindings.json', description: 'VS Code custom keybindings' },

  // 4. Terminal & Multiplexers
  { id: 'tmux_conf', category: 'Terminal', relPath: '.tmux.conf', description: 'tmux terminal multiplexer configuration' },
  { id: 'starship_toml', category: 'Terminal', relPath: '.config/starship.toml', description: 'Starship cross-shell prompt config' },
  { id: 'alacritty_toml', category: 'Terminal', relPath: '.config/alacritty/alacritty.toml', description: 'Alacritty terminal emulator configuration' },
  { id: 'curlrc', category: 'Tools', relPath: '.curlrc', description: 'cURL client defaults' }
];

/**
 * Reads ignore patterns from .dotfilesignore if present.
 * @param {string} baseDir
 * @returns {Promise<string[]>}
 */
export async function loadIgnorePatterns(baseDir) {
  const ignoreFile = path.join(baseDir, '.dotfilesignore');
  try {
    const raw = await fs.readFile(ignoreFile, 'utf-8');
    return raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Scans the provided directory (defaults to os.homedir()) for known and custom dotfiles.
 * @param {string} [homeDir=os.homedir()]
 * @param {object} [options={}]
 * @returns {Promise<Array<object>>}
 */
export async function scanDotfiles(homeDir = os.homedir(), options = {}) {
  const ignorePatterns = options.ignorePatterns || await loadIgnorePatterns(homeDir);
  const targets = options.targets || KNOWN_TARGETS;
  const results = [];

  for (const target of targets) {
    const absPath = path.resolve(homeDir, target.relPath);
    let exists = false;
    let size = 0;
    let mtime = null;
    let isSafe = true;
    let hasCritical = false;
    let secrets = [];
    let isExcluded = false;

    // Security check: strict secret paths
    if (isStrictSecretFile(target.relPath)) {
      isExcluded = true;
      isSafe = false;
      hasCritical = true;
    }

    if (matchesIgnore(target.relPath, ignorePatterns)) {
      isExcluded = true;
    }

    try {
      const stat = await fs.stat(absPath);
      if (stat.isFile()) {
        exists = true;
        size = stat.size;
        mtime = stat.mtime.toISOString();

        // Check file content for secrets if smaller than 512KB
        if (!isExcluded && size > 0 && size < 512 * 1024) {
          try {
            const content = await fs.readFile(absPath, 'utf-8');
            const secResult = scanContentForSecrets(content, target.relPath);
            isSafe = secResult.isSafe;
            hasCritical = secResult.hasCritical;
            secrets = secResult.secrets;
          } catch {
            // Binary or unreadable file
          }
        }
      }
    } catch {
      exists = false;
    }

    results.push({
      id: target.id,
      category: target.category,
      relPath: target.relPath,
      absPath,
      description: target.description,
      exists,
      size,
      mtime,
      isSafe,
      hasCritical,
      secrets,
      isExcluded
    });
  }

  return results;
}
