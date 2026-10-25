import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { resolveAudioCacheTarget } from '../../../vite-plugins/local-audio-cache.ts';

describe('local pronunciation cache path confinement', () => {
  it('accepts supported files below the cache root', () => {
    const cacheRoot = resolve('cache', 'audio');
    expect(resolveAudioCacheTarget(cacheRoot, 'sample/hash.mp3')).toBe(join(cacheRoot, 'sample', 'hash.mp3'));
  });

  it('rejects traversal, absolute paths, backslashes, and non-audio files', () => {
    expect(resolveAudioCacheTarget('/cache/audio', '../secret.mp3')).toBeNull();
    expect(resolveAudioCacheTarget('/cache/audio', '/secret.mp3')).toBeNull();
    expect(resolveAudioCacheTarget('/cache/audio', 'sample\\secret.mp3')).toBeNull();
    expect(resolveAudioCacheTarget('/cache/audio', 'sample/manifest.json')).toBeNull();
  });
});
