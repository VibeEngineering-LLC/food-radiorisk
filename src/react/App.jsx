import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import { loadAll, browserFetch } from '../data/loader.js';
import { computeScenario, listChoices } from '../calc/model.js';
import { presetRadGear } from '../ui/form.js';
import * as S from './formState.js';
import Form from './Form.jsx';
import Result from './Result.jsx';
import { fmtDose, fmtCases, verdictText } from '../ui/fmt.js';

// Итог для строки состояния: нуклиды · доза за год · риск · вердикт по ТР ТС
function statusText(calc) {
  const r = calc?.result;
  if (!r) return 'Загрузка данных…';
  if (!r.ok) return 'Расчёт не выполнен — исправьте ввод';
  const t = r.totals, v = r.limits?.compliance?.verdict;
  return [r.rows.map(x => x.nuclide).join(', '), `${fmtDose(t.doseSvPerYear)}/год`, `${fmtCases(t.riskPerYear)} на 1 млн`, v ? `ТР ТС: ${verdictText(v)}` : ''].filter(Boolean).join(' · ');
}

// Цвет квадрата в строке состояния — худший из уровней: риск (НРБ-99/2009 п. 2.3) и вердикт ТР ТС
function statusLevel(calc) {
  const r = calc?.result;
  if (calc?.error || (r && !r.ok)) return 'bad';
  if (!r) return '';
  const lv = { negligible: 'ok', within: 'warn', exceeds: 'bad' }[r.totals.riskAssessment?.level] || '';
  const v = { conforms: 'ok', undetermined: 'warn', nonconforms: 'bad' }[r.limits?.compliance?.verdict] || '';
  const rank = { '': 0, ok: 1, warn: 2, bad: 3 };
  return rank[v] > rank[lv] ? v : lv;
}

export default function App() {
  // Состояние загрузки и данных
  const [boot, setBoot] = useState(null);
  // Сырые данные формы
  const [raw, setRaw] = useState(null);

  // Инициализация при монтировании
  useEffect(() => {
    loadAll(browserFetch)
      .then(({ data, meta }) => {
        const choices = listChoices(data);
        const firstSha = meta[Object.keys(meta)[0]]?.sha || '';
        const metaInfo = {
          datasets: Object.keys(data).length,
          records: Object.values(data).reduce((s, a) => s + a.length, 0),
          sha: firstSha
        };
        setBoot({ data, choices, metaInfo });
        setRaw(S.initialRaw(choices));
      })
      .catch(e => setBoot({ error: e.message }));
  }, []);

  // Отложенное значение для оптимизации рендера
  const deferred = useDeferredValue(raw);

  // Вычисление сценария
  const calc = useMemo(() => {
    if (!boot?.data || !deferred) return null;
    try {
      const input = S.toInput(deferred, boot.choices);
      const result = computeScenario(boot.data, input);
      return { input, result };
    } catch (e) {
      return { error: e.message };
    }
  }, [boot, deferred]);

  // Экспорт в глобальную переменную для отладки
  useEffect(() => {
    if (boot?.data) {
      window.__radiorisk = {
        data: boot.data,
        choices: boot.choices,
        getInput: () => calc?.input,
        last: () => calc && calc.input ? { input: calc.input, result: calc.result } : undefined
      };
    }
  }, [boot, calc]);

  // Функция экспорта результатов в JSON
  function onExport() {
    if (!calc?.input) return;
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), input: calc.input, result: calc.result, data: boot.metaInfo }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `radiorisk-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Функция применения пресета
  function onPreset() {
    setRaw(S.rawFromInput(presetRadGear(), boot.choices));
  }

  return (
    <div className="app">
      <header className="titlebar">
        <span className="appicon" aria-hidden="true"></span>
        <h1 title="Оценка ожидаемой эффективной дозы и радиационного риска при потреблении пищевых продуктов">Доза и риск от радионуклидов в пище</h1>
        {/* кнопки заголовка окна — часть вида из макета, не управляют ничем */}
        <span className="caption" aria-hidden="true"><span>–</span><span>☐</span><span>✕</span></span>
      </header>
      <main className="split">
        {boot?.choices && raw && <Form choices={boot.choices} raw={raw} setRaw={setRaw} onPreset={onPreset} onExport={onExport} />}
        {boot?.error
          ? <section id="result" className="result"><div className="msg err">Не удалось загрузить данные: {boot.error}</div></section>
          : calc
            ? <section id="result" className="result" aria-live="polite">{calc.error ? <div className="msg err">Внутренняя ошибка: {calc.error}</div> : <Result result={calc.result} input={calc.input} meta={boot.metaInfo} />}</section>
            : <section id="result" className="result" aria-live="polite"><p className="empty">Загрузка данных…</p></section>}
      </main>
      {/* D-019: строка состояния окна — итог расчёта и команды всегда на виду */}
      <footer className="statusbar">
        <span className="stat"><i className={'lvl ' + statusLevel(calc)} aria-hidden="true"></i><span className="txt" id="statusText">{statusText(calc)}</span></span>
        <span className="cmds">
          <button type="button" id="preset" onClick={onPreset} disabled={!boot?.choices}>Пример</button>
          <button type="button" id="exportJson" onClick={onExport} disabled={!calc?.input}>Сохранить расчёт…</button>
          <a className="btn" href="sources.html" title="Источники чисел и методика расчёта">Справка</a>
        </span>
      </footer>
    </div>
  );
}
