import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, ChevronLeft,
  Shirt, Laptop, Sparkles, Home, ShoppingBasket, Package,
  ThumbsUp, Camera, MessageCircle, Globe, Store,
} from 'lucide-react';
import clsx from 'clsx';
import type { BusinessType, SalesChannel } from '@zetsales/shared';
import { useAuth } from '../../context/AuthContext';

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string; icon: typeof Shirt }[] = [
  { value: 'Fashion & Apparel', label: 'Fashion & Apparel', icon: Shirt },
  { value: 'Electronics', label: 'Electronics', icon: Laptop },
  { value: 'Beauty & Cosmetics', label: 'Beauty & Cosmetics', icon: Sparkles },
  { value: 'Home & Living', label: 'Home & Living', icon: Home },
  { value: 'Grocery & Food', label: 'Grocery & Food', icon: ShoppingBasket },
  { value: 'Other', label: 'Something else', icon: Package },
];

const CHANNEL_OPTIONS: { value: SalesChannel; label: string; icon: typeof Globe }[] = [
  { value: 'Facebook', label: 'Facebook', icon: ThumbsUp },
  { value: 'Instagram', label: 'Instagram', icon: Camera },
  { value: 'WhatsApp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'Website', label: 'My own website', icon: Globe },
  { value: 'Physical Store', label: 'Physical store', icon: Store },
];

const MONTHLY_ORDERS_OPTIONS = ['Under 50', '50 - 200', '200 - 1,000', '1,000+'];
const TEAM_SIZE_OPTIONS = ['Just me', '2 - 5', '6 - 15', '16+'];

type StepKey = 'businessName' | 'businessType' | 'phone' | 'channels' | 'monthlyOrders' | 'teamSize';
const STEP_ORDER: StepKey[] = ['businessName', 'businessType', 'phone', 'channels', 'monthlyOrders', 'teamSize'];

function OptionCard({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Globe; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center gap-2.5 rounded-xl border p-5 text-center transition-colors',
        active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      <Icon size={22} className={active ? 'text-indigo-600' : 'text-slate-400'} />
      <span className={clsx('text-sm font-medium', active ? 'text-indigo-700' : 'text-slate-700')}>{label}</span>
    </button>
  );
}

function ListOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left text-sm font-medium transition-colors',
        active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      {label}
      {active && <Check size={16} className="text-indigo-600" />}
    </button>
  );
}

export function OnboardingPage() {
  const { completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType | ''>('');
  const [phone, setPhone] = useState('');
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState('');
  const [teamSize, setTeamSize] = useState('');

  const step = STEP_ORDER[stepIndex];

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, [stepIndex]);

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const selectAndAdvance = (setter: () => void) => {
    setter();
    setTimeout(goNext, 220);
  };

  const toggleChannel = (c: SalesChannel) => setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  // teamSize is the last question — finish() fires from the same click that sets it, so the
  // value is passed directly instead of read back off state (which wouldn't have committed yet).
  const finish = async (finalTeamSize: string) => {
    if (businessType === '') return;
    setError('');
    setFinishing(true);
    try {
      await completeOnboarding({ businessName, businessType, phone, channels, monthlyOrders, teamSize: finalTeamSize });
      navigate('/home', { replace: true });
    } catch (err) {
      setFinishing(false);
      setError(err instanceof Error ? err.message : 'Could not finish onboarding.');
    }
  };

  if (finishing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
        <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-sm font-bold text-white">
          Z
        </div>
        <p className="text-sm text-slate-500">Setting up your workspace...</p>
      </div>
    );
  }

  const businessLabel = businessName.trim() || 'your business';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      <div className="h-1 w-full bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
          style={{ width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%` }}
        />
      </div>

      <div className="pointer-events-none absolute top-[-15%] right-[-10%] h-[380px] w-[380px] rounded-full bg-indigo-100/50 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-[-15%] left-[-10%] h-[380px] w-[380px] rounded-full bg-violet-100/50 blur-[110px]" />

      <div className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 text-xs font-bold text-white">
            Z
          </div>
          <span className="text-sm font-bold text-slate-900">ZetSales</span>
        </div>
        {stepIndex > 0 ? (
          <button onClick={goBack} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
            <ChevronLeft size={16} /> Back
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center px-6 pb-24">
        <div className={clsx('w-full max-w-lg transition-all duration-300', visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>
          {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

          {step === 'businessName' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (businessName.trim().length >= 2) goNext();
              }}
            >
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">What&apos;s your business called?</h1>
              <p className="mt-2.5 text-slate-500">This is the name your team and customers will see.</p>
              <input
                autoFocus
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Brown Bazar"
                className="mt-9 w-full border-b-2 border-slate-200 bg-transparent pb-3 text-2xl font-medium text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={businessName.trim().length < 2}
                className="mt-9 flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-30"
              >
                Continue <ArrowRight size={16} />
              </button>
              <p className="mt-3 text-xs text-slate-400">Press Enter ↵</p>
            </form>
          )}

          {step === 'businessType' && (
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">What does {businessLabel} sell?</h1>
              <p className="mt-2.5 text-slate-500">Pick the closest match.</p>
              <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {BUSINESS_TYPE_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt.value}
                    active={businessType === opt.value}
                    onClick={() => selectAndAdvance(() => setBusinessType(opt.value))}
                    icon={opt.icon}
                    label={opt.label}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'phone' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (phone.trim().length >= 6) goNext();
              }}
            >
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">What&apos;s the best number to reach you on?</h1>
              <p className="mt-2.5 text-slate-500">For account and delivery-related updates — WhatsApp preferred.</p>
              <input
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+8801XXXXXXXXX"
                className="mt-9 w-full border-b-2 border-slate-200 bg-transparent pb-3 text-2xl font-medium text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={phone.trim().length < 6}
                className="mt-9 flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-30"
              >
                Continue <ArrowRight size={16} />
              </button>
              <p className="mt-3 text-xs text-slate-400">Press Enter ↵</p>
            </form>
          )}

          {step === 'channels' && (
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Where does {businessLabel} sell today?</h1>
              <p className="mt-2.5 text-slate-500">Select every channel — you can connect them later.</p>
              <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CHANNEL_OPTIONS.map((opt) => (
                  <OptionCard key={opt.value} active={channels.includes(opt.value)} onClick={() => toggleChannel(opt.value)} icon={opt.icon} label={opt.label} />
                ))}
              </div>
              <button
                onClick={goNext}
                disabled={channels.length === 0}
                className="mt-9 flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-30"
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 'monthlyOrders' && (
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How many orders a month?</h1>
              <p className="mt-2.5 text-slate-500">A rough estimate is fine.</p>
              <div className="mt-9 space-y-2.5">
                {MONTHLY_ORDERS_OPTIONS.map((opt) => (
                  <ListOption key={opt} active={monthlyOrders === opt} onClick={() => selectAndAdvance(() => setMonthlyOrders(opt))} label={opt} />
                ))}
              </div>
            </div>
          )}

          {step === 'teamSize' && (
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How big is your team?</h1>
              <p className="mt-2.5 text-slate-500">Including yourself.</p>
              <div className="mt-9 space-y-2.5">
                {TEAM_SIZE_OPTIONS.map((opt) => (
                  <ListOption
                    key={opt}
                    active={teamSize === opt}
                    onClick={() => {
                      setTeamSize(opt);
                      setTimeout(() => finish(opt), 220);
                    }}
                    label={opt}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
