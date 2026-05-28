let floatContainer = null;
let isPinned = false;

// ================== НОРМАЛИЗАЦИЯ КЛЮЧЕЙ ==================
function normalizeKeyForStorage(key) {
    if (!key) return '';
    let normalized = key.trim();
    normalized = normalized.replace(/\*/g, '');
    normalized = normalized.replace(/\s*:\s*$/, '');
    normalized = normalized.replace(/\s*\([^)]*(обязательно|required|необязательно|optional)[^)]*\)\s*/gi, '');
    normalized = normalized.replace(/\s+(обязательно|required|необязательно|optional)\s*$/gi, '');
    return normalized.trim();
}

function normalizeForCompare(str) {
    if (!str) return '';
    return normalizeKeyForStorage(str).toLowerCase();
}

function isValidValue(value) {
    if (!value || value.length === 0) return false;
    const trimmed = value.trim();
    if (trimmed.length < 2) return false;
    if (/^[✖✔❌✅🔒★☆]+$/.test(trimmed)) return false;
    const trashWords = ['закрыть', 'удалить', 'редактировать', 'изменить', 'сохранить',
                        'выбрать файл', 'перетащите файлы', 'отмена', 'копировать',
                        'close', 'delete', 'edit', 'save', 'cancel'];
    if (trashWords.includes(trimmed.toLowerCase())) return false;
    return true;
}

// ================== СТИЛИ И ОКНО (без изменений) ==================
function injectFloatStyles() {
    if (document.getElementById('my-ext-float-styles')) return;
    const style = document.createElement('style');
    style.id = 'my-ext-float-styles';
    style.textContent = `
        #my-ext-float-container {
            position: fixed;
            z-index: 999999;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            overflow: hidden;
            min-width: 340px;
            min-height: 400px;
            width: 360px;
            height: 480px;
            resize: both;
            display: none;
            top: 100px;
            left: 100px;
        }
        #my-ext-float-container iframe {
            width: 100%;
            height: calc(100% - 36px);
            border: none;
            background: white;
        }
        .my-ext-header {
            background: #f0f0f0;
            padding: 6px 10px;
            cursor: move;
            user-select: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #ccc;
            font-family: sans-serif;
            font-size: 14px;
        }
        .my-ext-header button {
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 16px;
            margin-left: 8px;
            width: 28px;
            height: 28px;
            border-radius: 6px;
        }
        .my-ext-header button:hover {
            background: #ddd;
        }
        .my-ext-pin {
            font-weight: bold;
        }
        .my-ext-reset {
            font-size: 16px;
        }
    `;
    document.head.appendChild(style);
}

function constrainWindowPosition() {
    if (!floatContainer) return;
    const rect = floatContainer.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    let newLeft = rect.left;
    let newTop = rect.top;
    let changed = false;
    if (newLeft < 0) { newLeft = 0; changed = true; }
    if (newLeft > maxX) { newLeft = maxX; changed = true; }
    if (newTop < 0) { newTop = 0; changed = true; }
    if (newTop > maxY) { newTop = maxY; changed = true; }
    if (changed) {
        floatContainer.style.left = newLeft + 'px';
        floatContainer.style.top = newTop + 'px';
        chrome.storage.local.set({
            floatWindowLeft: newLeft,
            floatWindowTop: newTop
        });
    }
}

function resetWindowPosition() {
    if (!floatContainer) return;
    const width = floatContainer.offsetWidth;
    const height = floatContainer.offsetHeight;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    floatContainer.style.left = Math.max(0, left) + 'px';
    floatContainer.style.top = Math.max(0, top) + 'px';
    chrome.storage.local.set({
        floatWindowLeft: Math.max(0, left),
        floatWindowTop: Math.max(0, top)
    });
}

