import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRunCost, calculateTax, financialYearStart, toPaise, toRupees, weightedAverageRate } from '../src/lib/money.js';
import { baseUnitFor, fromBaseQuantity, toBaseQuantity, variancePercent } from '../src/lib/units.js';

test('unit conversion preserves benchmark quantities across base units', () => {
  assert.equal(toBaseQuantity(40, 'kg', 'g'), 40000);
  assert.equal(toBaseQuantity(10.5, 'litre', 'ml'), 10500);
  assert.equal(fromBaseQuantity(120000, 'kg'), 120);
  assert.equal(baseUnitFor('carton'), 'carton');
  assert.throws(() => toBaseQuantity(1, 'kg', 'ml'), /not compatible/);
});

test('money is stored in integer paise and tax splits match both supply types', () => {
  assert.equal(toPaise(7500), 750000);
  assert.equal(toRupees(18750), 187.5);
  assert.deepEqual(calculateTax(750000, 5, false), {
    cgstPaise: 18750, sgstPaise: 18750, igstPaise: 0, totalPaise: 37500,
  });
  assert.deepEqual(calculateTax(600000, 5, true), {
    cgstPaise: 0, sgstPaise: 0, igstPaise: 30000, totalPaise: 30000,
  });
});

test('financial-year sequence starts in April', () => {
  assert.equal(financialYearStart(new Date('2026-03-31T12:00:00Z')), 2025);
  assert.equal(financialYearStart(new Date('2026-04-01T00:00:00Z')), 2026);
  assert.equal(financialYearStart(new Date('2026-03-31T20:00:00Z')), 2026);
});

test('variance alert values expose six-percent yield loss and five-percent overuse', () => {
  assert.equal(variancePercent(188, 200), -6);
  assert.equal(variancePercent(10.5, 10), 5);
  assert.throws(() => variancePercent(1, 0), /must be positive/);
});

test('benchmark weighted-average material valuation produces the documented packet cost', () => {
  const flourRatePaisePerGram = weightedAverageRate(100000 * 4.2 + 60000 * 4.5, 160000);
  const materialCostPaise = Math.round(
    40000 * flourRatePaisePerGram + 10500 * 14 + 1200 * 20 + 194 * 250 + 9 * 1500,
  );
  assert.equal(materialCostPaise, 405500);
  assert.deepEqual(calculateRunCost(materialCostPaise, 120000, 60000, 188), {
    totalPaise: 585500,
    costPerPacketPaise: 3114,
  });
});
