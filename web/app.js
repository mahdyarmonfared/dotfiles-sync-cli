/**
 * Dotfiles Sync Web Dashboard Application
 * Reactive frontend for inspecting, backing up, diffing, and restoring developer configuration files.
 */

let scannedItems = [];
let backupsList = [];
let currentCategory = 'all';
let selectedRelPaths = new Set();
let activeRestoreDir = null;

// DOM Elements
const homeDirPath = document.getElementById('homeDirPath');
const valDetected = document.getElementById('valDetected');
const valTotalTargets = document.getElementById('valTotalTargets');
const valSecurity = document.getElementById('valSecurity');
const valSecuritySub = document.getElementById('valSecuritySub');
const valBackups = document.getElementById('valBackups');
const valTotalSize = document.getElementById('valTotalSize');
const dotfilesList = document.getElementById('dotfilesList');
const tabBackupCount = document.getElementById('tabBackupCount');
const btnRescan = document.getElementById('btnRescan');
const btnOpenBackupModal = document.getElementById('btnOpenBackupModal');
const backupModal = document.getElementById('backupModal');
const btnCloseBackupModal = document.getElementById('btnCloseBackupModal');
const btnCancelBackup = document.getElementById('btnCancelBackup');
const btnConfirmBackup = document.getElementById('btnConfirmBackup');
const chkSanitize = document.getElementById('chkSanitize');
const chkDryRun = document.getElementById('chkDryRun');
const restoreModal = document.getElementById('restoreModal');
const btnCloseRestoreModal = document.getElementById('btnCloseRestoreModal');
const btnCancelRestore = document.getElementById('btnCancelRestore');
const btnConfirmRestore = document.getElementById('btnConfirmRestore');
const restoreTargetDir = document.getElementById('restoreTargetDir');
const chkRestoreDryRun = document.getElementById('chkRestoreDryRun');
const diffFileSelect = document.getElementById('diffFileSelect');
const diffViewer = document.getElementById('diffViewer');
const diffAdds = document.getElementById('diffAdds');
const diffDels = document.getElementById('diffDels');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnDeselectAll = document.getElementById('btnDeselectAll');
const btnThemeToggle = document.getElementById('btnThemeToggle');
const iconSun = document.getElementById('iconSun');
const iconMoon = document.getElementById('iconMoon');

async function init() {
  setupTheme();
  setupTabs();
  setupModals();
  setupFilters();

  await Promise.all([fetchScan(), fetchBackups()]);

  btnRescan.addEventListener('click', async () => {
    btnRescan.classList.add('loading');
    await fetchScan();
    await fetchBackups();
    btnRescan.classList.remove('loading');
    showToast('System scan refreshed', 'success');
  });

  diffFileSelect.addEventListener('change', (e) => {
    loadDiff(e.target.value);
  });

  btnSelectAll.addEventListener('click', () => {
    scannedItems.filter(i => i.exists && !i.isExcluded).forEach(i => selectedRelPaths.add(i.relPath));
    renderDotfiles();
  });

  btnDeselectAll.addEventListener('click', () => {
    selectedRelPaths.clear();
    renderDotfiles();
  });
}

// 1. Theme Management
function setupTheme() {
  const theme = localStorage.getItem('dotfiles_theme') || 'dark';
  applyTheme(theme);

  btnThemeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('dotfiles_theme', newTheme);
  });
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
    iconSun.style.display = 'none';
    iconMoon.style.display = 'block';
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
    iconSun.style.display = 'block';
    iconMoon.style.display = 'none';
  }
}

// 2. Tabs Management
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetId = btn.dataset.tab;
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'diffTab' && diffFileSelect.value) {
        loadDiff(diffFileSelect.value);
      }
    });
  });
}

// 3. Category Filter
function setupFilters() {
  document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentCategory = chip.dataset.cat;
      renderDotfiles();
    });
  });
}