async function createFloatingUI() {
    if (floatContainer) return;
    injectFloatStyles();

    floatContainer = document.createElement('div');
    floatContainer.id = 'my-ext-float-container';

    const header = document.createElement('div');
    header.className = 'my-ext-header';
    header.innerHTML = `
        <span>Копирка</span>
        <div>
            <button class="my-ext-reset" title="Сбросить позицию">⟳</button>
            <button class="my-ext-pin" title="Закрепить/открепить">📌</button>
            <button class="my-ext-close" title="Закрыть">✖</button>
        </div>
    `;

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup.html');

    floatContainer.appendChild(header);
    floatContainer.appendChild(iframe);
    document.body.appendChild(floatContainer);

    makeDraggable(floatContainer, header);
    header.addEventListener('dblclick', resetWindowPosition);
    header.querySelector('.my-ext-reset').addEventListener('click', resetWindowPosition);
    header.querySelector('.my-ext-close').addEventListener('click', () => {
        hideFloatWindow();
    });

    const pinBtn = header.querySelector('.my-ext-pin');
    pinBtn.addEventListener('click', async () => {
        isPinned = !isPinned;
        pinBtn.style.opacity = isPinned ? '1' : '0.5';
        await chrome.storage.local.set({ floatWindowPinned: isPinned });
    });

    const storage = await chrome.storage.local.get('floatWindowPinned');
    isPinned = storage.floatWindowPinned || false;
    pinBtn.style.opacity = isPinned ? '1' : '0.5';

    const pos = await chrome.storage.local.get(['floatWindowLeft', 'floatWindowTop']);
    if (pos.floatWindowLeft !== undefined && pos.floatWindowTop !== undefined) {
        floatContainer.style.left = pos.floatWindowLeft + 'px';
        floatContainer.style.top = pos.floatWindowTop + 'px';
        setTimeout(constrainWindowPosition, 0);
    } else {
        resetWindowPosition();
    }
    
    const resizeObserver = new ResizeObserver(() => constrainWindowPosition());
    resizeObserver.observe(floatContainer);
    window.addEventListener('resize', () => constrainWindowPosition());
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;
        newLeft = Math.min(Math.max(0, newLeft), maxX);
        newTop = Math.min(Math.max(0, newTop), maxY);
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        if (floatContainer) {
            constrainWindowPosition();
            const left = parseFloat(floatContainer.style.left);
            const top = parseFloat(floatContainer.style.top);
            if (!isNaN(left) && !isNaN(top)) {
                chrome.storage.local.set({
                    floatWindowLeft: left,
                    floatWindowTop: top
                });
            }
        }
    }
}

function showFloatWindow() {
    if (!floatContainer) createFloatingUI();
    floatContainer.style.display = 'block';
    constrainWindowPosition();
    if (!isPinned) {
        document.addEventListener('click', outsideClickListener);
    }
}

function hideFloatWindow() {
    if (floatContainer) floatContainer.style.display = 'none';
    document.removeEventListener('click', outsideClickListener);
}

function outsideClickListener(e) {
    if (!floatContainer) return;
    if (!floatContainer.contains(e.target)) {
        hideFloatWindow();
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'toggleFloatWindow') {
        if (floatContainer && floatContainer.style.display === 'block') {
            hideFloatWindow();
        } else {
            showFloatWindow();
        }
        sendResponse({ success: true });
    } else if (request.command === 'startSelectionCopy') {
        startSelection('copy');
        sendResponse({ success: true });
    } else if (request.command === 'startSelectionRemember') {
        startSelection('remember');
        sendResponse({ success: true });
    } else if (request.command === 'autoFill') {
        autoFillFromStorage();
        sendResponse({ success: true });
    }
    return true;
});

let selectionMode = null;
let lastHighlighted = null;

function startSelection(mode) {
    if (selectionMode) return;
    selectionMode = mode;

    if (!document.getElementById('my-ext-highlight-style')) {
        const style = document.createElement('style');
        style.id = 'my-ext-highlight-style';
        style.textContent = `
            .my-ext-highlight {
                outline: 3px solid #00ff00 !important;
                cursor: pointer !important;
                background-color: rgba(0,255,0,0.1) !important;
            }
        `;
        document.head.appendChild(style);
    }

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('click', onElementClick);
}

function onMouseOver(e) {
    if (lastHighlighted) lastHighlighted.classList.remove('my-ext-highlight');
    lastHighlighted = e.target;
    lastHighlighted.classList.add('my-ext-highlight');
    e.stopPropagation();
}

async function onElementClick(e) {
    const element = e.target;
    element.classList.remove('my-ext-highlight');
    e.stopPropagation();

    if (selectionMode === 'copy') {
        const text = element.innerText.trim();
        if (text) {
            await copyToClipboard(text);
            showToast('Скопировано: ' + text.slice(0, 50));
        } else {
            showToast('Нет текста в элементе');
        }
    } else if (selectionMode === 'remember') {
        const pairs = extractKeyValuePairs(element);
        if (pairs.length === 0) {
            showToast('Не удалось распознать пары ключ-значение');
        } else {
            await savePairs(pairs);
            showToast(`Сохранено ${pairs.length} пар(ы)`);
        }
    }
    cleanup();
}

function cleanup() {
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('click', onElementClick);
    if (lastHighlighted) lastHighlighted.classList.remove('my-ext-highlight');
    selectionMode = null;
}

