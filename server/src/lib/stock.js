import mongoose from 'mongoose';
import { Material, Product, StockLedger, StockLock } from '../models/index.js';
import { fromBaseQuantity } from './units.js';
import { weightedAverageRate } from './money.js';

export async function appendMovement(session, { itemType, item, quantity, unit, unitCostPaise = 0, sourceType, source, sourceLabel, user }) {
  await StockLock.updateOne(
    { _id: `${itemType}:${item}` },
    { $inc: { version: 1 } },
    { upsert: true, session },
  );
  await StockLedger.create([{
    itemType,
    item,
    quantity,
    unit,
    unitCostPaise,
    sourceType,
    source,
    sourceLabel,
    createdBy: user,
  }], { session });
}

export async function ensureStockLock(itemType, item) {
  await StockLock.updateOne(
    { _id: `${itemType}:${item}` },
    { $setOnInsert: { version: 0 } },
    { upsert: true },
  );
}

export async function stockFor(itemType, item, session) {
  const query = StockLedger.aggregate([
    { $match: { itemType, item: new mongoose.Types.ObjectId(item) } },
    { $group: { _id: null, quantity: { $sum: '$quantity' } } },
  ]);
  if (session) query.session(session);
  return (await query)[0]?.quantity || 0;
}

export async function weightedAverageCost(itemType, item, session) {
  const query = StockLedger.aggregate([
    { $match: { itemType, item: new mongoose.Types.ObjectId(item) } },
    {
      $group: {
        _id: null,
        quantity: { $sum: '$quantity' },
        valuePaise: { $sum: { $multiply: ['$quantity', '$unitCostPaise'] } },
      },
    },
  ]);
  if (session) query.session(session);
  const balance = (await query)[0];
  if (!balance || balance.quantity <= 0) return 0;
  return weightedAverageRate(balance.valuePaise, balance.quantity);
}

export async function inventorySnapshot() {
  const [balances, materials, products] = await Promise.all([
    StockLedger.aggregate([
      { $group: { _id: { itemType: '$itemType', item: '$item' }, quantity: { $sum: '$quantity' } } },
    ]),
    Material.find().lean(),
    Product.find().lean(),
  ]);
  const itemMap = new Map([...materials, ...products].map((item) => [String(item._id), item]));
  const rows = balances.map((balance) => {
    const item = itemMap.get(String(balance._id.item));
    const displayQuantity = balance._id.itemType === 'finished'
      ? balance.quantity
      : fromBaseQuantity(balance.quantity, item?.displayUnit || balance._id.itemType);
    return {
      itemType: balance._id.itemType,
      itemId: String(balance._id.item),
      name: item ? `${item.name}${item.packSize ? ` ${item.packSize}` : ''}` : 'Unknown item',
      unit: item?.displayUnit || (balance._id.itemType === 'finished' ? 'packet' : ''),
      quantity: Math.round(displayQuantity * 1000) / 1000,
      reorderLevel: item && balance._id.itemType !== 'finished'
        ? Math.round(fromBaseQuantity(item.reorderLevel, item.displayUnit) * 1000) / 1000
        : 0,
      lowStock: Boolean(item && item.reorderLevel > 0 && balance.quantity <= item.reorderLevel),
    };
  });
  return rows.sort((a, b) => a.itemType.localeCompare(b.itemType) || a.name.localeCompare(b.name));
}