// 4. Modals Setup
function setupModals() {
  btnOpenBackupModal.addEventListener('click', () => {
    backupModal.showModal();
  });

  const closeBackup = () => backupModal.close();
  btnCloseBackupModal.addEventListener('click', closeBackup);
  btnCancelBackup.addEventListener('click', closeBackup);

  btnConfirmBackup.addEventListener('click', async () => {
    closeBackup();
    await executeBackup();
  });

  const closeRestore = () => restoreModal.close();
  btnCloseRestoreModal.addEventListener('click', closeRestore);
  btnCancelRestore.addEventListener('click', closeRestore);

  btnConfirmRestore.addEventListener('click', async () => {
    closeRestore();
    await executeRestore();
  });
}

// 5. Data Fetching
async function fetchScan() {
  try {
    const res = await fetch('/api/scan');
    if (res.ok) {
      const data = await res.json();
      homeDirPath.textContent = data.homeDir;
      scannedItems = data.items;

      // Initialize selected set with all detected
      selectedRelPaths.clear();
      scannedItems.filter(i => i.exists && !i.isExcluded).forEach(i => selectedRelPaths.add(i.relPath));

      updateMetrics();
      renderDotfiles();
      populateDiffPicker();
    }
  } catch (err) {
    showToast('Failed to load system scan', 'error');
  }
}

async function fetchBackups() {
  try {
    const res = await fetch('/api/backups');
    if (res.ok) {
      const data = await res.json();
      backupsList = data.backups || [];
      valBackups.textContent = backupsList.length;
      tabBackupCount.textContent = backupsList.length;
      renderBackups();
    }
  } catch (err) {
    console.error('Error fetching backups:', err);
  }
}

// 6. Metrics Update
function updateMetrics() {
  const detected = scannedItems.filter(i => i.exists);
  valDetected.textContent = detected.length;
  valTotalTargets.textContent = `out of ${scannedItems.length} recognized targets`;

  const totalBytes = detected.reduce((sum, item) => sum + item.size, 0);
  valTotalSize.textContent = `${(totalBytes / 1024).toFixed(1)} KB`;

  const secretsCount = detected.reduce((sum, item) => sum + (item.secrets ? item.secrets.length : 0), 0);
  if (secretsCount > 0) {
    valSecurity.textContent = 'Warning';
    valSecurity.className = 'metric-value' + ' text-danger';
    valSecuritySub.textContent = `${secretsCount} sensitive tokens flagged`;
  } else {
    valSecurity.textContent = 'Clean';
    valSecurity.className = 'metric-value status-safe';
    valSecuritySub.textContent = '0 secret patterns detected';
  }
}

// 7. Render Dotfiles Cards
function renderDotfiles() {
  dotfilesList.innerHTML = '';
  const filtered = scannedItems.filter(i => {
    if (currentCategory === 'all') return true;
    return i.category === currentCategory;
  });

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'dotfile-card';

    const isChecked = selectedRelPaths.has(item.relPath);
    const catClass = `badge-${item.category.toLowerCase()}`;

    let secBadge = '';
    if (item.secrets && item.secrets.length > 0) {
      secBadge = `<span class="status-chip chip-warning" title="${item.secrets.map(s => s.rule).join(', ')}">⚠ ${item.secrets.length} Secrets</span>`;
    } else if (item.exists) {
      secBadge = `<span class="status-chip chip-safe">✔ Safe</span>`;
    } else {
      secBadge = `<span class="status-chip chip-missing">Not Found</span>`;
    }

    card.innerHTML = `
      <div class="card-top">
        <label class="file-label-wrap">
          <input type="checkbox" data-rel="${item.relPath}" ${isChecked ? 'checked' : ''} ${!item.exists ? 'disabled' : ''}>
          <span class="file-name">${item.relPath}</span>
        </label>
        <span class="file-badge ${catClass}">${item.category}</span>
      </div>
      <div class="card-desc">${item.description}</div>
      <div class="card-meta">
        <span>${item.exists ? (item.size / 1024).toFixed(1) + ' KB' : '--'}</span>
        ${secBadge}
      </div>
    `;

    const chk = card.querySelector('input[type="checkbox"]');
    if (chk) {
      chk.addEventListener('change', (e) => {
        if (e.target.checked) selectedRelPaths.add(item.relPath);
        else selectedRelPaths.delete(item.relPath);
      });
    }

    dotfilesList.appendChild(card);
  });
}