function extractKeyValuePairs(element) {
    const text = element.innerText;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const pairs = [];

    const skipValues = new Set([
        'редактировать', 'удалить', 'изменить', 'сохранить', 'выбрать файл',
        'перетащите файлы', 'перетащите файлы или выберите на компьютере',
        'выбрать', 'отмена', 'закрыть'
    ]);

    function looksLikeKey(str) {
        if (str.length > 50 || str.length < 2) return false;
        if (skipValues.has(str.toLowerCase())) return false;
        const wordCount = str.split(/\s+/).length;
        if (wordCount > 4) return false;
        if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(str)) return false;
        if (/^\d+(?:[.,]\d+)?$/.test(str)) return false;
        return /[a-zA-Zа-яА-Я]/.test(str);
    }

    function looksLikeValue(str) {
        if (str.length < 2) return false;
        if (skipValues.has(str.toLowerCase())) return false;
        if (/^[✖✔❌✅🔒★☆]+$/.test(str)) return false;
        return true;
    }

    for (let i = 0; i < lines.length - 1; i++) {
        const keyLine = lines[i];
        const valueLine = lines[i+1];
        if (looksLikeKey(keyLine) && looksLikeValue(valueLine)) {
            const normalizedKey = normalizeKeyForStorage(keyLine);
            if (normalizedKey && isValidValue(valueLine)) {
                pairs.push({ key: normalizedKey, value: valueLine });
            }
            i++;
        }
    }

    const unique = new Map();
    for (const p of pairs) unique.set(p.key, p.value);
    return Array.from(unique, ([key, value]) => ({ key, value }));
}

async function savePairs(pairs) {
    const result = await chrome.storage.local.get('keyValuePairs');
    let existing = result.keyValuePairs || {};
    for (const p of pairs) {
        if (p.key && isValidValue(p.value)) {
            existing[p.key] = p.value;
        }
    }
    await chrome.storage.local.set({ keyValuePairs: existing });
}

async function loadPairs() {
    const result = await chrome.storage.local.get('keyValuePairs');
    return result.keyValuePairs || {};
}

