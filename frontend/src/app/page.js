"use client";

import { useState, useEffect } from "react";

const EURO_TO_IDR_RATE = 20474;
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const INITIAL_FORM = {
  Company: "",
  Product: "",
  TypeName: "",
  Inches: "",
  ScreenResolution: "",
  Cpu: "",
  Ram: "",
  Memory: "",
  Gpu: "",
  OpSys: "",
  Weight: "",
};

/* ── Reusable field components ─────────────────────────────────────────────── */
function FieldLabel({ children }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

const inputCls =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition";

const selectCls =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition " +
  "disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed";

function Select({ name, label, options, value, onChange, disabled }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled || options.length === 0}
        required
        className={selectCls}
      >
        <option value="">— select —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function Home() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [metadata, setMetadata] = useState(null);

  // serverState: "checking" | "sleeping" | "waking" | "ready" | "error"
  const [serverState, setServerState] = useState("sleeping");
  const [serverNote, setServerNote] = useState("");
  const [wakeElapsed, setWakeElapsed] = useState(0);
  const [wakeAttempt, setWakeAttempt] = useState(0);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  // 2. Timer detik berjalan selama proses wake-up berlangsung
  useEffect(() => {
    if (serverState !== "waking") {
      setWakeElapsed(0);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setWakeElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [serverState]);

  // 3. Polling GET /metadata setiap 3 detik HANYA setelah user klik tombol Wake Up Server
  useEffect(() => {
    if (serverState !== "waking") return;

    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;

    const wait = (ms) =>
      new Promise((resolve) => {
        const done = () => {
          clearTimeout(t);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const t = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
      });

    async function pollUntilReady() {
      const deadline = Date.now() + 120000;

      while (!cancelled && Date.now() < deadline) {
        try {
          const res = await fetch(`${API}/metadata`, {
            method: "GET",
            signal,
            cache: "no-store",
          });

          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              setMetadata(data);
              setServerState("ready");
              setServerNote("");
            }
            return;
          }

          if (![502, 503, 504].includes(res.status)) {
            throw new Error(`Metadata endpoint returned HTTP ${res.status}`);
          }
        } catch (err) {
          if (err.name === "AbortError") return;
          if (!(err instanceof TypeError)) {
            if (!cancelled) {
              setServerState("error");
              setServerNote(err.message);
            }
            return;
          }
        }

        await wait(3000);
      }

      if (!cancelled) {
        setServerState("sleeping");
        setServerNote(
          "Server belum merespons setelah 120 detik. Pastikan kuota 100 jam gratis SnapDeploy masih tersedia, lalu klik tombol Wake Up lagi."
        );
      }
    }

    pollUntilReady();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [serverState, wakeAttempt]);

  const handleWakeButtonClick = () => {
    setServerNote("");
    setWakeElapsed(0);
    setWakeAttempt((prev) => prev + 1);
    setServerState("waking");
  };

  // ── Cascading option derivation ────────────────────────────────────────────
  const companyRules =
    formData.Company && metadata?.dependencies?.by_company?.[formData.Company];

  const opts = {
    Company: metadata?.Company ?? [],
    TypeName: companyRules ? companyRules.TypeName : (metadata?.TypeName ?? []),
    Cpu: companyRules ? companyRules.Cpu : (metadata?.Cpu ?? []),
    Gpu: companyRules ? companyRules.Gpu : (metadata?.Gpu ?? []),
    OpSys: companyRules ? companyRules.OpSys : (metadata?.OpSys ?? []),
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "Company") {
      setFormData((prev) => ({
        ...prev,
        Company: value,
        TypeName: "",
        Cpu: "",
        Gpu: "",
        OpSys: "",
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const idr = (eur) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(eur * EURO_TO_IDR_RATE);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorText("");
    setResult(null);

    try {
      const response = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          laptop_ID: 0,
          Inches: parseFloat(formData.Inches),
          Weight: parseFloat(formData.Weight),
          Ram: parseInt(formData.Ram),
        }),
      });

      const isJson = response.headers
        .get("content-type")
        ?.includes("application/json");
      const data = isJson ? await response.json() : {};

      if (!response.ok) {
        if ([502, 503, 504].includes(response.status)) {
          setServerState("sleeping");
          throw new Error(
            "Backend kembali tidur setelah 15 menit tidak aktif. Klik tombol 'Wake Up Server' di banner atas, tunggu ~60 detik, lalu klik Generate AI Valuation lagi."
          );
        }
        throw new Error(
          data.detail || `Server returned HTTP ${response.status}.`
        );
      }

      setResult(data);
    } catch (err) {
      if (err instanceof TypeError) {
        setServerState("sleeping");
        setErrorText(
          "Backend sedang tertidur (free tier auto-sleep). Klik tombol 'Wake Up Server' di banner atas untuk menyalakannya kembali tanpa menghapus isi form."
        );
      } else {
        setErrorText(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── XAI bar scale ──────────────────────────────────────────────────────────
  const maxContribution =
    result?.top_drivers?.length > 0
      ? Math.max(...result.top_drivers.map((d) => d.contribution_eur)) || 1
      : 1;

  const isBackendReady = serverState === "ready" && Boolean(metadata);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Iframe tersembunyi: hanya muncul saat serverState === "waking", otomatis dilepas saat "ready" atau timeout */}
      {serverState === "waking" && (
        <iframe
          key={wakeAttempt}
          src={`${API}/`}
          title="SnapDeploy backend wake-up"
          aria-hidden="true"
          tabIndex={-1}
          className="fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none"
          style={{ border: 0 }}
        />
      )}

      {/* ── Top nav bar ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-800 leading-none">
              LaptopAI Valuator
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              ML-powered price prediction
            </p>
          </div>
        </div>

        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isBackendReady
              ? "bg-emerald-50 text-emerald-700"
              : serverState === "waking"
              ? "bg-indigo-50 text-indigo-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {isBackendReady
            ? "Backend Online"
            : serverState === "waking"
            ? `Waking up… (${wakeElapsed}s)`
            : "Backend Sleeping"}
        </span>
      </header>

      {/* ── Page body ── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* ── Free-Tier Backend Status & Wake-Up Banner ── */}
        {!isBackendReady && (
          <div
            className={`rounded-2xl border p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm ${
              serverState === "waking"
                ? "bg-indigo-50/80 border-indigo-200 text-indigo-950"
                : "bg-amber-50 border-amber-200 text-amber-950"
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {serverState === "waking" ? (
                  <svg
                    className="animate-spin w-4 h-4 text-indigo-600 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                ) : (
                  <span className="text-amber-600 font-bold">⚡</span>
                )}

                <h2 className="text-sm font-bold">
                  {serverState === "waking"
                    ? `Sedang membangunkan server backend... (${wakeElapsed}s / ~60s)`
                    : "Backend Free-Tier Sedang Tertidur"}
                </h2>
              </div>

              <p className="text-xs leading-relaxed opacity-85">
                {serverState === "waking"
                  ? "Sinyal wake-up telah dikirim di latar belakang. Dropdown spesifikasi dan tombol prediksi akan aktif otomatis begitu server siap."
                  : "Aplikasi ini menggunakan backend ML free-tier yang otomatis tidur setelah 15 menit tidak digunakan. Klik tombol di samping untuk menyalakan server (~60 detik)."}
              </p>

              {serverNote && (
                <p className="text-xs font-medium text-red-700 pt-1">
                  {serverNote}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleWakeButtonClick}
              disabled={serverState === "waking"}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition shrink-0 ${
                serverState === "waking"
                  ? "bg-indigo-200 text-indigo-600 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {serverState === "waking"
                ? "Menyalakan Server…"
                : "Nyalakan Server Backend"}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* ════════════════ LEFT — Specifications Form ════════════════ */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                Laptop Specifications
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Fill in all fields to generate an AI price valuation
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Row 1: Company + TypeName */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  name="Company"
                  label="Brand"
                  options={opts.Company}
                  value={formData.Company}
                  onChange={handleChange}
                  disabled={!isBackendReady}
                />

                <Select
                  name="TypeName"
                  label="Type"
                  options={opts.TypeName}
                  value={formData.TypeName}
                  onChange={handleChange}
                  disabled={!isBackendReady || !formData.Company}
                />
              </div>

              {/* Row 2: Product */}
              <div>
                <FieldLabel>Product Name</FieldLabel>
                <input
                  name="Product"
                  type="text"
                  required
                  value={formData.Product}
                  onChange={handleChange}
                  className={inputCls}
                  placeholder="e.g., MacBook Pro 14"
                />
              </div>

              {/* Row 3: CPU + GPU */}
              <div className="grid grid-cols-1 gap-4">
                <Select
                  name="Cpu"
                  label="Processor (CPU)"
                  options={opts.Cpu}
                  value={formData.Cpu}
                  onChange={handleChange}
                  disabled={!isBackendReady || !formData.Company}
                />

                <Select
                  name="Gpu"
                  label="Graphics (GPU)"
                  options={opts.Gpu}
                  value={formData.Gpu}
                  onChange={handleChange}
                  disabled={!isBackendReady || !formData.Company}
                />
              </div>

              {/* Row 4: RAM + Storage */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>RAM (GB)</FieldLabel>
                  <input
                    name="Ram"
                    type="number"
                    required
                    value={formData.Ram}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g., 16"
                  />
                </div>

                <div>
                  <FieldLabel>Storage</FieldLabel>
                  <input
                    name="Memory"
                    type="text"
                    required
                    value={formData.Memory}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g., 512GB SSD"
                  />
                </div>
              </div>

              {/* Row 5: Screen Size + Screen Resolution */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Screen Size (in)</FieldLabel>
                  <input
                    name="Inches"
                    type="number"
                    step="0.1"
                    required
                    value={formData.Inches}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g., 13.3"
                  />
                </div>

                <div>
                  <FieldLabel>Screen Resolution</FieldLabel>
                  <input
                    name="ScreenResolution"
                    type="text"
                    required
                    value={formData.ScreenResolution}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g., 2560x1600"
                  />
                </div>
              </div>

              {/* Row 6: OpSys + Weight */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  name="OpSys"
                  label="Operating System"
                  options={opts.OpSys}
                  value={formData.OpSys}
                  onChange={handleChange}
                  disabled={!isBackendReady || !formData.Company}
                />

                <div>
                  <FieldLabel>Weight (kg)</FieldLabel>
                  <input
                    name="Weight"
                    type="number"
                    step="0.01"
                    required
                    value={formData.Weight}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g., 1.37"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !isBackendReady}
                className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all ${
                  loading || !isBackendReady
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg"
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    Analysing…
                  </span>
                ) : !isBackendReady ? (
                  "Nyalakan Server di Banner Atas untuk Memprediksi"
                ) : (
                  "Generate AI Valuation →"
                )}
              </button>

              {/* Error */}
              {errorText && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <span className="mt-0.5">⚠</span>
                  <span>{errorText}</span>
                </div>
              )}
            </form>
          </div>

          {/* ════════════════ RIGHT — AI Price Analytics ════════════════ */}
          <div className="md:col-span-5 md:sticky md:top-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    AI Price Analytics
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Powered by Ridge Regression ML
                  </p>
                </div>

                <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">
                  RMSE ±€328.90
                </span>
              </div>

              <div className="p-6">
                {!result && !loading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                      <svg
                        className="w-7 h-7 text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 3.07-.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>

                    <p className="text-sm font-semibold text-slate-600">
                      No valuation yet
                    </p>

                    <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                      Enter laptop specifications to generate an AI valuation
                    </p>
                  </div>
                )}

                {loading && (
                  <div className="space-y-3 py-4">
                    <div className="space-y-3 animate-pulse">
                      <div className="h-8 bg-slate-100 rounded-xl w-3/4 mx-auto" />
                      <div className="h-4 bg-slate-100 rounded-xl w-1/2 mx-auto" />
                      <div className="h-px bg-slate-100 my-4" />
                      <div className="h-4 bg-slate-100 rounded-xl w-full" />
                      <div className="h-4 bg-slate-100 rounded-xl w-5/6" />
                    </div>
                  </div>
                )}

                {result && !loading && (
                  <div className="space-y-5">
                    <div className="text-center">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Estimated Market Price
                      </p>

                      <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                        {idr(result.predicted_price)}
                      </p>

                      <p className="text-sm text-slate-400 mt-1">
                        € {result.predicted_price.toLocaleString("id-ID")}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Confidence Range
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-center">
                          <p className="text-xs text-blue-500 font-semibold mb-0.5">
                            Floor
                          </p>

                          <p className="text-sm font-bold text-blue-900 leading-tight">
                            {idr(result.lower_bound)}
                          </p>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-center">
                          <p className="text-xs text-emerald-500 font-semibold mb-0.5">
                            Ceiling
                          </p>

                          <p className="text-sm font-bold text-emerald-900 leading-tight">
                            {idr(result.upper_bound)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {result.top_drivers?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                          Top Price Drivers
                        </p>

                        <div className="space-y-3">
                          {result.top_drivers.map((d, i) => {
                            const barPct = Math.round(
                              (d.contribution_eur / maxContribution) * 100
                            );

                            const label = d.feature.replace(/^(num__|cat__)/, "");

                            return (
                              <div key={i}>
                                <div className="flex justify-between items-baseline mb-1">
                                  <span
                                    className="text-xs font-semibold text-slate-700 truncate max-w-[55%]"
                                    title={label}
                                  >
                                    #{i + 1} {label}
                                  </span>

                                  <span className="text-xs font-bold text-indigo-700 whitespace-nowrap ml-2">
                                    +{idr(d.contribution_eur)}
                                  </span>
                                </div>

                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                    style={{ width: `${barPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <p className="text-center text-xs text-slate-400 pt-2 border-t border-slate-100">
                      Prediction based on historical market data. Results are estimates only.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}