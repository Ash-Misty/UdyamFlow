import { useCallback, useEffect, useState } from 'react';
import { ContactRound, PackagePlus, Plus, Tags } from 'lucide-react';
import { api } from '../api.js';
import { Feedback } from '../components/Feedback.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { money } from '../lib/format.js';

export function Masters() {
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', customerType: 'retailer', state: 'Tamil Nadu', stateCode: '33', gstin: '', phone: '' });
  const [materialForm, setMaterialForm] = useState({ name: '', kind: 'raw', displayUnit: 'kg', reorderLevel: 0, defaultRate: 0 });
  const [productForm, setProductForm] = useState({ name: '', sku: '', packSize: '', hsnCode: '', gstRate: 5, sellingPrice: 0, expectedPackets: 200 });
  const [bom, setBom] = useState([]);

  const reload = useCallback(async () => {
    try {
      const [customerRows, materialRows, productRows] = await Promise.all([
        api('/masters/customers'), api('/masters/materials'), api('/masters/products'),
      ]);
      setCustomers(customerRows);
      setMaterials(materialRows);
      setProducts(productRows);
      if (!bom.length && materialRows.length) {
        setBom([{ material: materialRows[0]._id, quantity: 1, unit: materialRows[0].displayUnit }]);
      }
    } catch (requestError) { setError(requestError.message); }
  }, [bom.length]);
  useEffect(() => { reload(); }, [reload]);

  function addBomLine() {
    const material = materials[0];
    if (material) setBom((lines) => [...lines, { material: material._id, quantity: 1, unit: material.displayUnit }]);
  }

  function updateBom(index, field, value) {
    setBom((lines) => lines.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (field === 'material') {
        const material = materials.find((item) => item._id === value);
        return { ...line, material: value, unit: material?.displayUnit || '' };
      }
      return { ...line, [field]: value };
    }));
  }

  async function save(kind, form, reset) {
    setBusy(true); setError(''); setSuccess('');
    try {
      await api(`/masters/${kind}`, { method: 'POST', body: form });
      setSuccess(`${kind === 'customers' ? 'Customer' : kind === 'materials' ? 'Material' : 'Product'} added to master data.`);
      reset();
      await reload();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Master data" description="Manage the customers, stock items, product catalogue and bill of materials that power daily transactions." />
      <Feedback error={error} success={success} />
      <div className="master-grid">
        <section className="panel master-card">
          <div className="panel-heading"><div><span className="eyebrow">CUSTOMER DIRECTORY</span><h2>New customer</h2></div><span className="round-panel-icon"><ContactRound size={18} /></span></div>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); save('customers', customerForm, () => setCustomerForm({ name: '', customerType: 'retailer', state: 'Tamil Nadu', stateCode: '33', gstin: '', phone: '' })); }}>
            <label>Business name<input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} required /></label>
            <div className="form-grid two"><label>Type<select value={customerForm.customerType} onChange={(event) => setCustomerForm({ ...customerForm, customerType: event.target.value })}><option value="retailer">Retailer</option><option value="distributor">Distributor</option></select></label><label>State code<input value={customerForm.stateCode} onChange={(event) => setCustomerForm({ ...customerForm, stateCode: event.target.value })} required /></label></div>
            <label>State name<input value={customerForm.state} onChange={(event) => setCustomerForm({ ...customerForm, state: event.target.value })} required /></label>
            <div className="form-grid two"><label>GSTIN (optional)<input value={customerForm.gstin} onChange={(event) => setCustomerForm({ ...customerForm, gstin: event.target.value })} /></label><label>Phone<input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label></div>
            <button className="button button-primary full-button" disabled={busy}><Plus size={15} /> Add customer</button>
          </form>
          <div className="master-list">{customers.slice(0, 5).map((customer) => <div key={customer._id}><span>{customer.name}<small>{customer.customerType} · {customer.state}</small></span><strong>{customer.stateCode}</strong></div>)}</div>
        </section>
        <section className="panel master-card">
          <div className="panel-heading"><div><span className="eyebrow">STOCK CATALOGUE</span><h2>New material</h2></div><span className="round-panel-icon"><PackagePlus size={18} /></span></div>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); save('materials', materialForm, () => setMaterialForm({ name: '', kind: 'raw', displayUnit: 'kg', reorderLevel: 0, defaultRate: 0 })); }}>
            <label>Material name<input value={materialForm.name} onChange={(event) => setMaterialForm({ ...materialForm, name: event.target.value })} required /></label>
            <div className="form-grid two"><label>Category<select value={materialForm.kind} onChange={(event) => setMaterialForm({ ...materialForm, kind: event.target.value })}><option value="raw">Raw material</option><option value="packaging">Packaging</option></select></label><label>Display unit<select value={materialForm.displayUnit} onChange={(event) => setMaterialForm({ ...materialForm, displayUnit: event.target.value })}><option value="kg">Kilogram</option><option value="g">Gram</option><option value="litre">Litre</option><option value="ml">Millilitre</option><option value="piece">Piece</option><option value="packet">Packet</option><option value="carton">Carton</option></select></label></div>
            <div className="form-grid two"><label>Reorder point<input type="number" min="0" step="any" value={materialForm.reorderLevel} onChange={(event) => setMaterialForm({ ...materialForm, reorderLevel: Number(event.target.value) })} /></label><label>Default rate (₹ / unit)<input type="number" min="0" step="0.01" value={materialForm.defaultRate} onChange={(event) => setMaterialForm({ ...materialForm, defaultRate: Number(event.target.value) })} /></label></div>
            <button className="button button-primary full-button" disabled={busy}><Plus size={15} /> Add material</button>
          </form>
          <div className="master-list">{materials.slice(0, 6).map((material) => <div key={material._id}><span>{material.name}<small>{material.kind} · {material.displayUnit}</small></span><strong>{money(material.defaultRatePaise)}</strong></div>)}</div>
        </section>
        <section className="panel master-card master-product-card">
          <div className="panel-heading"><div><span className="eyebrow">PRODUCT CATALOGUE</span><h2>New finished product</h2></div><span className="round-panel-icon"><Tags size={18} /></span></div>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); save('products', { ...productForm, bom }, () => { setProductForm({ name: '', sku: '', packSize: '', hsnCode: '', gstRate: 5, sellingPrice: 0, expectedPackets: 200 }); setBom([]); }); }}>
            <div className="form-grid two"><label>Product name<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required /></label><label>SKU<input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} required /></label></div>
            <div className="form-grid three"><label>Pack size<input value={productForm.packSize} onChange={(event) => setProductForm({ ...productForm, packSize: event.target.value })} placeholder="200 g" required /></label><label>HSN code<input value={productForm.hsnCode} onChange={(event) => setProductForm({ ...productForm, hsnCode: event.target.value })} required /></label><label>GST %<input type="number" min="0" step="any" value={productForm.gstRate} onChange={(event) => setProductForm({ ...productForm, gstRate: Number(event.target.value) })} /></label></div>
            <div className="form-grid two"><label>Selling price (₹ / packet)<input type="number" min="0.01" step="0.01" value={productForm.sellingPrice} onChange={(event) => setProductForm({ ...productForm, sellingPrice: Number(event.target.value) })} required /></label><label>Expected packets / batch<input type="number" min="1" step="1" value={productForm.expectedPackets} onChange={(event) => setProductForm({ ...productForm, expectedPackets: Number(event.target.value) })} required /></label></div>
            <div className="section-rule"><span>BILL OF MATERIALS</span><button type="button" className="text-link" onClick={addBomLine}><Plus size={13} /> Add line</button></div>
            {bom.map((line, index) => <div className="bom-row" key={`${index}-${line.material}`}>
              <select aria-label="BOM material" value={line.material} onChange={(event) => updateBom(index, 'material', event.target.value)}>{materials.map((material) => <option value={material._id} key={material._id}>{material.name}</option>)}</select>
              <input aria-label="BOM quantity" type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => updateBom(index, 'quantity', Number(event.target.value))} />
              <select aria-label="BOM unit" value={line.unit} onChange={(event) => updateBom(index, 'unit', event.target.value)}><option value="kg">kg</option><option value="g">g</option><option value="litre">litre</option><option value="ml">ml</option><option value="piece">piece</option><option value="carton">carton</option></select>
              <button type="button" className="icon-button" aria-label="Remove BOM line" onClick={() => setBom((lines) => lines.filter((_, lineIndex) => lineIndex !== index))}>×</button>
            </div>)}
            <button className="button button-primary full-button" disabled={busy || !bom.length}><Plus size={15} /> Add product &amp; BOM</button>
          </form>
          <div className="master-list">{products.slice(0, 6).map((product) => <div key={product._id}><span>{product.name} {product.packSize}<small>{product.sku} · {product.bom.length} BOM lines</small></span><strong>{money(product.sellingPricePaise)}</strong></div>)}</div>
        </section>
      </div>
    </>
  );
}
