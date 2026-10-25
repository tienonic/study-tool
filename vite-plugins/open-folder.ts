import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { basename, resolve, sep } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function psString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function openWindowsExplorerForeground(absPath: string, select = false) {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class ForegroundWindow {
  static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
  static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
  const UInt32 SWP_NOSIZE = 0x0001;
  const UInt32 SWP_NOMOVE = 0x0002;
  const UInt32 SWP_SHOWWINDOW = 0x0040;

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();

  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, UInt32 uFlags);

  [DllImport("user32.dll")]
  public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

  public static void Force(IntPtr hWnd) {
    ShowWindowAsync(hWnd, 9);

    IntPtr foreground = GetForegroundWindow();
    uint ignored;
    uint currentThread = GetCurrentThreadId();
    uint foregroundThread = GetWindowThreadProcessId(foreground, out ignored);
    uint targetThread = GetWindowThreadProcessId(hWnd, out ignored);
    bool attachedForeground = false;
    bool attachedTarget = false;

    try {
      if (foregroundThread != currentThread) {
        attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
      }
      if (targetThread != currentThread) {
        attachedTarget = AttachThreadInput(currentThread, targetThread, true);
      }
      BringWindowToTop(hWnd);
      SetForegroundWindow(hWnd);
      SwitchToThisWindow(hWnd, true);
    } finally {
      if (attachedTarget) {
        AttachThreadInput(currentThread, targetThread, false);
      }
      if (attachedForeground) {
        AttachThreadInput(currentThread, foregroundThread, false);
      }
    }

    SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    SetForegroundWindow(hWnd);
  }
}
'@`,
    'function Normalize-FolderPath([string]$value) {',
    '  if (-not $value) { return $null }',
    '  return [System.IO.Path]::GetFullPath($value).TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))',
    '}',
    `$target = ${psString(absPath)}`,
    `$select = ${select ? '$true' : '$false'}`,
    '$targetPath = [System.IO.Path]::GetFullPath($target)',
    '$folderPath = if ($select) { Split-Path -LiteralPath $targetPath -Parent } else { $targetPath }',
    '$shell = New-Object -ComObject Shell.Application',
    '$targetFolder = Normalize-FolderPath $folderPath',
    'function Focus-MatchingExplorerFolder {',
    '  foreach ($window in @($shell.Windows())) {',
    '    try {',
    '      $currentFolder = Normalize-FolderPath $window.Document.Folder.Self.Path',
    '      if ($currentFolder -and ($currentFolder -ieq $targetFolder)) {',
    '        $hwnd = [IntPtr]$window.HWND',
    '        [ForegroundWindow]::Force($hwnd)',
    '        return $true',
    '      }',
    '    } catch { }',
    '  }',
    '  return $false',
    '}',
    'if (-not $select -and (Focus-MatchingExplorerFolder)) { exit 0 }',
    '$argument = if ($select) { \'/select,"\' + $targetPath + \'"\' } else { \'"\' + $targetPath + \'"\' }',
    'Start-Process -FilePath explorer.exe -ArgumentList $argument',
    'for ($i = 0; $i -lt 25; $i++) {',
    '  Start-Sleep -Milliseconds 120',
    '  if (Focus-MatchingExplorerFolder) { exit 0 }',
    '}',
  ].join('\n');

  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
}

async function openWindowsProjectFilePicker(initialDirectory: string) {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$owner = New-Object System.Windows.Forms.Form',
    "$owner.Text = 'Drill Project Picker'",
    '$owner.Size = New-Object System.Drawing.Size(1, 1)',
    '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
    '$owner.ShowInTaskbar = $false',
    '$owner.TopMost = $true',
    '$owner.Opacity = 0',
    '$owner.Show()',
    '$owner.Activate()',
    '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
    `$dialog.InitialDirectory = ${psString(initialDirectory)}`,
    "$dialog.Filter = 'JSON project files (*.json)|*.json|All files (*.*)|*.*'",
    "$dialog.Title = 'Open project JSON'",
    '$dialog.Multiselect = $false',
    '$dialog.RestoreDirectory = $false',
    '$result = $dialog.ShowDialog($owner)',
    '$owner.Dispose()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  $dialog.FileName | ConvertTo-Json -Compress',
    '}',
  ].join('; ');

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
  const output = stdout.trim();
  return output ? (JSON.parse(output) as string) : null;
}

function sendJson(res: any, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function resolveUnderRoot(root: string, relPath: string) {
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, relPath);
  if (targetPath !== rootPath && !targetPath.startsWith(rootPath + sep)) {
    return null;
  }
  return targetPath;
}

export function isProjectDirectoryRequest(value: unknown): value is string {
  return value === 'projects';
}

