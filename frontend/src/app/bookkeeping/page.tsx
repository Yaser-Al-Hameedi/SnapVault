"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

interface Store {
  id: string;
  name: string;
}

async function getToken() {
  const { supabase } = await import("@/lib/supabase");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export default function BookkeepingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const allowedUsers = (process.env.NEXT_PUBLIC_BOOKKEEPING_USER_IDS || "").split(",");

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchStores() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setStores(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const store = await res.json();
    setStores(s => [...s, store]);
    setNewName("");
    setCreating(false);
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setStores(s => s.filter(store => store.id !== id));
    setDeletingId(null);
  }

  useEffect(() => { fetchStores(); }, []);

  if (!allowedUsers.includes(user?.id || "")) {
    return (
      <ProtectedRoute>
        <div className="container py-8 text-slate-500">Access denied.</div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="container py-12 space-y-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookkeeping</h1>
          <p className="text-slate-500 text-sm mt-1">Select a store to view its records</p>
        </div>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading stores...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {stores.map(store => (
              <div key={store.id} className="relative group">
                {deletingId === store.id ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex flex-col items-center justify-center gap-3 h-40">
                    <p className="text-sm text-red-700 font-medium">Delete &ldquo;{store.name}&rdquo;?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDelete(store.id)}
                        className="btn btn-primary bg-red-600 text-xs px-4 py-1.5"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-slate-500 text-xs hover:text-slate-900 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => router.push(`/bookkeeping/${store.id}`)}
                    className="w-full text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-900 hover:border-slate-900 hover:text-white p-6 h-40 flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-xl cursor-pointer group"
                  >
                    <span className="text-xs font-medium uppercase tracking-widest text-slate-400 group-hover:text-slate-400">
                      Store
                    </span>
                    <div>
                      <p className="text-xl font-bold">{store.name}</p>
                      <p className="text-sm text-slate-400 group-hover:text-slate-400 mt-1">
                        View records →
                      </p>
                    </div>
                  </button>
                )}
                {deletingId !== store.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingId(store.id); }}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-sm font-bold cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {/* New Store card */}
            {creating ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 h-40 flex flex-col justify-center gap-3">
                <input
                  autoFocus
                  type="text"
                  placeholder="Store name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="input text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={handleCreate} className="btn btn-primary text-xs px-4 py-1.5">
                    Create
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); }}
                    className="text-slate-400 text-xs hover:text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="rounded-2xl border-2 border-dashed border-slate-200 h-40 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-slate-700 hover:border-slate-400 transition-all duration-200 cursor-pointer w-full"
              >
                <span className="text-3xl font-light">+</span>
                <span className="text-sm font-medium">New Store</span>
              </button>
            )}
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
