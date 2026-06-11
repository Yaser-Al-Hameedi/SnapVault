"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

interface BookkeepingEntry {
  id: string;
  entry_date: string;
  income: number;
  payouts: number;
  tax: number;
}

interface LotteryEntry {
  id: string;
  week_start: string;
  week_end: string;
  amount: number;
}

interface Vendor {
  id: string;
  name: string;
}

interface VendorPayment {
  id: string;
  vendor_id: string;
  amount: number;
  payment_date: string;
  vendors: { name: string };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FIELDS = ["income", "payouts", "tax"] as const;

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
    income: "" as number | string,
    payouts: "" as number | string,
    tax: "" as number | string,
  });
  const [form, setForm] = useState(emptyForm());

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<BookkeepingEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, number | string>>({});
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [addingInlineForm, setAddingInlineForm] = useState<Record<string, string>>({ income: "", payouts: "", tax: "" });

  // Vendors
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [managingVendors, setManagingVendors] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");

  // Vendor payments
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ vendor_id: "", amount: 0, payment_date: new Date().toISOString().split("T")[0] });
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());

  // Lottery
  const [lotteryEntries, setLotteryEntries] = useState<LotteryEntry[]>([]);
  const [addingLottery, setAddingLottery] = useState(false);
  const [lotteryForm, setLotteryForm] = useState({ week_start: "", week_end: "", amount: "" as number | string });

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

  async function fetchVendors() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendors`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setVendors(Array.isArray(data) ? data : []);
  }

  async function handleAddVendor() {
    if (!newVendorName.trim()) return;
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendors`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newVendorName.trim() }),
    });
    setNewVendorName("");
    fetchVendors();
  }

  async function handleDeleteVendor(id: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendors/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchVendors();
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
        income: data.income ?? "",
        payouts: data.payouts ?? "",
        tax: data.tax ?? "",
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
        body: JSON.stringify({
          ...form,
          store_id,
          income: parseFloat(form.income as string) || 0,
          payouts: parseFloat(form.payouts as string) || 0,
          tax: parseFloat(form.tax as string) || 0,
        }),
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
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(editForm).map(([k, v]) => [k, v === "" ? 0 : parseFloat(v as string)])
          )
        ),
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

  async function handleSaveInline(dateStr: string) {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id,
          entry_date: dateStr,
          income: parseFloat(addingInlineForm.income) || 0,
          payouts: parseFloat(addingInlineForm.payouts) || 0,
          tax: parseFloat(addingInlineForm.tax) || 0,
        }),
      });
      if (res.ok) {
        setAddingDate(null);
        setAddingInlineForm({ income: "", payouts: "", tax: "" });
        fetchEntries();
      }
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

  async function handleAddPayment() {
    if (!paymentForm.vendor_id || !paymentForm.amount) return;
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendor-payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...paymentForm, store_id }),
    });
    setPaymentForm({ vendor_id: "", amount: 0, payment_date: new Date().toISOString().split("T")[0] });
    setAddingPayment(false);
    fetchVendorPayments();
  }

  async function handleDeletePayment(id: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vendor-payments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchVendorPayments();
  }

  async function fetchLotteryEntries() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/lottery-entries?store_id=${store_id}&month=${selectedMonth}&year=${selectedYear}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    setLotteryEntries(Array.isArray(data) ? data : []);
  }

  async function handleAddLotteryEntry() {
    if (!lotteryForm.week_start || !lotteryForm.week_end || !lotteryForm.amount) return;
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/lottery-entries`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...lotteryForm, store_id, amount: parseFloat(lotteryForm.amount as string) || 0 }),
    });
    setLotteryForm({ week_start: "", week_end: "", amount: "" });
    setAddingLottery(false);
    fetchLotteryEntries();
  }

  async function handleDeleteLotteryEntry(id: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/lottery-entries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchLotteryEntries();
  }

  useEffect(() => { fetchStoreName(); fetchVendors(); }, [store_id]);
  useEffect(() => { fetchEntries(); fetchVendorPayments(); fetchLotteryEntries(); }, [selectedMonth, selectedYear, store_id]);

  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { date: dateStr, entry: sorted.find(e => e.entry_date === dateStr) ?? null };
  });

  const vendorPayoutTotal = vendorPayments.reduce((sum, p) => sum + p.amount, 0);

  const totals = sorted.reduce(
    (acc, e) => ({
      income: acc.income + (e.income ?? 0),
      tax: acc.tax + (e.tax ?? 0),
      payout: acc.payout + (e.payouts ?? 0),
    }),
    { income: 0, tax: 0, payout: 0 }
  );

  const lotteryTotal = lotteryEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalPayout = totals.payout + vendorPayoutTotal;
  const profit = totals.income + lotteryTotal - totalPayout;
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  // Group vendor payments by vendor name
  const groupedPayments = vendorPayments.reduce((acc, p) => {
    const name = p.vendors?.name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(p);
    return acc;
  }, {} as Record<string, VendorPayment[]>);

  if (!allowedUsers.includes(user?.id || "")) {
    return (
      <ProtectedRoute>
        <div className="container py-8 text-slate-500">Access denied.</div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 print:hidden">
          <button onClick={() => router.push("/bookkeeping")} className="text-slate-400 hover:text-slate-900 text-sm cursor-pointer transition-colors">
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

          {!manualEntry && (
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
          )}

          {(extracted || manualEntry) && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium">{manualEntry ? "Enter Values" : "Confirm Values"}</h3>
              <div>
                <label className="text-sm text-slate-600 block mb-1">Date</label>
                <input type="date" value={form.entry_date} onChange={(e) => setForm(f => ({ ...f, entry_date: e.target.value }))} className="input" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {FIELDS.map(field => (
                  <div key={field}>
                    <label className="text-sm text-slate-600 block mb-1 capitalize">{field}</label>
                    <input
                      type="number"
                      value={form[field]}
                      onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
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
            <button onClick={() => window.print()} className="btn btn-primary print:hidden">Print</button>
          </div>

          <h2 className="font-semibold hidden print:block">{storeName} — {MONTHS[selectedMonth - 1]} {selectedYear}</h2>

          {loadingEntries ? (
            <div className="card p-6 text-center">Loading...</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-6 font-medium">Date</th>
                  <th className="py-2 pr-6 font-medium">Income</th>
                  <th className="py-2 pr-6 font-medium">Tax</th>
                  <th className="py-2 pr-6 font-medium">Payout</th>
                  <th className="py-2 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {allDays.map(({ date, entry }) => {
                  if (entry) {
                    return (
                      <tr key={date} className="border-b hover:bg-slate-50">
                        {editingId === entry.id ? (
                          <>
                            <td className="py-2 pr-6">{date}</td>
                            {(["income", "tax", "payouts"] as const).map(field => (
                              <td key={field} className="py-2 pr-6">
                                <input
                                  type="number"
                                  value={editForm[field] ?? ""}
                                  onChange={(e) => setEditForm(f => ({ ...f, [field]: e.target.value }))}
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
                            <td className="py-2 pr-6">{date}</td>
                            <td className="py-2 pr-6">${(entry.income ?? 0).toFixed(2)}</td>
                            <td className="py-2 pr-6">${(entry.tax ?? 0).toFixed(2)}</td>
                            <td className="py-2 pr-6">${(entry.payouts ?? 0).toFixed(2)}</td>
                            <td className="py-2 print:hidden space-x-3">
                              <button onClick={() => { setEditingId(entry.id); setEditForm({ income: String(entry.income ?? ""), payouts: String(entry.payouts ?? ""), tax: String(entry.tax ?? "") }); }} className="text-slate-400 hover:text-slate-900 text-xs cursor-pointer">Edit</button>
                              <button onClick={() => handleDelete(entry.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  }
                  // Empty day row
                  if (addingDate === date) {
                    return (
                      <tr key={date} className="border-b bg-blue-50">
                        <td className="py-2 pr-6 text-slate-400">{date}</td>
                        {(["income", "tax", "payouts"] as const).map(field => (
                          <td key={field} className="py-2 pr-6">
                            <input
                              type="number"
                              value={addingInlineForm[field]}
                              onChange={(e) => setAddingInlineForm(f => ({ ...f, [field]: e.target.value }))}
                              className="input w-24"
                              placeholder=""
                            />
                          </td>
                        ))}
                        <td className="py-2 print:hidden space-x-2">
                          <button onClick={() => handleSaveInline(date)} className="btn btn-primary text-xs px-3 py-1">Save</button>
                          <button onClick={() => setAddingDate(null)} className="text-slate-500 text-xs hover:text-slate-900 cursor-pointer">Cancel</button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={date}
                      className="border-b text-slate-300 hover:bg-slate-50 hover:text-slate-500 cursor-pointer print:hidden"
                      onClick={() => { setAddingDate(date); setAddingInlineForm({ income: "", payouts: "", tax: "" }); setEditingId(null); }}
                    >
                      <td className="py-2 pr-6">{date}</td>
                      <td className="py-2 pr-6">—</td>
                      <td className="py-2 pr-6">—</td>
                      <td className="py-2 pr-6">—</td>
                      <td className="py-2 print:hidden"></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t border-slate-300">
                  <td className="py-3 pr-6">Totals</td>
                  <td className="py-3 pr-6">${totals.income.toFixed(2)}</td>
                  <td className="py-3 pr-6">${totals.tax.toFixed(2)}</td>
                  <td className="py-3 pr-6">${totals.payout.toFixed(2)}</td>
                  <td className="print:hidden"></td>
                </tr>
                <tr className="font-semibold text-green-700">
                  <td className="py-2 pr-6">Profit</td>
                  <td className="py-2 pr-6" colSpan={3}>${profit.toFixed(2)}</td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Vendor Payments — visible on screen and print */}
        <div className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <div>
              <h2 className="font-semibold">Vendor Payments</h2>
              <p className="text-xs text-slate-400 mt-0.5">Additional payouts not on daily reports</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setManagingVendors(!managingVendors)} className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer transition-colors">
                {managingVendors ? "Done" : "Manage Vendors"}
              </button>
              <button onClick={() => setAddingPayment(!addingPayment)} className="btn btn-primary text-sm">
                {addingPayment ? "Cancel" : "+ Add Payment"}
              </button>
            </div>
          </div>

          <h2 className="font-semibold hidden print:block">Vendor Payments</h2>

          {/* Manage Vendors */}
          {managingVendors && (
            <div className="card p-4 space-y-3 print:hidden">
              <p className="text-sm font-medium">Your Vendors</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New vendor name..."
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddVendor()}
                  className="input flex-1 text-sm"
                />
                <button onClick={handleAddVendor} className="btn btn-primary text-sm">Add</button>
              </div>
              <div className="space-y-1">
                {vendors.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-1">
                    <span className="text-sm">{v.name}</span>
                    <button onClick={() => handleDeleteVendor(v.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">Remove</button>
                  </div>
                ))}
                {vendors.length === 0 && <p className="text-xs text-slate-400">No vendors yet.</p>}
              </div>
            </div>
          )}

          {/* Add Payment Form */}
          {addingPayment && (
            <div className="card p-4 print:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Vendor</label>
                  <select value={paymentForm.vendor_id} onChange={(e) => setPaymentForm(f => ({ ...f, vendor_id: e.target.value }))} className="input">
                    <option value="">Select vendor...</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Amount</label>
                  <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="input" />
                </div>
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Date</label>
                  <input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} className="input" />
                </div>
                <div className="sm:col-span-3">
                  <button onClick={handleAddPayment} className="btn btn-primary">Save Payment</button>
                </div>
              </div>
            </div>
          )}

          {/* Grouped Vendor Payments Table */}
          {Object.keys(groupedPayments).length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(groupedPayments).map(([vendorName, payments]) => {
                    const subtotal = payments.reduce((sum, p) => sum + p.amount, 0);
                    const isExpanded = expandedVendors.has(vendorName);
                    return (
                      <>
                        <tr
                          key={vendorName}
                          className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 print:cursor-default"
                          onClick={() => setExpandedVendors(prev => {
                            const next = new Set(prev);
                            isExpanded ? next.delete(vendorName) : next.add(vendorName);
                            return next;
                          })}
                        >
                          <td className="py-2 px-3 font-medium">
                            <span className="print:hidden text-slate-400 mr-2 text-xs">{isExpanded ? "▾" : "▸"}</span>
                            {vendorName}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">${subtotal.toFixed(2)}</td>
                          <td className="py-2 px-3 print:hidden w-12"></td>
                        </tr>
                        {isExpanded && payments.map(p => (
                          <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1.5 pl-7 pr-3 text-slate-500">{p.payment_date}</td>
                            <td className="py-1.5 px-3 text-right">${p.amount.toFixed(2)}</td>
                            <td className="py-1.5 px-3 text-right print:hidden">
                              <button onClick={(e) => { e.stopPropagation(); handleDeletePayment(p.id); }} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">Delete</button>
                            </td>
                          </tr>
                        ))}
                        {/* Always show rows on print */}
                        {!isExpanded && payments.map(p => (
                          <tr key={`print-${p.id}`} className="border-b border-slate-100 hidden print:table-row">
                            <td className="py-1.5 pl-7 pr-3 text-slate-500">{p.payment_date}</td>
                            <td className="py-1.5 px-3 text-right">${p.amount.toFixed(2)}</td>
                            <td></td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                  <tr className="font-semibold border-t-2 border-slate-300">
                    <td className="py-2 px-3">Total Vendor Payouts</td>
                    <td className="py-2 px-3 text-right">${vendorPayoutTotal.toFixed(2)}</td>
                    <td className="print:hidden"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 print:hidden">No vendor payments this month.</p>
          )}
        </div>
        {/* Lottery — Weekly Invoice */}
        <div className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <div>
              <h2 className="font-semibold">Lottery</h2>
              <p className="text-xs text-slate-400 mt-0.5">Weekly invoice totals — added to income</p>
            </div>
            <button onClick={() => setAddingLottery(!addingLottery)} className="btn btn-primary text-sm">
              {addingLottery ? "Cancel" : "+ Add Week"}
            </button>
          </div>

          <h2 className="font-semibold hidden print:block">Lottery</h2>

          {addingLottery && (
            <div className="card p-4 print:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Week Start</label>
                  <input type="date" value={lotteryForm.week_start} onChange={(e) => setLotteryForm(f => ({ ...f, week_start: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Week End</label>
                  <input type="date" value={lotteryForm.week_end} onChange={(e) => setLotteryForm(f => ({ ...f, week_end: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Amount</label>
                  <input type="number" value={lotteryForm.amount} onChange={(e) => setLotteryForm(f => ({ ...f, amount: e.target.value }))} className="input" placeholder="" />
                </div>
                <div className="sm:col-span-3">
                  <button onClick={handleAddLotteryEntry} className="btn btn-primary">Save</button>
                </div>
              </div>
            </div>
          )}

          {lotteryEntries.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {lotteryEntries.map(e => (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3">{e.week_start} — {e.week_end}</td>
                      <td className="py-2 px-3 text-right font-medium">${e.amount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right print:hidden">
                        <button onClick={() => handleDeleteLotteryEntry(e.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">Delete</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold border-t-2 border-slate-300">
                    <td className="py-2 px-3">Total Lottery</td>
                    <td className="py-2 px-3 text-right">${lotteryTotal.toFixed(2)}</td>
                    <td className="print:hidden"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 print:hidden">No lottery entries this month.</p>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
