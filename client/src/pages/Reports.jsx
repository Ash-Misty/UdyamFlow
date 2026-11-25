import { useEffect, useState } from 'react';
import { ArrowDownToLine, Download, FileBarChart, RefreshCw } from 'lucide-react';
import { api, download } from '../api.js';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';

const reportOptions = [
  ['sales', 'Sales register'], ['gst', 'GST summary'], ['stock', 'Stock summary'],
  ['ledger', 'Stock ledger'], ['production', 'Production & yield'], ['purchases', 'Purchase register'],
  ['outstanding', 'Receivables ageing'], ['orders', 'Order status'],
];

export function Reports() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ type });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const data = await api(`/reports?${query}`);
      setRows(data.rows);
      setGeneratedAt(data.generatedAt);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [type]);

  async function exportCsv() {
    const query = new URLSearchParams({ type, format: 'csv' });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    try { await download(`/reports?${query}`, `udyamflow-${type}.csv`); }
    catch (requestError) { setError(requestError.message); }
  }

  async function exportPdf() {
    const query = new URLSearchParams({ type, format: 'pdf' });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    try { await download(`/reports?${query}`, `udyamflow-${type}.pdf`); }
    catch (requestError) { setError(requestError.message); }
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <>
      <PageHeader eyebrow="AUDITOR WORKSPACE" title="Reports" description="Filter the source data behind your sales, tax, inventory and production numbers." action={<div className="export-actions"><button className="button button-secondary" onClick={exportCsv} disabled={!rows.length}><Download size={15} /> CSV</button><button className="button button-secondary" onClick={exportPdf} disabled={!rows.length}><Download size={15} /> PDF</button></div>} />
      <Feedback error={error} />
      <section className="panel report-controls">
        <label>Report<select value={type} onChange={(event) => setType(event.target.value)}>{reportOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="button button-primary report-run" onClick={load} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Generate report</button>
      </section>
      <section className="panel table-panel reports-panel">
        <div className="panel-heading"><div><span className="eyebrow">GENERATED OUTPUT</span><h2>{reportOptions.find(([value]) => value === type)?.[1]}</h2></div><span className="table-count">{rows.length} rows</span></div>
        {rows.length ? <div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.slice(0, 500).map((row, index) => <tr key={`${row.invoice || row.run || row.itemId || index}-${index}`}>{headers.map((header) => <td key={header}>{row[header] === '' ? '—' : String(row[header])}</td>)}</tr>)}</tbody></table></div> : <div className="empty-state"><FileBarChart /><strong>No report rows</strong><p>Try another report type or date range.</p></div>}
        {generatedAt && <div className="report-footnote"><span><ArrowDownToLine size={14} /> Exports reflect the filters above and are generated from posted records.</span><small>Generated {new Date(generatedAt).toLocaleString('en-IN')}</small></div>}
      </section>
    </>
  );
}
