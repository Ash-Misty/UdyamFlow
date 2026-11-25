import { Router } from 'express';
import mongoose from 'mongoose';
import {
  AuditLog, Customer, Invoice, Material, Order, Payment, Product, ProductionRun, Purchase,
} from '../models/index.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { calculateRunCost, calculateTax, financialYearStart, toPaise } from '../lib/money.js';
import { toBaseQuantity, variancePercent } from '../lib/units.js';
import { appendMovement, stockFor, weightedAverageCost } from '../lib/stock.js';
import { inTransaction, nextNumber } from '../lib/transactions.js';

const router = Router();
router.use(authenticate);
const isId = (value) => mongoose.isValidObjectId(value);

router.get('/orders', allowRoles('admin', 'salesman'), async (req, res, next) => {
  try {
    const filter = req.user.role === 'salesman' ? { salesman: req.user._id } : {};
    const orders = await Order.find(filter).populate('customer', 'name state').populate('salesman', 'name').sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (error) { next(error); }
});

router.post('/orders', allowRoles('salesman'), async (req, res, next) => {
  try {
    const { customer: customerId, lines, idempotencyKey } = req.body;
    if (!isId(customerId) || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Choose a customer and add at least one product.' });
    }
    if (idempotencyKey) {
      const previous = await Order.findOne({ idempotencyKey, salesman: req.user._id });
      if (previous) return res.status(200).json(previous);
    }
    const customer = await Customer.findOne({ _id: customerId, active: true });
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });
    const orderLines = [];
    for (const line of lines) {
      if (!isId(line.product) || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1) {
        return res.status(400).json({ message: 'Each order line needs a valid product and a whole packet quantity.' });
      }
      const product = await Product.findOne({ _id: line.product, active: true });
      if (!product) return res.status(404).json({ message: 'One of the selected products is no longer available.' });
      const current = orderLines.find((item) => String(item.product) === String(product._id));
      if (current) current.quantity += Number(line.quantity);
      else orderLines.push({
        product: product._id, productName: `${product.name} ${product.packSize}`, sku: product.sku,
        quantity: Number(line.quantity), unitPricePaise: product.sellingPricePaise,
      });
    }
    const order = await inTransaction(async (session) => {
      const number = await nextNumber(session, 'order');
      const [created] = await Order.create([{
        orderNumber: `ORD-${String(number).padStart(5, '0')}`,
        idempotencyKey: idempotencyKey || null,
        customer: customer._id, customerName: customer.name, customerState: customer.state,
        customerStateCode: customer.stateCode, salesman: req.user._id, lines: orderLines,
        audit: [{ action: 'submitted', user: req.user._id, details: { channel: 'mobile' } }],
      }], { session });
      return created;
    });
    res.status(201).json(order);
  } catch (error) { next(error); }
});

router.patch('/orders/:id', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid order id.' });
    if (!Array.isArray(req.body.lines) || !req.body.lines.length) {
      return res.status(400).json({ message: 'An order must contain at least one product line.' });
    }
    const order = await inTransaction(async (session) => {
      const current = await Order.findById(req.params.id).session(session);
      if (!current || current.status !== 'submitted') {
        throw Object.assign(new Error('Only submitted orders can be edited.'), { status: 409 });
      }
      const nextLines = [];
      for (const line of req.body.lines) {
        if (!isId(line.product) || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1) {
          throw Object.assign(new Error('Each order line needs a valid product and a whole packet quantity.'), { status: 400 });
        }
        const product = await Product.findOne({ _id: line.product, active: true }).session(session);
        if (!product) throw Object.assign(new Error('One of the selected products is no longer available.'), { status: 404 });
        const unitPricePaise = toPaise(Number(line.unitPrice));
        const existing = nextLines.find((item) => String(item.product) === String(product._id));
        if (existing) {
          existing.quantity += Number(line.quantity);
          existing.unitPricePaise = unitPricePaise;
        } else {
          nextLines.push({
            product: product._id, productName: `${product.name} ${product.packSize}`, sku: product.sku,
            quantity: Number(line.quantity), unitPricePaise,
          });
        }
      }
      const shortageDetails = [];
      for (const line of nextLines) {
        const available = await stockFor('finished', line.product, session);
        if (available < line.quantity) {
          shortageDetails.push({ product: line.productName, requested: line.quantity, available, shortage: line.quantity - available });
        }
      }
      const previousLines = current.lines.map((line) => ({
        product: line.product, quantity: line.quantity, unitPricePaise: line.unitPricePaise,
      }));
      current.lines = nextLines;
      current.shortage = shortageDetails.length > 0;
      current.shortageDetails = shortageDetails;
      current.audit.push({ action: 'edited', user: req.user._id, details: { previousLines, lines: nextLines } });
      await current.save({ session });
      await AuditLog.create([{
        entityType: 'Order', entity: current._id, action: 'edited', user: req.user._id,
        details: { previousLines, lines: nextLines, shortageDetails },
      }], { session });
      return current;
    });
    res.json(order);
  } catch (error) { next(error); }
});

