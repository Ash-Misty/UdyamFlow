import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Plus, ShoppingBasket } from 'lucide-react';
import { api } from '../api.js';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { date, money, quantity } from '../lib/format.js';

export function Purchases() {
  const [materials, setMaterials] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [materialId, setMaterialId] = useState('');
  const [supplier, setSupplier] = useState('Benchmark Supplier');
  const [purchaseQuantity, setPurchaseQuantity] = useState(60);
  const [rate, setRate] = useState(45);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const material = materials.find((item) => item._id === materialId);
  const reload = useCallback(async () => {
    try {
      const [items, rows] = await Promise.all([api('/masters/materials'), api('/purchases')]);
      setMaterials(items);
      setPurchases(rows);
      const flour = items.find((item) => item.name === 'Flour');
      if (!materialId) setMaterialId(flour?._id || items[0]?._id || '');
    } catch (requestError) { setError(requestError.message); }
  }, [materialId]);
  useEffect(() => { reload(); }, [reload]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await api('/purchases', {
        method: 'POST',
        body: { supplierName: supplier, lines: [{ material: materialId, quantity: Number(purchaseQuantity), unit: material.displayUnit, unitCost: Number(rate) }] },
      });
      setSuccess(`${result.purchaseNumber} received. ${quantity(Number(purchaseQuantity))} ${material.displayUnit} added to inventory.`);
      await reload();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="PROCUREMENT" title="Purchases" description="Receive raw and packaging materials into stock with supplier, rate and source document." />
      <Feedback error={error} success={success} />
      <div className="split-layout">
        <section className="panel purchase-form-panel">
          <div className="panel-heading"><div><span className="eyebrow">RECEIVE MATERIAL</span><h2>Record a purchase</h2></div><span className="round-panel-icon"><ShoppingBasket size={19} /></span></div>
          <form onSubmit={submit} className="stack-form">
            <label>Supplier name<input value={supplier} onChange={(event) => setSupplier(event.target.value)} required /></label>
            <label>Material<select value={materialId} onChange={(event) => setMaterialId(event.target.value)} required>{materials.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.kind}</option>)}</select></label>
            <div className="form-grid two"><label>Quantity ({material?.displayUnit || 'unit'})<input type="number" min="0.001" step="any" value={purchaseQuantity} onChange={(event) => setPurchaseQuantity(event.target.value)} required /></label><label>Rate (₹ per {material?.displayUnit || 'unit'})<input type="number" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} required /></label></div>
            <div className="purchase-total"><span>Purchase value</span><strong>{money(Math.round(Number(purchaseQuantity || 0) * Number(rate || 0) * 100))}</strong></div>
            <p className="muted-copy">Posting this receipt appends a purchase movement. It never edits an existing balance.</p>
            <button className="button button-primary full-button" disabled={busy || !material}><Plus size={16} /> {busy ? 'Posting receipt…' : 'Receive into stock'}</button>
          </form>
        </section>
        <section className="panel table-panel purchase-register">
          <div className="panel-heading"><div><span className="eyebrow">PURCHASE REGISTER</span><h2>Recent receipts</h2></div><span className="table-count">{purchases.length} receipts</span></div>
          {purchases.length ? <div className="compact-list">{purchases.map((purchase) => <div className="compact-row purchase-row" key={purchase._id}>
            <span className="list-avatar"><ArrowDownToLine size={16} /></span>
            <span className="compact-main"><strong>{purchase.supplierName}</strong><small>{purchase.purchaseNumber} · {purchase.lines.map((line) => `${line.materialName} ${quantity(line.quantity)}`).join(', ')}</small></span>
            <span className="compact-end"><strong>{money(purchase.totalPaise)}</strong><small>{date(purchase.createdAt)}</small></span>
          </div>)}</div> : <div className="empty-state"><ShoppingBasket /><strong>No receipts posted</strong><p>Purchases appear here after the first receipt.</p></div>}
        </section>
      </div>
    </>
  );
}
