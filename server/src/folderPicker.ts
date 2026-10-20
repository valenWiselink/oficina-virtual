/**
 * The operating system's folder picker, opened on the host so a folder is
 * chosen instead of typed. Windows only (the office runs there); elsewhere it
 * answers nothing and the field stays for typing.
 */

import { execFile } from 'child_process';

/** Long enough to browse; a forgotten dialog does not hold a process forever. */
const PICK_TIMEOUT_MS = 10 * 60_000;

// Windows' modern folder picker (the Explorer one, IFileOpenDialog with
// FOS_PICKFOLDERS) through a little C# interop: PowerShell 5.1's
// FolderBrowserDialog is the old tree dialog. An owner form set TopMost keeps
// it in front of the office window. Sent as -EncodedCommand (UTF-16LE base64),
// so no quoting gets in the way. The desktop app uses Electron's own instead.
const PICKER_SCRIPT = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ModernFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr bc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  const uint PickFolders = 0x20, ForceFileSystem = 0x40, FileSystemPath = 0x80058000;
  public static string Pick(IntPtr owner, string title) {
    var dialog = (IFileDialog)new FileOpenDialog();
    uint options;
    dialog.GetOptions(out options);
    dialog.SetOptions(options | PickFolders | ForceFileSystem);
    dialog.SetTitle(title);
    if (dialog.Show(owner) != 0) return null;
    IShellItem item;
    dialog.GetResult(out item);
    string path;
    item.GetDisplayName(FileSystemPath, out path);
    return path;
  }
}
'@
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
$picked = [ModernFolderPicker]::Pick($owner.Handle, 'Elegí la carpeta de tu proyecto')
if ($picked) { [Console]::Out.Write($picked) }`;
const ENCODED_PICKER = Buffer.from(PICKER_SCRIPT, 'utf16le').toString('base64');

export function pickFolder(): Promise<string | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NonInteractive', '-EncodedCommand', ENCODED_PICKER],
      { timeout: PICK_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        const picked = String(stdout ?? '').trim();
        resolve(err || !picked ? undefined : picked);
      },
    );
  });
}
