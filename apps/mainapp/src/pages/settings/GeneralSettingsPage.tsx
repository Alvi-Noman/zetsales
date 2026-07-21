import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { BusinessProfileDTO, BusinessType, SalesChannel } from "@zetsales/shared";
import { getBusinessProfile, updateBusinessProfile } from "../../lib/settingsApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/ToastProvider";

const BUSINESS_TYPE_OPTIONS: BusinessType[] = [
  "I manufacture my own products",
  "I import my products",
  "I buy from local wholesalers",
  "I dropship — I never hold stock",
];

const CHANNEL_OPTIONS: SalesChannel[] = ["Facebook", "Instagram", "WhatsApp", "Website", "Physical Store"];
const MONTHLY_ORDERS_OPTIONS = ["Under 100", "100 - 300", "300 - 1,000", "1,000 - 3,000", "3,000 - 5,000", "5,000+"];
const TEAM_SIZE_OPTIONS = ["Just me", "2 - 5", "6 - 15", "16+"];

export function GeneralSettingsPage() {
  const { refresh } = useAuth();
  const { push } = useToast();
  const [profile, setProfile] = useState<BusinessProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [phone, setPhone] = useState("");
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState("");
  const [teamSize, setTeamSize] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getBusinessProfile();
      setProfile(data);
      setName(data.name);
      setBusinessType(data.businessType ?? "");
      setPhone(data.phone ?? "");
      setChannels(data.channels);
      setMonthlyOrders(data.monthlyOrders ?? "");
      setTeamSize(data.teamSize ?? "");
    } catch {
      push("Couldn't load business info.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleChannel = (channel: SalesChannel) =>
    setChannels((list) => (list.includes(channel) ? list.filter((c) => c !== channel) : [...list, channel]));

  const isDirty =
    !!profile &&
    (name.trim() !== profile.name ||
      businessType !== (profile.businessType ?? "") ||
      phone.trim() !== (profile.phone ?? "") ||
      channels.length !== profile.channels.length ||
      channels.some((c) => !profile.channels.includes(c)) ||
      monthlyOrders !== (profile.monthlyOrders ?? "") ||
      teamSize !== (profile.teamSize ?? ""));

  const canSave = isDirty && name.trim().length >= 2 && channels.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateBusinessProfile({
        name: name.trim(),
        businessType: businessType || undefined,
        phone: phone.trim() || undefined,
        channels,
        monthlyOrders: monthlyOrders || undefined,
        teamSize: teamSize || undefined,
      });
      await refresh();
      await load();
      push("Business info updated.");
    } catch (err) {
      push((err as Error).message || "Couldn't update business info. Try again.", "info");
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-sm font-semibold text-slate-900";
  const descClass = "mt-1 text-[13px] text-slate-500";
  const inputClass =
    "mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  if (loading) {
    return (
      <div className="zs-page">
        <div className="zs-page-header">
          <h1 className="zs-page-title">General</h1>
          <p className="zs-page-description">Basic details about your store.</p>
        </div>
        <div className="zs-page-body">
          <div className="text-sm text-slate-400">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">General</h1>
        <p className="zs-page-description">Basic details about your store.</p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        <div className="flex max-w-lg flex-col gap-4">
          <div className="zs-surface p-5">
            <label className={labelClass} htmlFor="store-name">
              Store name
            </label>
            <p className={descClass}>Shown across your workspace and used as the default business name on invoices.</p>
            <input id="store-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your store name" />
          </div>

          <div className="zs-surface p-5">
            <label className={labelClass}>How do you get your stock?</label>
            <p className={descClass}>Helps us tailor reports and suggestions to how you actually operate.</p>
            <select value={businessType} onChange={(e) => setBusinessType(e.target.value as BusinessType)} className={inputClass}>
              <option value="" disabled>
                Select an option
              </option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="zs-surface p-5">
            <label className={labelClass}>Contact phone</label>
            <p className={descClass}>Used for account and delivery-related updates.</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+8801XXXXXXXXX" />
          </div>

          <div className="zs-surface p-5">
            <label className={labelClass}>Sales channels</label>
            <p className={descClass}>Where you sell today — select every channel that applies.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    channels.includes(channel)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {channel === "Website" ? "My own website" : channel === "Physical Store" ? "Physical store" : channel}
                </button>
              ))}
            </div>
          </div>

          <div className="zs-surface p-5">
            <label className={labelClass}>Monthly order volume</label>
            <p className={descClass}>A rough estimate is fine.</p>
            <select value={monthlyOrders} onChange={(e) => setMonthlyOrders(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Select a range
              </option>
              {MONTHLY_ORDERS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="zs-surface p-5">
            <label className={labelClass}>Team size</label>
            <p className={descClass}>Including yourself.</p>
            <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Select a range
              </option>
              {TEAM_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
