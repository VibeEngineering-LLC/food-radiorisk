// #FR-89: результат разбит на вкладки, а прежние тесты читали «весь экран» разом; помощник рисует нужные вкладки по очереди и склеивает HTML
import { renderJsx } from './render_helper.js';

export const MAIN_TABS = ['sum', 'norms']; // прежние карточки главного экрана: риск — «Сводка», соответствие и дозовые нормы — «Соответствие нормам»

/** HTML вкладок `tabs` результата подряд (по умолчанию — «Сводка» и «Соответствие нормам») */
export async function renderTabs(props, tabs = MAIN_TABS) {
  const out = [];
  for (const t of tabs) out.push(await renderJsx('src/react/Result.jsx', 'default', { ...props, initialTab: t }));
  return out.join('\n');
}
