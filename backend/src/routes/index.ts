import { Router } from 'express';
import poRoutes from './po.routes';
import grnRoutes from './grn.routes';
import stockRoutes from './stock.routes';
import reportRoutes from './report.routes';
import paymentRoutes from './payment.routes';

const router = Router();

// Register sub-routers
router.use('/purchase-orders', poRoutes);
router.use('/grns', grnRoutes);
router.use('/stock/movements', stockRoutes);
router.use('/reports', reportRoutes);
router.use('/payments', paymentRoutes);

export default router;
