import { posix, resolve, sep, win32 } from 'path';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';

const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMESTAMPED_EXPORT_PATTERN = /^export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/;

export function isValidExportSlug(value: unknown): value is string {
  return typeof value === 'string' && PROJECT_SLUG_PATTERN.test(value);
}

export function isAppOwnedExportFileName(value: unknown): value is string {
  return value === 'autosave.json'
    || (typeof value === 'string' && TIMESTAMPED_EXPORT_PATTERN.test(value));
}

export function resolveExportTarget(exportsRoot: string, slug: unknown, fileName: unknown): string | null {
  if (!isValidExportSlug(slug) || !isAppOwnedExportFileName(fileName)) return null;
  const pathApi = posix.isAbsolute(exportsRoot)
    ? posix
    : win32.isAbsolute(exportsRoot)
      ? win32
      : { resolve, sep };
  const root = pathApi.resolve(exportsRoot);
  const target = pathApi.resolve(root, slug, fileName);
  return target.startsWith(root + pathApi.sep) ? target : null;
}

export function exportPlugin() {
  return {
    name: 'export-data',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method === 'GET' && req.url?.startsWith('/api/autosave/')) {
          let slug: string;
          try {
            slug = decodeURIComponent(req.url.slice('/api/autosave/'.length));
          } catch {
            slug = '';
          }
          if (!isValidExportSlug(slug)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid slug');
            return;
          }
          const filePath = resolveExportTarget(resolve(server.config.root, 'exports'), slug, 'autosave.json');
          if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid export path');
            return;
          }
          if (!existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('No autosave found');
            return;
          }
          try {
            const content = readFileSync(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
          } catch {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Failed to read autosave');
          }
          return;
        }

        if (req.method !== 'POST' || req.url !== '/api/export') return next();

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { slug, fileName, data } = JSON.parse(body);
            if (data === undefined) throw new Error('missing data');
            const exportsRoot = resolve(server.config.root, 'exports');
            const filePath = resolveExportTarget(exportsRoot, slug, fileName);
            if (!filePath) throw new Error('invalid export path');
            const dir = resolve(exportsRoot, slug);
            mkdirSync(dir, { recursive: true });
            writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`\x1b[32m[export]\x1b[0m ${slug}/${fileName}`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
          } catch (err: any) {
            console.log(`\x1b[31m[export] error:\x1b[0m ${err.message}`);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(err.message);
          }
        });
      });
    },
  };
}
