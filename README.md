# Dotfiles-Sync 🔄🛡️

> **Developer environment dotfiles manager with automated secret scrubbing, collision-safe restore, diff viewer, and web dashboard.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Tests Passing](https://img.shields.io/badge/tests-17%2F17%20passed-success.svg)](tests/)
[![Port](https://img.shields.io/badge/local%20port-3007-purple.svg)](http://localhost:3007)
[![Security Guard](https://img.shields.io/badge/secret--guard-active-emerald.svg)](#security--secret-guard)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/mahdyarmonfared/dotfiles-sync-cli/pulls)

---

## 🎯 The Problem

Developers configure their terminal and editors over months or years: aliases, prompt themes, Git options, keybindings, and extensions. When setting up a new laptop or recovering a system, configuring everything from scratch is tedious and error-prone.

Worse, backing up dotfiles often leads to **accidental security breaches**:
- Users commit `~/.ssh/id_rsa`, `~/.gnupg/`, or `.env` files directly into public GitHub repositories.
- Hardcoded API tokens (`ghp_...`, `sk-...`) inside `~/.bashrc` or `~/.zshrc` leak into backups.
- Restoring dotfiles blindly overwrites local machine customizations without safety fallbacks.

**Dotfiles-Sync solves these issues end-to-end.** It safely discovers, scrubs, snapshots, diffs, and restores your environment with built-in secret guardrails and an interactive dashboard.

---

## ✨ Features

- 🔍 **Universal Discovery:** Automatically detects configurations across:
  - **Shell:** `.bashrc`, `.bash_aliases`, `.bash_profile`, `.profile`, `.zshrc`, `.zprofile`, `.zshenv`, `.inputrc`
  - **Git:** `.gitconfig`, `.gitignore_global`
  - **Editors:** VS Code (`settings.json`, `keybindings.json`), Neovim (`init.lua`, `init.vim`), Vim (`.vimrc`)
  - **Terminal:** `.tmux.conf`, `.alacritty.toml`, `.config/starship.toml`, `.curlrc`
- 🛡️ **Secret & Private Key Guard:**
  - Strictly prohibits backing up SSH private keys (`id_rsa`, `id_ed25519`), `.pem`, `.key`, or `.vault-pass` files.
  - Scans configuration contents for leaked API keys (GitHub PATs, OpenAI keys, AWS credentials) and alerts before backup.
  - Offers one-click `--sanitize` token redaction.
- 📦 **Cryptographic Snapshotting:** Generates timestamped backups in `~/.dotfiles-backups` with a complete `manifest.json` containing SHA-256 hashes, file permissions, and host metadata.
- 📊 **Line-by-Line Diff Inspector:** Visualizes additions and deletions between your live system and previous backup snapshots in both terminal and web UI.
- 🛡️ **Collision-Safe Restore:** When restoring, DotfilesSync **automatically generates safety copies** (`<file>.bak.<timestamp>`) before replacing any active file.
- 🧪 **Dry-Run Mode (`--dry-run`):** Accurately simulates backups and restores without modifying your hard drive.
- 🌐 **Web Dashboard (Port 3007):** Modern graphical dashboard with categorized cards, live diff viewer, snapshot timelines, and one-click actions.

---

## 🚀 Quick Start

### 1. Launch Interactive Web Dashboard (Port 3007)

```bash
# Clone the repository
git clone https://github.com/mahdyarmonfared/dotfiles-sync-cli.git
cd dotfiles-sync-cli

# Start Web UI on http://localhost:3007
node bin/dotfiles-sync.js ui
# or
npm start
```

Open [http://localhost:3007](http://localhost:3007) to view detected dotfiles and manage snapshots.

---

### 2. Command-Line (CLI) Usage

```bash
# 1. Scan your home directory for dotfiles and sensitive tokens
node bin/dotfiles-sync.js scan

# 2. Create a sanitized snapshot of all detected configs
node bin/dotfiles-sync.js backup --sanitize

# 3. Simulate backup without writing to disk
node bin/dotfiles-sync.js backup --dry-run

# 4. View diff between live configs and latest snapshot
node bin/dotfiles-sync.js diff
node bin/dotfiles-sync.js diff .bashrc

# 5. Safely restore files from the latest snapshot (creates .bak copies first)
node bin/dotfiles-sync.js restore

# 6. List all historical snapshots
node bin/dotfiles-sync.js list-backups
```

---

## 🔒 Security & Secret Guard

Dotfiles-Sync inspects files using built-in pattern matching before backup:

| Risk Category | Patterns Detected | Default Behavior |
| :--- | :--- | :--- |
| **SSH & Private Keys** | `id_rsa`, `id_ed25519`, `*.pem`, `*.key` | **Strict Exclusion** (Never backed up) |
| **Cloud & API Credentials** | AWS Keys, GitHub PATs (`ghp_`), OpenAI (`sk-`) | **Flagged as Warning**; Redacted via `--sanitize` |
| **Password Exports** | `export DB_PASS="..."`, `export API_KEY="..."` | **Flagged as Warning**; Redacted via `--sanitize` |
| **Custom Ignores** | Rules in `~/.dotfilesignore` | **Ignored** from scan and snapshots |

---

## 🏗️ Architecture

```
dotfiles-sync-cli/
├── bin/
│   └── dotfiles-sync.js      # Interactive CLI entry point
├── src/
│   ├── index.js              # Module exports
│   ├── scanner.js            # Target detection and dotfiles scanner
│   ├── security.js           # Secret rules, exclusion guards, and sanitizer
│   ├── backup.js             # Snapshot creator, SHA-256 hashing, and manifest
│   ├── differ.js             # Unified line-by-line diff engine
│   ├── restore.js            # Safe restore with automated .bak creation
│   └── server.js             # REST API & Web Dashboard server on port 3007
├── web/
│   ├── index.html            # Dashboard with tabs for files, diffs, and snapshots
│   ├── style.css             # Dark/Light theme, diff colorizer, and metric cards
│   └── app.js                # State management, rescan, diff viewer, and modals
├── tests/
│   ├── security.test.js      # Secret detection and redaction tests
│   ├── scanner.test.js       # Target discovery tests
│   ├── differ.test.js        # Diff engine tests
│   ├── backup_restore.test.js# Snapshot and restore safety tests
│   └── server.test.js        # REST API endpoint tests
└── package.json
```

---

## 🧪 Testing

Dotfiles-Sync uses the native Node.js test runner (`node:test`) with 0 external dependencies:

```bash
npm test
```

```text
▶ Dotfiles Backup & Restore Integration Tests (4 tests) - OK
▶ Dotfiles Differ Tests (2 tests) - OK
▶ Dotfiles Scanner Tests (1 test) - OK
▶ Dotfiles Security & Secret Guard Tests (4 tests) - OK
▶ Dotfiles Sync Server API Tests (6 tests) - OK

ℹ tests 17
ℹ suites 5
ℹ pass 17
ℹ fail 0
```

---

## 📜 License

Released under the [MIT License](LICENSE).  
Copyright (c) 2026 **Mahdyar Monfared**.