router.patch('/orders/:id/decision', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid order id.' });
    const { decision, notes = '' } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: 'Decision must be approved or rejected.' });
    const order = await inTransaction(async (session) => {
      const current = await Order.findById(req.params.id).session(session);
      if (!current || current.status !== 'submitted') throw Object.assign(new Error('Only submitted orders can be reviewed.'), { status: 409 });
      let shortageDetails = [];
      if (decision === 'approved') {
        for (const line of current.lines) {
          const available = await stockFor('finished', line.product, session);
          if (available < line.quantity) {
            shortageDetails.push({ product: line.productName, requested: line.quantity, available, shortage: line.quantity - available });
          }
        }
      }
      current.status = decision;
      current.shortage = shortageDetails.length > 0;
      current.shortageDetails = shortageDetails;
      current.notes = notes;
      current.audit.push({ action: decision, user: req.user._id, details: { notes, shortageDetails } });
      await current.save({ session });
      await AuditLog.create([{
        entityType: 'Order', entity: current._id, action: decision, user: req.user._id,
        details: { notes, shortageDetails },
      }], { session });
      return current;
    });
    res.json(order);
  } catch (error) { next(error); }
});

router.post('/orders/:id/invoice', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid order id.' });
    const invoice = await inTransaction(async (session) => {
      const order = await Order.findById(req.params.id).session(session);
      if (!order || order.status !== 'approved') throw Object.assign(new Error('Only approved orders can be invoiced.'), { status: 409 });
      const customer = await Customer.findById(order.customer).session(session);
      const products = await Product.find({ _id: { $in: order.lines.map((line) => line.product) } }).session(session);
      const productMap = new Map(products.map((product) => [String(product._id), product]));
      const interstate = customer.stateCode !== '33';
      const lines = order.lines.map((line) => {
        const product = productMap.get(String(line.product));
        if (!product) throw Object.assign(new Error(`Product "${line.productName}" was not found.`), { status: 409 });
        const taxablePaise = line.quantity * line.unitPricePaise;
        const tax = calculateTax(taxablePaise, product.gstRate, interstate);
        return {
          product: product._id, productName: line.productName, sku: line.sku, hsnCode: product.hsnCode,
          quantity: line.quantity, unitPricePaise: line.unitPricePaise, taxablePaise,
          gstRate: product.gstRate, ...tax, totalPaise: taxablePaise + tax.totalPaise,
        };
      });
      const totals = lines.reduce((sum, line) => ({
        taxablePaise: sum.taxablePaise + line.taxablePaise,
        cgstPaise: sum.cgstPaise + line.cgstPaise,
        sgstPaise: sum.sgstPaise + line.sgstPaise,
        igstPaise: sum.igstPaise + line.igstPaise,
        totalPaise: sum.totalPaise + line.totalPaise,
      }), { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 });
      const year = financialYearStart(new Date());
      const number = await nextNumber(session, `invoice-${year}`);
      const [created] = await Invoice.create([{
        invoiceNumber: `INV-${year}-${String(number).padStart(4, '0')}`,
        order: order._id, customer: customer._id, customerName: customer.name, customerGstin: customer.gstin,
        customerState: customer.state, customerStateCode: customer.stateCode, lines, ...totals, createdBy: req.user._id,
      }], { session });
      order.invoice = created._id;
      order.status = 'invoiced';
      order.audit.push({ action: 'invoiced', user: req.user._id, details: { invoiceNumber: created.invoiceNumber } });
      await order.save({ session });
      await AuditLog.create([{
        entityType: 'Invoice', entity: created._id, action: 'posted', user: req.user._id,
        details: { invoiceNumber: created.invoiceNumber, order: order.orderNumber },
      }], { session });
      return created;
    });
    res.status(201).json(invoice);
  } catch (error) { next(error); }
});