function openInExplorerDetached(absPath: string, select = false) {
  const args = select ? [`/select,${absPath}`] : [absPath];
  const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function openInExplorer(absPath: string, select = false) {
  if (process.platform !== 'win32') {
    openInExplorerDetached(absPath, select);
    return;
  }

  try {
    await openWindowsExplorerForeground(absPath, select);
  } catch {
    openInExplorerDetached(absPath, select);
  }
}

async function listProjectJsonFiles(projectsDir: string) {
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(jsonFiles.map(async (file) => {
    const filePath = resolve(projectsDir, file);
    const fileStat = await stat(filePath);
    try {
      const contents = await readFile(filePath, 'utf8');
      const data = JSON.parse(contents) as { name?: unknown };
      return {
        file,
        name: typeof data.name === 'string' ? data.name : file.replace(/\.json$/i, ''),
        createdAt: fileStat.birthtime.toISOString(),
        modifiedAt: fileStat.mtime.toISOString(),
        size: fileStat.size,
      };
    } catch {
      return {
        file,
        name: file.replace(/\.json$/i, ''),
        createdAt: fileStat.birthtime.toISOString(),
        modifiedAt: fileStat.mtime.toISOString(),
        size: fileStat.size,
      };
    }
  }));
}

export function openFolderPlugin() {
  return {
    name: 'open-folder',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url?.startsWith('/__open-folder')) {
          const url = new URL(req.url, 'http://localhost');
          const relPath = url.searchParams.get('path');
          if (!relPath) {
            res.statusCode = 400;
            res.end('Missing path');
            return;
          }
          const absPath = resolveUnderRoot(server.config.root, relPath);
          if (!absPath) {
            res.statusCode = 400;
            res.end('Invalid path');
            return;
          }
          const hasExt = /\.\w+$/.test(relPath);
          if (hasExt) {
            await openInExplorer(absPath, true);
          } else {
            await openInExplorer(absPath);
          }
          res.statusCode = 200;
          res.end('ok');
          return;
        }
        if (req.url?.startsWith('/__project-files')) {
          const url = new URL(req.url, 'http://localhost');
          const relDir = url.searchParams.get('dir') ?? 'projects';
          if (!isProjectDirectoryRequest(relDir)) {
            sendJson(res, 400, { error: 'Invalid projects folder.' });
            return;
          }
          const projectsDir = resolveUnderRoot(server.config.root, relDir);
          if (!projectsDir || !existsSync(projectsDir)) {
            sendJson(res, 404, { error: 'Projects folder not found.' });
            return;
          }

          try {
            sendJson(res, 200, { files: await listProjectJsonFiles(projectsDir) });
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : 'Failed to list project files',
            });
          }
          return;
        }
        if (req.url?.startsWith('/__project-file')) {
          const url = new URL(req.url, 'http://localhost');
          const relDir = url.searchParams.get('dir') ?? 'projects';
          const file = url.searchParams.get('file');
          if (!isProjectDirectoryRequest(relDir)) {
            sendJson(res, 400, { error: 'Invalid projects folder.' });
            return;
          }
          const projectsDir = resolveUnderRoot(server.config.root, relDir);
          if (!projectsDir || !existsSync(projectsDir)) {
            sendJson(res, 404, { error: 'Projects folder not found.' });
            return;
          }
          if (!file || basename(file) !== file || !file.toLowerCase().endsWith('.json')) {
            sendJson(res, 400, { error: 'Invalid project file.' });
            return;
          }

          try {
            const contents = await readFile(resolve(projectsDir, file), 'utf8');
            sendJson(res, 200, { file, contents });
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : 'Failed to read project file',
            });
          }
          return;
        }
        if (req.url?.startsWith('/__open-project-file')) {
          if (process.platform !== 'win32') {
            sendJson(res, 501, { error: 'Native project picker is only available on Windows.' });
            return;
          }

          const url = new URL(req.url, 'http://localhost');
          const relDir = url.searchParams.get('dir') ?? 'projects';
          if (!isProjectDirectoryRequest(relDir)) {
            sendJson(res, 400, { error: 'Invalid projects folder.' });
            return;
          }
          const requestedDir = resolveUnderRoot(server.config.root, relDir);
          if (!requestedDir) {
            sendJson(res, 400, { error: 'Invalid projects folder.' });
            return;
          }
          const initialDirectory = existsSync(requestedDir) ? requestedDir : server.config.root;

          try {
            const selectedPath = await openWindowsProjectFilePicker(initialDirectory);
            if (!selectedPath) {
              res.statusCode = 204;
              res.end();
              return;
            }
            const selectedProjectPath = resolveUnderRoot(requestedDir, selectedPath);
            if (!selectedProjectPath || !selectedProjectPath.toLowerCase().endsWith('.json')) {
              sendJson(res, 400, { error: 'Selected file must be a JSON project in the projects folder.' });
              return;
            }

            const contents = await readFile(selectedProjectPath, 'utf8');
            sendJson(res, 200, { path: selectedProjectPath, contents });
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : 'Failed to open project file',
            });
          }
          return;
        }
        next();
      });
    },
  };
}
