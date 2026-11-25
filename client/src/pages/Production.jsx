import { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Factory, Plus, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { date, money, quantity } from '../lib/format.js';

const defaultsFor = (product, actualOutput = 188) => (product?.bom || []).map((line) => {
  const material = line.material;
  const value = material.kind === 'packaging' && material.name.toLowerCase().includes('pouch')
    ? actualOutput + 6
    : material.kind === 'packaging' && material.name.toLowerCase().includes('carton')
      ? Math.max(1, Math.floor(actualOutput / 20))
      : material.name.toLowerCase().includes('oil')
        ? line.quantity * 1.05
      : line.quantity;
  return { material: material._id, name: material.name, unit: line.unit, quantity: value };
});

export function Production() {
  const [products, setProducts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [productId, setProductId] = useState('');
  const [batchCount, setBatchCount] = useState(1);
  const [actualOutput, setActualOutput] = useState(188);
  const [damagedPouches, setDamagedPouches] = useState(6);
  const [cartonsUsed, setCartonsUsed] = useState(9);
  const [labour, setLabour] = useState(1200);
  const [utilities, setUtilities] = useState(600);
  const [consumption, setConsumption] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const product = products.find((item) => item._id === productId);
  const reload = useCallback(async () => {
    try {
      const [productRows, runRows] = await Promise.all([api('/masters/products'), api('/production')]);
      setProducts(productRows);
      setRuns(runRows);
      if (!productId && productRows.length) {
        const defaultProduct = productRows.find((item) => item.sku === 'MRK-200') || productRows[0];
        setProductId(defaultProduct._id);
        setConsumption(defaultsFor(defaultProduct));
      }
    } catch (requestError) { setError(requestError.message); }
  }, [productId]);
  useEffect(() => { reload(); }, [reload]);

  function changeProduct(value) {
    setProductId(value);
    const selected = products.find((item) => item._id === value);
    setActualOutput(selected?.expectedPackets || 1);
    setConsumption(defaultsFor(selected, selected?.expectedPackets || 1));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const run = await api('/production', {
        method: 'POST',
        body: {
          product: productId, batchCount: Number(batchCount), actualOutput: Number(actualOutput),
          damagedPouches: Number(damagedPouches), cartonsUsed: Number(cartonsUsed),
          labour: Number(labour), utilities: Number(utilities), actualConsumption: consumption,
        },
      });
      setSuccess(`${run.runNumber} posted. Cost ${money(run.costPerPacketPaise)} per packet; yield variance ${quantity(run.yieldVariancePercent)}%.`);
      await reload();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="BILL OF MATERIALS · PRODUCTION" title="Production runs" description="Post actual consumption once. Raw stock, finished goods and run costing update together." />
      <Feedback error={error} success={success} />
      <div className="production-layout">
        <section className="panel production-form-panel">
          <div className="panel-heading"><div><span className="eyebrow">RECORD A RUN</span><h2>New production batch</h2></div><span className="round-panel-icon"><Factory size={19} /></span></div>
          <form onSubmit={submit} className="stack-form">
            <div className="form-grid">
              <label>Product<select value={productId} onChange={(event) => changeProduct(event.target.value)} required>{products.map((item) => <option value={item._id} key={item._id}>{item.name} {item.packSize}</option>)}</select></label>
              <label>Batch count<input type="number" min="1" step="1" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} /></label>
            </div>
            <div className="section-rule"><span>ACTUAL OUTPUT</span></div>
            <div className="form-grid three">
              <label>Good packets<input type="number" min="1" step="1" value={actualOutput} onChange={(event) => setActualOutput(event.target.value)} required /></label>
              <label>Damaged pouches<input type="number" min="0" step="1" value={damagedPouches} onChange={(event) => setDamagedPouches(event.target.value)} /></label>
              <label>Cartons used<input type="number" min="0" step="1" value={cartonsUsed} onChange={(event) => setCartonsUsed(event.target.value)} /></label>
            </div>
            <div className="section-rule"><span>ACTUAL MATERIAL CONSUMPTION</span><small>Enter quantities in the BOM unit</small></div>
            <div className="consumption-list">{consumption.map((line, index) => (
              <label key={line.material} className="consumption-row"><span><strong>{line.name}</strong><small>Planned {quantity((product?.bom[index]?.quantity || 0) * Number(batchCount))} {line.unit}</small></span><span className="consumption-input"><input type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => setConsumption((items) => items.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /><i>{line.unit}</i></span></label>
            ))}</div>
            <div className="section-rule"><span>RUN OVERHEADS</span></div>
            <div className="form-grid two">
              <label>Labour (₹)<input type="number" min="0" step="0.01" value={labour} onChange={(event) => setLabour(event.target.value)} /></label>
              <label>Gas &amp; power (₹)<input type="number" min="0" step="0.01" value={utilities} onChange={(event) => setUtilities(event.target.value)} /></label>
            </div>
            <div className="production-hint"><TriangleAlert size={16} /><span>Negative material balances are blocked. Every posted issue is linked to this run.</span></div>
            <button className="button button-primary full-button" disabled={busy || !product}><Plus size={16} /> {busy ? 'Posting run…' : 'Post production run'}</button>
          </form>
        </section>
        <aside className="production-aside">
          <section className="benchmark-card">
            <span className="eyebrow">BENCHMARK CHECK</span><h2>Murukku · 200 g</h2>
            <p>Section 5 scenario, ready to replay on a fresh seeded database.</p>
            <div className="benchmark-row"><span>Expected batch</span><strong>200 packets</strong></div>
            <div className="benchmark-row"><span>Demo actual yield</span><strong>188 packets <em>−6%</em></strong></div>
            <div className="benchmark-row"><span>Oil issue</span><strong>10.5 L <em>+5%</em></strong></div>
            <div className="benchmark-note">After seeding, purchase flour (60 kg at ₹45/kg) before posting this run.</div>
          </section>
          <section className="panel latest-runs">
            <div className="panel-heading"><div><span className="eyebrow">PRODUCTION LOG</span><h2>Latest runs</h2></div></div>
            {runs.slice(0, 5).map((run) => <div className="run-log-row" key={run._id}>
              <span className="run-log-dot" />
              <span className="compact-main"><strong>{run.productName}</strong><small>{run.runNumber} · {date(run.createdAt)}{run.actualConsumption?.some((line) => line.flagged) ? ` · ${run.actualConsumption.filter((line) => line.flagged).map((line) => `${line.materialName} ${line.variancePercent > 0 ? '+' : ''}${quantity(line.variancePercent)}%`).join(', ')}` : ''}</small></span>
              <span className={`variance ${run.yieldVariancePercent < -3 ? 'variance-bad' : 'variance-good'}`}>{run.yieldVariancePercent < 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{quantity(Math.abs(run.yieldVariancePercent))}%</span>
            </div>)}
            {!runs.length && <p className="muted-copy">No production run posted yet.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
