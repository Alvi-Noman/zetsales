import { Router } from 'express';
import { overview } from '../controllers/embedController.js';

const router: Router = Router();

router.get('/embed/overview', overview);

export default router;
