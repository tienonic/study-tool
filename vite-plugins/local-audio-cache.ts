import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

export function resolveAudioCacheTarget(cacheRoot: string, requestedPath: unknown): string | null {
  if (typeof requestedPath !== 'string' || !requestedPath || requestedPath.includes('\\')) return null;
  if (requestedPath.startsWith('/') || requestedPath.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  const extension = extname(requestedPath).toLowerCase();
  if (!Object.hasOwn(CONTENT_TYPES, extension)) return null;
  const root = resolve(cacheRoot);
  const target = resolve(root, requestedPath);
  return target.startsWith(root + sep) ? target : null;
}

export function localAudioCachePlugin() {
  return {
    name: 'local-audio-cache',
    configureServer(server: any) {
      const cacheRoot = process.env.STUDY_AUDIO_CACHE_DIR
        ? resolve(process.env.STUDY_AUDIO_CACHE_DIR)
        : resolve(server.config.root, 'audio-cache');
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/__audio-cache')) return next();
        let requestedPath = '';
        try {
          requestedPath = new URL(req.url, 'http://localhost').searchParams.get('path') ?? '';
        } catch {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid audio request');
          return;
        }
        const target = resolveAudioCacheTarget(cacheRoot, requestedPath);
        if (!target) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid audio path');
          return;
        }
        if (!existsSync(target) || !statSync(target).isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Pronunciation audio not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[extname(target).toLowerCase()],
          'Cache-Control': 'private, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        });
        createReadStream(target).pipe(res);
      });
    },
  };
}
