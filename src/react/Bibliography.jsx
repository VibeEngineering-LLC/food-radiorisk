import { buildBibliography } from '../ui/bibliography.js';

// #FR-96: список литературы текущего расчёта — нумерованный, каждый документ один раз, по алфавиту (сначала кириллица, потом латиница)
export default function Bibliography({ result }) {
  const list = buildBibliography(result);
  return <ol className="biblio">{list.map(e => <li key={e.n} id={'ref' + e.n}>{e.text}
    {e.doi ? <> DOI: <a href={'https://doi.org/' + e.doi} target="_blank" rel="noopener noreferrer">{e.doi}</a>.</> : null}
    {!e.doi && e.url ? <> <a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a></> : null}</li>)}</ol>;
}
