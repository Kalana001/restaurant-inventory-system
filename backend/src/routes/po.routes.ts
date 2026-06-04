import { Router } from 'express';
import { updatePOStatus } from '../controllers/po.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Update PO status (Approve, Reject, Cancel)
router.patch('/:id/status', requireAuth, updatePOStatus);

export default router;
