"use client";

import { useState, useEffect } from "react";

const EURO_TO_IDR_RATE = 20474;
const API = "http://localhost:8000";

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

function Select({ name, label, options, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled || options.length === 0}
        required
        className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
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

export default function Home() {
  const [formData, setFormData]       = useState(INITIAL_FORM);
  const [metadata, setMetadata]       = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError]     = useState("");

  const [result, setResult]   = useState(null);   // { predicted_price, lower_bound, upper_bound, top_drivers }
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  // ── Fetch metadata once on mount ──────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/metadata`)
      .then((r) => {
        if (!r.ok) throw new Error(`Metadata fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setMetadata(data);
        setMetaLoading(false);
      })
      .catch((err) => {
        setMetaError(err.message);
        setMetaLoading(false);
      });
  }, []);

  // ── Cascading option derivation ────────────────────────────────────────────
  const companyRules = formData.Company && metadata?.dependencies?.by_company?.[formData.Company];

  const opts = {
    Company:  metadata?.Company  ?? [],
    TypeName: companyRules ? companyRules.TypeName : (metadata?.TypeName ?? []),
    Cpu:      companyRules ? companyRules.Cpu      : (metadata?.Cpu      ?? []),
    Gpu:      companyRules ? companyRules.Gpu      : (metadata?.Gpu      ?? []),
    OpSys:    companyRules ? companyRules.OpSys    : (metadata?.OpSys    ?? []),
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;

    // When Company changes, reset all company-dependent dropdowns
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
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 })
      .format(eur * EURO_TO_IDR_RATE);

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

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Gagal mendapatkan prediksi dari server.");

      setResult(data);
    } catch (err) {
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-gray-800">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-center text-blue-900">
          Machine Learning: Laptop Price Prediction
        </h1>

        {metaLoading && (
          <p className="text-center text-gray-500 mb-6 animate-pulse">Loading options from server…</p>
        )}
        {metaError && (
          <p className="text-center text-red-600 mb-6 text-sm">⚠ {metaError}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* ── Left column ── */}
            <div className="space-y-4">
              <Select
                name="Company" label="Company (Brand)"
                options={opts.Company} value={formData.Company}
                onChange={handleChange} disabled={metaLoading}
              />
              <div>
                <label className="block text-sm font-semibold mb-1">Product</label>
                <input
                  name="Product" type="text" required
                  value={formData.Product} onChange={handleChange}
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., MacBook Pro"
                />
              </div>
              <Select
                name="TypeName" label="Type Name"
                options={opts.TypeName} value={formData.TypeName}
                onChange={handleChange} disabled={metaLoading || !formData.Company}
              />
              <div>
                <label className="block text-sm font-semibold mb-1">Inches</label>
                <input
                  name="Inches" type="number" step="0.1" required
                  value={formData.Inches} onChange={handleChange}
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 13.3"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Screen Resolution</label>
                <input
                  name="ScreenResolution" type="text" required
                  value={formData.ScreenResolution} onChange={handleChange}
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., IPS Panel Retina Display 2560x1600"
                />
              </div>
              <Select
                name="OpSys" label="Operating System (OpSys)"
                options={opts.OpSys} value={formData.OpSys}
                onChange={handleChange} disabled={metaLoading || !formData.Company}
              />
            </div>

            {/* ── Right column ── */}
            <div className="space-y-4">
              <Select
                name="Cpu" label="CPU"
                options={opts.Cpu} value={formData.Cpu}
                onChange={handleChange} disabled={metaLoading || !formData.Company}
              />
              <div>
                <label className="block text-sm font-semibold mb-1">RAM (GB)</label>
                <input
                  name="Ram" type="number" required
                  value={formData.Ram} onChange={handleChange}
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 8"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Memory</label>
                <input
                  name="Memory" type="text" required
                  value={formData.Memory} onChange={handleChange}
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 128GB SSD"
                />
              </div>
              <Select
                name="Gpu" label="GPU"
                options={opts.Gpu} value={formData.Gpu}
                onChange={handleChange} disabled={metaLoading || !formData.Company}
              />
              <div>
                <label className="block text-sm font-semibold mb-1">Weight (kg)</label>
                <input
                  name="Weight" type="number" step="0.01" required
                  value={formData.Weight} onChange={handleChange}
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 1.37"
                />
              </div>
            </div>

          </div>

          <button
            type="submit"
            disabled={loading || metaLoading}
            className={`w-full mt-6 text-white font-bold py-3 px-4 rounded transition-colors ${
              loading || metaLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Memproses Model ML…" : "Price Prediction"}
          </button>
        </form>

        {errorText && (
          <div className="mt-6 p-4 bg-red-100 text-red-700 border border-red-400 rounded text-sm font-mono">
            {errorText}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            {/* ── Price card ── */}
            <div className="p-6 bg-green-50 border-2 border-green-500 rounded text-center shadow-inner">
              <p className="text-sm text-green-700 font-semibold uppercase tracking-wide mb-1">
                Estimated Price
              </p>
              <p className="text-4xl font-extrabold text-green-900">
                {idr(result.predicted_price)}
              </p>
              <p className="text-lg text-green-800 mt-1">
                € {result.predicted_price.toLocaleString("id-ID")}
              </p>

              {/* ── Price range ── */}
              <div className="mt-4 pt-4 border-t border-green-300">
                <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-2">
                  Confidence Range (± €{(328.90).toLocaleString("id-ID")})
                </p>
                <div className="flex justify-center items-center gap-3 text-sm font-medium text-green-800">
                  <span className="bg-green-100 px-3 py-1 rounded-full">
                    Low: {idr(result.lower_bound)}
                  </span>
                  <span className="text-green-500 font-bold">—</span>
                  <span className="bg-green-100 px-3 py-1 rounded-full">
                    High: {idr(result.upper_bound)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Top drivers card ── */}
            {result.top_drivers && result.top_drivers.length > 0 && (
              <div className="p-5 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm font-bold text-blue-900 mb-3">
                  Top Price Drivers
                </p>
                <ul className="space-y-2">
                  {result.top_drivers.map((d, i) => (
                    <li key={i} className="flex justify-between items-center text-sm">
                      <span className="text-blue-800 font-medium truncate max-w-[60%]" title={d.feature}>
                        #{i + 1} {d.feature.replace(/^(num__|cat__)/, "")}
                      </span>
                      <span className="text-blue-900 font-bold whitespace-nowrap">
                        +{idr(d.contribution_eur)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
