/**
 * The operating system's folder picker, opened on the host so a folder is
 * chosen instead of typed. Windows only (the office runs there); elsewhere it
 * answers nothing and the field stays for typing.
 */

import { execFile } from 'child_process';

/** Long enough to browse; a forgotten dialog does not hold a process forever. */
const PICK_TIMEOUT_MS = 10 * 60_000;

// An owner form set TopMost keeps the dialog in front of the office window
// instead of behind it.
const PICKER_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$dialog.Description = 'Elegí la carpeta de tu proyecto'",
  '$dialog.ShowNewFolderButton = $true',
  "if ($dialog.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($dialog.SelectedPath) }",
].join('; ');

export function pickFolder(): Promise<string | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NonInteractive', '-Command', PICKER_SCRIPT],
      { timeout: PICK_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        const picked = String(stdout ?? '').trim();
        resolve(err || !picked ? undefined : picked);
      },
    );
  });
}
