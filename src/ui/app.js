import { loadAll, browserFetch } from '../data/loader.js';
import { computeScenario, listChoices } from '../calc/model.js';
import { renderResult } from './render.js';
import { initForm, getInput, setInput, onFormChange, presetRadGear } from './form.js';
import { esc } from './fmt.js';

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export async function start() {
  try {
    const { data, meta } = await loadAll(browserFetch);
    const choices = listChoices(data);
    const firstSha = meta[Object.keys(meta)[0]]?.sha || '';
    const metaInfo = { datasets: Object.keys(data).length, records: Object.values(data).reduce((s, a) => s + a.length, 0), sha: firstSha };

    document.getElementById('dataInfo').textContent = `Данные: ${metaInfo.datasets} наборов, ${metaInfo.records} записей.`;
    initForm(document, choices);

    let last;
    const compute = () => {
      try {
        const input = getInput(document);
        const result = computeScenario(data, input);
        document.getElementById('result').innerHTML = renderResult(result, input, metaInfo);
        last = { input, result };
      } catch (e) {
        document.getElementById('result').innerHTML = `<div class="msg err">Внутренняя ошибка: ${esc(e.message)}</div>`;
      }
    };

    onFormChange(document, debounce(compute, 120));
    compute();

    const btns = document.querySelectorAll('[data-view-btn]');
    const setView = (v) => {
      document.body.dataset.view = v;
      btns.forEach(b => b.setAttribute('aria-pressed', b.dataset.viewBtn === v ? 'true' : 'false'));
      try { localStorage.setItem('radiorisk.view', v); } catch {}
    };

    // #FR-53: плакатный вид отключён — всегда научный (сохранённый «poster» из прошлых сессий не восстанавливается)
    setView('science');
    btns.forEach(b => b.addEventListener('click', () => setView(b.dataset.viewBtn)));

    document.getElementById('preset')?.addEventListener('click', () => { setInput(document, choices, presetRadGear()); compute(); });
    
    document.getElementById('exportJson')?.addEventListener('click', () => {
      if (!last) return;
      const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), input: last.input, result: last.result, data: metaInfo }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      a.href = url; a.download = `radiorisk-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    window.__radiorisk = { data, choices, getInput: () => getInput(document), compute, last: () => last };
  } catch (e) {
    const r = document.getElementById('result');
    if (r) r.innerHTML = `<div class="msg err">Не удалось загрузить данные: ${esc(e.message)}</div><p class="hint">Страница должна открываться по http, не из файла: <code>python -m http.server 8000</code> в папке проекта, затем http://localhost:8000/</p>`;
  }
}

start();
