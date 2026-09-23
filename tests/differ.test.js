import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDiff } from '../src/differ.js';

describe('Dotfiles Differ Tests', () => {
  test('identical content produces no changes', () => {
    const text = 'line 1\nline 2\nline 3';
    const diff = computeDiff(text, text);
    assert.equal(diff.hasChanges, false);
    assert.equal(diff.additions, 0);
    assert.equal(diff.deletions, 0);
  });

  test('detects added and deleted lines properly', () => {
    const oldText = 'alias ll="ls -l"\nalias gs="git status"';
    const newText = 'alias ll="ls -la"\nalias gs="git status"\nalias gp="git push"';

    const diff = computeDiff(oldText, newText);
    assert.equal(diff.hasChanges, true);
    assert.ok(diff.additions >= 1);
    assert.ok(diff.deletions >= 1);
    assert.match(diff.unified, /\+alias gp="git push"/);
  });
});
