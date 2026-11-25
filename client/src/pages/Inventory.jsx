import { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Boxes, Download, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { date, quantity } from '../lib/format.js';

export function Inventory() {
  const [stock, setStock] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [balances, entries] = await Promise.all([api('/inventory/stock'), api('/inventory/ledger')]);
      setStock(balances);
      setLedger(entries);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const itemName = (itemId) => stock.find((item) => item.itemId === itemId)?.name || 'Inventory item';
  const visibleLedger = selected ? ledger.filter((entry) => entry.item === selected) : ledger;

  return (
    <>
      <PageHeader eyebrow="INVENTORY CONTROL" title="Stock & ledger" description="Live balances are calculated from traceable source movements — never overwritten." action={<button className="button button-secondary" onClick={reload} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh</button>} />
      <Feedback error={error} />
      <section className="metric-grid inventory-metrics">
        <article className="metric-card"><div className="metric-top"><span>Tracked items</span><span className="metric-icon mint"><Boxes size={18} /></span></div><strong className="metric-value">{stock.length}</strong><span className="metric-meta">Raw, packaging &amp; finished goods</span></article>
        <article className="metric-card"><div className="metric-top"><span>Low stock</span><span className="metric-icon rose"><TriangleAlert size={18} /></span></div><strong className="metric-value">{stock.filter((item) => item.lowStock).length}</strong><span className="metric-meta">At or below reorder level</span></article>
        <article className="metric-card"><div className="metric-top"><span>Movements posted</span><span className="metric-icon blue"><Search size={18} /></span></div><strong className="metric-value">{ledger.length}</strong><span className="metric-meta">Latest 2,000 source-linked entries</span></article>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><span className="eyebrow">CURRENT BALANCES</span><h2>Stock summary</h2></div><span className="table-count">Ledger-derived</span></div>
        {stock.length ? <div className="table-scroll"><table><thead><tr><th>Item</th><th>Category</th><th>On hand</th><th>Reorder point</th><th>Health</th></tr></thead><tbody>
          {stock.map((item) => <tr key={item.itemId}>
            <td><span className="table-icon"><Boxes size={16} /></span><strong className="table-primary">{item.name}</strong></td>
            <td><span className="category-tag">{item.itemType}</span></td>
            <td><strong>{quantity(item.quantity, 3)} {item.unit}</strong></td>
            <td>{item.reorderLevel ? `${quantity(item.reorderLevel)} ${item.unit}` : '—'}</td>
            <td>{item.lowStock ? <span className="shortage-chip">Reorder</span> : <span className="stock-ok">In range</span>}</td>
          </tr>)}
        </tbody></table></div> : <div className="empty-state"><Boxes /><strong>No inventory yet</strong><p>Seed the benchmark data to load opening balances.</p></div>}
      </section>
      <section className="panel table-panel ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Stock movements</h2></div>
          <label className="compact-select"><span className="sr-only">Filter ledger by item</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">All inventory items</option>{stock.map((item) => <option value={item.itemId} key={item.itemId}>{item.name}</option>)}</select></label>
        </div>
        {visibleLedger.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>Item</th><th>Source document</th><th>Movement</th><th>Base unit</th></tr></thead><tbody>
          {visibleLedger.slice(0, 100).map((entry) => <tr key={entry._id}>
            <td>{date(entry.createdAt)}</td><td><strong className="table-primary">{entry.itemName}</strong></td>
            <td><span className="category-tag">{entry.sourceType}</span> <small>{entry.sourceLabel}</small></td>
            <td><strong className={entry.quantity < 0 ? 'negative-quantity' : 'positive-quantity'}>{entry.quantity < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{entry.quantity > 0 ? '+' : ''}{quantity(entry.quantity, 3)}</strong></td>
            <td>{entry.unit}</td>
          </tr>)}
        </tbody></table></div> : <div className="empty-state"><Download /><strong>No stock movements match</strong><p>Try a different item filter.</p></div>}
      </section>
    </>
  );
}
