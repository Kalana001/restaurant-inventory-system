import { Router } from 'express';
import { exportReport } from '../controllers/report.controller';
import { requireAuth, requirePermission } from '../middlewares/auth';

const router = Router();

// Export report binaries (requires auth and reports:read permission)
router.get('/export', requireAuth, requirePermission('reports:read'), exportReport);

export default router;
