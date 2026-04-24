import { createReadStream, existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const BASE_DIR = process.env.ATTACHMENTS_DIR ?? join(process.cwd(), 'data', 'attachments');

export interface StoredFile {
  storagePath: string;
  filename:    string;
}

export async function storeFile(
  householdId: string,
  transactionId: string,
  originalName: string,
  buffer: Buffer,
): Promise<StoredFile> {
  const dir = join(BASE_DIR, householdId, transactionId);
  await mkdir(dir, { recursive: true });

  const uuid       = randomUUID();
  const safeFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename   = `${uuid}-${safeFilename}`;
  const fullPath   = join(dir, filename);

  await writeFile(fullPath, buffer);

  return {
    storagePath: join(householdId, transactionId, filename),
    filename: safeFilename,
  };
}

export function getReadStream(storagePath: string) {
  const fullPath = join(BASE_DIR, storagePath);
  if (!existsSync(fullPath)) return null;
  return createReadStream(fullPath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  const fullPath = join(BASE_DIR, storagePath);
  await unlink(fullPath).catch(() => {});
}
