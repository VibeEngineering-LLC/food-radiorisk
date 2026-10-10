import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import { loadAll, browserFetch } from '../data/loader.js';
import { computeScenario, listChoices } from '../calc/model.js';
import { presetRadGear } from '../ui/form.js';
import * as S from './formState.js';
import { loadSaved, save } from './persist.js';
import { FORMATS, buildReport } from '../ui/report.js';
import Form from './Form.jsx';
import Result from './Result.jsx';
import { statusText, statusLevel } from '../ui/status.js'; // #FR-81 V14: строка состояния — в status.js
import { userMessage } from '../calc/input_check.js';

export default function App() {
  // Состояние загрузки и данных
  const [boot, setBoot] = useState(null);
  // Сырые данные формы
  const [raw, setRaw] = useState(null);
  // Открытая вкладка формы (хранится вместе с вводом)
  const [tab, setTab] = useState(0);
  // Формат файла отчёта
  const [format, setFormat] = useState('md');

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
        // #FR-58: после обновления страницы возвращаем сохранённый ввод
        const base = S.initialRaw(choices);
        const saved = loadSaved(window.localStorage, base, choices.nuclides);
        setRaw(saved ? S.fixAge(saved.raw, choices) : base);
        if (saved) setTab(saved.tab);
      })
      .catch(e => setBoot({ error: e.message }));
  }, []);

  // Сохраняем ввод при каждом изменении (до загрузки данных raw пуст — не затираем сохранённое)
  useEffect(() => {
    if (raw) save(window.localStorage, raw, tab);
  }, [raw, tab]);

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
      return { error: userMessage(e) }; // #FR-88 v18: английский текст исключения пользователю не показываем
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

  // #FR-62: отчёт в выбранном формате (по умолчанию Markdown)
  function onExport() {
    if (!calc?.input) return;
    const rep = buildReport(format, calc, boot.metaInfo, new Date().toISOString());
    const url = URL.createObjectURL(new Blob([rep.text], { type: rep.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = rep.fileName;
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
        {boot?.choices && raw && <Form choices={boot.choices} raw={raw} setRaw={setRaw} tab={tab} setTab={setTab} onPreset={onPreset} onExport={onExport} />}
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
          <select id="reportFormat" aria-label="Формат отчёта" value={format} onChange={e => setFormat(e.target.value)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
          <button type="button" id="exportJson" onClick={onExport} disabled={!calc?.input}>Сохранить отчёт…</button>
          <a className="btn" href="sources.html" title="Источники чисел и методика расчёта">Справка</a>
        </span>
      </footer>
    </div>
  );
}
