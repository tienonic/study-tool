export interface Guard {
  withActing<T>(fn: () => Promise<T>): Promise<T | undefined>;
  isActing(): boolean;
}

export function createGuard(): Guard {
  let acting = false;

  return {
    async withActing<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (acting) return undefined;
      acting = true;
      try {
        return await fn();
      } catch (err) {
        console.error('[quiz] action error:', err);
        throw err;
      } finally {
        acting = false;
      }
    },
    isActing() {
      return acting;
    },
  };
}