router.get('/invoices', allowRoles('admin', 'accountant', 'owner'), async (_req, res, next) => {
  try {
    res.json(await Invoice.find().populate('customer', 'name').populate('order', 'status dispatchedAt').sort({ createdAt: -1 }).lean());
  } catch (error) { next(error); }
});

router.post('/orders/:id/dispatch', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid order id.' });
    const order = await inTransaction(async (session) => {
      const current = await Order.findById(req.params.id).session(session);
      if (!current || current.status !== 'invoiced') throw Object.assign(new Error('Only invoiced orders can be dispatched.'), { status: 409 });
      for (const line of current.lines) {
        const available = await stockFor('finished', line.product, session);
        if (available < line.quantity) {
          throw Object.assign(new Error(`${line.productName}: ${line.quantity} requested, ${available} available. Edit the order quantity or produce more stock before dispatch.`), { status: 409 });
        }
      }
      for (const line of current.lines) {
        await appendMovement(session, {
          itemType: 'finished', item: line.product, quantity: -line.quantity, unit: 'packet',
          sourceType: 'dispatch', source: current._id, sourceLabel: current.orderNumber, user: req.user._id,
        });
      }
      current.status = 'dispatched';
      current.dispatchedAt = new Date();
      current.audit.push({ action: 'dispatched', user: req.user._id });
      await current.save({ session });
      await AuditLog.create([{
        entityType: 'Order', entity: current._id, action: 'dispatched', user: req.user._id,
        details: { orderNumber: current.orderNumber },
      }], { session });
      return current;
    });
    res.json(order);
  } catch (error) { next(error); }
});

router.get('/purchases', allowRoles('admin', 'production', 'accountant', 'owner'), async (_req, res, next) => {
  try { res.json(await Purchase.find().sort({ createdAt: -1 }).lean()); } catch (error) { next(error); }
});

router.post('/purchases', allowRoles('admin', 'production'), async (req, res, next) => {
  try {
    const { supplierName, lines } = req.body;
    if (!supplierName || !Array.isArray(lines) || !lines.length) return res.status(400).json({ message: 'Supplier and at least one purchase line are required.' });
    const purchase = await inTransaction(async (session) => {
      const items = [];
      for (const line of lines) {
        if (!isId(line.material)) throw Object.assign(new Error('Select a valid material.'), { status: 400 });
        const material = await Material.findById(line.material).session(session);
        if (!material) throw Object.assign(new Error('Material not found.'), { status: 404 });
        const quantity = toBaseQuantity(Number(line.quantity), line.unit, material.baseUnit);
        const ratePaise = toPaise(Number(line.unitCost));
        const factor = quantity / Number(line.quantity);
        const amountPaise = Math.round(Number(line.quantity) * ratePaise);
        if (!Number.isSafeInteger(amountPaise)) {
          throw Object.assign(new Error('Purchase amount is outside the supported range.'), { status: 400 });
        }
        items.push({
          material, quantity, inputQuantity: Number(line.quantity), inputUnit: line.unit,
          ratePaise, unitCostPaise: ratePaise / factor,
          amountPaise,
        });
      }
      const seq = await nextNumber(session, 'purchase');
      const [created] = await Purchase.create([{
        purchaseNumber: `PUR-${String(seq).padStart(5, '0')}`, supplierName,
        lines: items.map((item) => ({
          material: item.material._id, materialName: item.material.name, quantity: item.inputQuantity,
          unit: item.inputUnit, unitCostPaise: item.ratePaise, amountPaise: item.amountPaise,
        })),
        totalPaise: items.reduce((sum, item) => sum + item.amountPaise, 0), createdBy: req.user._id,
      }], { session });
      for (const item of items) {
        await appendMovement(session, {
          itemType: item.material.kind, item: item.material._id, quantity: item.quantity,
          unit: item.material.baseUnit, unitCostPaise: item.unitCostPaise,
          sourceType: 'purchase', source: created._id, sourceLabel: created.purchaseNumber, user: req.user._id,
        });
      }
      await AuditLog.create([{
        entityType: 'Purchase', entity: created._id, action: 'received', user: req.user._id,
        details: { purchaseNumber: created.purchaseNumber },
      }], { session });
      return created;
    });
    res.status(201).json(purchase);
  } catch (error) { next(error); }
});

