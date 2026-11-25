import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { Invoice, Order, Payment, ProductionRun, Purchase, StockLedger } from '../models/index.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { inventorySnapshot } from '../lib/stock.js';
import { indiaDateEnd, indiaDateStart, indiaDateString } from '../lib/dates.js';

const router = Router();
router.use(authenticate, allowRoles('admin', 'accountant', 'owner'));

function dateFilter(from, to) {
  const filter = {};
  if (from) {
    filter.$gte = indiaDateStart(from);
  }
  if (to) {
    filter.$lte = indiaDateEnd(to);
  }
  return Object.keys(filter).length ? filter : undefined;
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (typeof value !== 'number' && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvFor(rows) {
  if (!rows.length) return 'No data\n';
  const columns = Object.keys(rows[0]);
  return [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
}

function writePdf(res, type, rows) {
  const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });
  pdf.on('error', (error) => {
    if (!res.headersSent) res.status(500).end();
    console.error(error);
  });
  res.type('application/pdf').attachment(`udyamflow-${type}.pdf`);
  pdf.pipe(res);
  const columns = rows.length ? Object.keys(rows[0]) : ['message'];
  const pageWidth = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
  const widths = columns.map(() => pageWidth / columns.length);
  const drawHeader = (title) => {
    pdf.fillColor('#245c49').fontSize(18).text(`UdyamFlow · ${title}`, { lineBreak: false });
    pdf.moveDown(0.7);
    pdf.fillColor('#708078').fontSize(8).text(`Generated ${new Date().toLocaleString('en-IN')} · ${rows.length} rows`);
    pdf.moveDown(0.8);
    const y = pdf.y;
    pdf.rect(pdf.page.margins.left, y, pageWidth, 22).fill('#eaf2eb');
    let x = pdf.page.margins.left;
    columns.forEach((column, index) => {
      pdf.fillColor('#315343').fontSize(7).text(column, x + 4, y + 7, { width: widths[index] - 8, lineBreak: false, ellipsis: true });
      x += widths[index];
    });
    pdf.y = y + 26;
  };
  drawHeader(type.replaceAll('-', ' ').toUpperCase());
  if (!rows.length) {
    pdf.fillColor('#647069').fontSize(10).text('No records match the selected report and date range.');
  } else {
    for (const row of rows) {
      if (pdf.y > pdf.page.height - pdf.page.margins.bottom - 20) {
        pdf.addPage();
        drawHeader(type.replaceAll('-', ' ').toUpperCase());
      }
      const y = pdf.y;
      if (Math.floor((y - 100) / 22) % 2 === 1) pdf.rect(pdf.page.margins.left, y - 2, pageWidth, 22).fill('#f8faf7');
      let x = pdf.page.margins.left;
      columns.forEach((column, index) => {
        const value = row[column] == null ? '' : String(row[column]);
        pdf.fillColor('#3d4942').fontSize(7).text(value, x + 4, y + 4, {
          width: widths[index] - 8, height: 15, lineBreak: false, ellipsis: true,
        });
        x += widths[index];
      });
      pdf.y = y + 20;
    }
  }
  pdf.end();
}

router.get('/', async (req, res, next) => {
  try {
    const { type = 'sales', from, to, format = 'json' } = req.query;
    const dates = dateFilter(from, to);
    const inRange = (field = 'createdAt') => dates ? { [field]: dates } : {};
    let rows = [];
    if (type === 'sales' || type === 'gst') {
      const invoices = await Invoice.find({ status: 'posted', ...inRange() }).lean();
      rows = invoices.flatMap((invoice) => invoice.lines.map((line) => ({
        date: indiaDateString(invoice.createdAt),
        invoice: invoice.invoiceNumber,
        customer: invoice.customerName,
        state: invoice.customerState,
        product: line.productName,
        hsn: line.hsnCode,
        quantity: line.quantity,
        taxableRupees: (line.taxablePaise / 100).toFixed(2),
        cgstRupees: (line.cgstPaise / 100).toFixed(2),
        sgstRupees: (line.sgstPaise / 100).toFixed(2),
        igstRupees: (line.igstPaise / 100).toFixed(2),
        totalRupees: (line.totalPaise / 100).toFixed(2),
      })));
      if (type === 'gst') {
        const invoices = await Invoice.find({ status: 'posted', ...inRange() }).lean();
        const groups = new Map();
        for (const invoice of invoices) {
          const month = indiaDateString(invoice.createdAt).slice(0, 7);
          const key = `${month}:${invoice.customerStateCode}`;
          const group = groups.get(key) || {
            month, state: invoice.customerState, placeOfSupplyCode: invoice.customerStateCode,
            invoices: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0,
          };
          group.invoices += 1;
          for (const field of ['taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'totalPaise']) {
            group[field] += invoice[field];
          }
          groups.set(key, group);
        }
        rows = [...groups.values()].map((group) => ({
          month: group.month, state: group.state, placeOfSupplyCode: group.placeOfSupplyCode,
          invoices: group.invoices, taxableRupees: (group.taxablePaise / 100).toFixed(2),
          cgstRupees: (group.cgstPaise / 100).toFixed(2), sgstRupees: (group.sgstPaise / 100).toFixed(2),
          igstRupees: (group.igstPaise / 100).toFixed(2), totalRupees: (group.totalPaise / 100).toFixed(2),
        }));
      }
    } else if (type === 'stock') {
      rows = await inventorySnapshot();
    } else if (type === 'ledger') {
      const ledger = await StockLedger.find(inRange()).sort({ createdAt: -1 }).limit(10000).lean();
      rows = ledger.map((entry) => ({
        date: indiaDateString(entry.createdAt), itemType: entry.itemType, item: String(entry.item),
        quantity: entry.quantity, unit: entry.unit, sourceType: entry.sourceType, source: entry.sourceLabel,
      }));
    } else if (type === 'production') {
      const runs = await ProductionRun.find({ status: 'posted', ...inRange() }).lean();
      rows = runs.map((run) => ({
        date: indiaDateString(run.createdAt), run: run.runNumber, product: run.productName,
        expectedOutput: run.expectedOutput, actualOutput: run.actualOutput,
        yieldVariancePercent: Number(run.yieldVariancePercent.toFixed(2)),
        materialVarianceAlerts: run.actualConsumption
          .filter((line) => Math.abs(line.variancePercent) > 3)
          .map((line) => `${line.materialName} ${line.variancePercent > 0 ? '+' : ''}${line.variancePercent.toFixed(2)}%`)
          .join('; '),
        materialCostRupees: (run.materialCostPaise / 100).toFixed(2),
        overheadRupees: ((run.labourPaise + run.utilitiesPaise) / 100).toFixed(2),
        costPerPacketRupees: (run.costPerPacketPaise / 100).toFixed(2),
      }));
    } else if (type === 'purchases') {
      const purchases = await Purchase.find(inRange()).lean();
      rows = purchases.flatMap((purchase) => purchase.lines.map((line) => ({
        date: indiaDateString(purchase.createdAt), purchase: purchase.purchaseNumber,
        supplier: purchase.supplierName, material: line.materialName, quantity: line.quantity,
        unit: line.unit, totalRupees: (line.amountPaise / 100).toFixed(2),
      })));
    } else if (type === 'outstanding') {
      const invoices = await Invoice.find({ status: 'posted', ...inRange() }).lean();
      const payments = await Payment.aggregate([
        { $match: { invoice: { $in: invoices.map((invoice) => invoice._id) } } },
        { $group: { _id: '$invoice', paid: { $sum: '$amountPaise' } } },
      ]);
      const paidByInvoice = new Map(payments.map((payment) => [String(payment._id), payment.paid]));
      rows = invoices.map((invoice) => ({
        invoice: invoice.invoiceNumber, customer: invoice.customerName,
        invoiceDate: indiaDateString(invoice.createdAt),
        totalRupees: (invoice.totalPaise / 100).toFixed(2),
        paidRupees: ((paidByInvoice.get(String(invoice._id)) || 0) / 100).toFixed(2),
        outstandingRupees: ((invoice.totalPaise - (paidByInvoice.get(String(invoice._id)) || 0)) / 100).toFixed(2),
        ageDays: Math.max(0, Math.floor((Date.now() - invoice.createdAt.getTime()) / 86400000)),
      })).filter((row) => Number(row.outstandingRupees) > 0);
    } else if (type === 'orders') {
      const orders = await Order.find(inRange()).populate('salesman', 'name').lean();
      rows = orders.map((order) => ({
        date: indiaDateString(order.createdAt), order: order.orderNumber,
        customer: order.customerName, salesman: order.salesman?.name || 'Unknown',
        status: order.status, shortage: order.shortage ? JSON.stringify(order.shortageDetails) : '',
      }));
    } else {
      return res.status(400).json({ message: 'Choose a supported report type.' });
    }
    if (format === 'csv') {
      res.type('text/csv').attachment(`udyamflow-${type}.csv`).send(csvFor(rows));
      return;
    }
    if (format === 'pdf') {
      writePdf(res, type, rows);
      return;
    }
    if (format !== 'json') return res.status(400).json({ message: 'Format must be json, csv or pdf.' });
    res.json({ type, rows, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

export default router;
