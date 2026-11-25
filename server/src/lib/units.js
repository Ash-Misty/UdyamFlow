import { inputError } from './errors.js';

const UNIT_TO_BASE = {
  kg: { base: 'g', factor: 1000 },
  g: { base: 'g', factor: 1 },
  litre: { base: 'ml', factor: 1000 },
  l: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  piece: { base: 'piece', factor: 1 },
  pieces: { base: 'piece', factor: 1 },
  packet: { base: 'packet', factor: 1 },
  packets: { base: 'packet', factor: 1 },
  carton: { base: 'carton', factor: 1 },
  cartons: { base: 'carton', factor: 1 },
};

export function toBaseQuantity(quantity, unit, expectedBase) {
  const definition = UNIT_TO_BASE[String(unit).toLowerCase()];
  if (!definition || definition.base !== expectedBase) {
    throw inputError(`Unit "${unit}" is not compatible with base unit "${expectedBase}".`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw inputError('Quantity must be a positive number.');
  }
  const converted = Math.round(quantity * definition.factor * 1000) / 1000;
  if (!Number.isFinite(converted) || converted > Number.MAX_SAFE_INTEGER) {
    throw inputError('Quantity is outside the supported range.');
  }
  return converted;
}

export function fromBaseQuantity(quantity, unit) {
  const definition = UNIT_TO_BASE[String(unit).toLowerCase()];
  if (!definition) throw inputError(`Unsupported unit "${unit}".`);
  return quantity / definition.factor;
}

export function baseUnitFor(unit) {
  const definition = UNIT_TO_BASE[String(unit).toLowerCase()];
  if (!definition) throw inputError(`Unsupported unit "${unit}".`);
  return definition.base;
}

export function variancePercent(actual, planned) {
  if (!Number.isFinite(actual) || !Number.isFinite(planned) || planned <= 0) {
    throw inputError('Planned and actual quantities must be positive finite values.');
  }
  return ((actual - planned) / planned) * 100;
}
