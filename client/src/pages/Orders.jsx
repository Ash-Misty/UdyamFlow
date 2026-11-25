import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Check, Clock3, FileText, Pencil, Plus, Send, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { date, money } from '../lib/format.js';

const statusClass = (status) => `status-pill status-${status}`;
const OFFLINE_KEY = 'udyamflow-offline-orders';
const CUSTOMER_CACHE = 'udyamflow-customer-cache';
const PRODUCT_CACHE = 'udyamflow-product-cache';

function readOfflineOrders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function readCache(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const makeIdempotencyKey = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function Orders() {
  const { user } = useAuth();
  const isSales = user.role === 'salesman';
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customer, setCustomer] = useState('');
  const [product, setProduct] = useState('');
  const [packetCount, setPacketCount] = useState(1);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [offlineCount, setOfflineCount] = useState(0);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editedLines, setEditedLines] = useState([]);
  const reload = useCallback(async () => {
    const [orderResult, customerResult, productResult] = await Promise.allSettled([
      api('/orders'), api('/masters/customers'), api('/masters/products'),
    ]);
    const customerRows = customerResult.status === 'fulfilled' ? customerResult.value : readCache(CUSTOMER_CACHE);
    const productRows = productResult.status === 'fulfilled' ? productResult.value : readCache(PRODUCT_CACHE);
    if (customerResult.status === 'fulfilled') localStorage.setItem(CUSTOMER_CACHE, JSON.stringify(customerRows));
    if (productResult.status === 'fulfilled') localStorage.setItem(PRODUCT_CACHE, JSON.stringify(productRows));
    if (orderResult.status === 'fulfilled') setOrders(orderResult.value);
    else if (navigator.onLine && !(orderResult.reason instanceof TypeError)) setError(orderResult.reason.message);
    if (customerResult.status === 'rejected' && !customerRows.length && navigator.onLine && !(customerResult.reason instanceof TypeError)) {
      setError(customerResult.reason.message);
    }
    if (productResult.status === 'rejected' && !productRows.length && navigator.onLine && !(productResult.reason instanceof TypeError)) {
      setError(productResult.reason.message);
    }
    setCustomers(customerRows);
    setProducts(productRows);
    if (!customer && customerRows.length) setCustomer(customerRows[0]._id);
    if (!product && productRows.length) setProduct(productRows[0]._id);
  }, [customer, product]);
  useEffect(() => { reload(); }, [reload]);

  const syncOfflineOrders = useCallback(async () => {
    if (!isSales || !navigator.onLine) return;
    const queued = readOfflineOrders();
    const mine = queued.filter((item) => item.ownerId === user.id);
    if (!mine.length) return setOfflineCount(0);
    const remaining = [...queued];
    let synced = 0;
    for (const item of mine) {
      try {
        await api('/orders', { method: 'POST', body: item.payload });
        const index = remaining.findIndex((entry) => entry.payload.idempotencyKey === item.payload.idempotencyKey);
        if (index >= 0) remaining.splice(index, 1);
        synced += 1;
      } catch (requestError) {
        if (!(requestError instanceof TypeError)) setError(`Offline order could not be synced: ${requestError.message}`);
        break;
      }
    }
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining));
    setOfflineCount(remaining.filter((item) => item.ownerId === user.id).length);
    if (synced) {
      setSuccess(`${synced} offline order${synced === 1 ? '' : 's'} synced to the factory.`);
      await reload();
    }
  }, [isSales, user.id, reload]);

  useEffect(() => {
    setOfflineCount(readOfflineOrders().filter((item) => item.ownerId === user.id).length);
    syncOfflineOrders();
    window.addEventListener('online', syncOfflineOrders);
    return () => window.removeEventListener('online', syncOfflineOrders);
  }, [syncOfflineOrders, user.id]);

  function addLine() {
    const selected = products.find((item) => item._id === product);
    if (!selected || !Number.isInteger(Number(packetCount)) || Number(packetCount) < 1) return;
    setLines((current) => [...current, {
      product: selected._id, productName: `${selected.name} ${selected.packSize}`,
      quantity: Number(packetCount), unitPricePaise: selected.sellingPricePaise,
    }]);
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!lines.length) return setError('Add at least one product to your order.');
    setBusy(true); setError(''); setSuccess('');
    const payload = {
      customer,
      lines: lines.map(({ product: id, quantity }) => ({ product: id, quantity })),
      idempotencyKey: makeIdempotencyKey(),
    };
    try {
      await api('/orders', { method: 'POST', body: payload });
      setLines([]);
      setSuccess('Order sent to the factory. You can follow its status below.');
      await reload();
    } catch (requestError) {
      if (requestError instanceof TypeError || !navigator.onLine) {
        const queued = readOfflineOrders();
        queued.push({ ownerId: user.id, payload, savedAt: new Date().toISOString() });
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(queued));
        setOfflineCount(queued.filter((item) => item.ownerId === user.id).length);
        setLines([]);
        setSuccess('Network unavailable. Order saved on this device and will sync when you reconnect.');
      } else setError(requestError.message);
    }
    finally { setBusy(false); }
  }

  async function decide(order, decision) {
    setError(''); setSuccess('');
    try {
      const result = await api(`/orders/${order._id}/decision`, { method: 'PATCH', body: { decision } });
      setSuccess(result.shortage ? `Approved with a stock shortage: ${result.shortageDetails.map((item) => `${item.product} short by ${item.shortage}`).join(', ')}.` : `Order ${decision}.`);
      await reload();
    } catch (requestError) { setError(requestError.message); }
  }

  function startEditing(order) {
    setEditingOrder(order);
    setEditedLines(order.lines.map((line) => ({
      product: String(line.product), productName: line.productName, quantity: line.quantity,
      unitPrice: (line.unitPricePaise / 100).toFixed(2),
    })));
  }

  async function saveOrderEdit(event) {
    event.preventDefault();
    setError(''); setSuccess('');
    try {
      const result = await api(`/orders/${editingOrder._id}`, {
        method: 'PATCH',
        body: { lines: editedLines.map(({ product: id, quantity, unitPrice }) => ({ product: id, quantity: Number(quantity), unitPrice: Number(unitPrice) })) },
      });
      setEditingOrder(null);
      setSuccess(result.shortage ? `Order updated. Stock shortage: ${result.shortageDetails.map((item) => `${item.product} short by ${item.shortage}`).join(', ')}.` : 'Order quantities and prices updated.');
      await reload();
    } catch (requestError) { setError(requestError.message); }
  }

  async function action(path, successText) {
    setError(''); setSuccess('');
    try { await api(path, { method: 'POST', body: {} }); setSuccess(successText); await reload(); }
    catch (requestError) { setError(requestError.message); }
  }

  const columns = isSales ? ['Order', 'Customer', 'Items', 'Submitted', 'Status'] : ['Order', 'Customer / rep', 'Items', 'Stock check', 'Status', 'Actions'];
  return (
    <>
      <PageHeader eyebrow="SALES WORKFLOW" title={isSales ? 'My orders' : 'Order desk'} description={isSales ? 'Place retailer orders and track every step to dispatch.' : 'Review incoming orders, check stock and move approved sales to dispatch.'} />
      <Feedback error={error} success={success} />
      {editingOrder && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingOrder(null); }}>
        <form className="panel order-edit-modal" onSubmit={saveOrderEdit}>
          <div className="panel-heading"><div><span className="eyebrow">EDIT SUBMITTED ORDER</span><h2>{editingOrder.orderNumber} · {editingOrder.customerName}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditingOrder(null)}><X size={17} /></button></div>
          <div className="order-edit-lines">{editedLines.map((line, index) => <div className="order-edit-line" key={line.product}>
            <span className="compact-main"><strong>{line.productName}</strong><small>Unit price before tax</small></span>
            <label>Packets<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setEditedLines((items) => items.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: event.target.value } : item))} /></label>
            <label>Price (₹)<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setEditedLines((items) => items.map((item, lineIndex) => lineIndex === index ? { ...item, unitPrice: event.target.value } : item))} /></label>
          </div>)}</div>
          <div className="composer-footer"><span>Price overrides are saved in the order audit trail.</span><div><button type="button" className="button button-secondary" onClick={() => setEditingOrder(null)}>Cancel</button><button className="button button-primary"><Check size={15} /> Save changes</button></div></div>
        </form>
      </div>}
      {isSales && <section className="panel order-composer">
        <div className="panel-heading"><div><span className="eyebrow">NEW ORDER</span><h2>Build a retailer order</h2></div><span className={`mobile-tag ${offlineCount ? 'offline-tag' : ''}`}>{offlineCount ? `${offlineCount} saved offline` : 'Offline-ready'}</span></div>
        <form onSubmit={submitOrder}>
          <div className="form-grid form-grid-order">
            <label>Customer<select value={customer} onChange={(event) => setCustomer(event.target.value)} required>{customers.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.state}</option>)}</select></label>
            <label>Product<select value={product} onChange={(event) => setProduct(event.target.value)}>{products.map((item) => <option key={item._id} value={item._id}>{item.name} {item.packSize}</option>)}</select></label>
            <label>Packets<input type="number" min="1" step="1" value={packetCount} onChange={(event) => setPacketCount(event.target.value)} /></label>
            <button type="button" className="button button-secondary add-line" onClick={addLine}><Plus size={16} /> Add item</button>
          </div>
          {lines.length > 0 && <div className="draft-lines">{lines.map((line, index) => <div key={`${line.product}-${index}`}><span>{line.productName} <small>× {line.quantity}</small></span><strong>{money(line.quantity * line.unitPricePaise)}</strong><button type="button" className="icon-button" aria-label="Remove item" onClick={() => setLines((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>)}</div>}
          <div className="composer-footer"><span>{lines.reduce((sum, line) => sum + line.quantity, 0)} packets · {money(lines.reduce((sum, line) => sum + line.quantity * line.unitPricePaise, 0))} before GST</span><button className="button button-primary" disabled={busy || !lines.length}><Send size={16} /> {busy ? 'Sending…' : 'Submit order'}</button></div>
        </form>
      </section>}
      <section className="panel table-panel">
        <div className="panel-heading"><div><span className="eyebrow">{isSales ? 'ORDER TRACKER' : 'INCOMING QUEUE'}</span><h2>{isSales ? 'Recent submissions' : 'All factory orders'}</h2></div><span className="table-count">{orders.length} orders</span></div>
        {orders.length ? <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
          {orders.map((order) => <tr key={order._id}>
            <td><strong className="table-primary">{order.orderNumber}</strong><small className="table-sub">{order.lines.map((line) => line.productName).join(', ')}</small></td>
            <td>{order.customerName}{!isSales && <small className="table-sub">by {order.salesman?.name || 'Salesman'}</small>}</td>
            <td>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} packets<small className="table-sub">{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPricePaise, 0))} ex. tax</small></td>
            {!isSales && <td>{order.shortage ? <span className="shortage-chip">Short {order.shortageDetails.reduce((sum, item) => sum + item.shortage, 0)} packets</span> : <span className="stock-ok">Stock available</span>}</td>}
            {isSales && <td>{date(order.createdAt)}</td>}
            <td><span className={statusClass(order.status)}>{order.status}</span>{order.shortage && <small className="table-sub warning-text">Shortage flagged</small>}</td>
            {!isSales && <td className="action-cell">
              {order.status === 'submitted' && <button className="button button-mini button-secondary" onClick={() => startEditing(order)}><Pencil size={13} /> Edit</button>}
              {order.status === 'submitted' && <><button className="button button-mini button-secondary" onClick={() => decide(order, 'rejected')}><X size={14} /> Reject</button><button className="button button-mini button-primary" onClick={() => decide(order, 'approved')}><Check size={14} /> Approve</button></>}
              {order.status === 'approved' && <button className="button button-mini button-primary" onClick={() => action(`/orders/${order._id}/invoice`, 'GST invoice created.') }><FileText size={14} /> Create invoice</button>}
              {order.status === 'invoiced' && <button className="button button-mini button-primary" onClick={() => action(`/orders/${order._id}/dispatch`, 'Dispatch posted to the stock ledger.') }><ArrowDownToLine size={14} /> Dispatch</button>}
              {order.status === 'dispatched' && <span className="muted-copy">Complete</span>}
            </td>}
          </tr>)}
        </tbody></table></div> : <div className="empty-state"><span className="empty-icon"><Clock3 /></span><strong>No orders yet</strong><p>New orders will show here when they are submitted.</p></div>}
      </section>
    </>
  );
}
