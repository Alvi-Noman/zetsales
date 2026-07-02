import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import { importStoreProductsStream, listProducts, createProduct, getProduct, updateProduct, deleteProduct } from '../controllers/productsController.js';

const router: Router = Router();

router.get('/products', requireAuth, requireTenant, listProducts);
router.post('/products', requireAuth, requireTenant, createProduct);
router.get('/products/:id', requireAuth, requireTenant, getProduct);
router.patch('/products/:id', requireAuth, requireTenant, updateProduct);
router.delete('/products/:id', requireAuth, requireTenant, deleteProduct);
router.get('/stores/:storeId/import/stream', requireAuth, requireTenant, importStoreProductsStream);

export default router;
