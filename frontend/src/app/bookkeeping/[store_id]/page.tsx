"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

interface BookkeepingEntry {
  id: string;
  entry_date: string;
  income: number;
  lotto: number;
  payouts: number;
  tax: number;
}

interface VendorPayment {
  id: string;
  vendor_name: string;
  amount: number;
  payment_date: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FIELDS = ["income", "lotto", "payouts", "tax"] as const;

export default function StoreBookkeepingPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const store_id = params.store_id as string;
  const now = new Date();

  const allowedUsers = (process.env.NEXT_PUBLIC_BOOKKEEPING_USER_IDS || "").split(",");

  const [storeName, setStoreName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const emptyForm = () => ({
    entry_date: new Date().toISOString().split("T")[0],
    income: 0, lotto: 0, payouts: 0, tax: 0,
  });
  const [form, setForm] = useState(emptyForm());

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<BookkeepingEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<BookkeepingEntry>>({});

  // Vendor payments
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [addingVendor, setAddingVendor] = useState(false);
  const [vendorForm, setVendorForm] = useState({ vendor_name: "", amount: 0, payment_date: new Date().toISOString().split("T")[0] });

  async function getToken() {
    const { supabase } = await import("@/lib/supabase");
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchStoreName() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      const store = data.find((s: { id: string; name: string }) => s.id === store_id);
      if (store) setStoreName(store.name);
    }
  }

