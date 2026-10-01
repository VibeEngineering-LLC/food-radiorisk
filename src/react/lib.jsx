// Библиотечный вход для Claude Design (/design-sync): только самостоятельные компоненты результата, со стилями калькулятора
import '../ui/styles.css';
import '../ui/window.css'; // D-019: вид окна настольной программы — тот же, что в калькуляторе
import { Kpi, RiskBlock, DataTable } from './Result.jsx';

// Блок риска вместе с цветной рамкой по уровню НРБ-99/2009 п. 2.3 (в калькуляторе рамка собирается в Result)
export function RiskBox({ totals, years }) {
  return <div className={'riskbox risk risk-' + (totals.riskAssessment?.level || 'none')}><RiskBlock totals={totals} years={years} /></div>;
}

export { Kpi, RiskBlock, DataTable };
