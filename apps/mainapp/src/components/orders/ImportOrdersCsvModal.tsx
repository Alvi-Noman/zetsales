import { useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { StoreDTO } from "@zetsales/shared";
import {
  parseCsvOrderImport,
  previewCsvOrderImport,
  commitCsvOrderImport,
  type CsvImportFieldKey,
  type CsvImportFieldMapping,
  type CsvImportDateFormat,
  type CsvImportPreviewRow,
} from "../../lib/commerceApi";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { useToast } from "../ui/ToastProvider";

interface ImportOrdersCsvModalProps {
  open: boolean;
  onClose: () => void;
  stores: StoreDTO[];
  onImported: () => void;
}

const FIELD_LABELS: { key: CsvImportFieldKey; label: string; required?: boolean }[] = [
  { key: "orderNumber", label: "Order Number (groups multi-item orders, enables reliable dedupe)" },
  { key: "platformOrderId", label: "Platform Order ID (advanced — if this matches a connected store, avoids duplicates if you later connect it live)" },
  { key: "orderDate", label: "Order Date" },
  { key: "customerName", label: "Customer Name" },
  { key: "customerPhone", label: "Customer Phone", required: true },
  { key: "customerAltPhone", label: "Alternate Phone" },
  { key: "address", label: "Address" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "productTitle", label: "Product Title" },
  { key: "sku", label: "SKU" },
  { key: "quantity", label: "Quantity" },
  { key: "price", label: "Unit Price" },
  { key: "total", label: "Order Total" },
];

const DATE_FORMAT_OPTIONS: { value: CsvImportDateFormat; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "DMY", label: "DD/MM/YYYY" },
  { value: "MDY", label: "MM/DD/YYYY" },
  { value: "YMD", label: "YYYY-MM-DD" },
];

type Step = "upload" | "map" | "review" | "done";
type Source = "generic" | "shopify";
type FieldMappingState = Record<CsvImportFieldKey, string>;

const EMPTY_MAPPING: FieldMappingState = FIELD_LABELS.reduce((acc, f) => {
  acc[f.key] = "";
  return acc;
}, {} as FieldMappingState);

// Shopify's own order-export column names, in priority order per field. Confirmed against a real
// export: the order-level "Phone" column is usually blank (it's an optional separate contact
// field) — "Billing Phone" is what's actually populated on essentially every order, since it's
// required at checkout, so it must come first or most rows falsely fail "missing phone". Matched
// exactly (case/spacing insensitive) against the uploaded file's real headers — if a candidate
// isn't found, the field stays unmapped rather than guessing wrong, same principle as the
// backend's fuzzy guesser.
const SHOPIFY_HEADER_CANDIDATES: Partial<Record<CsvImportFieldKey, string[]>> = {
  orderNumber: ["Name"],
  // Shopify's real internal order ID — identical to what a live Shopify sync stores as
  // externalId (see upsertShopifyOrder). Mapping this means a CSV backfill and a later live
  // connection of the same store recognize the same order instead of duplicating it.
  platformOrderId: ["Id"],
  orderDate: ["Created at"],
  customerName: ["Billing Name", "Shipping Name"],
  customerPhone: ["Billing Phone", "Shipping Phone", "Phone"],
  address: ["Billing Address1", "Shipping Address1"],
  paymentMethod: ["Payment Method"],
  productTitle: ["Lineitem name"],
  sku: ["Lineitem sku"],
  quantity: ["Lineitem quantity"],
  price: ["Lineitem price"],
  total: ["Total"],
};

