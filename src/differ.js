/**
 * Dotfiles Line-by-Line Differ
 * Generates unified and structured diffs between active configuration files and backed-up versions.
 */

/**
 * Computes a unified diff between two text contents.
 * @param {string} oldText
 * @param {string} newText
 * @param {string} [oldHeader='backup']
 * @param {string} [newHeader='current']
 * @returns {{ unified: string, additions: number, deletions: number, hasChanges: boolean, lines: Array<{ type: 'add'|'del'|'same', text: string }> }}
 */
export function computeDiff(oldText = '', newText = '', oldHeader = 'backup', newHeader = 'current') {
  if (oldText === newText) {
    return {
      unified: '',
      additions: 0,
      deletions: 0,
      hasChanges: false,
      lines: []
    };
  }

  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  // Simple LCS-based or line-matching diff algorithm
  const lines = [];
  let additions = 0;
  let deletions = 0;

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      lines.push({ type: 'same', text: oldLines[i] });
      i++;
      j++;
    } else {
      // Lookahead to see if next lines match
      const nextMatchInNew = newLines.indexOf(oldLines[i], j);
      const nextMatchInOld = oldLines.indexOf(newLines[j], i);

      if (i < oldLines.length && (nextMatchInNew === -1 || (nextMatchInOld !== -1 && nextMatchInOld - i < nextMatchInNew - j))) {
        lines.push({ type: 'del', text: oldLines[i] });
        deletions++;
        i++;
      } else if (j < newLines.length) {
        lines.push({ type: 'add', text: newLines[j] });
        additions++;
        j++;
      } else {
        lines.push({ type: 'del', text: oldLines[i] });
        deletions++;
        i++;
      }
    }
  }

  const unifiedHeader = `--- ${oldHeader}\n+++ ${newHeader}\n@@ -1,${oldLines.length} +1,${newLines.length} @@`;
  const unifiedBody = lines.map(l => {
    if (l.type === 'add') return `+${l.text}`;
    if (l.type === 'del') return `-${l.text}`;
    return ` ${l.text}`;
  }).join('\n');

  return {
    unified: `${unifiedHeader}\n${unifiedBody}`,
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
    lines
  };
}
