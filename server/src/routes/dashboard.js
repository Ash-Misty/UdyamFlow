import { Router } from 'express';
import { Invoice, Order, Payment, ProductionRun } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { inventorySnapshot } from '../lib/stock.js';
import { indiaTodayStart } from '../lib/dates.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const start = indiaTodayStart();
    const canSeeOrders = ['admin', 'salesman', 'owner'].includes(req.user.role);
    const orderFilter = req.user.role === 'salesman' ? { salesman: req.user._id } : {};
    const [ordersToday, pendingOrders, stock, recentRuns, invoices, payments] = await Promise.all([
      canSeeOrders ? Order.countDocuments({ ...orderFilter, createdAt: { $gte: start } }) : 0,
      canSeeOrders ? Order.countDocuments({ ...orderFilter, status: 'submitted' }) : 0,
      inventorySnapshot(),
      ProductionRun.find({ status: 'posted' }).sort({ createdAt: -1 }).limit(5).lean(),
      ['admin', 'accountant', 'owner'].includes(req.user.role) ? Invoice.find({ status: 'posted' }).lean() : [],
      ['admin', 'accountant', 'owner'].includes(req.user.role) ? Payment.aggregate([{ $group: { _id: '$invoice', paid: { $sum: '$amountPaise' } } }]) : [],
    ]);
    const paidMap = new Map(payments.map((payment) => [String(payment._id), payment.paid]));
    const outstandingPaise = invoices.reduce((sum, invoice) => sum + invoice.totalPaise - (paidMap.get(String(invoice._id)) || 0), 0);
    const todayRevenuePaise = invoices
      .filter((invoice) => invoice.createdAt >= start)
      .reduce((sum, invoice) => sum + invoice.totalPaise, 0);
    res.json({
      ordersToday,
      pendingOrders,
      lowStockCount: stock.filter((item) => item.lowStock).length,
      stock,
      recentRuns,
      outstandingPaise,
      todayRevenuePaise,
      openOrders: canSeeOrders
        ? await Order.find({ ...orderFilter, status: 'submitted' }).populate('salesman', 'name').sort({ createdAt: -1 }).limit(5).lean()
        : [],
    });
  } catch (error) { next(error); }
});

export default router;
