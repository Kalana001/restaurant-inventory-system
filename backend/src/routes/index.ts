import { Router } from 'express';
import poRoutes from './po.routes';
import grnRoutes from './grn.routes';
import stockRoutes from './stock.routes';
import reportRoutes from './report.routes';

const router = Router();

// Register sub-routers
router.use('/purchase-orders', poRoutes);
router.use('/grns', grnRoutes);
router.use('/stock/movements', stockRoutes);
router.use('/reports', reportRoutes);

export default router;
