import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import type { InvoiceTemplateDTO, OrderDTO, PrintPaperSize } from '@zetsales/shared';
import {
  listPrintTemplates,
  createPrintTemplate,
  updatePrintTemplate,
  deletePrintTemplate,
  setDefaultPrintTemplate,
  uploadPrintTemplateLogo,
  type PrintTemplateFields,
} from '../../lib/commerceApi';
import { useToast } from '../../components/ui/ToastProvider';
import { Select } from '../../components/ui/Select';
import { CombinedDocumentPage } from '../../components/orders/PrintOrderModal';

// Fabricated, never sent anywhere — purely so the editor has something realistic to render live as
// fields/toggles change, without needing a real order or a network round-trip per keystroke.
const SAMPLE_ORDER: OrderDTO = {
  id: 'sample', storeId: 'sample', platform: 'shopify', externalId: 'sample', number: '#SAMPLE-1001', invoiceNo: 'BRB-000001', invoiceIssuedAt: null,
  stage: 'Confirmed', heldFromStage: null, paymentStatus: 'COD Pending', paymentMethod: 'Cash on Delivery',
  subtotal: 1290, shippingFee: 80, discount: 0, advanceAmount: 0, total: 1370, currency: 'BDT',
  tags: [], customerName: 'Farzana Akter', customerPhone: '+8801711000101', customerAltPhone: null,
  customerEmail: null, address: 'Mirpur 10, Dhaka',
  lineItems: [{ title: 'Premium Cotton Kurti', variant: 'Sky Blue / M', quantity: 1, price: 1290, sku: 'KURTI-BLU-M', image: null }],
  holdReason: null, cancelReason: null, flagReason: null, wasShortOfStock: false, splitFromOrderId: null, splitFromOrderNumber: null,
  splitIntoOrderId: null, splitIntoOrderNumber: null, note: null, rescheduledFor: null, isPriorityCall: false,
  priorityNote: null, isCustomerBlocked: false, isReturningCustomer: false, riskLabel: null, riskSuccessRate: null, steadfastFraudCheck: null, pathaoFraudCheck: null, courierPartner: 'Steadfast', courierTrackingId: 'STF12345678',
  courierConsignmentId: null, courierStatus: null, courierSyncedAt: null, courierCharge: null,
  courierReturnCharge: null, courierZoneTier: 'inside', courierSpeed: 'regular',
  deliveryZone: 'Dhaka Metro', callAttempts: 0, history: [], returnLocation: null,
  fulfillmentWarehouseId: null, fulfillmentWarehouseName: null, cogsTotal: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  claimedBy: null, claimedAt: null, printedAt: null,
};

const BLANK_FORM: PrintTemplateFields = {
  name: '', logoUrl: '', businessNameOverride: '', address: '', phone: '',
  paperSize: 'A4', showItemImages: true, showSkuVariant: true, showCustomerAddress: true,
  showPaymentBox: true, showDeliveryBox: true, showBarcode: true, showCodCallout: true,
  footerNote: 'Thank you for your order.',
};

function toForm(t: InvoiceTemplateDTO): PrintTemplateFields {
  return {
    name: t.name, logoUrl: t.logoUrl ?? '', businessNameOverride: t.businessNameOverride ?? '',
    address: t.address ?? '', phone: t.phone ?? '', paperSize: t.paperSize,
    showItemImages: t.showItemImages, showSkuVariant: t.showSkuVariant, showCustomerAddress: t.showCustomerAddress,
    showPaymentBox: t.showPaymentBox, showDeliveryBox: t.showDeliveryBox, showBarcode: t.showBarcode,
    showCodCallout: t.showCodCallout, footerNote: t.footerNote,
  };
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
    </label>
  );
}

