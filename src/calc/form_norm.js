// #FR-81 V10 (D-022): вердикт B по форме продукта, к которой относится норматив ТР ТС 021/2011 прил. 4: у сухого продукта со своим нормативом (строки 4, 7, 12, 13 и 16 в скобках, 18) — активность как есть; у сушёного без своего норматива — пересчёт на исходное сырьё A/K (ст. 7 п. 4: показатели обезвоженной продукции рассчитываются в пересчёте на исходное сырьё); нет K — вердикт не выдаётся; готовое блюдо — норматива в регламенте нет, вердикт не выдаётся

// сухой — "сух", "сушеные", "вяленая", "сублимированные" в названии группы ДО скобки (в скобках п. 5 перечислены исключения: «кроме … сухих»);
// значения в скобках прил. 4 (овощи, ягоды) — записи с id «…_dry_…» («значение в скобках (сухой продукт)»)
export const isDryNorm = (rec) =>
  /_dry_(cs137|sr90)$/.test(String(rec?.id ?? '')) ||
  /сух|суш|вялен|сублим/i.test(String(rec?.food_group_ru ?? '').split(' (')[0]);

export function adjustForForm(ru, input) {
  const state = input.product?.state;

  // Готовое блюдо: норматива в регламенте нет, строки помечаем, но в расчёт не включаем
  if (state === 'cooked') {
    const rows = ru.map((row) => ({
      ...row,
      limitId: null,
      cooked: true,
      H: undefined,
      ratio: undefined,
    }));
    return { ru: rows, note: { kind: 'cooked' } };
  }

  // Сушёный продукт: проверяем, есть ли строки без собственного норматива для сухого
  if (state === 'dried') {
    const withLimit = ru.filter((row) => row.limitId !== null);
    // #FR-88 v20 (D-029, V-2): needsK — строка выбрана по B после пересчёта на K (ручная группа), без K выбор и вердикт невозможны
    const needsConversion = withLimit.some((row) => !row.dryNorm || row.needsK);

    // Все строки с нормативом имеют свой норматив для сухого (или строк с нормативом нет)
    if (!needsConversion) {
      return { ru: ru.map((row) => ({ ...row })), note: null };
    }

    const K = input.dryingFactor;
    const kDefined = Number.isFinite(K) && K >= 1;

    // K не задан — пересчёт невозможен, вердикт не выдаётся
    if (!kDefined) {
      return { ru: ru.map((row) => ({ ...row })), note: { kind: 'no_k' } };
    }

    // Пересчёт на исходное сырьё: A_raw = A_dry / K
    const items = [];
    const rows = ru.map((row) => {
      if (row.limitId === null || row.dryNorm) {
        return { ...row };
      }
      const aDry = row.activity;
      const aRaw = aDry / K;
      items.push({ nuclide: row.nuclide, aDry, aRaw });
      return {
        ...row,
        activity: aRaw,
        ratio: aRaw / row.H,
        converted: { aDry, K },
      };
    });

    return { ru: rows, note: { kind: 'converted', K, items } };
  }

  // Свежий продукт или любое другое состояние — строки без изменений
  return { ru: ru.map((row) => ({ ...row })), note: null };
}
