import { Router } from 'express';
import { createGRN } from '../controllers/grn.controller';
import { requireAuth, requirePermission } from '../middlewares/auth';

const router = Router();

// Process GRN (Requires auth and grn:create permission)
router.post('/', requireAuth, requirePermission('grn:create'), createGRN);

export default router;
