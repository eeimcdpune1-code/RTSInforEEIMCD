import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FileEdit, LogOut, Building2, Key, X, RefreshCcw, XCircle, CheckCircle2 } from "lucide-react";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import DataEntry from "./components/DataEntry";
import { Office } from "./types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<Office | null>(() => {
    const saved = localStorage.getItem("office_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const handleLogin = (office: Office) => {
    setUser(office);
    localStorage.setItem("office_user", JSON.stringify(office));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("office_user");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordForm.new.length < 4) {
      setPasswordError("Password must be at least 4 characters");
      return;
    }

    setPasswordLoading(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new
        })
      });
      const data = await res.json();
      if (data.success) {
        setPasswordSuccess("Password updated successfully!");
        setPasswordForm({ current: "", new: "", confirm: "" });
        setTimeout(() => setIsChangingPassword(false), 2000);
      } else {
        setPasswordError(data.message || "Failed to update password");
      }
    } catch (err) {
      setPasswordError("Network error. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-stone-50 flex flex-col">
        {/* Navigation */}
        <nav className="bg-white border-b border-stone-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <div className="bg-stone-900 p-1.5 rounded-lg">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-stone-900 hidden sm:block">OfficeReport</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <NavLink to="/dashboard" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
                  {user.role !== "Corporation" && (
                    <NavLink to="/entry" icon={<FileEdit className="w-4 h-4" />} label="Data Entry" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold text-stone-900">{user.name}</span>
                  <span className="text-[10px] text-stone-400 uppercase tracking-widest">{user.role} Account</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsChangingPassword(true)}
                    className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                    title="Change Password"
                  >
                    <Key className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1">
          <Routes>
            <Route path="/dashboard" element={<Dashboard user={user} />} />
            <Route path="/entry" element={user.role !== "Corporation" ? <DataEntry office={user} /> : <Navigate to="/dashboard" replace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>

        {/* Change Password Modal */}
        {isChangingPassword && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-stone-900" />
                  <h2 className="text-lg font-bold text-stone-900">Change Password</h2>
                </div>
                <button onClick={() => setIsChangingPassword(false)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>
              
              <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                {passwordError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {passwordSuccess}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Current Password</label>
                  <input
                    type="password"
                    required
                    value={passwordForm.current}
                    onChange={e => setPasswordForm(prev => ({ ...prev, current: e.target.value }))}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">New Password</label>
                  <input
                    type="password"
                    required
                    value={passwordForm.new}
                    onChange={e => setPasswordForm(prev => ({ ...prev, new: e.target.value }))}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={passwordForm.confirm}
                    onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-3 bg-stone-900 text-white font-bold rounded-lg hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {passwordLoading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : "Update Password"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="bg-white border-t border-stone-200 py-6">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-widest">
              &copy; {new Date().getFullYear()} Office Reporting System • Secure Data Collection
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
        isActive 
          ? "bg-stone-100 text-stone-900" 
          : "text-stone-500 hover:text-stone-900 hover:bg-stone-50"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
