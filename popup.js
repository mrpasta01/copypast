// popup.js – обновлённая версия с автообновлением списка

document.getElementById('copyBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { command: 'startSelectionCopy' });
});

document.getElementById('rememberBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { command: 'startSelectionRemember' });
});

document.getElementById('autoFillBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { command: 'autoFill' });
});

document.getElementById('clearBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove('keyValuePairs');
    loadPairsList();
});


async function loadPairsList() {
    const result = await chrome.storage.local.get('keyValuePairs');
    const pairs = result.keyValuePairs || {};
    const container = document.getElementById('pairsList');
    container.innerHTML = '';
    
    if (Object.keys(pairs).length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#888;">Нет сохранённых элементов</div>';
        return;
    }
    
    for (const [key, value] of Object.entries(pairs)) {
        const div = document.createElement('div');
        div.className = 'pair';
        
        const keySpan = document.createElement('span');
        keySpan.className = 'key';
        keySpan.textContent = key;
        
        const valueContainer = document.createElement('div');
        valueContainer.className = 'value-container';
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = value;
        
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Копировать';
        copyBtn.className = 'copy-btn';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(value);
            showCopyFeedback(copyBtn);
        });
        
        valueContainer.appendChild(valueSpan);
        valueContainer.appendChild(copyBtn);
        
        div.appendChild(keySpan);
        div.appendChild(valueContainer);
        container.appendChild(div);
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Ошибка копирования:', err);
    }
}

function showCopyFeedback(btn) {
    const originalText = btn.textContent;
    btn.textContent = '✓ Скопировано!';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 1500);
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.keyValuePairs) {
        loadPairsList(); // обновляем отображение
    }
});

loadPairsList();