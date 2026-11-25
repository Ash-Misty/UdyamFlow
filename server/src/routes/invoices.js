import { Router } from 'express';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import { AuditLog, CreditNote, Invoice, Order, Payment } from '../models/index.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { financialYearStart } from '../lib/money.js';
import { inTransaction, nextNumber } from '../lib/transactions.js';

const router = Router();
router.use(authenticate, allowRoles('admin', 'accountant', 'owner'));

router.post('/:id/cancel', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice id.' });
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ message: 'Enter a clear credit-note reason.' });
    const creditNote = await inTransaction(async (session) => {
      const invoice = await Invoice.findById(req.params.id).session(session);
      if (!invoice || invoice.status !== 'posted') {
        throw Object.assign(new Error('Only posted invoices can be cancelled.'), { status: 409 });
      }
      const order = await Order.findById(invoice.order).session(session);
      if (!order || order.status !== 'invoiced') {
        throw Object.assign(new Error('Only invoices for undispatched orders can be cancelled here.'), { status: 409 });
      }
      const payments = await Payment.countDocuments({ invoice: invoice._id }).session(session);
      if (payments) {
        throw Object.assign(new Error('This invoice has payments. Reverse or refund collections before cancellation.'), { status: 409 });
      }
      const year = financialYearStart(new Date());
      const sequence = await nextNumber(session, `credit-note-${year}`);
      const [created] = await CreditNote.create([{
        creditNoteNumber: `CN-${year}-${String(sequence).padStart(4, '0')}`,
        invoice: invoice._id, order: order._id, reason,
        taxablePaise: invoice.taxablePaise, cgstPaise: invoice.cgstPaise,
        sgstPaise: invoice.sgstPaise, igstPaise: invoice.igstPaise,
        totalPaise: invoice.totalPaise, createdBy: req.user._id,
      }], { session });
      invoice.status = 'cancelled';
      order.status = 'cancelled';
      order.audit.push({ action: 'cancelled', user: req.user._id, details: { creditNoteNumber: created.creditNoteNumber, reason } });
      await Promise.all([invoice.save({ session }), order.save({ session })]);
      await AuditLog.create([{
        entityType: 'Invoice', entity: invoice._id, action: 'cancelled-with-credit-note', user: req.user._id,
        details: { creditNoteNumber: created.creditNoteNumber, reason, totalPaise: invoice.totalPaise },
      }], { session });
      return created;
    });
    res.status(201).json(creditNote);
  } catch (error) { next(error); }
});

router.get('/credit-notes', async (_req, res, next) => {
  try { res.json(await CreditNote.find().populate('invoice', 'invoiceNumber').sort({ createdAt: -1 }).lean()); } catch (error) { next(error); }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice id.' });
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    const pdf = new PDFDocument({ size: 'A4', margin: 48 });
    pdf.on('error', next);
    pdf.pipe(res);
    const money = (paise) => `Rs. ${(paise / 100).toFixed(2)}`;

    pdf.fontSize(22).fillColor('#153f35').text('TAMIL SNACKS MANUFACTURING', { continued: false });
    pdf.fontSize(10).fillColor('#59645f').text('GSTIN: 33AABCU9603R1ZM  |  Tamil Nadu, India');
    pdf.moveDown();
    pdf.fontSize(18).fillColor('#17231f').text('TAX INVOICE');
    pdf.fontSize(10).fillColor('#414b46').text(`Invoice: ${invoice.invoiceNumber}`);
    pdf.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    pdf.text(`Status: ${invoice.status.toUpperCase()}`);
    pdf.moveDown();
    pdf.fontSize(11).fillColor('#17231f').text('Bill to');
    pdf.fontSize(10).fillColor('#414b46').text(invoice.customerName || 'Customer');
    if (invoice.customerGstin) pdf.text(`GSTIN: ${invoice.customerGstin}`);
    pdf.text(`Place of supply: ${invoice.customerState} (${invoice.customerStateCode})`);
    pdf.moveDown();

    const columns = [48, 295, 350, 397, 455, 510];
    let y = pdf.y;
    pdf.rect(48, y, 500, 24).fill('#e9efea');
    pdf.fillColor('#243b33').fontSize(9);
    pdf.text('Item / HSN', columns[0] + 6, y + 7);
    pdf.text('Qty', columns[1], y + 7, { width: 45, align: 'right' });
    pdf.text('Rate', columns[2], y + 7, { width: 55, align: 'right' });
    pdf.text('Taxable', columns[3], y + 7, { width: 60, align: 'right' });
    pdf.text('GST', columns[4], y + 7, { width: 36, align: 'right' });
    pdf.text('Total', columns[5], y + 7, { width: 38, align: 'right' });
    y += 30;

    for (const line of invoice.lines) {
      if (y > 690) { pdf.addPage(); y = 55; }
      pdf.fillColor('#27322e').fontSize(9);
      pdf.text(`${line.productName}  |  ${line.hsnCode}`, columns[0] + 6, y, { width: 235 });
      pdf.text(String(line.quantity), columns[1], y, { width: 45, align: 'right' });
      pdf.text(money(line.unitPricePaise), columns[2], y, { width: 55, align: 'right' });
      pdf.text(money(line.taxablePaise), columns[3], y, { width: 60, align: 'right' });
      pdf.text(`${line.gstRate}%`, columns[4], y, { width: 36, align: 'right' });
      pdf.text(money(line.totalPaise), columns[5], y, { width: 38, align: 'right' });
      y += 24;
      pdf.moveTo(48, y - 4).lineTo(548, y - 4).strokeColor('#e5e9e6').stroke();
    }

    y += 12;
    pdf.fontSize(10).fillColor('#414b46');
    pdf.text(`Taxable value: ${money(invoice.taxablePaise)}`, 350, y, { width: 198, align: 'right' });
    if (invoice.igstPaise) {
      pdf.text(`IGST: ${money(invoice.igstPaise)}`, 350, y + 18, { width: 198, align: 'right' });
    } else {
      pdf.text(`CGST: ${money(invoice.cgstPaise)}`, 350, y + 18, { width: 198, align: 'right' });
      pdf.text(`SGST: ${money(invoice.sgstPaise)}`, 350, y + 36, { width: 198, align: 'right' });
    }
    pdf.fontSize(13).fillColor('#153f35').text(`Invoice total: ${money(invoice.totalPaise)}`, 300, y + 58, { width: 248, align: 'right' });
    pdf.moveDown(6).fontSize(9).fillColor('#647069').text('Generated by UdyamFlow. This demo invoice is for evaluation and is not a government e-invoice.');
    pdf.end();
  } catch (error) { next(error); }
});

export default router;
