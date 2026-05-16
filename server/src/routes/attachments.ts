import { Router, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { storeFile, getReadStream, deleteFile } from '../lib/storage';

const router = Router();

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

router.post('/transactions/:txId/attachments', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const journal = await prisma.transactionJournal.findFirst({
      where: { id: req.params.txId, householdId: req.householdId! },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found' });
    if (!req.file) return res.status(400).json({ error: 'File required' });

    const stored = await storeFile(req.householdId!, req.params.txId, req.file.originalname, req.file.buffer);

    const attachment = await prisma.attachment.create({
      data: {
        householdId:   req.householdId!,
        transactionId: req.params.txId,
        filename:      stored.filename,
        mimeType:      req.file.mimetype,
        sizeBytes:     req.file.size,
        storagePath:   stored.storagePath,
      },
    });
    return res.status(201).json({
      id:       attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes('not allowed'))
      return res.status(400).json({ error: err.message });
    req.log.error({ err }, 'attachments/upload');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.use((err: unknown, _req: AuthRequest, res: Response, next: (err?: unknown) => void) => {
  if (err instanceof Error && err.message?.includes('not allowed')) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

router.get('/transactions/:txId/attachments', async (req: AuthRequest, res: Response) => {
  try {
    const journal = await prisma.transactionJournal.findFirst({
      where: { id: req.params.txId, householdId: req.householdId! },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found' });

    const attachments = await prisma.attachment.findMany({
      where:   { transactionId: req.params.txId, householdId: req.householdId! },
      orderBy: { uploadedAt: 'asc' },
      select:  { id: true, filename: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });
    return res.json(attachments);
  } catch (err) {
    req.log.error({ err }, 'attachments/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/attachments/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    const stream = getReadStream(attachment.storagePath);
    if (!stream) return res.status(404).json({ error: 'File not found on disk' });

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
    res.setHeader('Content-Length', attachment.sizeBytes);
    stream.pipe(res);
  } catch (err) {
    req.log.error({ err }, 'attachments/download');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/attachments/:id', async (req: AuthRequest, res: Response) => {
  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    await deleteFile(attachment.storagePath);
    await prisma.attachment.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'attachments/delete');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
