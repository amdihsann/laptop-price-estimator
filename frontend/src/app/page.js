"use client";

import { useState } from "react";

const EURO_TO_IDR_RATE = 20474;

export default function Home() {
  const [formData, setFormData] = useState({
    Company: "",
    Product: "",
    TypeName: "",
    Inches: "",
    ScreenResolution:"",
    Cpu: "",
    Ram: "",
    Memory: "",
    Gpu: "",
    OpSys: "",
    Weight: ""
  });

  const [predictedPrice, setPredictedPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorText("");
    setPredictedPrice(null);

    try {
      const response = await fetch("http://localhost:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          Inches: parseFloat(formData.Inches),
          Weight: parseFloat(formData.Weight),
          Ram: parseInt(formData.Ram)
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Gagal mendapatkan prediksi dari server.");
      }

      setPredictedPrice(data.predicted_price);
    } catch (err) {
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };


  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-gray-800">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-center text-blue-900">
          Machine Learning: Laptop Price Prediction
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* GRID LAYOUT: Membagi form menjadi 2 kolom agar tidak terlalu panjang */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Kolom Kiri */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Company (Brand)</label>
                <input name="Company" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., Apple, Asus" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Product</label>
                <input name="Product" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., MacBook Pro" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">TypeName</label>
                <input name="TypeName" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., Ultrabook, Gaming" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Inches</label>
                <input name="Inches" type="number" step="0.1" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., 13.3" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Screen Resolution</label>
                <input name="ScreenResolution" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., IPS Panel Retina Display 2560x1600" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Operating System (OpSys)</label>
                <input name="OpSys" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., macOS, Windows 10" onChange={handleChange} />
              </div>
            </div>

            {/* Kolom Kanan */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">CPU</label>
                <input name="Cpu" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., Intel Core i5 2.3GHz" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">RAM</label>
                <input name="Ram" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., 8GB" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Memory</label>
                <input name="Memory" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., 128GB SSD" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">GPU</label>
                <input name="Gpu" type="text" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., AMD Radeon Pro 455" onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Weight (Kg)</label>
                <input name="Weight" type="number" step="0.01" required className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" placeholder="e.g., 1.37" onChange={handleChange} />
              </div>
            </div>

          </div>

          <button type="submit" disabled={loading} className={`w-full mt-6 text-white font-bold py-3 px-4 rounded transition-colors ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
            {loading ? "Memproses Model ML..." : "Price Prediction"}
          </button>
        </form>

        {errorText && (
          <div className="mt-6 p-4 bg-red-100 text-red-700 border border-red-400 rounded text-sm font-mono">
            {errorText}
          </div>
        )}

        {predictedPrice !== null && (
          <div className="mt-6 p-6 bg-green-50 border-2 border-green-500 rounded text-center shadow-inner">
            <p className="text-md text-green-800 font-semibold mb-2">Estimated sells Price:</p>
            <p className="text-4xl font-extrabold text-green-900">
              € {predictedPrice.toLocaleString("id-ID")}
            </p>

            <p className="text-4xl font-extrabold text-green-900">
              {new Intl.NumberFormat("id-ID", {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
              }).format(predictedPrice * EURO_TO_IDR_RATE)}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}