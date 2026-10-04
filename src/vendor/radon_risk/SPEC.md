# SPEC radon_risk (черновик 2026-10-04, ред. 2 — по итогам независимой сверки D2–D8)

Назначение: чистая функция для калькулятора food-radiorisk (статичный React-сайт). ES-модуль без зависимостей, без DOM, без I/O.
Все коэффициенты — из `coefficients.json` (в модуль встроить копией константой ИЛИ принять объектом параметром; модуль не читает файлы). Синхронность встроенной копии с json проверяет отдельный тест S (`coefficients.sync.test.mjs`).
В коде НЕТ литералов-коэффициентов: референс-часы Дарби, горизонт 75 лет, умолчания `hoursPerYear` и `F` читаются из `coeffs` (D2). Допустимые литералы — только границы валидации входа (см. «Сигнатура») и порог предупреждения Дарби.

## Сигнатура

`radonRisk({ C, hoursPerYear, F, years, ageStart = 0, smoking = "never" }, coeffs = DEFAULT_COEFFS)`

- Умолчания (при `undefined`): `hoursPerYear = coeffs.exposure.default_hours_per_year_indoors.value` (7000), `F = coeffs.exposure.default_equilibrium_factor_F.value` (0.4).
- `C` Бк/м3 (объёмная активность радона в жилище): `0 <= C <= 10000` (C = 0 допустимо; C > 10000 — `RangeError`); `hoursPerYear` ч/год в помещении: `0..8766` (0 допустимо); `F` фактор равновесия: `0 < F <= 1`;
  `years` лет облучения: `0 < years <= 100` (years = 0 — ошибка, years > 100 — ошибка); `ageStart` возраст начала: `0..coeffs.assumptions.darby_horizon_years.value` (75); `smoking` ровно `"never"` или `"smoker"`.
- Невалидный вход (NaN, Infinity, не число, отрицательное, неверный smoking, years<=0, выход за диапазон) — бросать `RangeError` с понятным текстом, называющим поле. Тихой подстановки нет.
- (D8) `input` — только обычный объект (прототип `Object.prototype` или `null`): не массив, не `Date`, не `null`, не примитив, не экземпляр класса; иначе `RangeError` с текстом, начинающимся с `input:`. Пустой объект `{}` — `RangeError` про обязательное поле `C`.
- (D8) `coeffs` проверяется до входа: объект с обязательными ключами `exposure.wlm_bq_h_m3_eec.value`, `exposure.default_equilibrium_factor_F.value`, `exposure.default_hours_per_year_indoors.value`, `dose.mSv_per_WLM_dwelling.value`, `risk.icrp115_nominal_lung_per_WLM.value`, `risk.darby2005.err_per_100_Bq_m3`, `risk.darby2005.err_95ci_per_100` (массив из двух чисел), `risk.darby2005.baseline_cumulative_risk_by_age_75.never`, `...smoker`, `risk.uncertainty_factor.value`, `assumptions.darby_reference_hours_indoors.value`, `assumptions.darby_horizon_years.value`; числа — конечные, делители (`wlm`, референс-часы, горизонт, `u`) — строго > 0. Нарушение — `RangeError` с текстом `coeffs: ...` и путём ключа. `coeffs = null` / `{}` — `RangeError`.

## Формулы

Обозначения: `horizon = coeffs.assumptions.darby_horizon_years.value` (75), `refHours = coeffs.assumptions.darby_reference_hours_indoors.value` (7000).

1. `WLM_per_year = C * F * hoursPerYear / coeffs.exposure.wlm_bq_h_m3_eec.value`
2. `annualDose_mSv = WLM_per_year * coeffs.dose.mSv_per_WLM_dwelling.value`
3. `yearsEff = max(0, min(years, horizon - ageStart))` — ТОЛЬКО для канала Дарби (метрика «к 75 годам»; экспозиция после горизонта в ней не учитывается). Если yearsEff = 0 — `darby.excess` = 0. Флаг `truncated = years > yearsEff`.
4. ДОЗА И КАНАЛ МКРЗ НЕ ОБРЕЗАЮТСЯ по горизонту: `totalWLM = WLM_per_year * years`, `totalDose_mSv = annualDose_mSv * years` (горизонт задаёт вызывающий: взрослый — 50 лет, ребёнок — до 70 лет возраста; пример вызова: `years=50` или `years=70-ageStart`).
5. Канал МКРЗ 115/126: `icrp115.excess = totalWLM * coeffs.risk.icrp115_nominal_lung_per_WLM.value` (смешанное население, от курения не зависит, без обрезки). Множитель неопределённости `u = coeffs.risk.uncertainty_factor.value` (2) применяется ТОЛЬКО здесь: `icrp115.excessLow = excess / u`, `icrp115.excessHigh = excess * u` (D7).
6. Канал Дарби: `R0 = coeffs.risk.darby2005.baseline_cumulative_risk_by_age_75[smoking]`;
   `Ceff = C * hoursPerYear / refHours` (допущение, см. `assumptions` в json);
   `f = yearsEff / horizon`;
   `delta(err) = err * (Ceff / 100) * f`, `mult = 1 + delta`;
   `excess(err) = -(1 - R0) * expm1(delta(err) * log1p(-R0))` — эквивалент `(1 - R0)^0 - (1 - R0)^mult` без потери значимости при малых `delta` (D4; в формулу подставляется `delta`, а не `mult - 1`: разность `mult - 1` теряет разряды);
   `withRadonBy75 = R0 + excess`. При C = 0 (delta = 0): `withRadonBy75 === R0` точно, `excess === 0`.
   Основной расчёт — с `err = coeffs.risk.darby2005.err_per_100_Bq_m3`. Диапазон `excessCI = [excess(err_lo), excess(err_hi)]` по `err_95ci_per_100` из json (сейчас 0.05 и 0.31).
   Множитель `u` к каналу Дарби НЕ применяется: полей `darby.excessLow` / `darby.excessHigh` нет, неопределённость Дарби выражает только `excessCI` (D7).

