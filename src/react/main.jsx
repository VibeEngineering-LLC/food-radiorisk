import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import '../ui/window.css'; // D-019: вид окна настольной программы поверх базовых стилей
import App from './App.jsx';

// Шаги 1–2 переноса на React (D-018): форма — компоненты, результат пока HTML-строкой от renderResult
document.body.dataset.view = 'science';
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
