import { inputError } from './errors.js';
import { indiaDateString } from './dates.js';

export function toPaise(rupees) {
  if (!Number.isFinite(rupees) || rupees < 0) throw inputError('Money must be a non-negative number.');
  const paise = Math.round(rupees * 100);
  if (!Number.isSafeInteger(paise)) throw inputError('Money is outside the supported range.');
  return paise;
}

export function toRupees(paise) {
  return Number((paise / 100).toFixed(2));
}

export function calculateTax(taxablePaise, ratePercent, interstate) {
  if (!Number.isSafeInteger(taxablePaise) || taxablePaise < 0 ||
      !Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw inputError('Taxable value or GST rate is outside the supported range.');
  }
  const totalTax = Math.round((taxablePaise * ratePercent) / 100);
  if (!Number.isSafeInteger(totalTax) || !Number.isSafeInteger(taxablePaise + totalTax)) {
    throw inputError('Calculated tax is outside the supported range.');
  }
  if (interstate) return { cgstPaise: 0, sgstPaise: 0, igstPaise: totalTax, totalPaise: totalTax };
  const cgstPaise = Math.floor(totalTax / 2);
  const sgstPaise = totalTax - cgstPaise;
  return { cgstPaise, sgstPaise, igstPaise: 0, totalPaise: totalTax };
}

export function weightedAverageRate(valuePaise, quantity) {
  if (!Number.isFinite(valuePaise) || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Weighted-average valuation requires positive stock and a finite value.');
  }
  return valuePaise / quantity;
}

export function calculateRunCost(materialCostPaise, labourPaise, utilitiesPaise, goodPackets) {
  if (![materialCostPaise, labourPaise, utilitiesPaise].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !Number.isInteger(goodPackets) || goodPackets <= 0) {
    throw inputError('Run costs must be integer paise and good output must be a positive whole number.');
  }
  const totalPaise = materialCostPaise + labourPaise + utilitiesPaise;
  if (!Number.isSafeInteger(totalPaise)) throw inputError('Run cost is outside the supported range.');
  return { totalPaise, costPerPacketPaise: Math.round(totalPaise / goodPackets) };
}

export function financialYearStart(date) {
  const [yearText, monthText] = indiaDateString(date).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (month >= 4) return year;
  return year - 1;
}
