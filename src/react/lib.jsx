// Библиотечный вход для Claude Design (/design-sync): только самостоятельные компоненты результата, со стилями калькулятора
import '../ui/styles.css';
import '../ui/window.css'; // D-019: вид окна настольной программы — тот же, что в калькуляторе
import { Kpi, DataTable } from './Result.jsx';
import { RiskSummary, VerdictBox, DoseBlock } from './Summary.jsx';

// #FR-81 V04: блоки главного экрана (прежний блок риска с уровнями НРБ по Ē₅ удалён)
export { Kpi, DataTable, RiskSummary, VerdictBox, DoseBlock };
