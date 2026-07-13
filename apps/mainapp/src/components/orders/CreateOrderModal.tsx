import { useEffect, useState } from 'react';
import { Package, Plus, X } from 'lucide-react';
import type { OrderDTO, PaymentMethod, StoreDTO } from '@zetsales/shared';
import { createOrder, getProduct } from '../../lib/commerceApi';
import { ProductPicker, type PickedProduct } from '../adPerformance/ProductPicker';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { useToast } from '../ui/ToastProvider';

interface CreateOrderModalProps {
  open: boolean;
  onClose: () => void;
  stores: StoreDTO[];
  onCreated: (order: OrderDTO) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['Cash on Delivery', 'bKash', 'Nagad', 'Rocket', 'Card', 'Other'];

interface CartItem {
  productId: string;
  variantId: string;
  title: string;
  variantLabel: string | null;
  price: number;
  quantity: number;
}

// A real cart, not a single product — unlike the order drawer's one-shot upsell, a phone/walk-in
// order commonly has more than one item, so each "Add item" push appends to a list instead of
// closing immediately.
export function CreateOrderModal({ open, onClose, stores, onCreated }: CreateOrderModalProps) {
  const toast = useToast();
  const [storeId, setStoreId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash on Delivery');
  const [courierSpeed, setCourierSpeed] = useState<'regular' | 'express'>('regular');
  const [shippingFee, setShippingFee] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [advanceAmount, setAdvanceAmount] = useState('0');
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [variants, setVariants] = useState<{ id: string; label: string; price: number }[]>([]);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Reset to a blank form every time the modal opens rather than carrying over the last order —
  // this is a one-off "log this order" action, not something staff would resume mid-fill.
  useEffect(() => {
    if (!open) return;
    setStoreId(stores[0]?.id ?? '');
    setName('');
    setPhone('');
    setAltPhone('');
    setEmail('');
    setAddress('');
    setPaymentMethod('Cash on Delivery');
    setCourierSpeed('regular');
    setShippingFee('0');
    setDiscount('0');
    setAdvanceAmount('0');
    setItems([]);
    setPicked(null);
    setVariants([]);
    setVariantId('');
    setQuantity('1');
  }, [open, stores]);

  const handlePickProduct = async (product: PickedProduct) => {
    setPicked(product);
    setVariants([]);
    setVariantId('');
    setLoadingVariants(true);
    try {
      const res = await getProduct(product.id);
      const opts = res.product.variants.map((v) => ({ id: v.id, label: [v.title, v.optionValues.join(' / ')].filter(Boolean).join(' — ') || 'Default', price: v.price }));
      setVariants(opts);
      setVariantId(opts[0]?.id ?? '');
    } catch {
      toast.push('Could not load this product.', 'info');
    } finally {
      setLoadingVariants(false);
    }
  };

  const addItem = () => {
    if (!picked || !variantId) return;
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) return;
    setItems((prev) => [...prev, { productId: picked.id, variantId, title: picked.title, variantLabel: variant.label === 'Default' ? null : variant.label, price: variant.price, quantity: qty }]);
    setPicked(null);
    setVariants([]);
    setVariantId('');
    setQuantity('1');
  };

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const shippingFeeNum = Number(shippingFee) || 0;
  const discountNum = Number(discount) || 0;
  const advanceAmountNum = Number(advanceAmount) || 0;
  const subtotal = items.reduce((sum, li) => sum + li.price * li.quantity, 0);
  const total = Math.max(0, subtotal + shippingFeeNum - discountNum);

  const canSubmit = !!storeId && name.trim().length > 0 && phone.trim().length > 0 && items.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await createOrder({
        storeId,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerAltPhone: altPhone.trim() || null,
        customerEmail: email.trim() || null,
        address: address.trim() || null,
        paymentMethod,
        courierSpeed,
        shippingFee: shippingFeeNum,
        discount: discountNum,
        advanceAmount: advanceAmountNum,
        lineItems: items.map((li) => ({ productId: li.productId, variantId: li.variantId, quantity: li.quantity })),
      });
      toast.push(`Order ${res.order.number} created.`, 'success');
      onCreated(res.order);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not create this order.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create order" subtitle="Log a phone or walk-in order that didn't come through Shopify/WooCommerce." widthClass="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Store</label>
          <Select value={storeId} onChange={setStoreId} options={stores.map((s) => ({ value: s.id, label: s.displayName }))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Customer name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Alternative number</label>
            <input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Payment method</label>
            <Select value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Shipping fee</label>
            <input type="number" min={0} value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Discount</label>
            <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Advance collected</label>
            <input type="number" min={0} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Delivery speed</label>
            <Select
              value={courierSpeed}
              onChange={(v) => setCourierSpeed(v as 'regular' | 'express')}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'express', label: 'Express' },
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Items</p>
          {items.length > 0 && (
            <div className="mb-3 space-y-2">
              {items.map((li, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <Package size={13} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">{li.title}</p>
                      <p className="text-xs text-slate-400">{li.variantLabel ? `${li.variantLabel} · ` : ''}Qty {li.quantity}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-slate-700">{(li.price * li.quantity).toLocaleString()}</span>
                    <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-rose-500">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <ProductPicker value={picked} onChange={(p) => void handlePickProduct(p)} storeId={storeId || undefined} />
            {loadingVariants ? (
              <p className="text-xs text-slate-400">Loading variants...</p>
            ) : (
              picked &&
              variants.length > 0 && (
                <div className="flex items-center gap-2">
                  {variants.length > 1 && <Select value={variantId} onChange={setVariantId} options={variants.map((v) => ({ value: v.id, label: v.label }))} className="flex-1" />}
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
                  />
                  <button onClick={addItem} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                    <Plus size={13} /> Add
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-800">
            <span>Total</span>
            <span className="tabular-nums">{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating...' : 'Create order'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
