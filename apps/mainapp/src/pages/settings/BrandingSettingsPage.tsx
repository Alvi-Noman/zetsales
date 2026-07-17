import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { INVOICE_FONT_OPTIONS, type InvoiceFont } from "@zetsales/shared";
import { getBrandingSettings, updateInvoiceFont, uploadBrandingLogo } from "../../lib/commerceApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/ToastProvider";

export function BrandingSettingsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingFont, setSavingFont] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["branding-settings", user?.tenantId],
    queryFn: getBrandingSettings,
    enabled: !!user?.tenantId,
  });
  const branding = data?.branding;

  const handleLogoSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadBrandingLogo(file);
      await queryClient.invalidateQueries({ queryKey: ["branding-settings", user?.tenantId] });
      push("Logo updated.");
    } catch {
      push("Couldn't upload logo. Try again.", "info");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFontChange = async (font: InvoiceFont) => {
    setSavingFont(true);
    try {
      await updateInvoiceFont(font);
      await queryClient.invalidateQueries({ queryKey: ["branding-settings", user?.tenantId] });
      push("Invoice font updated.");
    } catch {
      push("Couldn't update invoice font. Try again.", "info");
    } finally {
      setSavingFont(false);
    }
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">Branding</h1>
        <p className="zs-page-description">Your logo and preferred font, used later on invoices.</p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="flex max-w-lg flex-col gap-4">
            <div className="zs-surface p-5">
              <h2 className="text-sm font-semibold text-slate-900">Logo</h2>
              <p className="mt-1 text-[13px] text-slate-500">
                Uploaded as JPEG, PNG or WEBP, up to 5MB.
              </p>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {branding?.logoUrl ? (
                    <img src={branding.logoUrl} alt="Store logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus size={20} className="text-slate-300" />
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleLogoSelected(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploading && <Loader2 size={13} className="animate-spin" />}
                    {branding?.logoUrl ? "Replace logo" : "Upload logo"}
                  </button>
                </div>
              </div>
            </div>

            <div className="zs-surface p-5">
              <h2 className="text-sm font-semibold text-slate-900">Invoice font</h2>
              <p className="mt-1 text-[13px] text-slate-500">
                Your preferred print-safe font for invoices.
              </p>
              <select
                value={branding?.invoiceFont ?? "Helvetica"}
                disabled={savingFont}
                onChange={(e) => handleFontChange(e.target.value as InvoiceFont)}
                className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
              >
                {INVOICE_FONT_OPTIONS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
