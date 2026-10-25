import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const route = '/api/learning/';
const topicFile = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;

export function learningWorkspaceMiddleware(projectRoot: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith(route)) return next();
    const reply = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return reply(405, { error: 'Use GET to read a learning topic.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      return reply(403, { error: 'Open this topic from the local Study Tool.' });
    }
    let file: string;
    try { file = decodeURIComponent(req.url.slice(route.length).split('?')[0]); }
    catch { return reply(400, { error: 'Invalid topic file.' }); }
    if (!topicFile.test(file)) return reply(400, { error: 'Invalid topic file.' });
    try {
      const root = await realpath(resolve(projectRoot, 'exports', 'learning'));
      const target = await realpath(resolve(root, file));
      if (!target.startsWith(root + sep)) return reply(403, { error: 'Invalid topic location.' });
      const info = await stat(target);
      if (!info.isFile() || info.size > 2_000_000) return reply(413, { error: 'The topic snapshot is too large.' });
      const receipt = JSON.parse(await readFile(target, 'utf8'));
      if (!receipt.workspace || typeof receipt.workspace !== 'object' || Array.isArray(receipt.workspace)) {
        return reply(409, { error: 'This topic needs a fresh Pi workspace snapshot.' });
      }
      return reply(200, {
        workspace: receipt.workspace,
        generatedAt: receipt.workspace.generatedAt ?? receipt.generatedAt ?? receipt.generated_at ?? info.mtime.toISOString(),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply(404, { error: 'This topic has no saved workspace yet.' });
      }
      return reply(500, { error: 'The saved topic could not be read.' });
    }
  };
}

export function learningWorkspacePlugin(): Plugin {
  return {
    name: 'learning-workspace',
    configureServer(server) {
      server.middlewares.use(learningWorkspaceMiddleware(server.config.root));
    },
  };
}