## Предупреждения (`warnings`, массив строк; не ошибки)

- (D3) `C > 800` (верхняя точка таблицы Дарби): строка с текстом «вне диапазона данных Дарби, экстраполяция» (C > 10000 — ошибка, см. выше). При `C <= 800` этого предупреждения нет.
- (D6) любая обрезка, `yearsEff < years`: строка о том, что доза и канал МКРЗ считаются за все `years`, а канал Дарби — за `yearsEff` (в тексте названы оба числа).
- При `yearsEff = 0` дополнительно — строка, что экспозиция начинается в возрасте горизонта или позже и избыточный риск Дарби равен 0.
- Без обрезки и при `C <= 800` — `warnings = []`.

## Возврат (объект)

`{ input, annualDose_mSv, totalDose_mSv, WLM_per_year, totalWLM, yearsEff, truncated, warnings: [],
  darby: { smoking, baselineBy75, withRadonBy75, excess, excessCI: [lo, hi], metric: "риск (вероятность) рака лёгкого к 75 годам, добавленный облучением" },
  icrp115: { excess, excessLow, excessHigh, metric: "номинальный риск рака лёгкого, смешанное население, с поправкой на ущерб" },
  provenance: { ...копия source/level для использованных коэффициентов }, assumptions: [строки note из coeffs.assumptions] }`

(D5) Отрицательный нуль нормализуется в +0 во ВСЕХ числовых выходах (включая `input`, `excessCI`, вложенные объекты): `Object.is(x, -0)` нигде не встречается.

## Контрольные значения (приёмка; источники НЕЗАВИСИМЫ от формулы модуля)

A. Воспроизведение таблицы Дарби 2005 (BMJ 330:223) — `years=75, ageStart=0, hoursPerYear=7000`, `F=0.4`:
   - never: C=100 -> withRadonBy75 0.00475 (публ. 0.47 %), C=400 -> 0.00672 (0.67 %), C=800 -> 0.00932 (0.93 %); допуск ±0.00005.
   - smoker: C=100 -> 0.11619 (11.6 %), C=400 -> 0.16022 (16.0 %), C=800 -> 0.21554 (21.6 %); допуск ±0.0005.
   - C=0 -> withRadonBy75 равен R0 точно, excess = 0.
B. Доза: `C=300, hoursPerYear=7000, F=0.4` -> `annualDose_mSv` 13.3545 (допуск ±0.001); для справки: с 13 мЗв/WLM (МКРЗ 126 п.36) та же экспозиция даёт ~17.4 мЗв — «близко к верхней границе интервала 1–20 мЗв», как сказано в п.36.
C. Канал МКРЗ 115: `C=100, hoursPerYear=7000, F=0.4, years=10, ageStart=0` -> `totalWLM` 4.45151, `icrp115.excess` 2.22576e-3 (допуск относит. 1e-4).
D. Частичный период, Дарби: `smoking=never, C=100, years=10, hoursPerYear=7000` -> `darby.excess` 8.7283e-5 (относит. допуск 1e-3); `smoking=smoker, C=200, hoursPerYear=3500, years=20` -> `darby.excess` 4.0747e-3 (относит. 1e-3).
E. Обрезка (только Дарби): `ageStart=70, years=10, C=100, F=0.4, hoursPerYear=7000` -> `yearsEff=5, truncated=true`, `totalWLM` 4.45151 (за все 10 лет, без обрезки), `totalDose_mSv` 44.5151; `ageStart=75, years=10` -> `darby.excess` 0, непустой `warnings`, а `icrp115.excess` и `totalDose_mSv` НЕ нулевые (2.22576e-3 и 44.5151).
E2. Горизонты калькулятора: `ageStart=18, years=50, C=100` -> `totalDose_mSv` 222.576 (допуск 0.01), `yearsEff=50`, `truncated=false`; `ageStart=0, years=70, C=100` -> `totalDose_mSv` 311.606 (допуск 0.01), `yearsEff=70`.
F. Ошибки: `smoking="ex"`, `years=0`, `C=-1`, `F=1.5`, `C=NaN` -> `RangeError`.
G. Детерминизм: `JSON.stringify(radonRisk(x))` одинаков при повторе; вход не мутируется (`Object.freeze(x)` не ломает).
H. Структура возврата: поля по разделу «Возврат»; у `darby` НЕТ `excessLow`/`excessHigh`, у `icrp115` они есть.

