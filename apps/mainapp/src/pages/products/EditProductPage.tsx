import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileSpreadsheet,
  Globe,
  Loader2,
  ShoppingBag,
  Store as StoreIcon,
} from "lucide-react";
import { canWriteModule, type ProductPushResultDTO } from "@zetsales/shared";
import {
  getProduct,
  updateProduct,
  type ProductStoreRef,
} from "../../lib/commerceApi";
import {
  ProductFormFields,
  EMPTY_PRODUCT_FORM,
  type ProductFormState,
} from "../../components/products/ProductFormFields";
import { ProductPushSummary } from "../../components/products/ProductPushSummary";
import {
  ProductPushProgress,
  pushProgressLabel,
  type PushProgressItem,
} from "../../components/products/ProductPushProgress";
import { useToast } from "../../components/ui/ToastProvider";
import { useAuth } from "../../context/AuthContext";
import { PageTitle } from "../../components/layout/PageTitle";

const PLATFORM_META = {
  shopify: { label: "Shopify", color: "bg-[#95BF47]", icon: ShoppingBag },
  woocommerce: { label: "WooCommerce", color: "bg-[#7f54b3]", icon: StoreIcon },
  zetsite: { label: "ZetSite", color: "bg-slate-900", icon: Globe },
  csv: { label: "CSV Import", color: "bg-slate-500", icon: FileSpreadsheet },
} as const;

export function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canWriteProducts = canWriteModule(user?.role, "products");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [initialForm, setInitialForm] =
    useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [ownStore, setOwnStore] = useState<ProductStoreRef | null>(null);
  const [siblings, setSiblings] = useState<ProductStoreRef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ProductPushResultDTO[] | null>(null);
  const [pushItems, setPushItems] = useState<PushProgressItem[] | null>(null);

  useEffect(() => {
    if (!canWriteProducts) {
      navigate("/products", { replace: true });
      return;
    }
    if (!id) return;
    (async () => {
      try {
        const res = await getProduct(id);
        const p = res.product;
        const loaded: ProductFormState = {
          title: p.title,
          description: p.description ?? "",
          category: p.category ?? "",
          images: p.images,
          weight: p.weight != null ? String(p.weight) : "",
          weightUnit: p.weightUnit,
          sourceUrl: p.sourceUrl ?? undefined,
          sourcePlatform: p.sourcePlatform ?? undefined,
          options: p.options,
          variants: p.variants.map((v) => ({
            sku: v.sku ?? "",
            price: String(v.price),
            compareAtPrice:
              v.compareAtPrice != null ? String(v.compareAtPrice) : "",
            optionValues: v.optionValues,
            continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
            title: v.title,
            imageUrl: v.image ?? null,
            initialQuantity: "",
          })),
        };
        setForm(loaded);
        setInitialForm(loaded);
        setOwnStore(res.ownStore);
        setSiblings(res.siblings);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, canWriteProducts, navigate]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const canSubmit =
    isDirty &&
    form.title.trim().length > 0 &&
    form.variants.every((v) => v.price.trim().length > 0) &&
    !submitting;
  const affectedStores = ownStore ? [ownStore, ...siblings] : siblings;

  const handleSubmit = async () => {
    if (!id || !canSubmit) return;
    setSubmitting(true);
    setPushItems(
      affectedStores.map((s) => ({
        storeId: s.storeId,
        displayName: s.displayName,
        platform: s.platform,
        status: "pending",
      })),
    );
    try {
      const res = await updateProduct(
        id,
        {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
          images: form.images,
          weight: form.weight.trim() ? Number(form.weight) : undefined,
          weightUnit: form.weightUnit,
          sourceUrl: form.sourceUrl,
          sourcePlatform: form.sourcePlatform,
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
          })),
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
      setResults(res.results);
      const successCount = res.results.filter((r) => r.success).length;
      if (successCount > 0)
        toast.push(
          `Updated "${form.title.trim()}" on ${successCount} store${successCount === 1 ? "" : "s"}.`,
        );
    } catch (err) {
      setPushItems(null);
      toast.push(
        err instanceof Error ? err.message : "Could not update this product.",
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
          <PageTitle hideBack>Edit product</PageTitle>
          <p className="zs-page-description">
            Changes push straight to the connected store(s).
          </p>
        </div>
      </div>

      <div className="zs-page-body mx-auto w-full max-w-3xl">
        {loading ? (
          <div className="zs-loading-state h-40">Loading...</div>
        ) : notFound ? (
          <div className="zs-empty-state h-40">Product not found.</div>
        ) : results ? (
          <div className="space-y-5">
            <ProductPushSummary
              title={form.title.trim()}
              image={form.images[0] ?? null}
              results={results}
            />
            <button
              onClick={() => navigate("/products")}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              View products
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <ProductFormFields value={form} onChange={setForm} />

            {pushItems ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Pushing to
                </label>
                <ProductPushProgress items={pushItems} />
              </div>
            ) : (
              siblings.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    This will update
                  </label>
                  <div className="space-y-2">
                    {affectedStores.map((s) => {
                      const meta = PLATFORM_META[s.platform];
                      return (
                        <div
                          key={s.storeId}
                          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
                        >
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${meta.color}`}
                          >
                            <meta.icon size={14} />
                          </span>
                          <span className="text-sm font-medium text-slate-800">
                            {s.displayName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting
                ? pushProgressLabel(pushItems, "Saving...")
                : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
