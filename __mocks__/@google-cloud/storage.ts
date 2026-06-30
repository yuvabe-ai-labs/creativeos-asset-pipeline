import { vi } from "vitest";

// In-memory state per bucket — assertable from tests via `mockBucketState`.
export const mockBucketState = new Map<
  string,
  Map<string, { body: Buffer; contentType: string }>
>();

export function _resetMockStorage(): void {
  mockBucketState.clear();
}

class MockFile {
  constructor(
    private readonly bucketName: string,
    public readonly name: string,
  ) {}
  save = vi.fn(
    async (body: Buffer | Uint8Array, opts: { contentType: string }) => {
      const b = mockBucketState.get(this.bucketName) ?? new Map();
      b.set(this.name, {
        body: Buffer.isBuffer(body) ? body : Buffer.from(body),
        contentType: opts.contentType,
      });
      mockBucketState.set(this.bucketName, b);
    },
  );
  delete = vi.fn(async (_opts?: { ignoreNotFound?: boolean }) => {
    mockBucketState.get(this.bucketName)?.delete(this.name);
  });
}

class MockBucket {
  constructor(public readonly name: string) {}
  file = vi.fn((path: string) => new MockFile(this.name, path));
}

export class Storage {
  constructor(_opts?: unknown) {}
  bucket = vi.fn((name: string) => new MockBucket(name));
}
