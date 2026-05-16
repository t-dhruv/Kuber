import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const randomUUID = vi.fn(() => 'fixed-uuid');

vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomUUID,
}));

let attachmentsDir: string;

beforeEach(async () => {
  vi.resetModules();
  randomUUID.mockReturnValue('fixed-uuid');
  attachmentsDir = await mkdtemp(join(tmpdir(), 'kuber-storage-'));
  vi.stubEnv('ATTACHMENTS_DIR', attachmentsDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(attachmentsDir, { recursive: true, force: true });
});

describe('attachment storage', () => {
  it('stores files under household and transaction directories with sanitized filenames', async () => {
    const { storeFile } = await import('./storage');

    const stored = await storeFile('household-1', 'transaction-1', 'receipt March/2026?.pdf', Buffer.from('pdf-bytes'));

    expect(stored).toEqual({
      storagePath: join('household-1', 'transaction-1', 'fixed-uuid-receipt_March_2026_.pdf'),
      filename: 'receipt_March_2026_.pdf',
    });
    await expect(readFile(join(attachmentsDir, stored.storagePath), 'utf8')).resolves.toBe('pdf-bytes');
  });

  it('returns a readable stream for existing stored files', async () => {
    const { getReadStream } = await import('./storage');
    const storagePath = join('household-1', 'transaction-1', 'receipt.txt');
    await writeFile(join(attachmentsDir, storagePath), 'stored content', { flag: 'w' }).catch(async () => {
      await import('fs/promises').then(({ mkdir }) => mkdir(join(attachmentsDir, 'household-1', 'transaction-1'), { recursive: true }));
      await writeFile(join(attachmentsDir, storagePath), 'stored content');
    });

    const stream = getReadStream(storagePath);

    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe('stored content');
  });

  it('returns null for missing stored files', async () => {
    const { getReadStream } = await import('./storage');

    expect(getReadStream('missing/file.txt')).toBeNull();
  });

  it('deletes files and ignores repeated deletion attempts', async () => {
    const { deleteFile } = await import('./storage');
    const dir = join(attachmentsDir, 'household-1', 'transaction-1');
    await import('fs/promises').then(({ mkdir }) => mkdir(dir, { recursive: true }));
    const storagePath = join('household-1', 'transaction-1', 'receipt.txt');
    const fullPath = join(attachmentsDir, storagePath);
    await writeFile(fullPath, 'stored content');

    await deleteFile(storagePath);
    await deleteFile(storagePath);

    expect(existsSync(fullPath)).toBe(false);
  });
});
