import { Router } from 'express';
import mongoose from 'mongoose';
import { AuditLog } from '../models/index.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, allowRoles('admin', 'accountant', 'owner'));

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entity && mongoose.isValidObjectId(req.query.entity)) filter.entity = req.query.entity;
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200)
      .populate('user', 'name role').lean();
    res.json(logs);
  } catch (error) { next(error); }
});

export default router;
