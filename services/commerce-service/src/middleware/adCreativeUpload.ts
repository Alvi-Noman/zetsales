import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { UPLOAD_DIR } from './upload.js';

// Separate subfolder from product images — ad creatives include video, which needs a much larger
// size ceiling than the 5MB product-image limit in upload.ts.
export const AD_CREATIVE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'ad-creatives');
fs.mkdirSync(AD_CREATIVE_UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AD_CREATIVE_UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

export const uploadAdCreativeFiles: RequestHandler = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP images or MP4/MOV/WEBM videos are allowed'));
      return;
    }
    cb(null, true);
  },
}).array('files', 20);