router.get('/production', allowRoles('admin', 'production', 'accountant', 'owner'), async (_req, res, next) => {
  try { res.json(await ProductionRun.find({ status: 'posted' }).sort({ createdAt: -1 }).lean()); } catch (error) { next(error); }
});

router.post('/production', allowRoles('admin', 'production'), async (req, res, next) => {
  try {
    const { product: productId, batchCount = 1, actualOutput, damagedPouches = 0, cartonsUsed = 0, actualConsumption = [], labour = 0, utilities = 0 } = req.body;
    if (!isId(productId) || !Number.isSafeInteger(Number(batchCount)) || Number(batchCount) < 1 ||
        !Number.isSafeInteger(Number(actualOutput)) || Number(actualOutput) < 1 ||
        !Number.isSafeInteger(Number(damagedPouches)) || Number(damagedPouches) < 0 ||
        !Number.isSafeInteger(Number(cartonsUsed)) || Number(cartonsUsed) < 0) {
      return res.status(400).json({ message: 'Choose a product and enter valid whole-number batch and packet quantities.' });
    }
    const production = await inTransaction(async (session) => {
      const product = await Product.findById(productId).populate('bom.material').session(session);
      if (!product) throw Object.assign(new Error('Product not found.'), { status: 404 });
      if (!product.bom.length) throw Object.assign(new Error('Add a BOM to this product before recording production.'), { status: 409 });
      const supplied = new Map(actualConsumption.map((line) => [String(line.material), line]));
      const planned = [];
      const actual = [];
      let materialCostPaise = 0;
      for (const bomLine of product.bom) {
        const material = bomLine.material;
        if (!material || !material._id) throw Object.assign(new Error('A BOM material no longer exists.'), { status: 409 });
        const plannedQty = toBaseQuantity(bomLine.quantity * Number(batchCount), bomLine.unit, material.baseUnit);
        const entered = supplied.get(String(material._id));
        const actualQty = entered
          ? toBaseQuantity(Number(entered.quantity), entered.unit, material.baseUnit)
          : plannedQty;
        if (material.kind === 'packaging' && material.name.toLowerCase().includes('pouch') && !entered) {
          throw Object.assign(new Error(`Enter actual pouch usage for ${material.name}, including damaged pouches.`), { status: 400 });
        }
        if (material.kind === 'packaging' && material.name.toLowerCase().includes('carton') && !entered) {
          throw Object.assign(new Error(`Enter actual carton usage for ${material.name}.`), { status: 400 });
        }
        const available = await stockFor(material.kind, material._id, session);
        if (available < actualQty) {
          throw Object.assign(new Error(`${material.name}: ${actualQty} ${material.baseUnit} needed, ${available} available.`), { status: 409 });
        }
        const unitCostPaise = await weightedAverageCost(material.kind, material._id, session);
        const lineCostPaise = Math.round(actualQty * unitCostPaise);
        if (!Number.isSafeInteger(lineCostPaise) || !Number.isSafeInteger(materialCostPaise + lineCostPaise)) {
          throw Object.assign(new Error('Material cost is outside the supported range.'), { status: 400 });
        }
        materialCostPaise += lineCostPaise;
        planned.push({ material: material._id, materialName: material.name, quantity: plannedQty, unit: material.baseUnit });
        actual.push({
          material: material._id, materialName: material.name, quantity: actualQty, plannedQuantity: plannedQty,
          variancePercent: variancePercent(actualQty, plannedQty),
          flagged: Math.abs(variancePercent(actualQty, plannedQty)) > 3,
          unit: material.baseUnit, unitCostPaise,
        });
      }
      const labourPaise = toPaise(Number(labour));
      const utilitiesPaise = toPaise(Number(utilities));
      const { totalPaise: totalCostPaise, costPerPacketPaise } = calculateRunCost(
        materialCostPaise, labourPaise, utilitiesPaise, Number(actualOutput),
      );
      const expectedOutput = product.expectedPackets * Number(batchCount);
      const seq = await nextNumber(session, 'production');
      const [created] = await ProductionRun.create([{
        runNumber: `RUN-${String(seq).padStart(5, '0')}`, product: product._id, productName: `${product.name} ${product.packSize}`,
        batchCount: Number(batchCount), expectedOutput, actualOutput: Number(actualOutput),
        damagedPouches: Number(damagedPouches), cartonsUsed: Number(cartonsUsed),
        plannedConsumption: planned, actualConsumption: actual, labourPaise, utilitiesPaise,
        materialCostPaise, totalCostPaise, costPerPacketPaise,
        yieldVariancePercent: ((Number(actualOutput) - expectedOutput) / expectedOutput) * 100,
        createdBy: req.user._id,
      }], { session });
      for (const line of actual) {
        await appendMovement(session, {
          itemType: product.bom.find((bomLine) => String(bomLine.material._id) === String(line.material)).material.kind,
          item: line.material, quantity: -line.quantity, unit: line.unit, unitCostPaise: line.unitCostPaise,
          sourceType: 'production', source: created._id, sourceLabel: created.runNumber, user: req.user._id,
        });
      }
      await appendMovement(session, {
        itemType: 'finished', item: product._id, quantity: Number(actualOutput), unit: 'packet',
        sourceType: 'production', source: created._id, sourceLabel: created.runNumber, user: req.user._id,
      });
      await AuditLog.create([{
        entityType: 'ProductionRun', entity: created._id, action: 'posted', user: req.user._id,
        details: { runNumber: created.runNumber, expectedOutput, actualOutput: Number(actualOutput), yieldVariancePercent: created.yieldVariancePercent },
      }], { session });
      return created;
    });
    res.status(201).json(production);
  } catch (error) { next(error); }
});

