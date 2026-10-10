// #FR-95: подстрока «в т. ч. рак лёгкого от радона в жилище» к строке «Новообразования»: значения из модуля radonRisk (Darby 2005), вне суммы причин
import { radonRisk } from '../vendor/radon_risk/radonRisk.mjs';
import { startAge } from './compare.js';

export function radonLungSub(input, H, radonC) {
  if (!input || !Number.isFinite(H) || H <= 0 || typeof radonC !== 'number' || !Number.isFinite(radonC) || radonC < 1 || radonC > 10000) return null;
  const ra = (smoking) => radonRisk({ C: radonC, years: H, ageStart: startAge(input), smoking }).darby.excess;
  return { C: radonC, H, never: ra('never'), smoker: ra('smoker') };
}

// #FR-97: доли подсекторов от итога круга: сплошной = радон у некурящего, штрихованный = добавка у курящего (курящий − некурящий).
// Несогласованные величины (курящий < некурящего, курящий > новообразований) не обрезаются — флаг bad, который UI показывает громко, а тест красит.
export function radonSubShares(sub, cancerP, total) {
  if (!sub || !(total > 0) || !Number.isFinite(cancerP)) return null;
  const add = sub.smoker - sub.never;
  const bad = !(sub.never >= 0) || add < 0 || sub.smoker > cancerP;
  return { never: sub.never / total, add: add / total, addP: add, bad };
}
