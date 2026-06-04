import { Router } from 'express';
import { createStockMovement, getPendingMovements, approveStockMovement } from '../controllers/stock.controller';
import { requireAuth, requirePermission } from '../middlewares/auth';

const router = Router();

// Log manual stock movement (adjustments, issues)
router.post('/', requireAuth, requirePermission('stock:adjust'), createStockMovement);

// List pending stock adjustments (requires approval authority)
router.get('/pending', requireAuth, requirePermission('stock:approve'), getPendingMovements);

// Approve or Reject stock adjustment
router.patch('/:id/approve', requireAuth, requirePermission('stock:approve'), approveStockMovement);

export default router;
