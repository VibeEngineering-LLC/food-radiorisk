import type { Level, DoseClass, RiskTotals, Column } from './types';
export type { Level, DoseClass, RiskTotals, Column };

/**
 * Карточка одного показателя: крупное значение и подпись под ним. Цвет рамки задаёт `level`; без него карточка серая.
 * Несколько карточек кладут подряд внутрь контейнера с классом `kpis`.
 */
export function Kpi(props: {
  /** Крупное значение, уже отформатированное: «15,6 мкЗв», «0,858 случая на 1 млн». */
  value: string;
  /** Подпись, что это за величина. */
  label: string;
  /** Уровень относительно нормы; влияет на цвет. */
  level?: Level;
}): JSX.Element;

/** Главный экран результата (#FR-81 V04, D-022): блок A — число «k на 1 000 000», подписи, сравнение, словесная оценка; `result` и `input` — как возвращают computeScenario и форма. */
export function RiskSummary(props: { result: any; input: any }): JSX.Element;

/** Плашка «Соответствие продукта нормам» (блок B): рамка окрашена только по вердикту ТР ТС 021/2011. */
export function VerdictBox(props: { result: any; input: any }): JSX.Element;

/** Блок «Доза и нормы облучения» (блок C): доза самого нагруженного года и доли пределов. */
export function DoseBlock(props: { result: any; input: any }): JSX.Element;

/** Таблица расчёта: заголовки из `cols`, строки из `rows`; при пустом `rows` ничего не выводит. Прокручивается по горизонтали на узком экране. */
export function DataTable<R = any>(props: { rows: R[]; cols: Column<R>[] }): JSX.Element | null;
