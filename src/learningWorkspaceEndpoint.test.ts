import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learningWorkspaceMiddleware } from '../vite-plugins/learning-workspace.ts';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'study-workspace-'));
  roots.push(root);
  const directory = join(root, 'exports', 'learning');
  await mkdir(directory, { recursive: true });
  const middleware = learningWorkspaceMiddleware(root);
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404).end(); }));
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start.');
  return { root, directory, url: `http://127.0.0.1:${address.port}/api/learning/` };
}

describe('Learning workspace receipt endpoint', () => {
  it('returns the current workspace without exporting private attempt text', async () => {
    const f = await fixture();
    const file = join(f.directory, 'exam-1.json');
    await writeFile(file, JSON.stringify({ workspace: { topic_id: 'exam-1' }, attempts: [{ answer: 'private reasoning' }] }));
    const first = await fetch(f.url + 'exam-1.json');
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(await first.json()).toMatchObject({ workspace: { topic_id: 'exam-1' } });
    await writeFile(file, JSON.stringify({ workspace: { topic_id: 'exam-1', goal: 'Updated goal' } }));
    expect(await (await fetch(f.url + 'exam-1.json')).json()).toMatchObject({ workspace: { goal: 'Updated goal' } });
  });

  it('rejects traversal, symlink escape, cross-origin reads and writes', async () => {
    const f = await fixture();
    const outside = join(f.root, 'private.json');
    await writeFile(outside, JSON.stringify({ workspace: { secret: true } }));
    await symlink(outside, join(f.directory, 'escape.json'));
    expect((await fetch(f.url + '%2e%2e%2fprivate.json')).status).toBe(400);
    expect((await fetch(f.url + 'escape.json')).status).toBe(403);
    expect((await fetch(f.url + 'exam.json', { headers: { Origin: 'https://example.com' } })).status).toBe(403);
    expect((await fetch(f.url + 'exam.json', { method: 'POST', body: '{}' })).status).toBe(405);
  });

  it('distinguishes missing, old and invalid snapshots', async () => {
    const f = await fixture();
    expect((await fetch(f.url + 'missing.json')).status).toBe(404);
    await writeFile(join(f.directory, 'old.json'), '{}');
    expect((await fetch(f.url + 'old.json')).status).toBe(409);
    await writeFile(join(f.directory, 'broken.json'), '{');
    expect((await fetch(f.url + 'broken.json')).status).toBe(500);
  });
});
