/**
 * Нормализует строку: приводит к нижнему регистру, заменяет ё на е,
 * убирает пробелы по краям и сворачивает множественные пробелы.
 * @param {string} s - Входная строка.
 * @returns {string} Нормализованная строка.
 */
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Очищает список названий продуктов: удаляет скобки, фильтрует мусор,
 * капитализирует первую букву, добавляет дополнительные названия,
 * удаляет дубликаты и сортирует.
 * @param {string[]} rawNames - Исходный массив названий.
 * @param {(name: string) => boolean} isProduct - Функция проверки валидности продукта.
 * @param {string[]} [extra=[]] - Дополнительные названия для добавления.
 * @returns {string[]} Очищенный и отсортированный массив уникальных названий.
 */
export function cleanProductNames(rawNames, isProduct, extra = []) {
  const seen = new Set();
  const result = [];

  // Обработка основных названий
  for (const name of rawNames) {
    // Удаляем всё в скобках и сами скобки, включая незакрытые
    let cleaned = name.replace(/\s*\([^)]*\)?/g, '').trim();

    // Проверки на отбрасывание
    if (!cleaned) continue;
    if (cleaned.includes(':')) continue;
    if (/групп|накапливающ|аккумулятор|коэффициент|средневзвешенн|вид не назван|травостой|растительност|^сено(\s|$)/i.test(cleaned)) continue; // \b в JS не видит кириллицу
    if (!isProduct(cleaned)) continue;

    // Капитализация первой буквы
    const capitalized = cleaned[0].toUpperCase() + cleaned.slice(1);

    // Де-дупликация по нормализованному виду
    const normalized = norm(capitalized);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(capitalized);
    }
  }

  // Добавление дополнительных названий (они уже чистые, но тоже де-дуплицируем)
  for (const name of extra) {
    const normalized = norm(name);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(name);
    }
  }

  // Сортировка по русскому алфавиту
  return result.sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * Фильтрует список названий по запросу с ранжированием.
 * @param {string[]} names - Массив названий для фильтрации.
 * @param {string} query - Строка запроса.
 * @param {number} [limit=12] - Максимальное количество результатов.
 * @returns {string[]} Отфильтрованный и ранжированный массив названий.
 */
export function filterNames(names, query, limit = 12) {
  const q = norm(query);

  // Если запрос пуст, возвращаем первые N элементов
  if (!q) {
    return names.slice(0, limit);
  }

  // Ранжирование: 0 - начало слова, 1 - начало части слова, 2 - вхождение
  const ranked = [];
  for (const name of names) {
    const nName = norm(name);
    let rank = 3; // Исключено

    if (nName.startsWith(q)) {
      rank = 0;
    } else {
      // Проверяем, начинается ли какое-то слово в названии с запроса
      const words = nName.split(/[\s\-]+/);
      for (const word of words) {
        if (word.startsWith(q)) {
          rank = 1;
          break;
        }
      }
    }

    if (rank === 3 && nName.includes(q)) {
      rank = 2;
    }

    if (rank < 3) {
      ranked.push({ name, rank });
    }
  }

  // Стабильная сортировка по рангу
  ranked.sort((a, b) => a.rank - b.rank);

  // Возвращаем не более limit элементов
  return ranked.slice(0, limit).map(item => item.name);
}

/**
 * Подключает автозаполнение к полю ввода. Работает только в браузере.
 * @param {HTMLInputElement} input - Элемент ввода.
 * @param {string[]} names - Массив названий для подсказок.
 * @param {{ limit?: number, onPick?: (name: string) => void }} [options] - Опции.
 * @returns {{ update: (newNames: string[]) => void }} Объект с методом обновления списка.
 */
export function attachSuggest(input, names, { limit = 12, onPick } = {}) {
  // Убираем атрибут list и отключаем автозаполнение браузера
  input.removeAttribute('list');
  input.setAttribute('autocomplete', 'off');

  // Создаем список подсказок
  const ul = document.createElement('ul');
  ul.className = 'suggest';
  ul.setAttribute('role', 'listbox');
  ul.hidden = true;

  // Вставляем список после поля ввода
  const parent = input.parentElement;
  if (parent) {
    parent.appendChild(ul);
    // Делаем родителя относительным для позиционирования списка
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
  }

  let activeIndex = -1;

  /**
   * Рендерит элементы списка.
   * @param {string[]} items - Массив названий для отображения.
   */
  function render(items) {
    ul.innerHTML = '';
    activeIndex = -1;

    // Скрываем список, если нет элементов или единственный элемент совпадает с текущим значением
    if (items.length === 0 || (items.length === 1 && norm(items[0]) === norm(input.value))) {
      ul.hidden = true;
      return;
    }

    for (const name of items) {
      const li = document.createElement('li');
      li.textContent = name;
      li.setAttribute('role', 'option');
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Чтобы input не потерял фокус
        pick(name);
      });
      ul.appendChild(li);
    }

    ul.hidden = false;
  }

  /**
   * Выбирает элемент.
   * @param {string} name - Выбранное название.
   */
  function pick(name) {
    input.value = name;
    hide();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onPick?.(name);
  }

  /**
   * Скрывает список.
   */
  function hide() {
    ul.hidden = true;
    activeIndex = -1;
    // Убираем выделение с элементов
    const items = ul.querySelectorAll('li');
    items.forEach(item => {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
    });
  }

  /**
   * Обновляет список подсказок на основе текущего значения input.
   */
  function updateSuggestions() {
    const filtered = filterNames(names, input.value, limit);
    render(filtered);
  }

  // Обработчики событий
  input.addEventListener('input', updateSuggestions);
  input.addEventListener('focus', updateSuggestions);

  input.addEventListener('keydown', (e) => {
    const items = ul.querySelectorAll('li');
    if (ul.hidden || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pick(items[activeIndex].textContent);
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(hide, 150);
  });

  /**
   * Обновляет выделенный элемент.
   * @param {NodeListOf<HTMLLIElement>} items - Элементы списка.
   */
  function updateActiveItem(items) {
    items.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
      } else {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }

  // Возвращаем объект с методом обновления списка названий
  return {
    update(newNames) {
      names = newNames;
      updateSuggestions();
    }
  };
}
