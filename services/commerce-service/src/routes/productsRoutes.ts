import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  importStoreProductsStream,
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  findProductByUrl,
  listStoreProductCollections,
  previewAlibabaImport,
  createPendingImportDraft,
  getPendingImportDraft,
} from '../controllers/productsController.js';
import { uploadProductImageFiles } from '../middleware/upload.js';

const router: Router = Router();
const requireProducts = requireModule('products');

router.get('/products', requireAuth, requireTenant, requireProducts, listProducts);
router.post('/products', requireAuth, requireTenant, requireProducts, createProduct);
router.post('/products/uploads', requireAuth, requireTenant, requireProducts, uploadProductImageFiles, uploadProductImages);
router.get('/products/collections', requireAuth, requireTenant, requireProducts, listStoreProductCollections);
router.post('/products/imports/alibaba/preview', requireAuth, requireTenant, requireProducts, previewAlibabaImport);
// Browser-extension handoff: the extension extracts the draft client-side (bypassing the
// server-side scraper's CAPTCHA problem) and posts it here; the web app fetches it once by id.
router.post('/products/imports/draft', requireAuth, requireTenant, requireProducts, createPendingImportDraft);
router.get('/products/imports/draft/:id', requireAuth, requireTenant, requireProducts, getPendingImportDraft);
// Must come before /products/:id, otherwise Express matches "by-url" as the :id param.
router.get('/products/by-url', requireAuth, requireTenant, requireProducts, findProductByUrl);
router.get('/products/:id', requireAuth, requireTenant, requireProducts, getProduct);
router.patch('/products/:id', requireAuth, requireTenant, requireProducts, updateProduct);
router.delete('/products/:id', requireAuth, requireTenant, requireProducts, deleteProduct);
router.get('/stores/:storeId/import/stream', requireAuth, requireTenant, requireProducts, importStoreProductsStream);

export default router;
