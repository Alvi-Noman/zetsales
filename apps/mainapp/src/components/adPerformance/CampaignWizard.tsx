import { useEffect, useState } from "react";
import { Check, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import type {
  AdAccountDTO,
  AdAccountPlatform,
  AdCampaignGoal,
  AdCreativeAssetDTO,
  CreateAdCampaignPayload,
} from "@zetsales/shared";
import {
  createCampaign,
  deleteAdCreative,
  findProductByUrl,
  listAdAccounts,
  listAdCreatives,
  uploadAdCreatives,
} from "../../lib/commerceApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../ui/ToastProvider";
import { ProductPicker, type PickedProduct } from "./ProductPicker";

const PLATFORM_LABEL: Record<AdAccountPlatform, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

// Google's three structured image slots — Meta/TikTok just use the shared asset pool as-is (their
// own dynamic creative doesn't need a designated role per image the way Performance Max does).
type GoogleSlot = "marketing" | "square" | "logo";

function AssetThumb({
  asset,
  googleSlot,
  onSetGoogleSlot,
  onDelete,
}: {
  asset: AdCreativeAssetDTO;
  googleSlot: GoogleSlot | null;
  onSetGoogleSlot: (slot: GoogleSlot) => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {asset.type === "video" ? (
        <video src={asset.url} className="h-24 w-full object-cover" muted />
      ) : (
        <img
          src={asset.url}
          alt={asset.fileName}
          className="h-24 w-full object-cover"
        />
      )}
      <button
        onClick={onDelete}
        className="absolute right-1 top-1 rounded-md bg-black/50 p-1 text-white hover:bg-black/70"
      >
        <Trash2 size={11} />
      </button>
      {asset.type === "image" && (
        <div className="flex divide-x divide-slate-200 border-t border-slate-200 bg-white text-[9px] font-semibold">
          {(["marketing", "square", "logo"] as GoogleSlot[]).map((slot) => (
            <button
              key={slot}
              onClick={() => onSetGoogleSlot(slot)}
              className={clsx(
                "flex-1 py-1 capitalize",
                googleSlot === slot
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500 hover:bg-slate-50",
              )}
            >
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignWizard({ onPublished }: { onPublished: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(1);

  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetType, setBudgetType] = useState<"daily" | "total">("daily");
  const [goal, setGoal] = useState<AdCampaignGoal>("maximize_conversions");

  const [assets, setAssets] = useState<AdCreativeAssetDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [googleSlots, setGoogleSlots] = useState<
    Record<GoogleSlot, string | null>
  >({ marketing: null, square: null, logo: null });

  const [headlines, setHeadlines] = useState(["", "", ""]);
  const [descriptions, setDescriptions] = useState(["", ""]);
  const [primaryText, setPrimaryText] = useState("");

  const [connectedPlatforms, setConnectedPlatforms] = useState<
    Set<AdAccountPlatform>
  >(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Set<AdAccountPlatform>
  >(new Set());
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void listAdCreatives().then((res) => setAssets(res.assets));
    void listAdAccounts().then((res) => {
      const platforms = new Set(
        res.accounts.map((a: AdAccountDTO) => a.platform),
      );
      setConnectedPlatforms(platforms);
      setSelectedPlatforms(new Set(platforms));
    });
  }, []);

  // Product -> URL: picking a product auto-fills the destination when it has a known storefront
  // link. Doesn't touch destinationUrl if the product has none yet (not re-synced since the link
  // capture shipped) — the user's own typed value is left alone rather than being cleared.
  const pickProduct = (p: PickedProduct) => {
    setProduct(p);
    if (p.url) setDestinationUrl(p.url);
  };

  // URL -> product: only fires on blur (a URL is only meaningful once finished, not per keystroke)
  // and only looks up — it never shows an error or blocks typing, since a destination outside the
  // synced catalog (a landing page, a non-product page) is entirely valid.
  const handleUrlBlur = async () => {
    const url = destinationUrl.trim();
    if (!url) return;
    try {
      const res = await findProductByUrl(url);
      if (res.product && res.product.id !== product?.id) {
        setProduct({ id: res.product.id, title: res.product.title, url });
      }
    } catch {
      // Best-effort — a failed lookup just means no auto-select, never an error the user sees.
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const res = await uploadAdCreatives(Array.from(files));
      setAssets((prev) => [...res.assets, ...prev]);
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not upload these files.",
        "info",
      );
    } finally {
      setUploading(false);
    }
  };

  const removeAsset = async (id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setGoogleSlots((prev) => {
      const next = { ...prev };
      (Object.keys(next) as GoogleSlot[]).forEach((slot) => {
        if (next[slot] === id) next[slot] = null;
      });
      return next;
    });
    try {
      await deleteAdCreative(id);
    } catch {
      toast.push("Could not remove this asset.", "info");
    }
  };

  const canProceedStep1 =
    destinationUrl.trim().length > 0 && Number(budgetAmount) > 0;
  const canProceedStep2 = assets.length > 0;
  const canProceedStep3 =
    headlines.every((h) => h.trim().length > 0) &&
    descriptions.every((d) => d.trim().length > 0) &&
    primaryText.trim().length > 0;
  const googleNeedsSlots = selectedPlatforms.has("google");
  const googleSlotsFilled =
    !googleNeedsSlots ||
    (googleSlots.marketing && googleSlots.square && googleSlots.logo);
  const canPublish =
    canProceedStep1 &&
    canProceedStep2 &&
    canProceedStep3 &&
    googleSlotsFilled &&
    selectedPlatforms.size > 0 &&
    !publishing;

  const publish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const payload: CreateAdCampaignPayload = {
        productId: product?.id,
        productTitle: product?.title,
        destinationUrl: destinationUrl.trim(),
        goal,
        budgetAmount: Number(budgetAmount),
        budgetType,
        assetIds: assets.map((a) => a.id),
        headlines: headlines.map((h) => h.trim()),
        descriptions: descriptions.map((d) => d.trim()),
        primaryText: primaryText.trim(),
        platforms: [...selectedPlatforms],
        googleMarketingImageAssetId: googleSlots.marketing ?? undefined,
        googleSquareImageAssetId: googleSlots.square ?? undefined,
        googleLogoAssetId: googleSlots.logo ?? undefined,
        businessName: user?.businessName ?? undefined,
      };
      const res = await createCampaign(payload);
      if (!res.success) {
        toast.push(res.message || "Could not publish this campaign.", "info");
        return;
      }
      toast.push(
        "Campaign created — publishing to each platform now (they start paused).",
        "success",
      );
      onPublished();
      // Reset for the next campaign.
      setStep(1);
      setProduct(null);
      setDestinationUrl("");
      setBudgetAmount("");
      setHeadlines(["", "", ""]);
      setDescriptions(["", ""]);
      setPrimaryText("");
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not publish this campaign.",
        "info",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={clsx(
              "h-1.5 flex-1 rounded-full",
              s <= step ? "bg-indigo-600" : "bg-slate-200",
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <section className="space-y-4 zs-surface p-5">
          <h2 className="text-sm font-bold text-slate-900">
            Product, budget &amp; goal
          </h2>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Product (optional)
            </label>
            <ProductPicker value={product} onChange={pickProduct} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Destination URL
            </label>
            <input
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              onBlur={() => void handleUrlBlur()}
              placeholder="https://yourstore.com/products/..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Picking a product above fills this automatically — or paste a link
              and we'll match it to a product.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Budget (৳)
              </label>
              <input
                type="number"
                min="0"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="500"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Budget type
              </label>
              <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200">
                {(["daily", "total"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBudgetType(t)}
                    className={clsx(
                      "flex-1 text-sm font-medium capitalize",
                      budgetType === t
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-600",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Goal
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "maximize_conversions",
                    label: "Get the most purchases",
                    desc: "Optimize for purchase volume",
                  },
                  {
                    value: "maximize_value",
                    label: "Get the most value",
                    desc: "Optimize for order value",
                  },
                ] as const
              ).map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  className={clsx(
                    "rounded-lg border p-3 text-left",
                    goal === g.value
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <p className="text-xs font-semibold text-slate-800">
                    {g.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{g.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="h-10 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
          >
            Next: Upload assets
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4 zs-surface p-5">
          <h2 className="text-sm font-bold text-slate-900">Creative assets</h2>
          <p className="text-xs text-slate-500">
            Upload your product photos/videos — the more you upload, the more ad
            combinations each platform can assemble automatically.
            {selectedPlatforms.has("google") &&
              " For Google, tag one image each as Marketing, Square, and Logo below."}
          </p>
          <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500">
            <Upload size={18} />
            <span className="text-xs font-medium">
              {uploading ? "Uploading..." : "Click to upload images or video"}
            </span>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files)}
            />
          </label>
          {assets.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map((a) => (
                <AssetThumb
                  key={a.id}
                  asset={a}
                  googleSlot={
                    (Object.keys(googleSlots) as GoogleSlot[]).find(
                      (s) => googleSlots[s] === a.id,
                    ) ?? null
                  }
                  onSetGoogleSlot={(slot) =>
                    setGoogleSlots((prev) => ({ ...prev, [slot]: a.id }))
                  }
                  onDelete={() => void removeAsset(a.id)}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
            >
              Next: Ad text
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4 zs-surface p-5">
          <h2 className="text-sm font-bold text-slate-900">Ad text</h2>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Headlines (3 short variants)
            </label>
            <div className="space-y-2">
              {headlines.map((h, i) => (
                <input
                  key={i}
                  value={h}
                  onChange={(e) =>
                    setHeadlines((prev) =>
                      prev.map((v, idx) => (idx === i ? e.target.value : v)),
                    )
                  }
                  placeholder={`Headline ${i + 1}`}
                  maxLength={30}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                />
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Descriptions (2 variants)
            </label>
            <div className="space-y-2">
              {descriptions.map((d, i) => (
                <input
                  key={i}
                  value={d}
                  onChange={(e) =>
                    setDescriptions((prev) =>
                      prev.map((v, idx) => (idx === i ? e.target.value : v)),
                    )
                  }
                  placeholder={`Description ${i + 1}`}
                  maxLength={90}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                />
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Primary text (longer, main message)
            </label>
            <textarea
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              rows={3}
              placeholder="What makes this product worth buying?"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!canProceedStep3}
              className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
            >
              Next: Review &amp; publish
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4 zs-surface p-5">
          <h2 className="text-sm font-bold text-slate-900">
            Review &amp; publish
          </h2>
          <p className="text-xs text-slate-500">
            Every platform below creates the campaign <strong>paused</strong> —
            nothing spends until you activate it from the list below, per
            platform.
          </p>
          <div className="space-y-2">
            {(["meta", "google", "tiktok"] as AdAccountPlatform[]).map((p) => {
              const connected = connectedPlatforms.has(p);
              return (
                <label
                  key={p}
                  className={clsx(
                    "flex items-center justify-between rounded-lg border p-3",
                    connected
                      ? "border-slate-200"
                      : "border-slate-100 bg-slate-50 opacity-50",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      disabled={!connected}
                      checked={selectedPlatforms.has(p)}
                      onChange={(e) =>
                        setSelectedPlatforms((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p);
                          else next.delete(p);
                          return next;
                        })
                      }
                    />
                    <span className="text-sm font-semibold text-slate-800">
                      {PLATFORM_LABEL[p]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {connected ? "Connected" : "Not connected"}
                  </span>
                </label>
              );
            })}
          </div>
          {googleNeedsSlots && !googleSlotsFilled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Go back and tag a Marketing, Square, and Logo image for Google
              before publishing.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Back
            </button>
            <button
              onClick={() => void publish()}
              disabled={!canPublish}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Check size={14} />{" "}
              {publishing ? "Publishing..." : "Publish (paused)"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