Замечания независимой сверки:

D2. Параметризация: подмена `coeffs` меняет выход — умолчание `hoursPerYear` (`default_hours_per_year_indoors`), умолчание `F`, референс-часы Дарби (`darby_reference_hours_indoors`: при 3500 вместо 7000 вход `C=100, hoursPerYear=7000` даёт тот же `darby.excess`, что `C=200` при 7000), горизонт (`darby_horizon_years` = 50: `years=75` даёт `yearsEff=50`, `truncated=true`; `ageStart=60` — `RangeError`).
D3. Границы: `C=10000` и `years=100` допустимы, `C=10001` и `years=100.5` — `RangeError`; `C=800` — без предупреждения, `C=801` — предупреждение «вне диапазона данных Дарби, экстраполяция» (значения при этом считаются).
D4. Значимость: `C=1e-12, years=75, ageStart=0, hoursPerYear=7000` -> `darby.excess > 0` и равен `delta*(1-R0)*(-log1p(-R0))`, `delta = 0.16 * 1e-12 / 100`, с относит. допуском 1e-6 (never и smoker); `withRadonBy75 === baselineBy75 + excess`.
D5. Нет `-0`: ни в одном числовом поле результата при `C=0`, `C=-0`, `hoursPerYear=0`, `ageStart=75`.
D6. Обрезка: `ageStart=70, years=10` -> предупреждение с «МКРЗ», «Дарби» и числами 10 и 5; `ageStart=65, years=10` (без обрезки) и `years=75, ageStart=0` -> `warnings = []`; `years=11, ageStart=65` -> предупреждение.
D7. Множитель `u` — только у `icrp115` (подмена `u=3` в coeffs меняет `icrp115.excessLow/High` и не меняет `darby.excessCI`); у `darby` нет `excessLow`/`excessHigh`.
D8. Валидация: `[]`, `new Date()`, `null`, строка, число, `undefined`, экземпляр класса — `RangeError` с `input`; `{}` — `RangeError` про `C`; `coeffs = null` / `{}` / отсутствие любого обязательного ключа / нечисловое или нулевое значение делителя — `RangeError` с `coeffs` и путём ключа; `C=0` и `hoursPerYear=0` допустимы, `years=0` — ошибка.

## Приёмка кода (#SA-3)

- Тесты `node --test` (встроенный `node:test`, без зависимостей), файл `radonRisk.test.mjs` (A–H, E2, D2–D8) и `coefficients.sync.test.mjs` (S).
- Мутационная приёмка: для каждой мутации хотя бы один тест красный, на годном коде все зелёные. Цель «ровно один формульный тест» — если красных несколько, указать каких и почему.
  Базовые (из исходного SPEC; якоря обновлены под D2): 1. константа `629000` -> `630000`; 2. `mSv_per_WLM` 10 -> 13; 3. `f = yearsEff / horizon` -> `/ 70`; 4. формула избытка (`expm1`) -> `R0 * delta`; 5. убрать `min(years, horizon - ageStart)`; 6. референс-часы в `Ceff` -> `8760`; 7. `err_per_100` 0.16 -> 0.084.
  Дополнительные (на D2–D6): 8. `MAX_C` 10000 -> 100000; 9. `MAX_YEARS` 100 -> 1000; 10. порог предупреждения Дарби 800 -> 8000; 11. `expm1` -> наивная разность `1-(1-R0)^(1+delta)-R0`; 12. условие предупреждения об обрезке `yearsEff < years` -> `yearsEff < 0`; 13. убрать нормализацию `-0`; 14–17. чтение из `coeffs` -> литерал: умолчание часов (7000), умолчание F (0.4), референс-часы (7000), горизонт (75).
  Результат мутационного прогона записать в `mutation-report.md` (мутация -> какой тест покраснел).
- Файлы: `radonRisk.mjs`, `radonRisk.test.mjs`, `coefficients.sync.test.mjs`, `mutation_run.mjs`, `mutation-report.md`.
