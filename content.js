let floatContainer = null;
let isPinned = false;

// Стили для плавающего окна
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
    `;
    document.head.appendChild(style);
}

// Создаём плавающее окно
async function createFloatingUI() {
    if (floatContainer) return;
    injectFloatStyles();

    floatContainer = document.createElement('div');
    floatContainer.id = 'my-ext-float-container';

    // Заголовок для перетаскивания
    const header = document.createElement('div');
    header.className = 'my-ext-header';
    header.innerHTML = `
        <span>Копирка</span>
        <div>
            <button class="my-ext-pin" title="Закрепить/открепить">📌</button>
            <button class="my-ext-close" title="Закрыть">✖</button>
        </div>
    `;

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup.html');

    floatContainer.appendChild(header);
    floatContainer.appendChild(iframe);
    document.body.appendChild(floatContainer);

    // Перетаскивание
    makeDraggable(floatContainer, header);

    // Кнопка закрытия
    header.querySelector('.my-ext-close').addEventListener('click', () => {
        hideFloatWindow();
    });

    // Кнопка закрепления
    const pinBtn = header.querySelector('.my-ext-pin');
    pinBtn.addEventListener('click', async () => {
        isPinned = !isPinned;
        pinBtn.style.opacity = isPinned ? '1' : '0.5';
        await chrome.storage.local.set({ floatWindowPinned: isPinned });
    });

    // Восстанавливаем состояние закрепления
    const storage = await chrome.storage.local.get('floatWindowPinned');
    isPinned = storage.floatWindowPinned || false;
    pinBtn.style.opacity = isPinned ? '1' : '0.5';

    // Загружаем сохранённую позицию окна
    const pos = await chrome.storage.local.get(['floatWindowLeft', 'floatWindowTop']);
    if (pos.floatWindowLeft && pos.floatWindowTop) {
        floatContainer.style.left = pos.floatWindowLeft + 'px';
        floatContainer.style.top = pos.floatWindowTop + 'px';
    }
}

// Перетаскивание
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
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        // сохраняем позицию
        chrome.storage.local.set({
            floatWindowLeft: newLeft,
            floatWindowTop: newTop
        });
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function showFloatWindow() {
    if (!floatContainer) createFloatingUI();
    floatContainer.style.display = 'block';
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
    }

    else if (request.command === 'startSelectionCopy') {
        startSelection('copy');
        sendResponse({ success: true });
    } else if (request.command === 'startSelectionRemember') {
        startSelection('remember');
        sendResponse({ success: true });
    } else if (request.command === 'autoFill') {
        autoFillFromStorage();
        sendResponse({ success: true });
    }
    return true; // асинхронный ответ
});


let selectionMode = null;
let lastHighlighted = null;

function startSelection(mode) {
    if (selectionMode) return;
    selectionMode = mode;

    // Стиль для подсветки
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

    // Слова, которые не могут быть значением
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
        return str.length > 0 && !skipValues.has(str.toLowerCase());
    }

    for (let i = 0; i < lines.length - 1; i++) {
        const keyLine = lines[i];
        const valueLine = lines[i+1];
        if (looksLikeKey(keyLine) && looksLikeValue(valueLine)) {
            pairs.push({ key: keyLine, value: valueLine });
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
        existing[p.key] = p.value;
    }
    await chrome.storage.local.set({ keyValuePairs: existing });
}

async function loadPairs() {
    const result = await chrome.storage.local.get('keyValuePairs');
    return result.keyValuePairs || {};
}

async function autoFillFromStorage() {
    const pairs = await loadPairs();
    if (Object.keys(pairs).length === 0) {
        showToast('Нет сохранённых элементов');
        return;
    }

    let filledCount = 0;
    for (const [key, value] of Object.entries(pairs)) {
        const inputField = findInputByLabel(key);
        if (inputField) {
            fillField(inputField, value);
            filledCount++;
        } else {
            console.log(`Не найдено поле для ключа: "${key}"`);
        }
    }
    showToast(`Заполнено полей: ${filledCount}`);
}

function findInputByLabel(labelText) {
    // 1. Ищем элементы-подписи
    const possibleLabels = document.querySelectorAll('label, span, div, th, b, strong, .field-label, .form-label, .label');
    for (let label of possibleLabels) {
        const labelContent = label.innerText.trim();
        if (labelContent === labelText || labelContent.startsWith(labelText + ':') || labelContent.endsWith(':' + labelText)) {
            if (label.htmlFor) {
                const field = document.getElementById(label.htmlFor);
                if (field && isFillableElement(field)) return field;
            }
            let next = label.nextElementSibling;
            while (next && !isFillableElement(next) && next.tagName !== 'BR') {
                next = next.nextElementSibling;
            }
            if (next && isFillableElement(next)) return next;
            const parent = label.parentElement;
            if (parent) {
                const candidates = Array.from(parent.querySelectorAll('input, textarea, select, [contenteditable="true"]'));
                for (let cand of candidates) {
                    if (isFillableElement(cand) && (cand.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                        return cand;
                    }
                }
            }
        }
    }
    // 2. Таблицы
    const ths = document.querySelectorAll('th');
    for (let th of ths) {
        if (th.innerText.trim() === labelText) {
            const td = th.nextElementSibling;
            if (td && td.tagName === 'TD') {
                const field = td.querySelector('input, textarea, select');
                if (field && isFillableElement(field)) return field;
                if (isFillableElement(td)) return td;
            }
        }
    }
    // 3. Placeholder / aria-label
    const inputs = document.querySelectorAll('input, textarea, select');
    for (let inp of inputs) {
        const placeholder = inp.placeholder?.trim();
        const ariaLabel = inp.getAttribute('aria-label')?.trim();
        if (placeholder === labelText || ariaLabel === labelText) {
            return inp;
        }
    }
    // 4. Поиск по ближайшему родителю
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
        if (el.innerText && el.innerText.trim() === labelText && el.offsetHeight > 0) {
            let parent = el.parentElement;
            for (let i = 0; i < 3; i++) {
                if (!parent) break;
                const field = parent.querySelector('input, textarea, select, [contenteditable="true"]');
                if (field && isFillableElement(field)) return field;
                parent = parent.parentElement;
            }
            let next = el.nextElementSibling;
            while (next && !isFillableElement(next)) next = next.nextElementSibling;
            if (next && isFillableElement(next)) return next;
        }
    }
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

async function copyToClipboard(text) {
    await navigator.clipboard.writeText(text);
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

// Инициализация: создаём окно, но скрытым
createFloatingUI().then(() => hideFloatWindow());