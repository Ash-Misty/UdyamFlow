import { Router } from 'express';
import mongoose from 'mongoose';
import { Material, Product, StockLedger } from '../models/index.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { inventorySnapshot } from '../lib/stock.js';

const router = Router();
router.use(authenticate);

router.get('/stock', async (_req, res, next) => {
  try { res.json(await inventorySnapshot()); } catch (error) { next(error); }
});

router.get('/ledger', allowRoles('admin', 'production', 'accountant', 'owner'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.item && mongoose.isValidObjectId(req.query.item)) filter.item = req.query.item;
    if (req.query.itemType) filter.itemType = req.query.itemType;
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return res.status(400).json({ message: 'Dates must use YYYY-MM-DD format.' });
    }
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const entries = await StockLedger.find(filter).sort({ createdAt: -1 }).limit(2000).lean();
    const [materials, products] = await Promise.all([Material.find().lean(), Product.find().lean()]);
    const names = new Map([...materials, ...products].map((item) => [String(item._id), item.name]));
    res.json(entries.map((entry) => ({ ...entry, itemName: names.get(String(entry.item)) || 'Unknown item' })));
  } catch (error) { next(error); }
});

export default router;
