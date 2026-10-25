import { describe, expect, it } from 'vitest';
import { isAllowedClaudeModel } from '../vite-plugins/ai-bridge.ts';
import {
  isAppOwnedExportFileName,
  isValidExportSlug,
  resolveExportTarget,
} from '../vite-plugins/export-data.ts';
import { isProjectDirectoryRequest } from '../vite-plugins/open-folder.ts';

describe('Vite dev middleware security boundaries', () => {
  it('accepts only project-style slugs and app-owned export filenames', () => {
    expect(isValidExportSlug('spanish-ag-plant-20260716')).toBe(true);
    for (const value of ['', '..', '../private', '..\\private', '/tmp', 'with space', 'UPPER']) {
      expect(isValidExportSlug(value)).toBe(false);
    }

    expect(isAppOwnedExportFileName('autosave.json')).toBe(true);
    expect(isAppOwnedExportFileName('export-2026-07-16T14-05-59.json')).toBe(true);
    for (const value of ['backup.json', '../autosave.json', '..\\autosave.json', 'export-latest.json']) {
      expect(isAppOwnedExportFileName(value)).toBe(false);
    }
  });

  it('resolves accepted exports beneath the configured exports root', () => {
    const windowsRoot = 'C:\\study-tool\\exports';
    const windowsTarget = resolveExportTarget(windowsRoot, 'spanish-ag-plant', 'autosave.json');
    expect(windowsTarget).toBe('C:\\study-tool\\exports\\spanish-ag-plant\\autosave.json');
    expect(resolveExportTarget(windowsRoot, '../private', 'autosave.json')).toBeNull();
    expect(resolveExportTarget(windowsRoot, 'spanish-ag-plant', '..\\private.json')).toBeNull();

    const posixRoot = '/opt/study-tool/exports';
    const posixTarget = resolveExportTarget(posixRoot, 'spanish-ag-plant', 'autosave.json');
    expect(posixTarget).toBe('/opt/study-tool/exports/spanish-ag-plant/autosave.json');
  });

  it('limits project routes and AI models to explicit allowlists', () => {
    expect(isProjectDirectoryRequest('projects')).toBe(true);
    for (const value of ['.', 'src/projects', 'exports', '../projects', 'projects/..']) {
      expect(isProjectDirectoryRequest(value)).toBe(false);
    }

    for (const value of ['haiku', 'sonnet', 'opus']) {
      expect(isAllowedClaudeModel(value)).toBe(true);
    }
    for (const value of ['', 'sonnet --dangerously-skip-permissions', 'sonnet; whoami', { model: 'sonnet' }]) {
      expect(isAllowedClaudeModel(value)).toBe(false);
    }
  });
});
