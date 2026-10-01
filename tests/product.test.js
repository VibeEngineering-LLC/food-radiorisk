import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normRu, elementOf, productNames, matchesProduct, transferValueText,
  transferLabel, transferOptions, concentrationFor, TUM_HINT, depositionHtml
} from '../src/ui/product.js';

const REC = (o) => ({ quantity: 'KP', nuclide: 'Cs-137', source: 'PEREVOLOTSKY2006', level: '✅', mass_basis: 'fresh', unit_norm: 'm2/kg', unit_factor: 1e-3, am: null, gm: null, min: null, max: null, ...o });
const choices = { transfer: [
  REC({ id: 'b1', item_ru: 'черника, свежие ягоды, ТУМ А2', am: 3.11, min: 1.2, max: 6.4 }),
  REC({ id: 'b2', item_ru: 'Черника, свежие ягоды, ТУМ А5', am: 21.7 }),
  REC({ id: 'm1', item_ru: 'белый гриб, плодовые тела, ТУМ А2', am: 15.6 }),
  REC({ id: 'r1', item_ru: 'свинушка тонкая, разброс других авторов (свежая масса)', min: 5, max: 20 }),
  REC({ id: 'e1', item_ru: 'ёжевика, ягоды', min: 2 }),
  REC({ id: 's1', item_ru: 'черника, ягоды', nuclide: 'Sr-90', am: 1 }),
  REC({ id: 't1', item_ru: 'косуля', quantity: 'Tag', unit_factor: 1, source: 'TRS472', level: '⚠️', mass_basis: null })
] };

test("normRu: регистр, ё, пробелы", () => {
  assert.strictEqual(normRu("  Ёжевика   Лесная "), "ежевика лесная");
  assert.strictEqual(normRu(null), "");
});

test("elementOf", () => {
  assert.strictEqual(elementOf("Cs-137"), "Cs");
  assert.strictEqual(elementOf("Sr"), "Sr");
  assert.strictEqual(elementOf(undefined), "");
});

test("список продуктов без повторов", () => {
  assert.deepStrictEqual(productNames(choices), ["белый гриб", "ёжевика", "косуля", "свинушка тонкая", "черника"]);
});

test("поиск продукта без учёта регистра и ё", () => {
  assert.strictEqual(matchesProduct("Черника, свежие ягоды", "черника"), true);
  assert.strictEqual(matchesProduct("ёжевика, ягоды", "ежевика"), true);
  assert.strictEqual(matchesProduct("белый гриб", "черника"), false);
  assert.strictEqual(matchesProduct("белый гриб", "  "), true);
});

test("подпись: среднее и диапазон", () => {
  assert.strictEqual(transferValueText(choices.transfer[0]), "0,00311 м²/кг (0,0012–0,0064)");
});

test("подпись: только диапазон вместо «нет среднего»", () => {
  assert.strictEqual(transferValueText(choices.transfer[3]), "0,005–0,02 м²/кг");
});

test("подпись: одна граница", () => {
  assert.strictEqual(transferValueText(choices.transfer[4]), "≥ 0,002 м²/кг");
});

test("подпись целиком", () => {
  assert.strictEqual(transferLabel(choices.transfer[6]), "косуля — КП нет значения · основа не указана · ⚠️");
});

test("список КП фильтруется по продукту", () => {
  const o = transferOptions(choices, "Cs-137", "черника");
  assert.strictEqual(o.matched, 2);
  assert.strictEqual(o.fallback, false);
  const ids = o.groups.flatMap(g => g.items.map(i => i.id));
  assert.deepStrictEqual(ids, ["b1", "b2"]);
});

test("нет совпадений — показан весь список элемента", () => {
  const o = transferOptions(choices, "Cs-137", "морошка");
  assert.strictEqual(o.matched, 0);
  assert.strictEqual(o.fallback, true);
  const totalItems = o.groups.reduce((sum, g) => sum + g.items.length, 0);
  assert.strictEqual(totalItems, 6);
});

test("пустой запрос — все записи элемента, без пометки", () => {
  const o = transferOptions(choices, "Cs-137", "");
  assert.strictEqual(o.fallback, false);
  assert.strictEqual(o.matched, 6);
});

test("K: как есть", () => {
  assert.deepStrictEqual(concentrationFor("as_is", null, null), { k: 1, auto: true, note: "" });
});

test("K: высушена — из % сухого вещества", () => {
  const res = concentrationFor("dried", 15, null);
  assert.ok(Math.abs(res.k - 100 / 15) < 1e-12);
  const resNull = concentrationFor("dried", null, null);
  assert.strictEqual(resNull.k, null);
  assert.ok(typeof resNull.note === 'string' && resNull.note.length > 0);
});

test("K: озолена — вводит пользователь", () => {
  assert.strictEqual(concentrationFor("ashed", 15, 40).k, 40);
  assert.strictEqual(concentrationFor("concentrated", null, null).k, null);
  assert.strictEqual(concentrationFor("x", 15, 40).k, null);
});

test("подсказка ТУМ", () => {
  assert.ok(TUM_HINT.includes("бор"));
  assert.ok(TUM_HINT.includes("мокрый"));
});

test("таблица оценки загрязнения", () => {
  assert.strictEqual(depositionHtml([{ nuclide: "Cs-137", depositionEstimate: null }]), "");
  const rows = [{
    nuclide: "Cs-137",
    depositionEstimate: {
      transferId: "b1<script>",
      basis: "fresh",
      activityOnBasis: 1560,
      kBqPerM2: { central: 100, min: 50, max: null, unbounded: true },
      ciPerKm2: { central: 2.7, min: 1.35, max: null }
    }
  }];
  const html = depositionHtml(rows);
  assert.ok(html.includes("Оценка плотности загрязнения места сбора"));
  assert.ok(html.includes("∞"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("сырая"));
});

test("основа первого значимого слова (шифры проб ЛСРМ)", async () => {
  const { stemOf } = await import('../src/ui/product.js');
  assert.strictEqual(stemOf("Сухое молоко Рогачев"), "моло");
  assert.strictEqual(stemOf("Грузди"), "груз");
  assert.strictEqual(stemOf("ОГО"), "");
});

test("второй проход поиска: по основе слова, если точного совпадения нет", () => {
  const o = transferOptions(choices, "Cs-137", "Черникой");
  assert.strictEqual(o.fallback, false);
  assert.deepEqual(o.groups.flatMap(g => g.items).map(i => i.id), ["b1", "b2"]);
});
