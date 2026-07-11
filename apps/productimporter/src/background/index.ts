import { apiPost, ApiError } from '../lib/apiClient.js';
import { getSession } from '../lib/storage.js';
import type { ExtractedDraft } from '../content/extract.js';

interface ImportDraftMessage {
  type: 'zetsales:import-draft';
  draft: ExtractedDraft;
}

function isImportDraftMessage(message: unknown): message is ImportDraftMessage {
  return Boolean(message) && (message as ImportDraftMessage).type === 'zetsales:import-draft';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isImportDraftMessage(message)) return undefined;

  (async () => {
    try {
      const session = await getSession();
      if (!session) throw new ApiError('Log in to ZetSales from the extension options page first.');

      const draft = message.draft;
      const payload = {
        title: draft.title,
        description: draft.description,
        category: '',
        images: draft.images,
        weightUnit: 'kg',
        sourceUrl: draft.sourceUrl,
        sourcePlatform: 'alibaba',
        supplierName: draft.supplierName,
        rawPriceText: draft.rawPriceText,
        confidence: draft.confidence,
        warnings: draft.warnings,
        options: draft.options,
        variants: draft.variants.map((v) => ({
          price: draft.price ?? 0,
          optionValues: v.optionValues,
          image: v.image,
          continueSellingWhenOutOfStock: true,
        })),
      };

      const result = await apiPost<{ success: boolean; id: string }>('/commerce/products/imports/draft', payload);
      await chrome.tabs.create({ url: `${session.appBaseUrl}/products?importDraftId=${result.id}` });
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();

  return true; // keep the message channel open for the async response above
});
