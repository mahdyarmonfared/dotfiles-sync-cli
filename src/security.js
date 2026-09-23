/**
 * Dotfiles Security & Secret Guard
 * Prevents accidental inclusion of private keys, API credentials, and authorization tokens into dotfiles backups.
 */

import path from 'node:path';

// Rules for sensitive file patterns that should be strictly excluded by default
export const STRICT_EXCLUDED_PATTERNS = [
  /id_rsa/i,
  /id_ecdsa/i,
  /id_ed25519/i,
  /id_dsa/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /known_hosts/i,
  /\.gnupg\/private-keys/i,
  /\.vault-pass/i,
  /\.netrc$/i
];

// Regex rules for sensitive patterns inside dotfile contents
export const SECRET_RULES = [
  {
    name: 'Private Encryption Key Header',
    severity: 'critical',
    regex: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY[^-]*-----/i
  },
  {
    name: 'AWS Access Key ID',
    severity: 'high',
    regex: /\b(AKIA[0-9A-Z]{16})\b/
  },
  {
    name: 'GitHub Personal Access Token',
    severity: 'critical',
    regex: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/
  },
  {
    name: 'OpenAI API Secret',
    severity: 'critical',
    regex: /\b(sk-[A-Za-z0-9]{32,64})\b/
  },
  {
    name: 'Generic Exported Secret / Password',
    severity: 'warning',
    regex: /^\s*export\s+(?:[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|AUTH_TOKEN|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*['"]?([^'"\s]{8,})['"]?/im
  }
];

/**
 * Determines whether a file path is a strictly prohibited secret file (e.g., SSH private keys).
 * @param {string} filePath
 * @returns {boolean}
 */
export function isStrictSecretFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return STRICT_EXCLUDED_PATTERNS.some(regex => regex.test(normalized));
}

/**
 * Scans a file's string content for secret patterns.
 * @param {string} content
 * @param {string} [filename='']
 * @returns {{ isSafe: boolean, secrets: Array<{ rule: string, severity: string, line: number, preview: string }> }}
 */
export function scanContentForSecrets(content, filename = '') {
  if (!content) return { isSafe: true, secrets: [] };

  const findings = [];
  const lines = content.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    for (const rule of SECRET_RULES) {
      if (rule.regex.test(line)) {
        // Redact most of the matched line for safe preview
        const preview = line.length > 80 ? `${line.substring(0, 40)}…[REDACTED]` : line.replace(/[a-zA-Z0-9]{8,}/g, '****');
        findings.push({
          rule: rule.name,
          severity: rule.severity,
          line: idx + 1,
          preview
        });
      }
    }
  }

  const hasCritical = findings.some(f => f.severity === 'critical');
  return {
    isSafe: findings.length === 0,
    hasCritical,
    secrets: findings
  };
}

/**
 * Redacts detected sensitive strings from content before backup.
 * @param {string} content
 * @returns {string}
 */
export function sanitizeContent(content) {
  if (!content) return '';
  let sanitized = content;

  // Redact private key blocks
  sanitized = sanitized.replace(
    /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY[^-]*-----[\s\S]*?-----END[^-]*-----/gi,
    '# [DOTFILES_SYNC_REDACTED: PRIVATE KEY BLOCK REMOVED]'
  );

  // Redact GitHub and OpenAI tokens
  sanitized = sanitized.replace(/\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g, '[REDACTED_GITHUB_TOKEN]');
  sanitized = sanitized.replace(/\b(sk-[A-Za-z0-9]{32,64})\b/g, '[REDACTED_API_KEY]');

  // Redact export PASSWORD="..."
  sanitized = sanitized.replace(
    /(^\s*export\s+(?:[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|AUTH_TOKEN|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*['"]?)([^'"\r\n]{8,})(['"]?)/gim,
    '$1[REDACTED_SECRET]$3'
  );

  return sanitized;
}

/**
 * Checks if a relative path matches simple glob-like ignore patterns.
 * @param {string} relPath
 * @param {string[]} ignorePatterns
 * @returns {boolean}
 */
export function matchesIgnore(relPath, ignorePatterns = []) {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;
  const normalized = relPath.replace(/\\/g, '/');

  for (const pattern of ignorePatterns) {
    const clean = pattern.trim();
    if (!clean || clean.startsWith('#')) continue;

    if (clean.endsWith('/')) {
      const dirPattern = clean.slice(0, -1);
      if (normalized === dirPattern || normalized.startsWith(`${dirPattern}/`)) return true;
    } else if (clean.startsWith('*.')) {
      const ext = clean.slice(1);
      if (normalized.endsWith(ext)) return true;
    } else {
      if (normalized === clean || normalized.endsWith(`/${clean}`)) return true;
    }
  }

  return false;
}
