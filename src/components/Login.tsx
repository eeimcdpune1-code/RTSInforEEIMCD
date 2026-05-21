import React, { useState, useEffect } from "react";
import { Lock, User, Loader2 } from "lucide-react";

interface LoginProps {
  onLogin: (office: { id: number; name: string }) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [offices, setOffices] = useState<{ id: number; name: string }[]>([]);
  const [officeName, setOfficeName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingOffices, setFetchingOffices] = useState(true);

  useEffect(() => {
    const fetchOffices = async () => {
      try {
        const res = await fetch("/api/offices");
        const data = await res.json();
        if (data.success) {
          setOffices(data.offices);
          if (data.offices.length > 0) {
            setOfficeName(data.offices[0].name);
          }
        } else {
          setError("Failed to load offices from Google Sheets");
        }
      } catch (err) {
        setError("Failed to connect to server");
      } finally {
        setFetchingOffices(false);
      }
    };
    fetchOffices();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeName, password }),
      });
      const data = await res.json();
      if (data.success) {
        onLogin(data.office);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-stone-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-stone-900">RTS Information System</h1>
          <p className="text-stone-500 text-sm mt-1">Please sign in to your office account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
              Select Office
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <select
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                disabled={fetchingOffices}
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all appearance-none disabled:opacity-50"
              >
                {fetchingOffices ? (
                  <option>Loading offices...</option>
                ) : (
                  offices.map((off) => (
                    <option key={off.id} value={off.name}>
                      {off.name}
                    </option>
                  ))
                )}
              </select>
              {fetchingOffices && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || fetchingOffices}
            className="w-full py-3 bg-stone-900 text-white font-semibold rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

      </div>
    </div>
  );
}
