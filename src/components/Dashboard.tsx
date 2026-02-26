import React, { useState, useEffect } from "react";
import { DashboardStat, Office, ServiceRow } from "../types";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { FileText, CheckCircle2, XCircle, Clock, RefreshCcw, LayoutGrid, Building, X, ArrowRight, Download } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as XLSX from "xlsx";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ["#0ea5e9", "#10b981", "#ef4444", "#f59e0b", "#6366f1"];

interface DashboardProps {
  user: Office;
}

const getInitialFY = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
};

export default function Dashboard({ user }: DashboardProps) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(getInitialFY());
  const [timeframe, setTimeframe] = useState<"monthly" | "yearly">("monthly");
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [corpStats, setCorpStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"office" | "corporation">(user.role === "Admin" ? "corporation" : "office");
  const [selectedOffice, setSelectedOffice] = useState<{ id: number, name: string } | null>(null);
  const [selectedCorp, setSelectedCorp] = useState<{ id: number, name: string } | null>(null);
  const [officeDetails, setOfficeDetails] = useState<ServiceRow[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [month, year, timeframe, user]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const endpoint = timeframe === "monthly" 
        ? `/api/dashboard/${month}?userId=${user.id}&role=${user.role}`
        : `/api/dashboard/yearly/${year}?userId=${user.id}&role=${user.role}`;
      
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setCorpStats(data.corpStats || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOfficeDetails = async (officeId: number, officeName: string) => {
    setSelectedOffice({ id: officeId, name: officeName });
    setLoadingDetails(true);
    try {
      const endpoint = timeframe === "monthly"
        ? `/api/submission/${officeId}/${month}`
        : `/api/submission/yearly/${officeId}/${year}`;
      
      const res = await fetch(endpoint);
      const result = await res.json();
      if (result.success) {
        setOfficeDetails(result.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const downloadExcel = (data: any[], fileName: string, headers: string[]) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  const activeStats = view === "corporation" 
    ? corpStats.map(c => ({ 
        ...c, 
        officeName: c.corporationName,
        off_total: c.offline.total, on_total: c.online.total,
        off_appr: c.offline.approved, on_appr: c.online.approved,
        off_rej: c.offline.rejected, on_rej: c.online.rejected,
        off_pend: c.offline.pending, on_pend: c.online.pending,
        off_sb: c.offline.sendback, on_sb: c.online.sendback
      })) 
    : stats.map(s => ({
        ...s,
        off_total: s.offline.total, on_total: s.online.total,
        off_appr: s.offline.approved, on_appr: s.online.approved,
        off_rej: s.offline.rejected, on_rej: s.online.rejected,
        off_pend: s.offline.pending, on_pend: s.online.pending,
        off_sb: s.offline.sendback, on_sb: s.online.sendback
      }));

  const totals = stats.reduce((acc, curr) => ({
    total: acc.total + (curr.total || 0),
    approved: acc.approved + (curr.approved || 0),
    rejected: acc.rejected + (curr.rejected || 0),
    pending: acc.pending + (curr.pending || 0),
    sendback: acc.sendback + (curr.sendback || 0),
  }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

  const offlineTotals = activeStats.reduce((acc, curr) => ({
    total: acc.total + (curr.off_total || 0),
    approved: acc.approved + (curr.off_appr || 0),
    rejected: acc.rejected + (curr.off_rej || 0),
    pending: acc.pending + (curr.off_pend || 0),
    sendback: acc.sendback + (curr.off_sb || 0),
  }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

  const onlineTotals = activeStats.reduce((acc, curr) => ({
    total: acc.total + (curr.on_total || 0),
    approved: acc.approved + (curr.on_appr || 0),
    rejected: acc.rejected + (curr.on_rej || 0),
    pending: acc.pending + (curr.on_pend || 0),
    sendback: acc.sendback + (curr.on_sb || 0),
  }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

  const grandTotals = activeStats.reduce((acc, curr) => ({
    total: acc.total + (curr.total || 0),
    approved: acc.approved + (curr.approved || 0),
    rejected: acc.rejected + (curr.rejected || 0),
    pending: acc.pending + (curr.pending || 0),
    sendback: acc.sendback + (curr.sendback || 0),
  }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

  const pieData = [
    { name: "Approved", value: totals.approved },
    { name: "Rejected", value: totals.rejected },
    { name: "Pending", value: totals.pending },
    { name: "Sendback", value: totals.sendback },
  ].filter(d => d.value > 0);

  // Calculate common Y-axis max for comparability with rounding to nearest nice interval
  const rawMax = Math.max(
    ...activeStats.flatMap(s => [
      s.off_total, s.on_total, 
      s.off_appr, s.on_appr, 
      s.off_rej, s.on_rej, 
      s.off_pend, s.on_pend, 
      s.off_sb, s.on_sb
    ]),
    10 // Minimum scale
  );

  // Round up to nearest nice interval (10, 50, 100, 500, 1000...)
  const getNiceMax = (val: number) => {
    if (val === 0) return 10;
    const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
    const firstDigit = val / magnitude;
    let step;
    if (firstDigit < 2) step = 2;
    else if (firstDigit < 5) step = 5;
    else step = 10;
    return Math.ceil(val / (step * magnitude / 10)) * (step * magnitude / 10);
  };
  
  const yAxisMax = getNiceMax(rawMax * 1.1);

  // Custom tick for wrapping text
  const WrappedTick = (props: any) => {
    const { x, y, payload } = props;
    const words = payload.value.split(' ');
    const lines: string[] = [];
    let currentLine = "";
    
    words.forEach((word: string) => {
      if ((currentLine + word).length > 12) {
        lines.push(currentLine);
        currentLine = word + " ";
      } else {
        currentLine += word + " ";
      }
    });
    lines.push(currentLine);

    return (
      <g transform={`translate(${x},${y})`}>
        {lines.map((line, i) => (
          <text
            key={i}
            x={0}
            y={i * 12}
            dy={12}
            textAnchor="middle"
            fill="#666"
            fontSize={10}
            className="font-medium"
          >
            {line}
          </text>
        ))}
      </g>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Performance Dashboard</h1>
          <p className="text-stone-500">
            {user.role === "Admin" ? "Full System Overview" : 
             user.role === "Corporation" ? `Corporation Overview: ${user.name}` : 
             `Office Overview: ${user.name}`} for {timeframe === "monthly" ? month : year}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-stone-100 p-1 rounded-lg border border-stone-200">
            <button
              onClick={() => setTimeframe("monthly")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                timeframe === "monthly" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setTimeframe("yearly")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                timeframe === "yearly" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Yearly
            </button>
          </div>

          {user.role === "Admin" && (
            <div className="flex bg-stone-100 p-1 rounded-lg border border-stone-200">
              <button
                onClick={() => setView("corporation")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  view === "corporation" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                Corporations
              </button>
              <button
                onClick={() => setView("office")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  view === "office" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Offices
              </button>
            </div>
          )}

          {timeframe === "monthly" ? (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-4 py-2 bg-white border border-stone-200 rounded-lg shadow-sm outline-none text-sm"
            />
          ) : (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-4 py-2 bg-white border border-stone-200 rounded-lg shadow-sm outline-none text-sm"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = new Date().getFullYear() - i;
                return `${y}-${(y + 1).toString().slice(-2)}`;
              }).map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard icon={<FileText className="text-blue-500" />} label="Total" value={totals.total} color="blue" />
        <StatCard icon={<CheckCircle2 className="text-emerald-500" />} label="Approved" value={totals.approved} color="emerald" />
        <StatCard icon={<XCircle className="text-red-500" />} label="Rejected" value={totals.rejected} color="red" />
        <StatCard icon={<Clock className="text-amber-500" />} label="Pending" value={totals.pending} color="amber" />
        <StatCard icon={<RefreshCcw className="text-indigo-500" />} label="Sendback" value={totals.sendback} color="indigo" />
      </div>

      <div className="grid grid-cols-1 gap-8 mb-12">
        {/* Offline Bar Chart */}
        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              Offline Applications Comparison
            </h3>
            <div className="flex items-center gap-1 text-[10px] uppercase font-bold">
              <div className="w-2 h-2 rounded-full bg-stone-800"></div> Offline Mode
            </div>
          </div>
          <div className="h-[450px] w-full overflow-x-auto">
            <div style={{ minWidth: activeStats.length * 150 }}>
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={activeStats} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis 
                    dataKey="officeName" 
                    axisLine={false} 
                    tickLine={false} 
                    interval={0}
                    tick={<WrappedTick />}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, yAxisMax]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '11px' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px' }} />
                  <Bar dataKey="off_total" name="Total" fill="#1e293b" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="off_appr" name="Approved" fill="#059669" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="off_pend" name="Pending" fill="#d97706" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="off_rej" name="Rejected" fill="#dc2626" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="off_sb" name="Sendback" fill="#4f46e5" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Online Bar Chart */}
        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              Online Applications Comparison
            </h3>
            <div className="flex items-center gap-1 text-[10px] uppercase font-bold">
              <div className="w-2 h-2 rounded-full bg-stone-400"></div> Online Mode
            </div>
          </div>
          <div className="h-[450px] w-full overflow-x-auto">
            <div style={{ minWidth: activeStats.length * 150 }}>
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={activeStats} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis 
                    dataKey="officeName" 
                    axisLine={false} 
                    tickLine={false} 
                    interval={0}
                    tick={<WrappedTick />}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, yAxisMax]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '11px' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px' }} />
                  <Bar dataKey="on_total" name="Total" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="on_appr" name="Approved" fill="#6ee7b7" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="on_pend" name="Pending" fill="#fcd34d" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="on_rej" name="Rejected" fill="#fca5a5" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="on_sb" name="Sendback" fill="#a5b4fc" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Tables */}
      <div className="space-y-12">
        {/* Offline Summary Table */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
            <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
              Offline Summary Table
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadExcel(activeStats.map(s => ({ Name: s.officeName, Total: s.off_total, Approved: s.off_appr, Rejected: s.off_rej, Pending: s.off_pend, Sendback: s.off_sb })), "Offline_Summary", ["Name", "Total", "Approved", "Rejected", "Pending", "Sendback"])}
                className="p-1.5 hover:bg-stone-200 rounded-md transition-colors text-stone-500"
                title="Download Excel"
              >
                <Download className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-stone-900"></div>
                <span className="text-[10px] text-stone-400 font-bold uppercase">Offline Mode</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50 text-stone-500 text-[10px] font-bold uppercase tracking-wider border-b border-stone-100">
                  <th className="px-6 py-4">{view === "corporation" ? "Corporation Name" : "Office Name"}</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Approved</th>
                  <th className="px-6 py-4">Rejected</th>
                  <th className="px-6 py-4">Pending</th>
                  <th className="px-6 py-4">Sendback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {activeStats.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors cursor-pointer group" onClick={() => {
                    if (view === "office") {
                      const office = stats.find(s => s.officeName === stat.officeName);
                      if (office) fetchOfficeDetails(office.officeId, office.officeName);
                    } else if (view === "corporation") {
                      setSelectedCorp({ id: stat.corporationId, name: stat.officeName });
                    }
                  }}>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900 flex items-center gap-2">
                      {stat.officeName}
                      <ArrowRight className="w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-900 font-bold">{stat.off_total || 0}</td>
                    <td className="px-6 py-4 text-sm text-emerald-600 font-semibold">{stat.off_appr || 0}</td>
                    <td className="px-6 py-4 text-sm text-red-600 font-semibold">{stat.off_rej || 0}</td>
                    <td className="px-6 py-4 text-sm text-amber-600 font-semibold">{stat.off_pend || 0}</td>
                    <td className="px-6 py-4 text-sm text-indigo-600 font-semibold">{stat.off_sb || 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-stone-50 border-t border-stone-200">
                <tr className="font-bold text-stone-900">
                  <td className="px-6 py-4 text-sm uppercase tracking-wider">Total</td>
                  <td className="px-6 py-4 text-sm">{offlineTotals.total}</td>
                  <td className="px-6 py-4 text-sm text-emerald-600">{offlineTotals.approved}</td>
                  <td className="px-6 py-4 text-sm text-red-600">{offlineTotals.rejected}</td>
                  <td className="px-6 py-4 text-sm text-amber-600">{offlineTotals.pending}</td>
                  <td className="px-6 py-4 text-sm text-indigo-600">{offlineTotals.sendback}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Online Summary Table */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
            <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
              Online Summary Table
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadExcel(activeStats.map(s => ({ Name: s.officeName, Total: s.on_total, Approved: s.on_appr, Rejected: s.on_rej, Pending: s.on_pend, Sendback: s.on_sb })), "Online_Summary", ["Name", "Total", "Approved", "Rejected", "Pending", "Sendback"])}
                className="p-1.5 hover:bg-stone-200 rounded-md transition-colors text-stone-500"
                title="Download Excel"
              >
                <Download className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-stone-400"></div>
                <span className="text-[10px] text-stone-400 font-bold uppercase">Online Mode</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50 text-stone-500 text-[10px] font-bold uppercase tracking-wider border-b border-stone-100">
                  <th className="px-6 py-4">{view === "corporation" ? "Corporation Name" : "Office Name"}</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Approved</th>
                  <th className="px-6 py-4">Rejected</th>
                  <th className="px-6 py-4">Pending</th>
                  <th className="px-6 py-4">Sendback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {activeStats.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors cursor-pointer group" onClick={() => {
                    if (view === "office") {
                      const office = stats.find(s => s.officeName === stat.officeName);
                      if (office) fetchOfficeDetails(office.officeId, office.officeName);
                    } else if (view === "corporation") {
                      setSelectedCorp({ id: stat.corporationId, name: stat.officeName });
                    }
                  }}>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900 flex items-center gap-2">
                      {stat.officeName}
                      <ArrowRight className="w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-900 font-bold">{stat.on_total || 0}</td>
                    <td className="px-6 py-4 text-sm text-emerald-600 font-semibold">{stat.on_appr || 0}</td>
                    <td className="px-6 py-4 text-sm text-red-600 font-semibold">{stat.on_rej || 0}</td>
                    <td className="px-6 py-4 text-sm text-amber-600 font-semibold">{stat.on_pend || 0}</td>
                    <td className="px-6 py-4 text-sm text-indigo-600 font-semibold">{stat.on_sb || 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-stone-50 border-t border-stone-200">
                <tr className="font-bold text-stone-900">
                  <td className="px-6 py-4 text-sm uppercase tracking-wider">Total</td>
                  <td className="px-6 py-4 text-sm">{onlineTotals.total}</td>
                  <td className="px-6 py-4 text-sm text-emerald-600">{onlineTotals.approved}</td>
                  <td className="px-6 py-4 text-sm text-red-600">{onlineTotals.rejected}</td>
                  <td className="px-6 py-4 text-sm text-amber-600">{onlineTotals.pending}</td>
                  <td className="px-6 py-4 text-sm text-indigo-600">{onlineTotals.sendback}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Grand Total Summary Table */}
        <div className="bg-stone-900 rounded-xl border border-stone-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-stone-800 flex justify-between items-center bg-stone-950/50">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Grand Total Summary Table (Offline + Online)
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadExcel(activeStats.map(s => ({ Name: s.officeName, Total: s.total, Approved: s.approved, Rejected: s.rejected, Pending: s.pending, Sendback: s.sendback })), "Grand_Total_Summary", ["Name", "Total", "Approved", "Rejected", "Pending", "Sendback"])}
                className="p-1.5 hover:bg-stone-800 rounded-md transition-colors text-stone-400 hover:text-white"
                title="Download Excel"
              >
                <Download className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-[10px] text-stone-400 font-bold uppercase">Combined Data</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-950 text-stone-400 text-[10px] font-bold uppercase tracking-wider border-b border-stone-800">
                  <th className="px-6 py-4">{view === "corporation" ? "Corporation Name" : "Office Name"}</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Approved</th>
                  <th className="px-6 py-4">Rejected</th>
                  <th className="px-6 py-4">Pending</th>
                  <th className="px-6 py-4">Sendback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800">
                {activeStats.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-stone-800/50 transition-colors cursor-pointer group" onClick={() => {
                    if (view === "office") {
                      const office = stats.find(s => s.officeName === stat.officeName);
                      if (office) fetchOfficeDetails(office.officeId, office.officeName);
                    } else if (view === "corporation") {
                      setSelectedCorp({ id: stat.corporationId, name: stat.officeName });
                    }
                  }}>
                    <td className="px-6 py-4 text-sm font-medium text-white flex items-center gap-2">
                      {stat.officeName}
                      <ArrowRight className="w-3 h-3 text-stone-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-bold">{stat.total || 0}</td>
                    <td className="px-6 py-4 text-sm text-emerald-400 font-semibold">{stat.approved || 0}</td>
                    <td className="px-6 py-4 text-sm text-red-400 font-semibold">{stat.rejected || 0}</td>
                    <td className="px-6 py-4 text-sm text-amber-400 font-semibold">{stat.pending || 0}</td>
                    <td className="px-6 py-4 text-sm text-indigo-400 font-semibold">{stat.sendback || 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-stone-950 border-t border-stone-800">
                <tr className="font-bold text-white">
                  <td className="px-6 py-4 text-sm uppercase tracking-wider">Total</td>
                  <td className="px-6 py-4 text-sm">{grandTotals.total}</td>
                  <td className="px-6 py-4 text-sm text-emerald-400">{grandTotals.approved}</td>
                  <td className="px-6 py-4 text-sm text-red-400">{grandTotals.rejected}</td>
                  <td className="px-6 py-4 text-sm text-amber-400">{grandTotals.pending}</td>
                  <td className="px-6 py-4 text-sm text-indigo-400">{grandTotals.sendback}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Corporation Drill-down Modal */}
      {selectedCorp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <div>
                <h2 className="text-xl font-bold text-stone-900">{selectedCorp.name}</h2>
                <p className="text-sm text-stone-500">Office-wise breakdown for {timeframe === "monthly" ? month : year}</p>
              </div>
              <button onClick={() => setSelectedCorp(null)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-stone-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex justify-end bg-stone-50/30">
                  <button
                    onClick={() => {
                      const corpOffices = stats.filter(s => s.corporationId === selectedCorp.id);
                      downloadExcel(corpOffices.map(o => ({ Name: o.officeName, Total: o.total, Approved: o.approved, Rejected: o.rejected, Pending: o.pending, Sendback: o.sendback })), `${selectedCorp.name}_Breakdown`, ["Name", "Total", "Approved", "Rejected", "Pending", "Sendback"]);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-600 hover:bg-stone-50 transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Excel
                  </button>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 text-[10px] font-bold uppercase tracking-wider border-b border-stone-100">
                      <th className="px-6 py-4">Office Name</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Approved</th>
                      <th className="px-6 py-4">Rejected</th>
                      <th className="px-6 py-4">Pending</th>
                      <th className="px-6 py-4">Sendback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {stats.filter(s => s.corporationId === selectedCorp.id).map((office, idx) => (
                      <tr key={idx} className="hover:bg-stone-50 transition-colors cursor-pointer group" onClick={() => fetchOfficeDetails(office.officeId, office.officeName)}>
                        <td className="px-6 py-4 text-sm font-medium text-stone-900 flex items-center gap-2">
                          {office.officeName}
                          <ArrowRight className="w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </td>
                        <td className="px-6 py-4 text-sm text-stone-900 font-bold">{office.total}</td>
                        <td className="px-6 py-4 text-sm text-emerald-600 font-semibold">{office.approved}</td>
                        <td className="px-6 py-4 text-sm text-red-600 font-semibold">{office.rejected}</td>
                        <td className="px-6 py-4 text-sm text-amber-600 font-semibold">{office.pending}</td>
                        <td className="px-6 py-4 text-sm text-indigo-600 font-semibold">{office.sendback}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-stone-50 border-t border-stone-200">
                    <tr className="font-bold text-stone-900">
                      <td className="px-6 py-4 text-sm uppercase tracking-wider">Total</td>
                      {(() => {
                        const filtered = stats.filter(s => s.corporationId === selectedCorp.id);
                        const t = filtered.reduce((acc, curr) => ({
                          total: acc.total + curr.total,
                          approved: acc.approved + curr.approved,
                          rejected: acc.rejected + curr.rejected,
                          pending: acc.pending + curr.pending,
                          sendback: acc.sendback + curr.sendback,
                        }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });
                        return (
                          <>
                            <td className="px-6 py-4 text-sm">{t.total}</td>
                            <td className="px-6 py-4 text-sm text-emerald-600">{t.approved}</td>
                            <td className="px-6 py-4 text-sm text-red-600">{t.rejected}</td>
                            <td className="px-6 py-4 text-sm text-amber-600">{t.pending}</td>
                            <td className="px-6 py-4 text-sm text-indigo-600">{t.sendback}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedOffice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <div>
                <h2 className="text-xl font-bold text-stone-900">{selectedOffice.name}</h2>
                <p className="text-sm text-stone-500">Service-wise breakdown for {timeframe === "monthly" ? month : year}</p>
              </div>
              <button 
                onClick={() => {
                  setSelectedOffice(null);
                  setOfficeDetails(null);
                }}
                className="p-2 hover:bg-stone-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-stone-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {loadingDetails ? (
                <div className="h-64 flex items-center justify-center">
                  <RefreshCcw className="w-8 h-8 animate-spin text-stone-300" />
                </div>
              ) : officeDetails ? (
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-stone-100 flex justify-end bg-stone-50/30">
                    <button
                      onClick={() => {
                        const exportData = officeDetails.map(row => ({
                          Service: row.serviceName,
                          "Off Total": row.offline.total, "Off Appr": row.offline.approved, "Off Rej": row.offline.rejected, "Off Pend": row.offline.pending, "Off SB": row.offline.sendback,
                          "On Total": row.online.total, "On Appr": row.online.approved, "On Rej": row.online.rejected, "On Pend": row.online.pending, "On SB": row.online.sendback
                        }));
                        downloadExcel(exportData, `${selectedOffice.name}_Service_Breakdown`, ["Service", "Off Total", "Off Appr", "Off Rej", "Off Pend", "Off SB", "On Total", "On Appr", "On Rej", "On Pend", "On SB"]);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-600 hover:bg-stone-50 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Excel
                    </button>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-stone-50 text-stone-500 text-[10px] font-bold uppercase tracking-wider border-b border-stone-100">
                        <th className="px-6 py-4 sticky left-0 bg-stone-50">Service Name</th>
                        <th className="px-6 py-4 text-center bg-stone-100/50" colSpan={5}>Offline Applications</th>
                        <th className="px-6 py-4 text-center bg-blue-50/50" colSpan={5}>Online Applications</th>
                      </tr>
                      <tr className="bg-stone-50 text-stone-400 text-[9px] font-bold uppercase tracking-wider border-b border-stone-100">
                        <th className="px-6 py-2 sticky left-0 bg-stone-50"></th>
                        <th className="px-4 py-2 bg-stone-100/30">Total</th>
                        <th className="px-4 py-2 bg-stone-100/30">Appr</th>
                        <th className="px-4 py-2 bg-stone-100/30">Rej</th>
                        <th className="px-4 py-2 bg-stone-100/30">Pend</th>
                        <th className="px-4 py-2 bg-stone-100/30">SB</th>
                        <th className="px-4 py-2 bg-blue-50/20">Total</th>
                        <th className="px-4 py-2 bg-blue-50/20">Appr</th>
                        <th className="px-4 py-2 bg-blue-50/20">Rej</th>
                        <th className="px-4 py-2 bg-blue-50/20">Pend</th>
                        <th className="px-4 py-2 bg-blue-50/20">SB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {officeDetails.map((row, idx) => (
                        <tr key={idx} className="hover:bg-stone-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-stone-900 sticky left-0 bg-white">{row.serviceName}</td>
                          <td className="px-4 py-4 text-sm text-stone-900 font-bold bg-stone-50/30">{row.offline.total}</td>
                          <td className="px-4 py-4 text-sm text-emerald-600 font-semibold bg-stone-50/30">{row.offline.approved}</td>
                          <td className="px-4 py-4 text-sm text-red-600 font-semibold bg-stone-50/30">{row.offline.rejected}</td>
                          <td className="px-4 py-4 text-sm text-amber-600 font-semibold bg-stone-50/30">{row.offline.pending}</td>
                          <td className="px-4 py-4 text-sm text-indigo-600 font-semibold bg-stone-50/30">{row.offline.sendback}</td>
                          <td className="px-4 py-4 text-sm text-stone-900 font-bold bg-blue-50/10">{row.online.total}</td>
                          <td className="px-4 py-4 text-sm text-emerald-600 font-semibold bg-blue-50/10">{row.online.approved}</td>
                          <td className="px-4 py-4 text-sm text-red-600 font-semibold bg-blue-50/10">{row.online.rejected}</td>
                          <td className="px-4 py-4 text-sm text-amber-600 font-semibold bg-blue-50/10">{row.online.pending}</td>
                          <td className="px-4 py-4 text-sm text-indigo-600 font-semibold bg-blue-50/10">{row.online.sendback}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-stone-50 border-t border-stone-200">
                      <tr className="font-bold text-stone-900">
                        <td className="px-6 py-4 text-sm uppercase tracking-wider sticky left-0 bg-stone-50">Total</td>
                        {(() => {
                          const t = officeDetails.reduce((acc, curr) => ({
                            off_total: acc.off_total + curr.offline.total,
                            off_appr: acc.off_appr + curr.offline.approved,
                            off_rej: acc.off_rej + curr.offline.rejected,
                            off_pend: acc.off_pend + curr.offline.pending,
                            off_sb: acc.off_sb + curr.offline.sendback,
                            on_total: acc.on_total + curr.online.total,
                            on_appr: acc.on_appr + curr.online.approved,
                            on_rej: acc.on_rej + curr.online.rejected,
                            on_pend: acc.on_pend + curr.online.pending,
                            on_sb: acc.on_sb + curr.online.sendback,
                          }), { off_total: 0, off_appr: 0, off_rej: 0, off_pend: 0, off_sb: 0, on_total: 0, on_appr: 0, on_rej: 0, on_pend: 0, on_sb: 0 });
                          return (
                            <>
                              <td className="px-4 py-4 text-sm bg-stone-100/30">{t.off_total}</td>
                              <td className="px-4 py-4 text-sm text-emerald-600 bg-stone-100/30">{t.off_appr}</td>
                              <td className="px-4 py-4 text-sm text-red-600 bg-stone-100/30">{t.off_rej}</td>
                              <td className="px-4 py-4 text-sm text-amber-600 bg-stone-100/30">{t.off_pend}</td>
                              <td className="px-4 py-4 text-sm text-indigo-600 bg-stone-100/30">{t.off_sb}</td>
                              <td className="px-4 py-4 text-sm bg-blue-50/10">{t.on_total}</td>
                              <td className="px-4 py-4 text-sm text-emerald-600 bg-blue-50/10">{t.on_appr}</td>
                              <td className="px-4 py-4 text-sm text-red-600 bg-blue-50/10">{t.on_rej}</td>
                              <td className="px-4 py-4 text-sm text-amber-600 bg-blue-50/10">{t.on_pend}</td>
                              <td className="px-4 py-4 text-sm text-indigo-600 bg-blue-50/10">{t.on_sb}</td>
                            </>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-stone-400 italic">
                  No detailed data found for this period.
                </div>
              )}
            </div>
            
            <div className="p-6 bg-stone-50 border-t border-stone-100 flex justify-end">
              <button 
                onClick={() => {
                  setSelectedOffice(null);
                  setOfficeDetails(null);
                }}
                className="px-6 py-2 bg-stone-900 text-white font-semibold rounded-lg hover:bg-stone-800 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-lg bg-${color}-50`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-stone-900">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