function normalizeHeaderForMatch(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

// Returns null if the file doesn't look enough like a Shopify export to trust (no phone column
// found at all) — caller falls back to the manual mapping step in that case.
function resolveShopifyMapping(headers: string[]): FieldMappingState | null {
  const normalized = headers.map(normalizeHeaderForMatch);
  const mapping: FieldMappingState = { ...EMPTY_MAPPING };
  for (const [field, candidates] of Object.entries(SHOPIFY_HEADER_CANDIDATES) as [CsvImportFieldKey, string[]][]) {
    for (const candidate of candidates) {
      const idx = normalized.indexOf(normalizeHeaderForMatch(candidate));
      if (idx !== -1) {
        mapping[field] = String(idx);
        break;
      }
    }
  }
  return mapping.customerPhone ? mapping : null;
}

// A 4-step wizard: upload -> map columns -> review (dedupe/validation preview) -> commit. Every
// CSV shape is different, so nothing is assumed about column order/names beyond the auto-guessed
// starting mapping — the merchant confirms or corrects it before anything is written.
export function ImportOrdersCsvModal({ open, onClose, stores, onImported }: ImportOrdersCsvModalProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [source, setSource] = useState<Source>("generic");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [importId, setImportId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<FieldMappingState>(EMPTY_MAPPING);
  const [dateFormat, setDateFormat] = useState<CsvImportDateFormat>("auto");
  const [targetStoreId, setTargetStoreId] = useState("csv-generic");

  const [previewRows, setPreviewRows] = useState<CsvImportPreviewRow[]>([]);
  const [counts, setCounts] = useState({ new: 0, duplicate: 0, invalid: 0, total: 0 });
  const [skuMatch, setSkuMatch] = useState({ matched: 0, total: 0 });

  const [result, setResult] = useState<{
    created: number;
    skippedDuplicate: number;
    skippedInvalid: number;
    storeDisplayName: string;
  } | null>(null);

  const reset = () => {
    setStep("upload");
    setSource("generic");
    setImportId("");
    setHeaders([]);
    setTotalRows(0);
    setMapping(EMPTY_MAPPING);
    setDateFormat("auto");
    setTargetStoreId("csv-generic");
    setPreviewRows([]);
    setCounts({ new: 0, duplicate: 0, invalid: 0, total: 0 });
    setSkuMatch({ matched: 0, total: 0 });
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await parseCsvOrderImport(file);
      setImportId(res.importId);
      setHeaders(res.headers);
      setTotalRows(res.totalRows);

      if (source === "shopify") {
        const shopifyMapping = resolveShopifyMapping(res.headers);
        if (shopifyMapping) {
          setMapping(shopifyMapping);
          setDateFormat("YMD");
          setUploading(false);
          // Skip the mapping step entirely — go straight to a preview using the known-correct
          // mapping. "Back" from review still lands on the (pre-filled) mapping step as an escape
          // hatch, for the rare export with custom/renamed columns. importId is passed explicitly
          // (not read from state) since the setImportId above hasn't flushed yet at this point.
          void runPreview(shopifyMapping, "YMD", res.importId);
          return;
        }
        toast.push("Couldn't find the expected Shopify columns — please check the mapping below.", "info");
      }

      const initial: FieldMappingState = { ...EMPTY_MAPPING };
      for (const f of FIELD_LABELS) {
        const idx = res.suggestedMapping[f.key];
        if (idx !== undefined) initial[f.key] = String(idx);
      }
      setMapping(initial);
      setStep("map");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not read this CSV file.", "info");
    } finally {
      setUploading(false);
    }
  };

  const buildMappingPayload = (m: FieldMappingState): CsvImportFieldMapping => {
    const payload: CsvImportFieldMapping = {};
    for (const f of FIELD_LABELS) {
      const v = m[f.key];
      if (v !== "") payload[f.key] = Number(v);
    }
    return payload;
  };

  // Accepts an explicit mapping/dateFormat so the Shopify preset path (handleFile above) can jump
  // straight to preview without waiting for setMapping/setDateFormat to flush through React state.
  const runPreview = async (
    mappingOverride?: FieldMappingState,
    dateFormatOverride?: CsvImportDateFormat,
    importIdOverride?: string
  ) => {
    const effectiveMapping = mappingOverride ?? mapping;
    const effectiveDateFormat = dateFormatOverride ?? dateFormat;
    const effectiveImportId = importIdOverride ?? importId;
    if (!effectiveMapping.customerPhone) {
      toast.push("Map a Customer Phone column before previewing.", "info");
      setStep("map");
      return;
    }
    setPreviewing(true);
    try {
      const res = await previewCsvOrderImport({
        importId: effectiveImportId,
        mapping: buildMappingPayload(effectiveMapping),
        dateFormat: effectiveDateFormat,
        targetStoreId,
      });
      setPreviewRows(res.rows);
      setCounts(res.counts);
      setSkuMatch(res.skuMatch);
      setStep("review");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not preview this import.", "info");
    } finally {
      setPreviewing(false);
    }
  };

  const runCommit = async () => {
    setCommitting(true);
    try {
      const res = await commitCsvOrderImport({ importId, mapping: buildMappingPayload(mapping), dateFormat, targetStoreId });
      setResult(res);
      setStep("done");
      onImported();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not import these orders.", "info");
    } finally {
      setCommitting(false);
    }
  };

  const headerOptions = [
    { value: "", label: "— not in file —" },
    ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
  ];
  const storeOptions = [
    { value: "csv-generic", label: "CSV Import (generic, not tied to a store)" },
    ...stores.map((s) => ({ value: s.id, label: s.displayName })),
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Orders from CSV"
      widthClass="max-w-2xl"
      subtitle={step === "map" ? `${totalRows} rows found — map columns below` : undefined}
    >
      {step === "upload" && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex rounded-lg border border-slate-200 p-1">
            {(
              [
                { value: "generic", label: "Generic CSV" },
                { value: "shopify", label: "Shopify export" },
              ] as { value: Source; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSource(opt.value)}
                className={
                  source === opt.value
                    ? "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 px-10 py-8 text-slate-500 hover:border-indigo-300 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
            <span className="text-sm font-medium">{uploading ? "Reading file…" : "Click to choose a CSV file"}</span>
          </button>
          <p className="max-w-sm text-xs text-slate-400">
            {source === "shopify"
              ? "Columns are matched automatically for a standard Shopify order export — you'll go straight to a preview. If something doesn't match, you can still adjust the mapping from there."
              : "Any CSV shape works — you'll map its columns to ZetSales fields next."}{" "}
            Orders land in Pending, dated using each row's own order date, and re-uploading the same
            file never creates duplicates.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files)}
          />
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {FIELD_LABELS.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  {f.label}
                  {f.required && <span className="text-rose-500"> *</span>}
                </label>
                <Select value={mapping[f.key]} onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))} options={headerOptions} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Date format</label>
              <Select value={dateFormat} onChange={(v) => setDateFormat(v as CsvImportDateFormat)} options={DATE_FORMAT_OPTIONS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Attribute orders to</label>
              <Select value={targetStoreId} onChange={setTargetStoreId} options={storeOptions} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => setStep("upload")} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
              Back
            </button>
            <button
              onClick={() => void runPreview()}
              disabled={previewing}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {previewing && <Loader2 size={14} className="animate-spin" />}
              Preview
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              <CheckCircle2 size={13} /> {counts.new} new
            </span>
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              <AlertTriangle size={13} /> {counts.duplicate} duplicate
            </span>
            <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
              <XCircle size={13} /> {counts.invalid} invalid
            </span>
          </div>
          {skuMatch.total > 0 && (
            <p className="text-xs text-slate-400">
              {skuMatch.matched} of {skuMatch.total} line items matched a known SKU in your product catalog — unmatched
              items still import fine, just without inventory linkage.
            </p>
          )}
          {counts.invalid > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Row(s)</th>
                    <th className="px-2 py-1.5 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows
                    .filter((r) => r.status === "invalid")
                    .map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-600">{r.rowNumbers.join(", ")}</td>
                        <td className="px-2 py-1.5 text-rose-600">{r.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {counts.new === 0 && (
            <p className="text-sm text-slate-500">Nothing new to import — every row is either a duplicate of an existing order or invalid.</p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => setStep("map")} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
              Back
            </button>
            <button
              onClick={() => void runCommit()}
              disabled={committing || counts.new === 0}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {committing && <Loader2 size={14} className="animate-spin" />}
              Import {counts.new} order{counts.new === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4 py-4 text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
          <p className="text-sm text-slate-700">
            Imported <strong>{result.created}</strong> order{result.created === 1 ? "" : "s"} into{" "}
            <strong>{result.storeDisplayName}</strong>.
          </p>
          {(result.skippedDuplicate > 0 || result.skippedInvalid > 0) && (
            <p className="text-xs text-slate-400">
              Skipped {result.skippedDuplicate} duplicate{result.skippedDuplicate === 1 ? "" : "s"} and{" "}
              {result.skippedInvalid} invalid row{result.skippedInvalid === 1 ? "" : "s"}.
            </p>
          )}
          <button onClick={handleClose} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
