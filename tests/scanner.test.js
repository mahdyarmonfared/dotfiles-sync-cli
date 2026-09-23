import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanDotfiles } from '../src/scanner.js';

describe('Dotfiles Scanner Tests', () => {
  let tmpHome;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dotfiles-test-home-'));
    // Create mock dotfiles
    await fs.writeFile(path.join(tmpHome, '.bashrc'), 'alias ll="ls -la"', 'utf-8');
    await fs.writeFile(path.join(tmpHome, '.gitconfig'), '[user]\n  name = Test User\n', 'utf-8');
    await fs.mkdir(path.join(tmpHome, '.config/Code/User'), { recursive: true });
    await fs.writeFile(path.join(tmpHome, '.config/Code/User/settings.json'), '{"editor.tabSize": 2}', 'utf-8');
  });

  after(async () => {
    if (tmpHome) {
      await fs.rm(tmpHome, { recursive: true, force: true });
    }
  });

  test('scanDotfiles discovers existing files in target home', async () => {
    const results = await scanDotfiles(tmpHome);
    assert.ok(Array.isArray(results));

    const bashrc = results.find(r => r.relPath === '.bashrc');
    assert.ok(bashrc, 'bashrc should be in scanned results');
    assert.equal(bashrc.exists, true);
    assert.equal(bashrc.category, 'Shell');
    assert.ok(bashrc.size > 0);

    const gitconfig = results.find(r => r.relPath === '.gitconfig');
    assert.ok(gitconfig);
    assert.equal(gitconfig.exists, true);
    assert.equal(gitconfig.category, 'Git');

    const vscode = results.find(r => r.relPath === '.config/Code/User/settings.json');
    assert.ok(vscode);
    assert.equal(vscode.exists, true);
    assert.equal(vscode.category, 'Editor');

    const missing = results.find(r => r.relPath === '.zshrc');
    assert.ok(missing);
    assert.equal(missing.exists, false);
  });
});
