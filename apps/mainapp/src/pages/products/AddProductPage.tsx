import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Package,
  ShoppingBag,
  Store as StoreIcon,
} from "lucide-react";
import clsx from "clsx";
import { canWriteModule, type StoreDTO } from "@zetsales/shared";
import {
  createProduct,
  listStores,
  listWarehouses,
  type WarehouseDTO,
} from "../../lib/commerceApi";
import {
  ProductFormFields,
  EMPTY_PRODUCT_FORM,
  type ProductFormState,
} from "../../components/products/ProductFormFields";
import {
  ProductPushProgress,
  pushProgressLabel,
  type PushProgressItem,
} from "../../components/products/ProductPushProgress";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/ToastProvider";
import { BinPicker, hasRealBins } from "../inventory/InventoryPage";
import { useAuth } from "../../context/AuthContext";

const PLATFORM_META = {
  shopify: { label: "Shopify", color: "bg-[#95BF47]", icon: ShoppingBag },
  woocommerce: { label: "WooCommerce", color: "bg-[#7f54b3]", icon: StoreIcon },
} as const;

export function AddProductPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canWriteProducts = canWriteModule(user?.role, "products");
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [pushItems, setPushItems] = useState<PushProgressItem[] | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [bin, setBin] = useState("");

  useEffect(() => {
    if (!canWriteProducts) {
      navigate("/products", { replace: true });
      return;
    }
    (async () => {
      try {
        const [list, warehouseRes] = await Promise.all([
          listStores(),
          listWarehouses(),
        ]);
        setStores(list);
        setSelected(new Set(list.map((s) => s.id)));
        setWarehouses(warehouseRes.warehouses);
        setWarehouseId(warehouseRes.warehouses[0]?.id ?? "");
      } catch {
        toast.push("Could not load your connected stores.", "info");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWriteProducts]);

  // The warehouse/bin picker is only relevant once a starting quantity is actually entered for
  // some variant — no point asking where to put stock nobody said exists yet.
  const hasInitialQuantity = form.variants.some(
    (v) => Number(v.initialQuantity) > 0,
  );
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const binOptions = selectedWarehouse
    ? [...selectedWarehouse.bins, ...selectedWarehouse.systemBins]
    : [];
  const usesBins = hasRealBins(binOptions);

  const toggleStore = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit =
    form.title.trim().length > 0 &&
    form.variants.length > 0 &&
    form.variants.every((v) => v.price.trim().length > 0) &&
    selected.size > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const targetStores = stores.filter((s) => selected.has(s.id));
    setPushItems(
      targetStores.map((s) => ({
        storeId: s.id,
        displayName: s.displayName,
        platform: s.platform,
        status: "pending",
      })),
    );
    try {
      const res = await createProduct(
        {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
          images: form.images,
          weight: form.weight.trim() ? Number(form.weight) : undefined,
          weightUnit: form.weightUnit,
          sourceUrl: form.sourceUrl,
          sourcePlatform: form.sourcePlatform ?? "manual",
          options: form.options,
          variants: form.variants.map((v) => ({
            sku: v.sku.trim() || undefined,
            price: Number(v.price) || 0,
            compareAtPrice: v.compareAtPrice.trim()
              ? Number(v.compareAtPrice)
              : undefined,
            optionValues: v.optionValues,
            continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
            image: v.imageUrl,
            initialQuantity: v.initialQuantity.trim()
              ? Number(v.initialQuantity)
              : undefined,
          })),
          storeIds: [...selected],
          warehouseId: hasInitialQuantity
            ? warehouseId || undefined
            : undefined,
          bin: hasInitialQuantity ? bin.trim() || undefined : undefined,
        },
        (event) => {
          if (event.type === "store:start") {
            setPushItems(
              (prev) =>
                prev?.map((item) =>
                  item.storeId === event.storeId
                    ? { ...item, status: "pushing" }
                    : item,
                ) ?? prev,
            );
          } else if (event.type === "store:done") {
            setPushItems(
              (prev) =>
                prev?.map((item) =>
                  item.storeId === event.storeId
                    ? {
                        ...item,
                        status: event.success ? "done" : "error",
                        error: event.error,
                      }
                    : item,
                ) ?? prev,
            );
          }
        },
      );
      const firstSuccess = res.results.find((r) => r.success && r.productId);
      const successCount = res.results.filter((r) => r.success).length;

      if (firstSuccess?.productId) {
        toast.push(
          `Pushed "${form.title.trim()}" to ${successCount} store${successCount === 1 ? "" : "s"}.`,
        );
        navigate(`/products/${firstSuccess.productId}/edit`);
      } else {
        toast.push(
          "Could not push this product to any store — see details below.",
          "info",
        );
      }
    } catch (err) {
      setPushItems(null);
      toast.push(
        err instanceof Error ? err.message : "Could not create this product.",
        "info",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header flex items-center gap-3">
        <button
          onClick={() => navigate("/products")}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="zs-page-title">Add product</h1>
          <p className="zs-page-description">
            Create once, push to any mix of your connected stores.
          </p>
        </div>
      </div>

      <div className="zs-page-body mx-auto w-full max-w-3xl">
        {loading ? (
          <div className="zs-loading-state h-40">Loading...</div>
        ) : stores.length === 0 ? (
          <div className="zs-dashed-surface flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Package size={24} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              Connect a store first
            </p>
            <p className="text-xs text-slate-400">
              You need at least one connected Shopify or WooCommerce store to
              push a product to.
            </p>
            <button
              onClick={() => navigate("/integrations")}
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go to Integrations
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <ProductFormFields
              value={form}
              onChange={setForm}
              showInitialQuantity
            />

            {hasInitialQuantity && (
              <div
                className={clsx(
                  "grid gap-3",
                  usesBins ? "sm:grid-cols-[1fr_1fr]" : "sm:grid-cols-1",
                )}
              >
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Warehouse
                  </label>
                  <Select
                    value={warehouseId}
                    onChange={(v) => {
                      setWarehouseId(v);
                      setBin("");
                    }}
                    options={
                      warehouses.length === 0
                        ? [
                            {
                              value: "",
                              label: "Main Warehouse (created automatically)",
                            },
                          ]
                        : warehouses.map((w) => ({
                            value: w.id,
                            label: w.name,
                          }))
                    }
                  />
                </div>
                {usesBins && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Shelf/Bin
                    </label>
                    <BinPicker
                      value={bin}
                      onChange={setBin}
                      options={binOptions}
                      placeholder="Optional"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Push to
              </label>
              {pushItems ? (
                <ProductPushProgress items={pushItems} />
              ) : (
                <div className="space-y-2">
                  {stores.map((store) => {
                    const meta = PLATFORM_META[store.platform];
                    const checked = selected.has(store.id);
                    return (
                      <label
                        key={store.id}
                        className={clsx(
                          "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition",
                          checked
                            ? "border-indigo-300 bg-indigo-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStore(store.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span
                          className={clsx(
                            "flex h-7 w-7 items-center justify-center rounded-lg text-white",
                            meta.color,
                          )}
                        >
                          <meta.icon size={14} />
                        </span>
                        <span className="text-sm font-medium text-slate-800">
                          {store.displayName}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting
                ? pushProgressLabel(pushItems, "Pushing...")
                : `Create & push to ${selected.size} store${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