// ================== УЛУЧШЕННЫЙ ПОИСК ПОЛЯ ДЛЯ КЛЮЧА ==================
function findInputByLabel(labelText) {
    const normalizedTarget = normalizeForCompare(labelText);
    if (!normalizedTarget) return null;
    
    console.log(`[Копирка] Ищем поле для ключа: "${labelText}" (норм: "${normalizedTarget}")`);
    
    // 1. Ищем все потенциальные элементы-лейблы, содержащие текст
    const possibleLabels = document.querySelectorAll('label, span, div, th, b, strong, .field-label, .form-label, .label, .field-name, .caption, .form-question');
    let bestMatch = null;
    
    for (let label of possibleLabels) {
        const rawText = label.innerText?.trim();
        if (!rawText) continue;
        const normalizedLabel = normalizeForCompare(rawText);
        if (normalizedLabel === normalizedTarget) {
            console.log(`[Копирка] Найден лейбл: "${rawText}" (норм: "${normalizedLabel}")`, label);
            
            // Пытаемся найти поле, связанное с этим лейблом
            let field = null;
            
            // А) Если есть атрибут for
            if (label.htmlFor) {
                field = document.getElementById(label.htmlFor);
                if (field && isFillableElement(field)) {
                    console.log(`[Копирка] Найдено поле по for="${label.htmlFor}"`);
                    bestMatch = field;
                    break;
                }
            }
            
            // Б) Если внутри label уже есть поле
            const innerField = label.querySelector('input, textarea, select, [contenteditable="true"]');
            if (innerField && isFillableElement(innerField)) {
                console.log(`[Копирка] Найдено поле внутри лейбла`);
                bestMatch = innerField;
                break;
            }
            
            // В) Ищем следующий элемент (sibling) в пределах одного контейнера
            // Ограничиваем поиск 3 уровнями вверх и вниз, не пересекая другие лейблы
            let container = label.parentElement;
            for (let depth = 0; depth < 3 && container; depth++) {
                let next = label.nextElementSibling;
                // Ищем следующий fillable элемент, но не дальше, чем встретится другой элемент с текстом (возможный лейбл)
                while (next && !isFillableElement(next)) {
                    // Если встретили элемент, который похож на лейбл (имеет текст и не является пустым), останавливаемся
                    const nextText = next.innerText?.trim();
                    if (nextText && nextText.length > 0 && next !== label) {
                        // Это может быть другой лейбл, не идём дальше
                        break;
                    }
                    if (isFillableElement(next)) {
                        field = next;
                        break;
                    }
                    next = next.nextElementSibling;
                }
                if (field && isFillableElement(field)) {
                    console.log(`[Копирка] Найдено поле как следующий sibling`);
                    bestMatch = field;
                    break;
                }
                // Если не нашли, поднимаемся к родителю и ищем среди его детей после текущего лейбла
                if (container && container.children) {
                    const children = Array.from(container.children);
                    const idx = children.indexOf(label);
                    if (idx !== -1) {
                        for (let i = idx + 1; i < children.length; i++) {
                            const child = children[i];
                            if (isFillableElement(child)) {
                                field = child;
                                break;
                            }
                            // Поиск внутри дочерних элементов (на случай, если поле обёрнуто в div)
                            const innerField2 = child.querySelector('input, textarea, select, [contenteditable="true"]');
                            if (innerField2 && isFillableElement(innerField2)) {
                                field = innerField2;
                                break;
                            }
                            // Если встретили другой элемент с текстом (потенциальный лейбл), прекращаем поиск в этой группе
                            const childText = child.innerText?.trim();
                            if (childText && childText.length > 0 && child !== label) {
                                break;
                            }
                        }
                        if (field && isFillableElement(field)) {
                            console.log(`[Копирка] Найдено поле среди следующих детей родителя`);
                            bestMatch = field;
                            break;
                        }
                    }
                }
                // Переходим к родителю
                label = container;
                container = container.parentElement;
            }
            if (bestMatch) break;
        }
    }
    
    if (bestMatch) {
        console.log(`[Копирка] Для ключа "${labelText}" выбрано поле:`, bestMatch);
        return bestMatch;
    }
    
    // 2. Поиск по th (таблицы)
    const ths = document.querySelectorAll('th');
    for (let th of ths) {
        const normalizedTh = normalizeForCompare(th.innerText.trim());
        if (normalizedTh === normalizedTarget) {
            const td = th.nextElementSibling;
            if (td && td.tagName === 'TD') {
                const field = td.querySelector('input, textarea, select');
                if (field && isFillableElement(field)) return field;
                if (isFillableElement(td)) return td;
            }
        }
    }
    
    // 3. Поиск по placeholder / aria-label
    const inputs = document.querySelectorAll('input, textarea, select');
    for (let inp of inputs) {
        const placeholder = inp.placeholder?.trim();
        if (placeholder && normalizeForCompare(placeholder) === normalizedTarget) {
            console.log(`[Копирка] Найдено поле по placeholder: "${placeholder}"`);
            return inp;
        }
        const ariaLabel = inp.getAttribute('aria-label')?.trim();
        if (ariaLabel && normalizeForCompare(ariaLabel) === normalizedTarget) {
            console.log(`[Копирка] Найдено поле по aria-label: "${ariaLabel}"`);
            return inp;
        }
    }
    
    console.log(`[Копирка] Не удалось найти поле для ключа "${labelText}"`);
    return null;
}

function isFillableElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (tag === 'DIV' && el.getAttribute('contenteditable') === 'true') return true;
    return false;
}

function fillField(field, value) {
    if (field.tagName === 'SELECT') {
        let option = Array.from(field.options).find(opt => opt.text === value || opt.value === value);
        if (!option && field.options.length > 0) {
            option = document.createElement('option');
            option.text = value;
            option.value = value;
            field.add(option);
        }
        if (option) {
            field.value = option.value;
            field.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } 
    else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    else if (field.isContentEditable) {
        field.innerText = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    else if (field.tagName === 'DIV') {
        field.innerText = value;
    }
}

async function autoFillFromStorage() {
    const pairs = await loadPairs();
    const cleanPairs = Object.fromEntries(
        Object.entries(pairs).filter(([key, val]) => isValidValue(val))
    );
    if (Object.keys(cleanPairs).length === 0) {
        showToast('Нет сохранённых элементов');
        return;
    }

    let filledCount = 0;
    for (const [key, value] of Object.entries(cleanPairs)) {
        const inputField = findInputByLabel(key);
        if (inputField) {
            // Дополнительная проверка: если поле уже содержит какое-то значение, не перезаписываем? По желанию
            // Но для теста оставим перезапись.
            fillField(inputField, value);
            filledCount++;
            console.log(`[Копирка] Заполнено поле "${key}" значением "${value}"`);
        } else {
            console.log(`[Копирка] Поле для ключа "${key}" не найдено`);
        }
    }
    showToast(`Заполнено полей: ${filledCount}`);
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.warn('Clipboard fallback', err);
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        z-index: 1000000;
        font-size: 14px;
        font-family: sans-serif;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

createFloatingUI().then(() => hideFloatWindow());