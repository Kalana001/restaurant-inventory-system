import { Router } from 'express';
import { processSupplierPayment } from '../controllers/payment.controller';
import { requireAuth, requirePermission } from '../middlewares/auth';

const router = Router();

// Process Supplier Payment (requires auth and purchase_orders:create permission or specific payment permission)
// Here using 'purchase_orders:create' as an approximation for payment rights if specific payment permission doesn't exist.
router.post('/supplier', requireAuth, requirePermission('purchase_orders:create'), processSupplierPayment);

export default router;