  async function handleExtract() {
    if (!file) return;
    setSaveError(null);
    setExtracting(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      setForm(f => ({
        ...f,
        income: data.income ?? 0,
        lotto: data.lotto ?? 0,
        payouts: data.payouts ?? 0,
        tax: data.tax ?? 0,
        entry_date: data.entry_date || f.entry_date,
      }));
      setExtracted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, store_id }),
      });
      if (res.status === 409) {
        const err = await res.json();
        setSaveError(err.detail);
        return;
      }
      setExtracted(false);
      setManualEntry(false);
      setFile(null);
      setForm(emptyForm());
      fetchEntries();
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchEntries() {
    setLoadingEntries(true);
    try {
      const token = await getToken();
      if (!token) { setLoadingEntries(false); return; }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/retrieve?month=${selectedMonth}&year=${selectedYear}&store_id=${store_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEntries(false);
    }
  }

  async function handleUpdate(id: string) {
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/update/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      fetchEntries();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/delete/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchEntries();
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchVendorPayments() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/vendor-payments?store_id=${store_id}&month=${selectedMonth}&year=${selectedYear}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    setVendorPayments(Array.isArray(data) ? data : []);
  }

  async function handleAddVendorPayment() {
    if (!vendorForm.vendor_name.trim() || !vendorForm.amount) return;
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendor-payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...vendorForm, store_id }),
    });
    setVendorForm({ vendor_name: "", amount: 0, payment_date: new Date().toISOString().split("T")[0] });
    setAddingVendor(false);
    fetchVendorPayments();
  }

  async function handleDeleteVendorPayment(id: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendor-payments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchVendorPayments();
  }

  useEffect(() => { fetchStoreName(); }, [store_id]);
  useEffect(() => { fetchEntries(); fetchVendorPayments(); }, [selectedMonth, selectedYear, store_id]);

  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const vendorPayoutTotal = vendorPayments.reduce((sum, p) => sum + p.amount, 0);

  const totals = sorted.reduce(
    (acc, e) => ({
      income: acc.income + e.income,
      tax: acc.tax + e.tax,
      lotto: acc.lotto + e.lotto,
      payout: acc.payout + e.payouts,
    }),
    { income: 0, tax: 0, lotto: 0, payout: 0 }
  );

  const totalPayout = totals.payout + vendorPayoutTotal;
  const profit = totals.income - totalPayout;
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  if (!allowedUsers.includes(user?.id || "")) {
    return (
      <ProtectedRoute>
        <div className="container py-8 text-slate-500">Access denied.</div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="container py-8 space-y-8 print:py-2">
        {/* Header */}
        <div className="flex items-center gap-4 print:hidden">
          <button
            onClick={() => router.push("/bookkeeping")}
            className="text-slate-400 hover:text-slate-900 text-sm cursor-pointer transition-colors"
          >
            ← Stores
          </button>
          <h1 className="text-xl font-semibold">{storeName || "Bookkeeping"}</h1>
        </div>

        {/* Upload & Extract */}
        <div className="card p-6 space-y-4 print:hidden">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Upload Daily Report</h2>
            <button
              onClick={() => { setManualEntry(!manualEntry); setExtracted(false); setSaveError(null); setForm(emptyForm()); }}
              className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
            >
              {manualEntry ? "← Back to Upload" : "Enter Manually"}
            </button>
          </div>

          {!manualEntry ? (
            <>
              <input
                type="file"
                accept="image/*,.pdf,.heic,.heif"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setExtracted(false); setSaveError(null); }}
                className="input"
              />
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <button onClick={handleExtract} disabled={!file || extracting} className="btn btn-primary">
                {extracting ? "Uploading..." : "Upload"}
              </button>
            </>
          ) : null}

          {(extracted || manualEntry) && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium">{manualEntry ? "Enter Values" : "Confirm Values"}</h3>
              <div>
                <label className="text-sm text-slate-600 block mb-1">Date</label>
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm(f => ({ ...f, entry_date: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {FIELDS.map(field => (
                  <div key={field}>
                    <label className="text-sm text-slate-600 block mb-1 capitalize">{field}</label>
                    <input
                      type="number"
                      value={form[field]}
                      onChange={(e) => setForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))}
                      className="input w-full"
                    />
                  </div>
                ))}
              </div>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <button onClick={handleSave} className="btn btn-primary">Save Entry</button>
            </div>
          )}
        </div>

        {/* Monthly Table */}
        <div className="space-y-4">
          <div className="flex items-center gap-4 print:hidden">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="input">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="input">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => window.print()} className="btn btn-primary">Print</button>
          </div>

          <h2 className="font-semibold hidden print:block">
            {storeName} — {MONTHS[selectedMonth - 1]} {selectedYear}
          </h2>

          {loadingEntries ? (
            <div className="card p-6 text-center">Loading...</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-6 font-medium">Date</th>
                  <th className="py-2 pr-6 font-medium">Income</th>
                  <th className="py-2 pr-6 font-medium">Tax</th>
                  <th className="py-2 pr-6 font-medium">Lotto</th>
                  <th className="py-2 pr-6 font-medium">Payout</th>
                  <th className="py-2 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(entry => (
                  <tr key={entry.id} className="border-b hover:bg-slate-50">
                    {editingId === entry.id ? (
                      <>
                        <td className="py-2 pr-6">{entry.entry_date}</td>
                        {(["income", "tax", "lotto", "payouts"] as const).map(field => (
                          <td key={field} className="py-2 pr-6">
                            <input
                              type="number"
                              value={editForm[field] ?? entry[field]}
                              onChange={(e) => setEditForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))}
                              className="input w-24"
                            />
                          </td>
                        ))}
                        <td className="py-2 print:hidden space-x-2">
                          <button onClick={() => handleUpdate(entry.id)} className="btn btn-primary text-xs px-3 py-1">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-slate-500 text-xs hover:text-slate-900 cursor-pointer">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-6">{entry.entry_date}</td>
                        <td className="py-2 pr-6">${entry.income.toFixed(2)}</td>
                        <td className="py-2 pr-6">${entry.tax.toFixed(2)}</td>
                        <td className="py-2 pr-6">${entry.lotto.toFixed(2)}</td>
                        <td className="py-2 pr-6">${entry.payouts.toFixed(2)}</td>
                        <td className="py-2 print:hidden space-x-3">
                          <button
                            onClick={() => { setEditingId(entry.id); setEditForm({ income: entry.income, lotto: entry.lotto, payouts: entry.payouts, tax: entry.tax }); }}
                            className="text-slate-400 hover:text-slate-900 text-xs cursor-pointer"
                          >Edit</button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-400 hover:text-red-600 text-xs cursor-pointer"
                          >Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">No entries for this month.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t border-slate-300">
                  <td className="py-3 pr-6">Totals</td>
                  <td className="py-3 pr-6">${totals.income.toFixed(2)}</td>
                  <td className="py-3 pr-6">${totals.tax.toFixed(2)}</td>
                  <td className="py-3 pr-6">${totals.lotto.toFixed(2)}</td>
                  <td className="py-3 pr-6">${totals.payout.toFixed(2)}</td>
                  <td className="print:hidden"></td>
                </tr>
                <tr className="font-semibold text-green-700">
                  <td className="py-2 pr-6">Profit</td>
                  <td className="py-2 pr-6" colSpan={4}>${profit.toFixed(2)}</td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Vendor Payments */}
        <div className="card p-6 space-y-4 print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Vendor Payments</h2>
              <p className="text-xs text-slate-400 mt-0.5">Additional payouts not on daily reports</p>
            </div>
            <button onClick={() => setAddingVendor(!addingVendor)} className="btn btn-primary text-sm">
              {addingVendor ? "Cancel" : "+ Add Payment"}
            </button>
          </div>

          {addingVendor && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-4">
              <div>
                <label className="text-sm text-slate-600 block mb-1">Vendor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Cigarette Co."
                  value={vendorForm.vendor_name}
                  onChange={(e) => setVendorForm(f => ({ ...f, vendor_name: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 block mb-1">Amount</label>
                <input
                  type="number"
                  value={vendorForm.amount}
                  onChange={(e) => setVendorForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  className="input"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 block mb-1">Date</label>
                <input
                  type="date"
                  value={vendorForm.payment_date}
                  onChange={(e) => setVendorForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="sm:col-span-3">
                <button onClick={handleAddVendorPayment} className="btn btn-primary">Save Payment</button>
              </div>
            </div>
          )}

          {vendorPayments.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-6 font-medium">Vendor</th>
                  <th className="py-2 pr-6 font-medium">Date</th>
                  <th className="py-2 pr-6 font-medium">Amount</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {vendorPayments.map(p => (
                  <tr key={p.id} className="border-b hover:bg-slate-50">
                    <td className="py-2 pr-6">{p.vendor_name}</td>
                    <td className="py-2 pr-6">{p.payment_date}</td>
                    <td className="py-2 pr-6">${p.amount.toFixed(2)}</td>
                    <td className="py-2">
                      <button
                        onClick={() => handleDeleteVendorPayment(p.id)}
                        className="text-red-400 hover:text-red-600 text-xs cursor-pointer"
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t border-slate-300">
                  <td className="py-3 pr-6" colSpan={2}>Total Vendor Payouts</td>
                  <td className="py-3 pr-6">${vendorPayoutTotal.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-sm text-slate-400">No vendor payments this month.</p>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