export function InvoiceTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<InvoiceTemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<PrintTemplateFields>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listPrintTemplates();
      setTemplates(res.templates);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setEditorOpen(true);
  };

  const openEdit = (t: InvoiceTemplateDTO) => {
    setEditingId(t.id);
    setForm(toForm(t));
    setEditorOpen(true);
  };

  const handleLogoFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const res = await uploadPrintTemplateLogo(files[0]);
      setForm((prev) => ({ ...prev, logoUrl: res.url }));
    } catch {
      toast.push('Could not upload the logo.', 'info');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) await updatePrintTemplate(editingId, form);
      else await createPrintTemplate(form);
      toast.push(editingId ? 'Template updated.' : 'Template created.', 'success');
      setEditorOpen(false);
      void load();
    } catch (err) {
      toast.push((err as Error).message || 'Could not save this template.', 'info');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePrintTemplate(id);
      toast.push('Template deleted.', 'success');
      void load();
    } catch {
      toast.push('Could not delete this template.', 'info');
    }
  };

  const makeDefault = async (id: string) => {
    try {
      await setDefaultPrintTemplate(id);
      void load();
    } catch {
      toast.push('Could not set this as default.', 'info');
    }
  };

  const previewTemplate: InvoiceTemplateDTO = {
    id: 'preview', createdAt: '', updatedAt: '',
    name: form.name, logoUrl: form.logoUrl || null, businessNameOverride: form.businessNameOverride || null,
    address: form.address || null, phone: form.phone || null, paperSize: form.paperSize,
    showItemImages: form.showItemImages, showSkuVariant: form.showSkuVariant, showCustomerAddress: form.showCustomerAddress,
    showPaymentBox: form.showPaymentBox, showDeliveryBox: form.showDeliveryBox, showBarcode: form.showBarcode,
    showCodCallout: form.showCodCallout, footerNote: form.footerNote, isDefault: false,
  };

  return (
    <div className="px-4 py-4 lg:px-8 lg:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Invoice Design</h1>
          <p className="mt-0.5 text-sm text-slate-500">Save as many templates as you need — logo, layout, what shows on the page.</p>
        </div>
        {!editorOpen && (
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus size={14} /> New template
          </button>
        )}
      </div>

      {editorOpen ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Template name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Standard Invoice"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Logo</label>
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                    <img src={form.logoUrl} alt="" className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, logoUrl: '' }))}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-500"
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                    <span className="text-[9px] font-medium">Add</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleLogoFile(e.target.files)} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Business name override (optional)</label>
              <input
                value={form.businessNameOverride}
                onChange={(e) => setForm((p) => ({ ...p, businessNameOverride: e.target.value }))}
                placeholder="Leave blank to use your account business name"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Address (optional)</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Phone (optional)</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Paper size</label>
              <Select
                value={form.paperSize}
                onChange={(v) => setForm((p) => ({ ...p, paperSize: v as PrintPaperSize }))}
                options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: 'A5' }]}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">What shows on the document</p>
              <Toggle label="Item images" checked={form.showItemImages} onChange={(v) => setForm((p) => ({ ...p, showItemImages: v }))} />
              <Toggle label="Variant / SKU" checked={form.showSkuVariant} onChange={(v) => setForm((p) => ({ ...p, showSkuVariant: v }))} />
              <Toggle label="Customer address" checked={form.showCustomerAddress} onChange={(v) => setForm((p) => ({ ...p, showCustomerAddress: v }))} />
              <Toggle label="Payment box" checked={form.showPaymentBox} onChange={(v) => setForm((p) => ({ ...p, showPaymentBox: v }))} />
              <Toggle label="Delivery box" checked={form.showDeliveryBox} onChange={(v) => setForm((p) => ({ ...p, showDeliveryBox: v }))} />
              <Toggle label="Barcode" checked={form.showBarcode} onChange={(v) => setForm((p) => ({ ...p, showBarcode: v }))} />
              <Toggle label="COD collect box" checked={form.showCodCallout} onChange={(v) => setForm((p) => ({ ...p, showCodCallout: v }))} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Footer note</label>
              <input
                value={form.footerNote}
                onChange={(e) => setForm((p) => ({ ...p, footerNote: e.target.value }))}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditorOpen(false)} className="flex-1 rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={saving || !form.name.trim()}
                className="flex-1 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save template'}
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Live preview — sample order</p>
            <div className="mx-auto max-w-2xl overflow-hidden rounded-lg shadow-sm">
              <CombinedDocumentPage order={SAMPLE_ORDER} businessName="Your Business" template={previewTemplate} />
            </div>
          </section>
        </div>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 text-center">
          <ImagePlus size={28} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No templates yet</p>
          <p className="max-w-md text-sm text-slate-400">Create one to add your logo and control what shows on invoices and packing slips.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {t.logoUrl ? (
                    <img src={t.logoUrl} alt="" className="h-9 w-9 rounded-lg border border-slate-100 object-contain" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                      <ImagePlus size={14} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-[11px] text-slate-400">{t.paperSize}</p>
                  </div>
                </div>
                {t.isDefault && (
                  <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    <Star size={10} className="fill-indigo-700" /> Default
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => openEdit(t)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Pencil size={12} /> Edit
                </button>
                {!t.isDefault && (
                  <button onClick={() => void makeDefault(t.id)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Set default
                  </button>
                )}
                <button onClick={() => void remove(t.id)} className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
