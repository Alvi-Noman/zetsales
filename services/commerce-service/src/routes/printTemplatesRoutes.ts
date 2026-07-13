import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  listPrintTemplates,
  createPrintTemplate,
  updatePrintTemplate,
  deletePrintTemplate,
  setDefaultPrintTemplate,
  uploadPrintTemplateLogo,
} from '../controllers/printTemplatesController.js';
import { uploadLogoFile } from '../middleware/upload.js';

const router: Router = Router();
const requirePrintOut = requireModule('printOut');

router.get('/print-templates', requireAuth, requireTenant, requirePrintOut, listPrintTemplates);
router.post('/print-templates', requireAuth, requireTenant, requirePrintOut, createPrintTemplate);
router.patch('/print-templates/:id', requireAuth, requireTenant, requirePrintOut, updatePrintTemplate);
router.delete('/print-templates/:id', requireAuth, requireTenant, requirePrintOut, deletePrintTemplate);
router.post('/print-templates/:id/set-default', requireAuth, requireTenant, requirePrintOut, setDefaultPrintTemplate);
router.post('/print-templates/logo', requireAuth, requireTenant, requirePrintOut, uploadLogoFile, uploadPrintTemplateLogo);

export default router;
