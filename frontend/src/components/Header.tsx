"use client";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/auth");
  }

  return (
    <header className="border-b bg-white/70 backdrop-blur">
      <div className="container h-14 flex items-center justify-between">
        <span className="text-lg font-semibold">SnapVault</span>
        <nav className="text-sm space-x-6">
          {user ? (
            <>
              <Link href="/" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
              <Link href="/documents" className="text-slate-600 hover:text-slate-900">Documents</Link>
              <button onClick={handleSignOut} className="text-slate-600 hover:text-slate-900">
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/auth" className="text-slate-600 hover:text-slate-900">Login</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
