import multer from 'multer';
import type { RequestHandler } from 'express';

// In-memory, not disk — the file is parsed once into csvImportDrafts (see csvOrderImportController)
// and never needs to persist as a file on disk the way product images do.
const ALLOWED_MIME_TYPES = new Set(['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain']);

export const uploadCsvFile: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !file.originalname.toLowerCase().endsWith('.csv')) {
      cb(new Error('Only CSV files are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('file');
