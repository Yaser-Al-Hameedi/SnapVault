"use client";
import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface StoreSummary {
  store_id: string;
  store_name: string;
  income: number;
  payouts: number;
  tax: number;
  vendor_total: number;
  lottery_total: number;
  profit: number;
}

async function getToken() {
  const { supabase } = await import("@/lib/supabase");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export default function AnalyticsPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [summaries, setSummaries] = useState<StoreSummary[]>([]);
  const [prevSummaries, setPrevSummaries] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  async function fetchSummaries(month: number, year: number) {
    const token = await getToken();
    if (!token) return [];
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/bookkeeping/summary?month=${month}&year=${year}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function loadData() {
    setLoading(true);
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const [current, prev] = await Promise.all([
      fetchSummaries(selectedMonth, selectedYear),
      fetchSummaries(prevMonth, prevYear),
    ]);
    setSummaries(current);
    setPrevSummaries(prev);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [selectedMonth, selectedYear]);

  function getPrev(storeId: string) {
    return prevSummaries.find(s => s.store_id === storeId);
  }

  function pctChange(current: number, previous: number) {
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }

  function ChangeTag({ current, previous }: { current: number; previous: number }) {
    const pct = pctChange(current, previous);
    if (pct === null) return null;
    const up = pct >= 0;
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
        {up ? "+" : ""}{pct.toFixed(1)}%
      </span>
    );
  }

  const totalIncome = summaries.reduce((s, x) => s + x.income + x.lottery_total, 0);
  const totalProfit = summaries.reduce((s, x) => s + x.profit, 0);
  const totalVendor = summaries.reduce((s, x) => s + x.vendor_total, 0);

  return (
    <ProtectedRoute>
      <main className="container py-12 space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-slate-500 text-sm mt-1">Monthly overview across all stores</p>
          </div>
          <div className="flex gap-3">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="input text-sm">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="input text-sm">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Top-line totals */}
        {summaries.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total Income</p>
              <p className="text-2xl font-bold">${totalIncome.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-0.5">All stores combined</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total Vendor Spend</p>
              <p className="text-2xl font-bold">${totalVendor.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-0.5">All stores combined</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Net Profit</p>
              <p className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-500"}`}>${totalProfit.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-0.5">All stores combined</p>
            </div>
          </div>
        )}

        {/* Per-store cards */}
        {loading ? (
          <div className="text-slate-400 text-sm">Loading...</div>
        ) : summaries.length === 0 ? (
          <div className="text-slate-400 text-sm">No data for this month.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {summaries.map(store => {
              const prev = getPrev(store.store_id);
              const lotteryPct = (store.income + store.lottery_total) > 0
                ? (store.lottery_total / (store.income + store.lottery_total)) * 100
                : 0;

              return (
                <div key={store.store_id} className="card p-6 space-y-5">
                  {/* Store name */}
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg">{store.store_name}</h2>
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${store.profit >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {store.profit >= 0 ? "+" : ""}${store.profit.toFixed(2)} profit
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Store Income</p>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">${store.income.toFixed(2)}</p>
                        {prev && <ChangeTag current={store.income} previous={prev.income} />}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Lottery Income</p>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">${store.lottery_total.toFixed(2)}</p>
                        {prev && <ChangeTag current={store.lottery_total} previous={prev.lottery_total} />}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Daily Payouts</p>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">${store.payouts.toFixed(2)}</p>
                        {prev && <ChangeTag current={store.payouts} previous={prev.payouts} />}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Vendor Spend</p>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">${store.vendor_total.toFixed(2)}</p>
                        {prev && <ChangeTag current={store.vendor_total} previous={prev.vendor_total} />}
                      </div>
                    </div>
                  </div>

                  {/* Lottery % of income bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Lottery as % of total income</span>
                      <span>{lotteryPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-800 rounded-full" style={{ width: `${Math.min(lotteryPct, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
