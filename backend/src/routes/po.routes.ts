import { Router } from 'express';
import { updatePOStatus, deepPriceCorrection } from '../controllers/po.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Update PO status (Approve, Reject, Cancel)
router.patch('/:id/status', requireAuth, updatePOStatus);

// Deep Price Correction
router.patch('/:id/deep-price-correction', requireAuth, deepPriceCorrection);

export default router;
