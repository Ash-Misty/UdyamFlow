import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CircleDollarSign, ClipboardCheck, Factory, PackageSearch, ShoppingCart, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { date, money, quantity } from '../lib/format.js';

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/dashboard').then(setData).catch((requestError) => setError(requestError.message)); }, []);

  if (!data) return <><PageHeader eyebrow="FACTORY OVERVIEW" title="Good day." description="Your operations at a glance." /><Feedback error={error} /></>;
  const cards = [
    { title: 'Orders today', value: data.ordersToday, meta: `${data.pendingOrders} waiting for review`, icon: ShoppingCart, tint: 'mint' },
    { title: 'Open orders', value: data.pendingOrders, meta: user.role === 'salesman' ? 'Your submitted orders' : 'Need your attention', icon: ClipboardCheck, tint: 'gold' },
    { title: 'Low stock alerts', value: data.lowStockCount, meta: 'Materials at reorder level', icon: TriangleAlert, tint: data.lowStockCount ? 'rose' : 'mint' },
    { title: 'Receivables', value: money(data.outstandingPaise), meta: 'Outstanding on posted invoices', icon: CircleDollarSign, tint: 'blue' },
  ];
  return (
    <>
      <PageHeader eyebrow="FACTORY OVERVIEW" title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.name.split(' ')[0]}.`} description="Here is what is happening across your factory today." />
      <Feedback error={error} />
      <section className="metric-grid">
        {cards.map(({ title, value, meta, icon: Icon, tint }) => (
          <article className="metric-card" key={title}>
            <div className="metric-top"><span>{title}</span><span className={`metric-icon ${tint}`}><Icon size={18} /></span></div>
            <strong className="metric-value">{value}</strong><span className="metric-meta">{meta}</span>
          </article>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel orders-panel">
          <div className="panel-heading"><div><span className="eyebrow">NEEDS ATTENTION</span><h2>Incoming orders</h2></div><Link className="text-link" to="/orders">View all <ArrowRight size={15} /></Link></div>
          {data.openOrders.length ? <div className="compact-list">
            {data.openOrders.map((order) => <Link className="compact-row" key={order._id} to="/orders">
              <span className="list-avatar"><ShoppingCart size={16} /></span>
              <span className="compact-main"><strong>{order.customerName}</strong><small>{order.orderNumber} · {order.lines.reduce((sum, line) => sum + line.quantity, 0)} packets</small></span>
              <span className="compact-end"><small>{date(order.createdAt)}</small><ArrowRight size={15} /></span>
            </Link>)}
          </div> : <div className="empty-state"><span className="empty-icon"><ClipboardCheck /></span><strong>All caught up</strong><p>No orders are waiting for review.</p></div>}
        </section>
        <section className="panel stock-panel">
          <div className="panel-heading"><div><span className="eyebrow">LIVE INVENTORY</span><h2>Stock at a glance</h2></div><Link className="text-link" to="/inventory">Open ledger <ArrowRight size={15} /></Link></div>
          <div className="stock-preview">{data.stock.slice(0, 6).map((item) => <div className="stock-preview-row" key={item.itemId}>
            <span className={`stock-indicator ${item.lowStock ? 'warning' : ''}`}><Boxes size={16} /></span>
            <span className="stock-preview-name"><strong>{item.name}</strong><small>{item.itemType}</small></span>
            <span className={`stock-amount ${item.lowStock ? 'warning-text' : ''}`}>{quantity(item.quantity)} <small>{item.unit}</small></span>
          </div>)}</div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel production-panel">
          <div className="panel-heading"><div><span className="eyebrow">PRODUCTION</span><h2>Recent runs</h2></div><Factory size={19} className="subtle-icon" /></div>
          {data.recentRuns.length ? data.recentRuns.slice(0, 3).map((run) => (
            <div className="run-row" key={run._id}>
              <span className="run-icon"><PackageSearch size={16} /></span>
              <span className="compact-main"><strong>{run.productName}</strong><small>{run.runNumber} · {date(run.createdAt)}</small></span>
              <span className={`variance ${run.yieldVariancePercent < -3 ? 'variance-bad' : 'variance-good'}`}>
                {run.yieldVariancePercent < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                {quantity(Math.abs(run.yieldVariancePercent))}%
              </span>
            </div>
          )) : <p className="muted-copy">Production runs appear here once posted.</p>}
        </section>
        <section className="callout-card">
          <div className="callout-orb"><CircleDollarSign size={23} /></div>
          <span className="eyebrow">BUILT FOR TRACEABILITY</span>
          <h2>Every balance<br />has a paper trail.</h2>
          <p>Purchases, runs and dispatches flow into one append-only stock ledger.</p>
          <Link className="callout-link" to="/reports">Explore reports <ArrowRight size={16} /></Link>
        </section>
      </div>
    </>
  );
}