// 8. Diff Inspector
function populateDiffPicker() {
  diffFileSelect.innerHTML = '';
  const detected = scannedItems.filter(i => i.exists);
  detected.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.relPath;
    opt.textContent = `${item.relPath} (${item.category})`;
    diffFileSelect.appendChild(opt);
  });

  if (detected.length > 0) {
    diffFileSelect.value = detected[0].relPath;
  }
}

async function loadDiff(relPath) {
  if (!relPath) return;
  diffViewer.textContent = 'Calculating differences…';

  try {
    const res = await fetch('/api/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath })
    });

    if (res.ok) {
      const data = await res.json();
      diffAdds.textContent = `+${data.additions}`;
      diffDels.textContent = `-${data.deletions}`;

      if (!data.hasChanges) {
        diffViewer.textContent = `Active ${relPath} is identical to the snapshot version (No changes).`;
      } else {
        diffViewer.innerHTML = '';
        data.lines.forEach(l => {
          const div = document.createElement('div');
          if (l.type === 'add') {
            div.className = 'diff-line-add';
            div.textContent = `+ ${l.text}`;
          } else if (l.type === 'del') {
            div.className = 'diff-line-del';
            div.textContent = `- ${l.text}`;
          } else {
            div.textContent = `  ${l.text}`;
          }
          diffViewer.appendChild(div);
        });
      }
    }
  } catch (err) {
    diffViewer.textContent = 'Failed to load diff.';
  }
}

// 9. Backup Execution
async function executeBackup() {
  const sanitize = chkSanitize.checked;
  const dryRun = chkDryRun.checked;
  const paths = Array.from(selectedRelPaths);

  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedRelPaths: paths, sanitize, dryRun })
    });

    if (res.ok) {
      const data = await res.json();
      showToast(dryRun ? `Dry-run simulated for ${data.filesBackedUp} files` : `Backup created with ${data.filesBackedUp} files!`, 'success');
      await fetchBackups();
    } else {
      showToast('Backup request failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to backup server', 'error');
  }
}

// 10. Render Backups List
function renderBackups() {
  const container = document.getElementById('backupsList');
  container.innerHTML = '';

  if (backupsList.length === 0) {
    container.innerHTML = `<div class="card-desc">No snapshots found yet. Click 'Create Backup' to make your first snapshot.</div>`;
    return;
  }

  backupsList.forEach(b => {
    const item = document.createElement('div');
    item.className = 'backup-item';
    const dateStr = new Date(b.manifest.createdAt).toLocaleString();

    item.innerHTML = `
      <div class="backup-info">
        <div class="backup-name">${b.dirName}</div>
        <div class="backup-details">
          <span>📅 ${dateStr}</span>
          <span>📁 ${b.manifest.filesCount} files</span>
          <span>💻 ${b.manifest.hostname} (${b.manifest.platform})</span>
          <span>🛡️ ${b.manifest.sanitized ? 'Tokens Redacted' : 'Raw'}</span>
        </div>
      </div>
      <div>
        <button class="action-btn btn-secondary btn-restore" data-path="${b.dirPath}">Restore Snapshot</button>
      </div>
    `;

    item.querySelector('.btn-restore').addEventListener('click', () => {
      activeRestoreDir = b.dirPath;
      restoreTargetDir.textContent = b.dirName;
      restoreModal.showModal();
    });

    container.appendChild(item);
  });
}

// 11. Restore Execution
async function executeRestore() {
  const dryRun = chkRestoreDryRun.checked;
  try {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupDir: activeRestoreDir, dryRun })
    });

    if (res.ok) {
      const data = await res.json();
      showToast(dryRun ? `Dry-run: ${data.filesRestored} files would be restored` : `Restored ${data.filesRestored} files safely!`, 'success');
      await fetchScan();
    } else {
      showToast('Restore failed', 'error');
    }
  } catch (err) {
    showToast('Failed to restore snapshot', 'error');
  }
}

// Toast helper
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

document.addEventListener('DOMContentLoaded', init);
