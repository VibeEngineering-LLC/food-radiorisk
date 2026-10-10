import { useEffect, useRef, useState } from 'react';
import * as S from './formState.js';
import { doseSourceOptions, agesFor, lifetimeOf, yearsShown } from '../ui/form.js';
import { productSuggestions } from '../calc/products.js';
import { attachSuggest } from '../ui/suggest.js';
import { T } from '../ui/texts_v.js';

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
      <input id="product" ref={ref} value={value} placeholder="например, черника лесная" autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

// #FR-85 (спека §3): нераспознанный продукт — группа рациона вручную; неоднозначный — выбор записи словаря
function ProductMatch({ view, onGroup, onPick, onConfirm }) {
  if (!['unknown', 'ambiguous', 'partial', 'confirmed'].includes(view.status)) return null;
  return <div className="msg warn" id="productMatch">
    <p>{view.text}</p>
    {view.status === 'partial' && <p className="btnrow"><button type="button" className="btn" id="productConfirm" onClick={() => onConfirm(view.confirm.id)}>{view.confirm.label}</button></p>}
    {view.status === 'confirmed' && <p className="btnrow"><button type="button" className="btn" id="productUnconfirm" onClick={() => onConfirm('')}>{T.PRODUCT_CONFIRM_UNDO}</button></p>}
    {view.status === 'ambiguous' && <p className="btnrow">{view.candidates.map(c => <button type="button" className="btn" key={c} onClick={() => onPick(c)}>{c}</button>)}</p>}
    {(view.status === 'unknown' || view.status === 'partial') && <label>{T.PRODUCT_GROUP_PICK} <select id="dietGroupPick" value={view.value} onChange={e => onGroup(e.target.value)}>
      <option value="">— не выбрана —</option>
      {view.groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
    </select></label>}
  </div>;
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
export default function Form({ choices, raw, setRaw, tab, setTab, onPreset, onExport }) {
  // Инициализация списка продуктов (ленивая)
  const namesRef = useRef(null);
  if (!namesRef.current) {
    namesRef.current = productSuggestions(choices.products); // #FR-85: все названия и синонимы словаря, с нормативом и без
  }
  const names = namesRef.current;

  // Хелперы для установки полей
  // режим «до 70 лет» возможен, если у источника e(g) есть все возрастные группы
  const lifeOk = raw.doseSource === 'ICRP119_F1';
  const set = (name) => (e) => setRaw(r => S.setField(r, choices, name, e.target.value));
  const setN = (i, name) => (e) => setRaw(r => S.setNuclideField(r, i, name, e.target.value));

  // Представления для передачи и обработки
  const tv = (i) => S.transferView(raw, choices, i);
  const pv = S.procView(raw, choices);
  const h = S.hints(raw, choices);
  const dv = S.dietView(raw, choices);
  const dietAuto = raw.dietMode !== 'own'; // поля «знаю» недоступны при умолчании
  const dis = dietAuto ? ' dis' : '';
  // D-019: шаги — вкладки окна, переход в любом порядке (не мастер с «Далее/Назад»)
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
          <div className="lrow" role="radiogroup" aria-label={T.FORM_STATE_LABEL}>{T.FORM_STATE_LABEL} <span className="radios" id="measuredForm">
            {T.FORM_STATE_OPTS.map(([v, t]) => <label className="opt" key={v}><input type="radio" name="measuredForm" value={v} checked={raw.measuredForm === v} onChange={set('measuredForm')} />{t}</label>)}
          </span></div>
          <p className="hint">{T.FORM_STATE_HINT}</p>
          {/* D-019: зависимые поля не прячутся, а становятся недоступными */}
          <label className={raw.measuredForm === 'dried' ? undefined : 'dis'} title="при сушке продукта: свежий → сушёный">Коэффициент концентрирования при сушке <input id="dryingFactor" type="number" min="1" step="any" value={raw.dryingFactor} disabled={raw.measuredForm !== 'dried'} onChange={set('dryingFactor')} /></label>
        </div>
        <p className="hint" id="autoHint">{h.auto}</p>
        <ProductMatch view={S.productView(raw, choices)} onGroup={(v) => setRaw(r => S.setField(r, choices, 'dietGroup', v))} onPick={(v) => setRaw(r => S.setField(r, choices, 'product', v))} onConfirm={(v) => setRaw(r => S.setField(r, choices, 'productConfirm', v))} />
      </fieldset>

      <fieldset className="gbox"><legend>Измерение</legend>
        <div className="nucgrid" id="nuclides">
          <table><thead><tr><th style={{ width: '30%' }}>Нуклид</th><th className="num">Бк/кг</th><th className="num" style={{ width: '16%' }}>± %</th><th className="num" style={{ width: '30%' }}>Дата пробы</th></tr></thead>
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
        {raw.measuredForm === 'cooked' ? <p className="hint">{T.FORM_COOKED_FR}</p> : <>
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
              <option value="best">рекомендованное (где его нет — середина диапазона)</option>
              {pv.variants.min && <option value="min">минимум диапазона</option>}
              {pv.variants.max && <option value="max">максимум диапазона — скрининг</option>}
            </select></label>
          </div>
        </div>
        <p className="hint">Fr относится к активности сырья: доза = A<sub>сырья</sub> · m<sub>сырья</sub> · Fr · e(g). Масса порции — продукта до кулинарной обработки, в выбранном состоянии (свежий или сушёный).</p></>}
      </fieldset>

      <fieldset className="gbox"><legend>Рацион</legend>
        {/* #FR-83 W07: если потребление неизвестно — умолчание из данных; поля «знаю» становятся недоступными, значения не стираются */}
        <div className="lrow" role="radiogroup" aria-label={T.DIET_MODE_LABEL}>{T.DIET_MODE_LABEL} <span className="radios" id="dietMode">
          {T.DIET_MODE_OPTS.map(([v, t]) => <label className="opt" key={v}><input type="radio" name="dietMode" value={v} checked={raw.dietMode === v} onChange={set('dietMode')} />{t}</label>)}
        </span></div>
        {dv.mode !== 'own' && <div className="dietbox">
          {dv.line && <p className="ration" id="dietLine">{dv.line}</p>}
          {dv.basis && <p className="hint" id="dietBasis">{dv.basis}</p>}
          {dv.scope && <p className="hint" id="dietScope">{dv.scope}</p>}
          {dv.ref614 && <p className="hint" id="dietRef614">{dv.ref614}</p>}
          {dv.diff && <p className="hint" id="dietDiff">{dv.diff}</p>}
          {dv.info && <p className="hint" id="dietInfo">{dv.info}</p>}
          {dv.notSet && <p className="msg warn" id="dietNotSet">{dv.notSet} <button type="button" id="dietOwn" className="btn" onClick={() => setRaw(r => S.setField(r, choices, 'dietMode', 'own'))}>{T.DIET_OWN_BUTTON}</button></p>}
          {dv.child && <details className="dietchild" id="dietChild"><summary>{dv.child.head}</summary>
            <p className="hint">{dv.child.note}</p>
            <table><thead><tr>{dv.child.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{dv.child.rows.map(r => <tr key={r.label}><td>{r.label}</td><td className="num">{r.v1}</td><td className="num">{r.v10}</td></tr>)}</tbody></table>
          </details>}
        </div>}
        <div className="grid3">
          <label className={'r3' + dis}>Порция <input id="portionG" type="number" min="0" step="any" disabled={dietAuto} value={raw.portionG} onChange={set('portionG')} /> <span>г</span></label>
          <label className={'r3' + dis}>Раз в день <input id="timesPerDay" type="number" min="0" step="any" disabled={dietAuto} value={raw.timesPerDay} onChange={set('timesPerDay')} /></label>
          <label className={'r3' + dis}>Дней в неделю <input id="daysPerWeek" type="number" min="0" max="7" step="any" disabled={dietAuto} value={raw.daysPerWeek} onChange={set('daysPerWeek')} /></label>
          <label className={'r3' + dis}>Недель в месяц <input id="weeksPerMonth" type="number" min="0" max="4.35" step="any" disabled={dietAuto} value={raw.weeksPerMonth} onChange={set('weeksPerMonth')} /></label>
          <label className={'r3' + dis}>Месяцев в году <input id="monthsPerYear" type="number" min="0" max="12" step="any" disabled={dietAuto} value={raw.monthsPerYear} onChange={set('monthsPerYear')} /></label>
          <label className={'r3' + (raw.lifeMode ? ' dis' : '')}>Сколько лет <input id="years" type="number" min="1" step="1" disabled={!!lifetimeOf(raw)} value={yearsShown(raw)} onChange={set('years')} /></label>
        </div>
        {/* #FR-81 шаг 4а: Y-90 при Sr-90 — отдельная добавка, по умолчанию не включена */}
        <label className="check"><input type="checkbox" id="includeY90" checked={!!raw.includeY90} onChange={(e) => setRaw(r => S.setField(r, choices, 'includeY90', e.target.checked))} /> Добавить Y-90 в равновесии с Sr-90 (верхняя оценка для хранившегося продукта)</label>
        {/* #FR-81 D18: распад от даты пробы до даты начала питания, затем по годам питания (D08) */}
        <label className="r3">Дата начала питания <input id="eatDate" type="date" value={raw.eatDate} onChange={set('eatDate')} /></label>
        {/* #FR-81 D08: физический распад продукта по годам учитывается всегда, кроме явной отметки */}
        <label className="check"><input type="checkbox" id="constAct" checked={!!raw.constAct} onChange={(e) => setRaw(r => S.setField(r, choices, 'constAct', e.target.checked))} /> Активность продукта постоянна во все годы (распад не учитывать) — для лесных грибов и ягод</label>
        {/* #FR-65: питание с начального возраста до 70 лет, коэффициент e(g) меняется с возрастом (нужны все шесть групп ICRP 119) */}
        <label className="check">
          <input type="checkbox" id="lifeMode" checked={!!raw.lifeMode} onChange={(e) => setRaw(r => S.setField(r, choices, 'lifeMode', e.target.checked))} /> Питание с возраста a до возраста b (по возрастным группам)
        </label>
        <label className={'r3' + (raw.lifeMode ? '' : ' dis')}>С возраста <input id="startAge" type="number" min="0" max="119" step="any" disabled={!raw.lifeMode} value={raw.startAge} onChange={set('startAge')} /> <span>лет</span></label>
        <label className={'r3' + (raw.lifeMode ? '' : ' dis')}>До возраста <input id="endAge" type="number" min="1" max="120" step="any" disabled={!raw.lifeMode} value={raw.endAge} onChange={set('endAge')} /> <span>лет</span></label>
        {raw.lifeMode && !lifeOk && <p className="msg warn">Режим «с возраста a до возраста b» требует коэффициентов по возрастным группам: в НРБ-99/2009 они даны только для критической группы. Выберите источник «МКРЗ (ICRP 119)» — с НРБ расчёт не выполняется.</p>}
        <p className="ration" id="dietHint">{h.diet}</p>
      </fieldset>
      </div>

      <div {...page(2)}>
      <fieldset className="gbox"><legend>Потребитель</legend>
        <div className="grid2">
          <label>Возраст <select id="age" value={raw.age} onChange={set('age')}>{agesFor(choices, raw.doseSource).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>Коэффициенты дозы e(g) <select id="doseSource" value={raw.doseSource} onChange={set('doseSource')}>{doseSourceOptions(choices).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        </div>
      </fieldset>

      <fieldset className="gbox"><legend>Нормы для сравнения</legend>
        <label>Группа по ТР ТС 021/2011, прил. 4 <select id="foodGroup" value={raw.foodGroup} onChange={set('foodGroup')}>{S.foodGroupOptions(choices).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </fieldset>

      </div>
    </form>
  );
}
