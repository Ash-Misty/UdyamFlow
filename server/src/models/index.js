import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'salesman', 'production', 'accountant', 'owner'], required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const customerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  customerType: { type: String, enum: ['retailer', 'distributor'], default: 'retailer' },
  gstin: { type: String, default: '' },
  state: { type: String, required: true },
  stateCode: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const materialSchema = new Schema({
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['raw', 'packaging'], required: true },
  baseUnit: { type: String, required: true },
  displayUnit: { type: String, required: true },
  reorderLevel: { type: Number, default: 0 },
  defaultRatePaise: { type: Number, default: 0 },
}, { timestamps: true });
materialSchema.index({ name: 1, kind: 1 }, { unique: true });

const bomLineSchema = new Schema({
  material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
  quantity: { type: Number, required: true, min: 0.001 },
  unit: { type: String, required: true },
}, { _id: false });

const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, uppercase: true },
  packSize: { type: String, required: true },
  hsnCode: { type: String, required: true },
  gstRate: { type: Number, required: true, min: 0, max: 100 },
  sellingPricePaise: { type: Number, required: true, min: 0 },
  expectedPackets: { type: Number, required: true, min: 1 },
  bom: { type: [bomLineSchema], default: [] },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const ledgerSchema = new Schema({
  itemType: { type: String, enum: ['raw', 'packaging', 'finished'], required: true },
  item: { type: Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  unitCostPaise: { type: Number, default: 0 },
  sourceType: { type: String, required: true },
  source: { type: Schema.Types.ObjectId, required: true },
  sourceLabel: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
ledgerSchema.index({ itemType: 1, item: 1, createdAt: 1 });
ledgerSchema.index({ sourceType: 1, source: 1 });
const stockLockSchema = new Schema({ _id: String, version: { type: Number, default: 0 } });

const orderLineSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPricePaise: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, default: null },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String, required: true },
  customerState: { type: String, required: true },
  customerStateCode: { type: String, required: true },
  salesman: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lines: { type: [orderLineSchema], required: true },
  status: { type: String, enum: ['submitted', 'approved', 'rejected', 'invoiced', 'dispatched', 'cancelled'], default: 'submitted' },
  shortage: { type: Boolean, default: false },
  shortageDetails: { type: [Schema.Types.Mixed], default: [] },
  notes: { type: String, default: '' },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
  dispatchedAt: { type: Date, default: null },
  audit: [{ action: String, user: Schema.Types.ObjectId, at: { type: Date, default: Date.now }, details: Schema.Types.Mixed }],
}, { timestamps: true });
orderSchema.index(
  { idempotencyKey: 1, salesman: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

const invoiceLineSchema = new Schema({
  product: Schema.Types.ObjectId,
  productName: String,
  sku: String,
  hsnCode: String,
  quantity: Number,
  unitPricePaise: Number,
  taxablePaise: Number,
  gstRate: Number,
  cgstPaise: Number,
  sgstPaise: Number,
  igstPaise: Number,
  totalPaise: Number,
}, { _id: false });

const invoiceSchema = new Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: String,
  customerGstin: String,
  customerState: String,
  customerStateCode: String,
  supplierState: { type: String, default: 'Tamil Nadu' },
  supplierStateCode: { type: String, default: '33' },
  lines: [invoiceLineSchema],
  taxablePaise: Number,
  cgstPaise: Number,
  sgstPaise: Number,
  igstPaise: Number,
  totalPaise: Number,
  paymentVersion: { type: Number, default: 0 },
  status: { type: String, enum: ['posted', 'cancelled'], default: 'posted' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const creditNoteSchema = new Schema({
  creditNoteNumber: { type: String, required: true, unique: true },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true },
  order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  reason: { type: String, required: true },
  taxablePaise: Number,
  cgstPaise: Number,
  sgstPaise: Number,
  igstPaise: Number,
  totalPaise: Number,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const purchaseSchema = new Schema({
  purchaseNumber: { type: String, required: true, unique: true },
  supplierName: { type: String, required: true },
  lines: [{ material: Schema.Types.ObjectId, materialName: String, quantity: Number, unit: String, unitCostPaise: Number, amountPaise: Number }],
  totalPaise: Number,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const productionRunSchema = new Schema({
  runNumber: { type: String, required: true, unique: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: String,
  batchCount: { type: Number, required: true },
  expectedOutput: Number,
  actualOutput: Number,
  damagedPouches: { type: Number, default: 0 },
  cartonsUsed: { type: Number, default: 0 },
  plannedConsumption: [{ material: Schema.Types.ObjectId, materialName: String, quantity: Number, unit: String }],
  actualConsumption: [{
    material: Schema.Types.ObjectId,
    materialName: String,
    quantity: Number,
    plannedQuantity: Number,
    variancePercent: Number,
    flagged: Boolean,
    unit: String,
    unitCostPaise: Number,
  }],
  labourPaise: { type: Number, default: 0 },
  utilitiesPaise: { type: Number, default: 0 },
  materialCostPaise: Number,
  totalCostPaise: Number,
  costPerPacketPaise: Number,
  yieldVariancePercent: Number,
  status: { type: String, enum: ['posted', 'cancelled'], default: 'posted' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const paymentSchema = new Schema({
  paymentNumber: { type: String, required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  method: { type: String, enum: ['cash', 'bank', 'upi', 'cheque'], default: 'bank' },
  reference: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const auditSchema = new Schema({
  entityType: { type: String, required: true },
  entity: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  details: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const User = model('User', userSchema);
export const Customer = model('Customer', customerSchema);
export const Material = model('Material', materialSchema);
export const Product = model('Product', productSchema);
export const StockLedger = model('StockLedger', ledgerSchema);
export const StockLock = model('StockLock', stockLockSchema);
export const Order = model('Order', orderSchema);
export const Invoice = model('Invoice', invoiceSchema);
export const CreditNote = model('CreditNote', creditNoteSchema);
export const Purchase = model('Purchase', purchaseSchema);
export const ProductionRun = model('ProductionRun', productionRunSchema);
export const Payment = model('Payment', paymentSchema);
export const Counter = model('Counter', counterSchema);
export const AuditLog = model('AuditLog', auditSchema);
