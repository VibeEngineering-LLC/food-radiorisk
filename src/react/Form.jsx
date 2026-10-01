import { useEffect, useRef, useState } from 'react';
import * as S from './formState.js';
import { COMMON_PRODUCTS, doseSourceOptions, agesFor } from '../ui/form.js';
import { productNames } from '../ui/product.js';
import { categoryOf } from '../calc/catalog.js';
import { attachSuggest, cleanProductNames } from '../ui/suggest.js';

// Компонент ввода продукта с подсказками
function ProductInput({ value, names, onChange }) {
  const ref = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    attachSuggest(ref.current, names, { onPick: (v) => cb.current(v) });
  }, []);

  return (
    <span className="suggest-host">
      <input id="product" ref={ref} value={value} placeholder="например, черника" autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

// D-019: строка таблицы нуклидов (DataGridView): нуклид, активность пробы по протоколу, ±% (P = 0,95), дата активности
function NuclideRow({ n, choices, sel, onSelect, onField }) {
  const cell = (name, cls, props) => <td><input className={cls} value={n[name]} onFocus={onSelect} onChange={e => onField(name, e.target.value)} {...props} /></td>;
  return (
    <tr className={sel ? 'sel' : undefined} onClick={onSelect}>
      <td><select className="n-nuclide" aria-label="Нуклид" value={n.nuclide} onFocus={onSelect} onChange={e => onField('nuclide', e.target.value)}>{choices.nuclides.map(x => <option key={x} value={x}>{x}</option>)}</select></td>
      {cell('measured', 'n-measured', { type: 'number', min: 0, step: 'any', 'aria-label': 'Активность пробы (протокол), Бк/кг' })}
      {cell('unc', 'n-unc', { type: 'number', min: 0, step: 'any', 'aria-label': '± неопределённость, % (P = 0,95)' })}
      {cell('sampleDate', 'n-sampleDate', { type: 'date', 'aria-label': 'Дата, на которую дана активность' })}
    </tr>
  );
}

// Оценка загрязнения места сбора (КП почва → продукт) — для выделенного нуклида
function TransferPick({ n, view, onField }) {
  return <div className="fields f-deposition nucpick">
    <label>Оценка загрязнения места сбора ({n.nuclide})
      <select className="n-transfer" value={view.value} onChange={e => onField('transfer', e.target.value)}>
        {view.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        {view.groups.map(g => <optgroup key={g.label} label={g.label}>{g.items.map(it => <option key={it.value} value={it.value}>{it.label}</option>)}</optgroup>)}
      </select></label>
    <p className="hint n-trHint">{view.hint}</p>
  </div>;
}

const TABS = ['1 · Продукт и проба', '2 · Обработка и рацион', '3 · Потребитель и нормы'];

// Основной компонент формы
export default function Form({ choices, raw, setRaw, onPreset, onExport }) {
  // Инициализация списка продуктов (ленивая)
  const namesRef = useRef(null);
  if (!namesRef.current) {
    namesRef.current = cleanProductNames(productNames(choices), (n) => !!categoryOf(n), COMMON_PRODUCTS);
  }
  const names = namesRef.current;

  // Хелперы для установки полей
  const set = (name) => (e) => setRaw(r => S.setField(r, choices, name, e.target.value));
  const setN = (i, name) => (e) => setRaw(r => S.setNuclideField(r, i, name, e.target.value));

  // Представления для передачи и обработки
  const tv = (i) => S.transferView(raw, choices, i);
  const pv = S.procView(raw, choices);
  const h = S.hints(raw, choices);
  // D-019: шаги — вкладки окна, переход в любом порядке (не мастер с «Далее/Назад»)
  const [tab, setTab] = useState(0);
  // выделенная строка таблицы нуклидов (её удаляет «удалить», для неё — оценка места сбора)
  const [sel, setSel] = useState(0);
  const cur = Math.min(sel, raw.nuclides.length - 1);
  const page = (i) => ({ className: 'tabbody', role: 'tabpanel', hidden: tab !== i });

  return (
    <form id="form" className="pane" autoComplete="off" onSubmit={e => e.preventDefault()}>
      <div className="tabs" role="tablist">
        {TABS.map((t, i) => <button type="button" role="tab" key={t} aria-selected={tab === i} className={tab === i ? 'on' : undefined} onClick={() => setTab(i)}>{t}</button>)}
      </div>
      <div {...page(0)}>
      <fieldset className="gbox"><legend>Продукт</legend>
        <div className="grid2">
          <label>Название <ProductInput value={raw.product} names={names} onChange={(v) => setRaw(r => S.setField(r, choices, 'product', v))} /></label>
          <div className="lrow" role="radiogroup" aria-label="Состояние">Состояние <span className="radios" id="productState">
            {[['fresh', 'свежий'], ['dried', 'сушёный']].map(([v, t]) => <label className="opt" key={v}><input type="radio" name="productState" value={v} checked={raw.productState === v} onChange={set('productState')} />{t}</label>)}
          </span></div>
          {/* D-019: зависимые поля не прячутся, а становятся недоступными */}
          <label className={raw.productState === 'dried' ? undefined : 'dis'} title="свежий → сушёный">Коэффициент усушки <input id="dryingFactor" type="number" min="1" step="any" value={raw.dryingFactor} disabled={raw.productState !== 'dried'} onChange={set('dryingFactor')} /></label>
        </div>
        <p className="hint" id="autoHint">{h.auto}</p>
      </fieldset>

      <fieldset className="gbox"><legend>Измерение</legend>
        <div className="nucgrid" id="nuclides">
          <table><thead><tr><th style={{ width: '30%' }}>Нуклид</th><th className="num">Бк/кг</th><th className="num" style={{ width: '16%' }}>± %</th><th className="num" style={{ width: '30%' }}>Дата</th></tr></thead>
            <tbody>{raw.nuclides.map((n, i) => <NuclideRow key={i} n={n} choices={choices} sel={i === cur} onSelect={() => setSel(i)} onField={(name, v) => setRaw(r => S.setNuclideField(r, i, name, v))} />)}</tbody></table>
        </div>
        <div className="btnrow">
          <button type="button" id="addNuclide" className="btn" onClick={() => { setRaw(r => S.addNuclide(r, choices)); setSel(raw.nuclides.length); }}>+ нуклид</button>
          <button type="button" id="delNuclide" className="btn" disabled={raw.nuclides.length < 2} onClick={() => { setRaw(r => S.removeNuclide(r, cur)); setSel(Math.max(0, cur - 1)); }}>удалить</button>
        </div>
        <TransferPick n={raw.nuclides[cur]} view={tv(cur)} onField={(name, v) => setRaw(r => S.setNuclideField(r, cur, name, v))} />
      </fieldset>
      <details className="prep" id="prepBox" open={!!(raw.rawMass || raw.probeMass) || undefined}>
        <summary>Подготовка пробы (если пробу сушили или озоляли)</summary>
        <div className="grid2">
          <label className="r3">Масса сырья <input id="rawMass" type="number" min="0" step="any" value={raw.rawMass} onChange={set('rawMass')} /> <span>г</span></label>
          <label className="r3">Масса пробы после сушки <input id="probeMass" type="number" min="0" step="any" value={raw.probeMass} onChange={set('probeMass')} /> <span>г</span></label>
          <label className="r3">Сухое вещество <input id="dryMatter" type="number" min="0" max="100" step="any" value={raw.dryMatter} onChange={set('dryMatter')} /> <span>%</span></label>
        </div>
        <p className="hint" id="prepHint">{h.prep}</p>
      </details>
      </div>

      <div {...page(1)}>
      <fieldset className="gbox"><legend>Кулинарная обработка</legend>
        <div className="procmodes" id="procMode" role="radiogroup" aria-label="Способ обработки">
          <label className="opt"><input type="radio" name="procMode" value="none" checked={raw.procMode === 'none'} onChange={set('procMode')} />без обработки (Fr = 1)</label>
          <div className="optrow"><label className="opt"><input type="radio" name="procMode" value="fr" checked={raw.procMode === 'fr'} onChange={set('procMode')} />свой Fr</label>
            <input id="procFr" type="number" min="0" max="1" step="any" aria-label="Fr — доля активности сырья, оставшаяся в блюде" value={raw.procFr} disabled={raw.procMode !== 'fr'} onChange={set('procFr')} /></div>
          <label className="opt"><input type="radio" name="procMode" value="record" checked={raw.procMode === 'record'} onChange={set('procMode')} />из справочника (можно отметить несколько)</label>
          <div className="indent" id="procRecWrap">
            <div id="procRec" className="checklist">
              {pv.options.length === 0 && <p className="hint">Введите продукт — здесь появятся способы обработки для него. Для продукта вне справочника задайте свой Fr.</p>}
              {pv.options.map(o => <label className={'check' + (raw.procMode !== 'record' ? ' dis' : '')} key={o.value}><input type="checkbox" value={o.value} disabled={raw.procMode !== 'record'} checked={pv.checked.includes(o.value)} onChange={e => setRaw(r => ({ ...r, procRecs: e.target.checked ? [...pv.checked, o.value] : pv.checked.filter(x => x !== o.value) }))} /> {o.label}</label>)}
            </div>
            <label className={'r132' + (raw.procMode !== 'record' ? ' dis' : '')}>Значение Fr <select id="procVar" value={raw.procVar} disabled={raw.procMode !== 'record'} onChange={set('procVar')}>
              <option value="best">рекомендованное</option>
              <option value="min">минимум диапазона</option>
              <option value="max">максимум диапазона</option>
            </select></label>
          </div>
        </div>
        <p className="hint">Fr относится к активности сырья: доза = A<sub>сырья</sub> · m<sub>сырья</sub> · Fr · e(g). Масса порции — продукта до кулинарной обработки, в выбранном состоянии (свежий или сушёный).</p>
      </fieldset>

      <fieldset className="gbox"><legend>Рацион</legend>
        <div className="grid3">
          <label className="r3">Порция <input id="portionG" type="number" min="0" step="any" value={raw.portionG} onChange={set('portionG')} /> <span>г</span></label>
          <label className="r3">Раз в день <input id="timesPerDay" type="number" min="0" step="any" value={raw.timesPerDay} onChange={set('timesPerDay')} /></label>
          <label className="r3">Дней в неделю <input id="daysPerWeek" type="number" min="0" max="7" step="any" value={raw.daysPerWeek} onChange={set('daysPerWeek')} /></label>
          <label className="r3">Недель в месяц <input id="weeksPerMonth" type="number" min="0" max="4.35" step="any" value={raw.weeksPerMonth} onChange={set('weeksPerMonth')} /></label>
          <label className="r3">Месяцев в году <input id="monthsPerYear" type="number" min="0" max="12" step="any" value={raw.monthsPerYear} onChange={set('monthsPerYear')} /></label>
          <label className="r3">Сколько лет <input id="years" type="number" min="1" step="1" value={raw.years} onChange={set('years')} /></label>
        </div>
        <p className="ration" id="dietHint">{h.diet}</p>
      </fieldset>
      </div>

      <div {...page(2)}>
      <fieldset className="gbox"><legend>Потребитель</legend>
        <div className="grid2">
          <label>Возраст <select id="age" value={raw.age} onChange={set('age')}>{agesFor(choices, raw.doseSource).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>Коэффициенты дозы e(g) <select id="doseSource" value={raw.doseSource} onChange={set('doseSource')}>{doseSourceOptions(choices).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>Коэффициент риска, Зв⁻¹ <select id="riskCoeff" value={raw.riskCoeff} onChange={set('riskCoeff')}>
            <option value="0.055">5,5·10⁻² рак, население (ICRP 103, НРБ-99/2009)</option>
            <option value="0.057">5,7·10⁻² рак и наследств., население</option>
            <option value="0.041">4,1·10⁻² рак, взрослые</option>
            <option value="0.042">4,2·10⁻² рак и наследств., взрослые</option>
          </select></label>
        </div>
      </fieldset>

      <fieldset className="gbox"><legend>Нормы для сравнения</legend>
        <label>Группа по ТР ТС 021/2011, прил. 4 <select id="foodGroup" value={raw.foodGroup} onChange={set('foodGroup')}>{S.foodGroupOptions(choices).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </fieldset>

      </div>
    </form>
  );
}
