import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Customer, Material, Product, StockLedger, User } from './models/index.js';
import { ensureStockLock } from './lib/stock.js';
import { connectDatabase } from './local-mongo.js';

await connectDatabase();
try {
  const passwords = await bcrypt.hash('demo1234', 10);
  const users = [
    ['Factory Admin', 'admin@udyamflow.demo', 'admin'],
    ['Salesman A', 'sales.a@udyamflow.demo', 'salesman'],
    ['Salesman B', 'sales.b@udyamflow.demo', 'salesman'],
    ['Production Supervisor', 'production@udyamflow.demo', 'production'],
    ['Accountant', 'accountant@udyamflow.demo', 'accountant'],
    ['Factory Owner', 'owner@udyamflow.demo', 'owner'],
  ];
  for (const [name, email, role] of users) {
    await User.findOneAndUpdate(
      { email },
      { $set: { name, email, role, active: true, passwordHash: passwords } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  const materialSpecs = [
    { name: 'Flour', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 20000, rate: 42, opening: 100000 },
    { name: 'Cooking oil', kind: 'raw', baseUnit: 'ml', displayUnit: 'litre', reorderLevel: 5000, rate: 140, opening: 30000 },
    { name: 'Salt and spice mix', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 2000, rate: 200, opening: 5000 },
    { name: 'Besan', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 10000, rate: 70, opening: 50000 },
    { name: 'Peanuts', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 5000, rate: 120, opening: 30000 },
    { name: 'Rice flakes', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 5000, rate: 70, opening: 25000 },
    { name: 'Raw banana', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 10000, rate: 30, opening: 60000 },
    { name: 'Coconut oil', kind: 'raw', baseUnit: 'ml', displayUnit: 'litre', reorderLevel: 5000, rate: 180, opening: 25000 },
    { name: 'Sugar', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 10000, rate: 48, opening: 50000 },
    { name: 'Ghee', kind: 'raw', baseUnit: 'g', displayUnit: 'kg', reorderLevel: 3000, rate: 600, opening: 15000 },
    { name: '200 g pouch', kind: 'packaging', baseUnit: 'piece', displayUnit: 'piece', reorderLevel: 100, rate: 2.5, opening: 500 },
    { name: '150 g pouch', kind: 'packaging', baseUnit: 'piece', displayUnit: 'piece', reorderLevel: 100, rate: 2.2, opening: 400 },
    { name: '250 g pouch', kind: 'packaging', baseUnit: 'piece', displayUnit: 'piece', reorderLevel: 100, rate: 3, opening: 300 },
    { name: 'Carton (20 packets)', kind: 'packaging', baseUnit: 'piece', displayUnit: 'piece', reorderLevel: 10, rate: 15, opening: 30 },
    { name: 'Carton (150 g, 20 packets)', kind: 'packaging', baseUnit: 'piece', displayUnit: 'piece', reorderLevel: 10, rate: 14, opening: 20 },
    { name: 'Carton (250 g, 20 packets)', kind: 'packaging', baseUnit: 'piece', displayUnit: 'piece', reorderLevel: 10, rate: 18, opening: 15 },
  ];
  const materials = {};
  for (const spec of materialSpecs) {
    const { opening, rate, ...materialFields } = spec;
    materials[spec.name] = await Material.findOneAndUpdate(
      { name: spec.name, kind: spec.kind },
      { $set: { ...materialFields, defaultRatePaise: Math.round(rate * 100) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  const productSpecs = [
    {
      name: 'Murukku', sku: 'MRK-200', packSize: '200 g', hsnCode: '19059030', gstRate: 5, sellingPricePaise: 5000, expectedPackets: 200,
      bom: [['Flour', 40, 'kg'], ['Cooking oil', 10, 'litre'], ['Salt and spice mix', 1.2, 'kg'], ['200 g pouch', 200, 'piece'], ['Carton (20 packets)', 10, 'piece']],
    },
    {
      name: 'South Indian Mixture', sku: 'MIX-200', packSize: '200 g', hsnCode: '19059030', gstRate: 5, sellingPricePaise: 5500, expectedPackets: 200,
      bom: [['Besan', 10, 'kg'], ['Peanuts', 5, 'kg'], ['Rice flakes', 10, 'kg'], ['Cooking oil', 5, 'litre'], ['Salt and spice mix', 0.8, 'kg'], ['200 g pouch', 200, 'piece'], ['Carton (20 packets)', 10, 'piece']],
    },
    {
      name: 'Banana Chips', sku: 'BNC-150', packSize: '150 g', hsnCode: '20089990', gstRate: 5, sellingPricePaise: 6000, expectedPackets: 200,
      bom: [['Raw banana', 45, 'kg'], ['Coconut oil', 8, 'litre'], ['Salt and spice mix', 0.5, 'kg'], ['150 g pouch', 200, 'piece'], ['Carton (150 g, 20 packets)', 10, 'piece']],
    },
    {
      name: 'Mysore Pak', sku: 'MSP-250', packSize: '250 g', hsnCode: '17049020', gstRate: 5, sellingPricePaise: 9000, expectedPackets: 160,
      bom: [['Besan', 8, 'kg'], ['Sugar', 22, 'kg'], ['Ghee', 10, 'kg'], ['250 g pouch', 160, 'piece'], ['Carton (250 g, 20 packets)', 8, 'piece']],
    },
  ];
  const products = {};
  for (const spec of productSpecs) {
    const { bom, ...productFields } = spec;
    products[spec.sku] = await Product.findOneAndUpdate(
      { sku: spec.sku },
      { $set: {
        ...productFields,
        bom: bom.map(([materialName, quantity, unit]) => ({ material: materials[materialName]._id, quantity, unit })),
        active: true,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  const customers = [
    { name: 'Retailer A', customerType: 'retailer', state: 'Tamil Nadu', stateCode: '33', gstin: '33ABCDE1234F1Z5', phone: '9000000001', address: 'Chennai, Tamil Nadu' },
    { name: 'Distributor B', customerType: 'distributor', state: 'Karnataka', stateCode: '29', gstin: '29ABCDE1234F1Z7', phone: '9000000002', address: 'Bengaluru, Karnataka' },
  ];
  for (const customer of customers) {
    await Customer.findOneAndUpdate({ name: customer.name }, { $set: customer }, { upsert: true, new: true });
  }

  const openingItems = [
    { itemType: 'raw', item: materials.Flour._id, quantity: 100000, unit: 'g', cost: 4200 / 1000 },
    { itemType: 'raw', item: materials['Cooking oil']._id, quantity: 30000, unit: 'ml', cost: 14000 / 1000 },
    { itemType: 'raw', item: materials['Salt and spice mix']._id, quantity: 5000, unit: 'g', cost: 20000 / 1000 },
    { itemType: 'raw', item: materials.Besan._id, quantity: 50000, unit: 'g', cost: 7000 / 1000 },
    { itemType: 'raw', item: materials.Peanuts._id, quantity: 30000, unit: 'g', cost: 12000 / 1000 },
    { itemType: 'raw', item: materials['Rice flakes']._id, quantity: 25000, unit: 'g', cost: 7000 / 1000 },
    { itemType: 'raw', item: materials['Raw banana']._id, quantity: 60000, unit: 'g', cost: 3000 / 1000 },
    { itemType: 'raw', item: materials['Coconut oil']._id, quantity: 25000, unit: 'ml', cost: 18000 / 1000 },
    { itemType: 'raw', item: materials.Sugar._id, quantity: 50000, unit: 'g', cost: 4800 / 1000 },
    { itemType: 'raw', item: materials.Ghee._id, quantity: 15000, unit: 'g', cost: 60000 / 1000 },
    { itemType: 'packaging', item: materials['200 g pouch']._id, quantity: 500, unit: 'piece', cost: 250 },
    { itemType: 'packaging', item: materials['150 g pouch']._id, quantity: 400, unit: 'piece', cost: 220 },
    { itemType: 'packaging', item: materials['250 g pouch']._id, quantity: 300, unit: 'piece', cost: 300 },
    { itemType: 'packaging', item: materials['Carton (20 packets)']._id, quantity: 30, unit: 'piece', cost: 1500 },
    { itemType: 'packaging', item: materials['Carton (150 g, 20 packets)']._id, quantity: 20, unit: 'piece', cost: 1400 },
    { itemType: 'packaging', item: materials['Carton (250 g, 20 packets)']._id, quantity: 15, unit: 'piece', cost: 1800 },
    { itemType: 'finished', item: products['MRK-200']._id, quantity: 50, unit: 'packet', cost: 0 },
    { itemType: 'finished', item: products['MIX-200']._id, quantity: 30, unit: 'packet', cost: 0 },
    { itemType: 'finished', item: products['BNC-150']._id, quantity: 40, unit: 'packet', cost: 0 },
    { itemType: 'finished', item: products['MSP-250']._id, quantity: 20, unit: 'packet', cost: 0 },
  ];
  const admin = await User.findOne({ email: 'admin@udyamflow.demo' });
  for (const material of Object.values(materials)) await ensureStockLock(material.kind, material._id);
  for (const product of Object.values(products)) await ensureStockLock('finished', product._id);
  for (const opening of openingItems) {
    await StockLedger.updateOne(
      { sourceType: 'opening', sourceLabel: 'OPENING-SEED-2026', item: opening.item },
      { $setOnInsert: {
        ...opening, unitCostPaise: opening.cost, sourceType: 'opening', source: admin._id,
        sourceLabel: 'OPENING-SEED-2026', createdBy: admin._id,
      } },
      { upsert: true },
    );
  }
  console.log('Seed complete. Demo users share the password: demo1234');
} finally {
  await mongoose.disconnect();
}
