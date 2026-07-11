import { extractDraft } from './extract.js';

const BUTTON_ID = 'zetsales-import-button';

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.textContent = 'Import to ZetSales';
  button.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'z-index:2147483647',
    'padding:10px 16px',
    'background:#0f172a',
    'color:#fff',
    'border:none',
    'border-radius:8px',
    'font:600 13px -apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
    'cursor:pointer',
  ].join(';');

  const originalText = button.textContent;
  const resetAfterDelay = () => {
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2500);
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Importing…';

    try {
      const draft = extractDraft();
      const response = await chrome.runtime.sendMessage({ type: 'zetsales:import-draft', draft });
      if (!response?.ok) throw new Error(response?.error || 'Import failed');
      button.textContent = 'Opened in ZetSales ✓';
    } catch (err) {
      button.textContent = 'Import failed';
      console.error('[ZetSales Product Importer]', err);
    } finally {
      resetAfterDelay();
    }
  });

  document.documentElement.appendChild(button);
}

injectButton();
