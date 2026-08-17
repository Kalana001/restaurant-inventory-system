import { Router } from 'express';
import { processSupplierPayment } from '../controllers/payment.controller';
import { requireAuth, requirePermission } from '../middlewares/auth';

const router = Router();

// Process Supplier Payment (requires auth and po:create permission or specific payment permission)
// Here using 'po:create' as an approximation for payment rights if specific payment permission doesn't exist.
router.post('/supplier', requireAuth, requirePermission('po:create'), processSupplierPayment);

export default router;
