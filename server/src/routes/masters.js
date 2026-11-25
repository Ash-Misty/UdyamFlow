import { Router } from 'express';
import { Customer, Material, Product } from '../models/index.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { toPaise } from '../lib/money.js';
import { baseUnitFor, toBaseQuantity } from '../lib/units.js';
import { ensureStockLock } from '../lib/stock.js';

const router = Router();
router.use(authenticate);

router.get('/customers', allowRoles('admin', 'salesman'), async (_req, res, next) => {
  try { res.json(await Customer.find({ active: true }).sort({ name: 1 }).lean()); } catch (error) { next(error); }
});

router.get('/products', allowRoles('admin', 'salesman', 'production', 'accountant', 'owner'), async (_req, res, next) => {
  try { res.json(await Product.find({ active: true }).populate('bom.material').sort({ name: 1 }).lean()); } catch (error) { next(error); }
});

router.get('/materials', allowRoles('admin', 'production', 'accountant', 'owner'), async (_req, res, next) => {
  try { res.json(await Material.find().sort({ kind: 1, name: 1 }).lean()); } catch (error) { next(error); }
});

router.post('/customers', allowRoles('admin'), async (req, res, next) => {
  try {
    const { name, state, stateCode } = req.body;
    if (!name || !state || !stateCode) return res.status(400).json({ message: 'Name, state and state code are required.' });
    res.status(201).json(await Customer.create(req.body));
  } catch (error) { next(error); }
});

router.post('/materials', allowRoles('admin'), async (req, res, next) => {
  try {
    const { name, kind, displayUnit, reorderLevel = 0, defaultRate = 0 } = req.body;
    if (!name || !['raw', 'packaging'].includes(kind) || !displayUnit) {
      return res.status(400).json({ message: 'Name, valid material kind and display unit are required.' });
    }
    if (!Number.isFinite(Number(reorderLevel)) || Number(reorderLevel) < 0) {
      return res.status(400).json({ message: 'Reorder point must be a non-negative number.' });
    }
    const baseUnit = baseUnitFor(displayUnit);
    const material = await Material.create({
      name, kind, displayUnit, baseUnit,
      reorderLevel: Number(reorderLevel) > 0 ? toBaseQuantity(Number(reorderLevel), displayUnit, baseUnit) : 0,
      defaultRatePaise: toPaise(Number(defaultRate)),
    });
    await ensureStockLock(kind, material._id);
    res.status(201).json(material);
  } catch (error) { next(error); }
});

router.post('/products', allowRoles('admin'), async (req, res, next) => {
  try {
    const { name, sku, packSize, hsnCode, gstRate, sellingPrice, expectedPackets, bom = [] } = req.body;
    if (!name || !sku || !packSize || !hsnCode || !Number.isFinite(Number(gstRate)) ||
        !Number.isSafeInteger(Number(expectedPackets)) || Number(expectedPackets) < 1 || !sellingPrice) {
      return res.status(400).json({ message: 'Product name, SKU, pack size, HSN, GST, price and expected output are required.' });
    }
    if (!Array.isArray(bom) || !bom.length) return res.status(400).json({ message: 'A finished product needs at least one BOM line.' });
    const materialIds = bom.map((line) => line.material);
    if (materialIds.some((id) => !id || !/^[a-f\d]{24}$/i.test(String(id)))) {
      return res.status(400).json({ message: 'Every BOM line must reference a valid material.' });
    }
    const materialRows = await Material.find({ _id: { $in: materialIds } });
    if (materialRows.length !== new Set(materialIds.map(String)).size) {
      return res.status(400).json({ message: 'Every BOM line must reference an existing material.' });
    }
    if (new Set(materialIds.map(String)).size !== materialIds.length) {
      return res.status(400).json({ message: 'Each material can appear only once in a product BOM.' });
    }
    const materialMap = new Map(materialRows.map((material) => [String(material._id), material]));
    for (const line of bom) {
      try {
        toBaseQuantity(Number(line.quantity), line.unit, materialMap.get(String(line.material)).baseUnit);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }
    const product = await Product.create({
      name, sku, packSize, hsnCode, gstRate: Number(gstRate), sellingPricePaise: toPaise(Number(sellingPrice)),
      expectedPackets: Number(expectedPackets), bom,
    });
    await ensureStockLock('finished', product._id);
    res.status(201).json(product);
  } catch (error) { next(error); }
});

export default router;