router.get('/payments', allowRoles('admin', 'accountant', 'owner'), async (_req, res, next) => {
  try { res.json(await Payment.find().populate('customer', 'name').populate('invoice', 'invoiceNumber totalPaise').sort({ createdAt: -1 }).lean()); } catch (error) { next(error); }
});

router.post('/payments', allowRoles('admin', 'accountant'), async (req, res, next) => {
  try {
    const { invoice: invoiceId, amount, method = 'bank', reference = '' } = req.body;
    if (!isId(invoiceId) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Select an invoice and enter a positive payment amount.' });
    }
    const payment = await inTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: invoiceId, status: 'posted' }).session(session);
      if (!invoice) throw Object.assign(new Error('Posted invoice not found.'), { status: 404 });
      const paid = await Payment.aggregate([
        { $match: { invoice: invoice._id } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ]).session(session);
      const amountPaise = toPaise(Number(amount));
      if ((paid[0]?.total || 0) + amountPaise > invoice.totalPaise) {
        throw Object.assign(new Error('Payment exceeds the invoice balance.'), { status: 409 });
      }
      const seq = await nextNumber(session, 'payment');
      const [created] = await Payment.create([{
        paymentNumber: `PAY-${String(seq).padStart(5, '0')}`, customer: invoice.customer,
        invoice: invoice._id, amountPaise, method, reference, createdBy: req.user._id,
      }], { session });
      invoice.paymentVersion += 1;
      await invoice.save({ session });
      await AuditLog.create([{
        entityType: 'Payment', entity: created._id, action: 'received', user: req.user._id,
        details: { paymentNumber: created.paymentNumber, amountPaise },
      }], { session });
      return created;
    });
    res.status(201).json(payment);
  } catch (error) { next(error); }
});

export default router;
