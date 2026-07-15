import { useEffect, useState } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import type { InventorySkuOptionDTO, SupplierDTO, WarehouseDTO } from '../../lib/commerceApi';
import { createSupplier, listBins, listSuppliers, listWarehouses, createPurchaseOrder, updatePurchaseOrder, sendPurchaseOrder, type PurchaseOrderDTO, type PurchaseOrderLinePayload } from '../../lib/commerceApi';
import { SkuPicker, SupplierPicker, WarehousePicker, BinPicker } from '../../pages/inventory/InventoryPage';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';
import { ConfirmPrintPromptModal } from './ConfirmPrintPromptModal';
import { PrintPurchaseOrderModal } from './PrintPurchaseOrderModal';

interface DraftLine {
  key: string;
  sku: InventorySkuOptionDTO | null;
  bin: string;
  quantity: string;
  unitPrice: string;
  shippingCost: string;
  dutiesCost: string;
}

function emptyLine(): DraftLine {
  return { key: crypto.randomUUID(), sku: null, bin: '', quantity: '1', unitPrice: '', shippingCost: '', dutiesCost: '' };
}

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

interface CreatePurchaseOrderModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  // Omit both when there's no fixed supplier context (e.g. opened from the Suppliers list rather
  // than a specific supplier's page) — a SupplierPicker (same one the Incoming Stock modal uses,
  // "Create new supplier" included) appears in the modal instead.
  supplierId?: string;
  supplierName?: string;
  initial?: PurchaseOrderDTO | null;
  onClose: () => void;
  // Receives the PO's supplier id, so a caller with no fixed supplier context (the Suppliers list)
  // can navigate to wherever that supplier's own Purchase Orders section lives.
  onSaved: (supplierId: string) => void;
}

