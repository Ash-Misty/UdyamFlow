import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Ban, CreditCard, FileText } from 'lucide-react';
import { api, download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { date, money } from '../lib/format.js';

export function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      const [invoiceRows, paymentRows] = await Promise.all([api('/invoices'), api('/payments')]);
      setInvoices(invoiceRows);
      setPayments(paymentRows);
      if (!invoiceId && invoiceRows.length) setInvoiceId(invoiceRows[0]._id);
    } catch (requestError) { setError(requestError.message); }
  }, [invoiceId]);
  useEffect(() => { reload(); }, [reload]);

  async function recordPayment(event) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const selectedInvoiceId = postedInvoices.find((invoice) => invoice._id === invoiceId)?._id || postedInvoices[0]?._id;
      if (!selectedInvoiceId) throw new Error('Choose a posted invoice before recording a payment.');
      const payment = await api('/payments', { method: 'POST', body: { invoice: selectedInvoiceId, amount: Number(amount), method } });
      setSuccess(`${payment.paymentNumber} recorded against the invoice.`);
      setAmount('');
      await reload();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function cancelInvoice(invoice) {
    if (!window.confirm(`Cancel ${invoice.invoiceNumber} with a credit note? This is only allowed before dispatch and collection.`)) return;
    setError(''); setSuccess('');
    try {
      const creditNote = await api(`/invoices/${invoice._id}/cancel`, {
        method: 'POST', body: { reason: 'Order cancelled before dispatch' },
      });
      setSuccess(`${invoice.invoiceNumber} cancelled with ${creditNote.creditNoteNumber}.`);
      setInvoiceId('');
      await reload();
    } catch (requestError) { setError(requestError.message); }
  }

  const paidByInvoice = new Map();
  for (const payment of payments) {
    const invoice = payment.invoice?._id || payment.invoice;
    if (invoice) paidByInvoice.set(String(invoice), (paidByInvoice.get(String(invoice)) || 0) + payment.amountPaise);
  }
  const postedInvoices = invoices.filter((invoice) => invoice.status === 'posted');

  const selected = invoices.find((invoice) => invoice._id === invoiceId);
  return (
    <>
      <PageHeader eyebrow="GST BILLING & COLLECTIONS" title="Invoices" description="Download posted GST invoices, record collections and track customer balances." />
      <Feedback error={error} success={success} />
      <div className="split-layout invoice-layout">
        <section className="panel table-panel">
          <div className="panel-heading"><div><span className="eyebrow">POSTED DOCUMENTS</span><h2>Tax invoice register</h2></div><span className="table-count">{invoices.length} invoices</span></div>
          {invoices.length ? <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer / supply</th><th>Taxable value</th><th>GST</th><th>Invoice total</th><th>PDF</th></tr></thead><tbody>
            {invoices.map((invoice) => <tr key={invoice._id}>
              <td><strong className="table-primary">{invoice.invoiceNumber}</strong><small className="table-sub">{date(invoice.createdAt)} · {invoice.status}</small></td>
              <td>{invoice.customerName}<small className="table-sub">{invoice.customerStateCode === '33' ? 'CGST + SGST' : `IGST · ${invoice.customerState}`}</small></td>
              <td>{money(invoice.taxablePaise)}</td><td>{money(invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise)}</td>
              <td><strong>{money(invoice.totalPaise)}</strong></td>
              <td className="invoice-actions"><button className="button button-mini button-secondary" title="Download invoice PDF" onClick={() => download(`/invoices/${invoice._id}/pdf`, `${invoice.invoiceNumber}.pdf`).catch((requestError) => setError(requestError.message))}><ArrowDownToLine size={15} /> PDF</button>
                {user.role === 'admin' && invoice.status === 'posted' && invoice.order?.status === 'invoiced' && !paidByInvoice.get(String(invoice._id)) && <button className="button button-mini button-cancel" onClick={() => cancelInvoice(invoice)}><Ban size={13} /> Credit note</button>}
              </td>
            </tr>)}
          </tbody></table></div> : <div className="empty-state"><FileText /><strong>No invoices posted</strong><p>Approve an order and create its GST invoice from the order desk.</p></div>}
        </section>
        <aside className="invoice-side">
          <section className="panel payment-panel">
            <div className="panel-heading"><div><span className="eyebrow">ACCOUNTS RECEIVABLE</span><h2>Record payment</h2></div><span className="round-panel-icon"><CreditCard size={18} /></span></div>
            {postedInvoices.length ? <form onSubmit={recordPayment} className="stack-form">
              <label>Invoice<select value={postedInvoices.some((invoice) => invoice._id === invoiceId) ? invoiceId : postedInvoices[0]._id} onChange={(event) => setInvoiceId(event.target.value)}>{postedInvoices.map((invoice) => <option key={invoice._id} value={invoice._id}>{invoice.invoiceNumber} · {invoice.customerName}</option>)}</select></label>
              {selected?.status === 'posted' && <div className="balance-hint"><span>Invoice total</span><strong>{money(selected.totalPaise)}</strong></div>}
              <label>Amount received (₹)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
              <label>Method<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></label>
              <button className="button button-primary full-button" disabled={busy}><CreditCard size={15} /> {busy ? 'Saving…' : 'Record collection'}</button>
            </form> : <p className="muted-copy">Post an invoice to record a payment.</p>}
          </section>
          <section className="panel payment-history">
            <div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Collections</h2></div></div>
            {payments.slice(0, 5).map((payment) => <div className="payment-row" key={payment._id}>
              <span className="payment-check">✓</span><span className="compact-main"><strong>{payment.customer?.name || 'Customer'}</strong><small>{payment.paymentNumber} · {payment.invoice?.invoiceNumber}</small></span><strong>{money(payment.amountPaise)}</strong>
            </div>)}
            {!payments.length && <p className="muted-copy">Recorded collections appear here.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