// Draft-only editor — a sent/received/cancelled PO is never passed in as `initial` here (the
// Purchase Orders section only opens this for drafts). Reuses the exact product/warehouse/bin
// pickers the Inventory "Log incoming stock" flow already uses (see InventoryPage.tsx) rather than
// rebuilding them, since a PO line is the same shape as an inbound-stock line plus a per-line cost.
export function CreatePurchaseOrderModal({ open, mode, supplierId: fixedSupplierId, supplierName: fixedSupplierName, initial, onClose, onSaved }: CreatePurchaseOrderModalProps) {
  const toast = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [binOptions, setBinOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [pickedSupplierId, setPickedSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  // Set only once a confirm actually succeeds — holds the flow open on a "print it?" prompt instead
  // of closing/navigating away immediately, regardless of whether this modal was opened from the
  // Suppliers list (which navigates on finish) or a specific supplier's page.
  const [confirmedPo, setConfirmedPo] = useState<PurchaseOrderDTO | null>(null);
  const [confirmedSupplierId, setConfirmedSupplierId] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const finish = () => {
    const sid = confirmedSupplierId;
    setConfirmedPo(null);
    setShowPrintModal(false);
    onSaved(sid);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    void listWarehouses().then((res) => setWarehouses(res.warehouses));
    if (!fixedSupplierId) void listSuppliers().then((res) => setSuppliers(res.suppliers));
  }, [open, fixedSupplierId]);

  useEffect(() => {
    if (!open) return;
    setConfirmedPo(null);
    setConfirmedSupplierId('');
    setShowPrintModal(false);
    if (!fixedSupplierId) {
      setPickedSupplierId(mode === 'edit' && initial ? initial.supplierId : '');
      setNewSupplierName('');
    }
    if (mode === 'edit' && initial) {
      setWarehouseId(initial.warehouseId);
      setNotes(initial.notes ?? '');
      setExpectedAt(initial.expectedAt ? initial.expectedAt.slice(0, 10) : '');
      setLines(
        initial.lines.map((l) => ({
          key: crypto.randomUUID(),
          sku: {
            productId: l.productId,
            variantId: l.variantId,
            sku: l.sku,
            productTitle: l.productTitle,
            productImage: null,
            variantLabel: l.variantLabel ?? '',
          },
          bin: l.bin ?? '',
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          shippingCost: l.shippingCost ? String(l.shippingCost) : '',
          dutiesCost: l.dutiesCost ? String(l.dutiesCost) : '',
        }))
      );
    } else {
      setWarehouseId('');
      setNotes('');
      setExpectedAt('');
      setLines([emptyLine()]);
    }
  }, [open, mode, initial, fixedSupplierId]);

  useEffect(() => {
    if (!warehouseId) {
      setBinOptions([]);
      return;
    }
    void listBins(warehouseId).then((res) => setBinOptions(res.bins));
  }, [warehouseId]);

  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const total = lines.reduce((sum, l) => {
    const qty = Number(l.quantity) || 0;
    const price = Number(l.unitPrice) || 0;
    return sum + qty * price + (Number(l.shippingCost) || 0) + (Number(l.dutiesCost) || 0);
  }, 0);

  const supplierReady = fixedSupplierId ? true : pickedSupplierId === '__new' ? newSupplierName.trim().length > 0 : pickedSupplierId.trim().length > 0;

  const canSave =
    !saving &&
    supplierReady &&
    warehouseId.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((l) => l.sku && Number(l.quantity) > 0 && l.unitPrice.trim() !== '' && Number(l.unitPrice) >= 0);

  // Confirming requires every line to have a bin too (same rule sendPurchaseOrder enforces
  // server-side) — checked here so the button disables itself instead of round-tripping to find out.
  const canConfirm = canSave && lines.every((l) => l.bin.trim().length > 0);

  const save = async (andConfirm: boolean) => {
    if (!canSave || (andConfirm && !canConfirm)) return;
    setSaving(true);
    try {
      let supplierId = fixedSupplierId ?? '';
      let supplierName = fixedSupplierName ?? '';
      if (!fixedSupplierId) {
        if (pickedSupplierId === '__new') {
          const created = await createSupplier({ name: newSupplierName.trim() });
          supplierId = created.supplier.id;
          supplierName = created.supplier.name;
        } else {
          const picked = suppliers.find((s) => s.id === pickedSupplierId);
          supplierId = pickedSupplierId;
          supplierName = picked?.name ?? '';
        }
      }

      const warehouse = warehouses.find((w) => w.id === warehouseId);
      const payloadLines: PurchaseOrderLinePayload[] = lines.map((l) => ({
        productId: l.sku!.productId,
        variantId: l.sku!.variantId,
        sku: l.sku!.sku,
        productTitle: l.sku!.productTitle,
        variantLabel: l.sku!.variantLabel,
        bin: l.bin.trim() || undefined,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        shippingCost: l.shippingCost.trim() ? Number(l.shippingCost) : undefined,
        dutiesCost: l.dutiesCost.trim() ? Number(l.dutiesCost) : undefined,
      }));
      const payload = {
        supplierId,
        supplierName,
        warehouseId,
        warehouseName: warehouse?.name ?? '',
        lines: payloadLines,
        notes: notes.trim() || undefined,
        expectedAt: expectedAt || undefined,
      };

      let poId: string;
      if (mode === 'edit' && initial) {
        const res = await updatePurchaseOrder(initial.id, payload);
        if (!res.success || !res.purchaseOrder) {
          toast.push(res.message || 'Could not save this purchase order.', 'info');
          return;
        }
        poId = res.purchaseOrder.id;
      } else {
        const res = await createPurchaseOrder(payload);
        poId = res.purchaseOrder.id;
      }

      if (andConfirm) {
        const sendRes = await sendPurchaseOrder(poId);
        if (sendRes.success && sendRes.purchaseOrder) {
          toast.push('Added to Incoming Stock.', 'success');
          setConfirmedSupplierId(supplierId);
          setConfirmedPo(sendRes.purchaseOrder);
          return; // hold the flow open on the print prompt instead of closing immediately
        }
        toast.push(sendRes.message || 'Saved as draft, but could not confirm it — check the Purchase Orders section.', 'info');
      } else {
        toast.push(mode === 'edit' ? 'Purchase order updated.' : 'Purchase order created.', 'success');
      }
      onSaved(supplierId);
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not save this purchase order.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit purchase order' : 'New purchase order'}
      subtitle={fixedSupplierName ? `For ${fixedSupplierName} — stays a draft until you confirm it.` : 'Stays a draft until you confirm it.'}
      widthClass="max-w-2xl"
    >
      <div className="space-y-5">
        {!fixedSupplierId && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Supplier</label>
            <SupplierPicker suppliers={suppliers} value={pickedSupplierId} onChange={setPickedSupplierId} />
            {pickedSupplierId === '__new' && (
              <input
                autoFocus
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="New supplier name"
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
            )}
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Receiving warehouse</label>
          <WarehousePicker warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} placeholder="Select warehouse" />
        </div>

        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.key} className="rounded-lg border border-slate-200 p-3.5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SkuPicker value={line.sku} onChange={(sku) => updateLine(line.key, { sku })} />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                  className="mt-6 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Unit price</label>
                  <input
                    type="number"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Shipping</label>
                  <input
                    type="number"
                    min="0"
                    value={line.shippingCost}
                    onChange={(e) => updateLine(line.key, { shippingCost: e.target.value })}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Duties</label>
                  <input
                    type="number"
                    min="0"
                    value={line.dutiesCost}
                    onChange={(e) => updateLine(line.key, { dutiesCost: e.target.value })}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
              </div>
              {warehouseId && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Shelf/Bin (needed before confirming)</label>
                  <BinPicker value={line.bin} onChange={(bin) => updateLine(line.key, { bin })} options={binOptions} />
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
        >
          <Plus size={14} /> Add line
        </button>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Expected arrival</label>
            <input
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <Package size={14} /> Estimated total
          </span>
          <span className="text-base font-bold text-slate-900">{money(total)}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void save(false)}
            disabled={!canSave}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Save as draft'}
          </button>
          <button
            onClick={() => void save(true)}
            disabled={!canConfirm}
            title={!canConfirm && canSave ? 'Every line needs a storage bin before this can be confirmed.' : undefined}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Confirm & add to Incoming Stock'}
          </button>
        </div>
      </div>

      <ConfirmPrintPromptModal
        open={confirmedPo !== null && !showPrintModal}
        poNumber={confirmedPo?.poNumber ?? ''}
        onSkip={finish}
        onPrint={() => setShowPrintModal(true)}
      />
      <PrintPurchaseOrderModal open={showPrintModal} purchaseOrder={confirmedPo} onClose={finish} />
    </Modal>
  );
}
