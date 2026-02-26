import React, { useState, useEffect } from "react";
import { SERVICES } from "../constants";
import { ServiceRow, Office, ApplicationCounts } from "../types";
import { Save, CheckCircle, AlertCircle, Loader2, ClipboardPaste } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DataEntryProps {
  office: Office;
}

export default function DataEntry({ office }: DataEntryProps) {
  const [selectedOfficeId, setSelectedOfficeId] = useState<number>(office.id);
  const [offices, setOffices] = useState<{ id: number; name: string }[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<ServiceRow[]>(
    SERVICES.map((name) => ({
      serviceName: name,
      offline: { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 },
      online: { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 },
    }))
  );
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    if (office.role === "Admin") {
      const fetchOffices = async () => {
        try {
          const res = await fetch("/api/offices");
          const data = await res.json();
          if (data.success) {
            setOffices(data.offices.filter((o: any) => o.role === "Office"));
          }
        } catch (err) {
          console.error("Failed to fetch offices", err);
        }
      };
      fetchOffices();
    }
  }, [office.role]);

  useEffect(() => {
    fetchExistingData();
  }, [month, selectedOfficeId]);

  const fetchExistingData = async () => {
    setFetching(true);
    try {
      const res = await fetch(`/api/submission/${selectedOfficeId}/${month}`);
      const result = await res.json();
      if (result.success && result.data) {
        setRows(result.data);
      } else {
        setRows(SERVICES.map((name) => ({
          serviceName: name,
          offline: { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 },
          online: { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 },
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  const handleInputChange = (
    serviceIndex: number,
    type: "offline" | "online",
    field: keyof ServiceRow["offline"],
    value: string
  ) => {
    const numValue = value === "" ? 0 : parseInt(value);
    const newRows = [...rows];
    const target = newRows[serviceIndex][type];
    
    // Update the specific field
    target[field] = isNaN(numValue) ? 0 : numValue;
    
    // Auto-calculate Total
    if (field !== "total") {
      target.total = (target.approved || 0) + (target.rejected || 0) + (target.pending || 0) + (target.sendback || 0);
    }
    
    setRows(newRows);
  };

  const handlePaste = () => {
    try {
      const lines = pasteText.trim().split("\n");
      const newRows = [...rows];
      
      // Check if first line is a header row (contains non-numeric data in data columns)
      let startLine = 0;
      const firstLineCells = lines[0].split("\t");
      if (isNaN(parseInt(firstLineCells[1])) && isNaN(parseInt(firstLineCells[2]))) {
        startLine = 1;
      }

      lines.slice(startLine).forEach((line, index) => {
        if (index >= SERVICES.length) return;
        
        const cells = line.split("\t");
        // Expected format: Header Column (Service Name) + 4 offline + 4 online (No Totals)
        // Total 9 columns
        let dataCells = cells;
        if (cells.length === 9) {
          dataCells = cells.slice(1);
        } else if (cells.length === 8) {
          dataCells = cells;
        } else {
          return;
        }

        const offlineData = dataCells.slice(0, 4).map(v => parseInt(v) || 0);
        const onlineData = dataCells.slice(4, 8).map(v => parseInt(v) || 0);

        newRows[index].offline = {
          approved: offlineData[0],
          rejected: offlineData[1],
          pending: offlineData[2],
          sendback: offlineData[3],
          total: offlineData[0] + offlineData[1] + offlineData[2] + offlineData[3]
        };
        newRows[index].online = {
          approved: onlineData[0],
          rejected: onlineData[1],
          pending: onlineData[2],
          sendback: onlineData[3],
          total: onlineData[0] + onlineData[1] + onlineData[2] + onlineData[3]
        };
      });

      setRows(newRows);
      setShowPasteModal(false);
      setPasteText("");
      setStatus({ type: "success", message: "Data pasted from Excel successfully! Totals were auto-calculated." });
    } catch (err) {
      setStatus({ type: "error", message: "Failed to parse pasted data. Ensure it's copied from Excel with 8 data columns (4 offline, 4 online)." });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    // Validation
    const invalidRows = rows.filter(row => {
      const offSum = row.offline.approved + row.offline.rejected + row.offline.pending + row.offline.sendback;
      const onSum = row.online.approved + row.online.rejected + row.online.pending + row.online.sendback;
      return offSum > row.offline.total || onSum > row.online.total;
    });

    if (invalidRows.length > 0) {
      setLoading(false);
      setStatus({ 
        type: "error", 
        message: `Validation Error: In some rows, the sum of Approved, Rejected, Pending, and Sent Back exceeds the Total applications.` 
      });
      return;
    }

    const maxRetries = 3;
    let attempt = 0;

    const performSubmit = async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ officeId: selectedOfficeId, month, data: rows }),
        });
        const data = await res.json();
        if (data.success) {
          setStatus({ type: "success", message: "Data saved successfully!" });
          return true;
        } else {
          throw new Error(data.message || "Server error");
        }
      } catch (err: any) {
        attempt++;
        if (attempt < maxRetries) {
          setStatus({ type: "error", message: `Save failed. Retrying... (Attempt ${attempt + 1}/${maxRetries})` });
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          return performSubmit();
        }
        setStatus({ type: "error", message: err.message || "Failed to save data after multiple attempts. Please check your connection." });
        return false;
      }
    };

    await performSubmit();
    setLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Monthly Data Entry</h1>
          <div className="flex items-center gap-2 mt-1">
            {office.role === "Admin" ? (
              <select
                value={selectedOfficeId}
                onChange={(e) => setSelectedOfficeId(parseInt(e.target.value))}
                className="text-sm font-semibold text-stone-900 bg-stone-100 border-none rounded px-2 py-1 outline-none"
              >
                {offices.map((off) => (
                  <option key={off.id} value={off.id}>{off.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-stone-500">{office.name}</p>
            )}
            <span className="text-stone-300">•</span>
            <p className="text-stone-500">Reporting for {month}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-700 font-semibold rounded-lg hover:bg-stone-50 transition-colors"
          >
            <ClipboardPaste className="w-4 h-4" />
            Paste from Excel
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-4 py-2 bg-white border border-stone-200 rounded-lg shadow-sm focus:ring-2 focus:ring-stone-900 outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || fetching}
            className="flex items-center gap-2 px-6 py-2 bg-stone-900 text-white font-semibold rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Report
          </button>
        </div>
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          status.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
        }`}>
          {status.type === "success" ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {status.message}
        </div>
      )}

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h3 className="text-lg font-bold text-stone-900">Paste from Excel</h3>
              <p className="text-sm text-stone-500 mt-1">
                Copy data from Excel including header row and service name column. 
                Expected columns: Service Name, Off Appr, Off Rej, Off Pend, Off S.Back, On Appr, On Rej, On Pend, On S.Back.
                (Totals will be auto-calculated).
              </p>
            </div>
            <div className="p-6">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste your Excel data here..."
                className="w-full h-64 p-4 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-stone-900 outline-none resize-none"
              />
            </div>
            <div className="p-6 bg-stone-50 flex justify-end gap-3">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-stone-600 font-semibold hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                onClick={handlePaste}
                className="px-6 py-2 bg-stone-900 text-white font-semibold rounded-lg hover:bg-stone-800"
              >
                Apply Data
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-x-auto relative">
        {fetching && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-stone-900" />
          </div>
        )}
        <table className="w-full border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th rowSpan={2} className="p-4 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider border-r border-stone-200 w-1/4">
                Service Name
              </th>
              <th colSpan={5} className="p-2 text-center text-xs font-semibold text-stone-500 uppercase tracking-wider border-r border-stone-200">
                Offline Applications
              </th>
              <th colSpan={5} className="p-2 text-center text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Online Applications
              </th>
            </tr>
            <tr className="bg-stone-50 border-b border-stone-200">
              {["Total", "Appr.", "Rej.", "Pend.", "S.Back"].map((h, i) => (
                <th key={`off-${i}`} className="p-2 text-center text-[10px] font-bold text-stone-400 uppercase border-r border-stone-200 last:border-r-0">
                  {h}
                </th>
              ))}
              {["Total", "Appr.", "Rej.", "Pend.", "S.Back"].map((h, i) => (
                <th key={`on-${i}`} className="p-2 text-center text-[10px] font-bold text-stone-400 uppercase border-r border-stone-200 last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, sIdx) => {
              const offSum = row.offline.approved + row.offline.rejected + row.offline.pending + row.offline.sendback;
              const onSum = row.online.approved + row.online.rejected + row.online.pending + row.online.sendback;
              const isOffInvalid = offSum > row.offline.total;
              const isOnInvalid = onSum > row.online.total;

              return (
                <tr key={sIdx} className={cn(
                  "border-b border-stone-100 hover:bg-stone-50 transition-colors",
                  (isOffInvalid || isOnInvalid) && "bg-red-50/50"
                )}>
                  <td className="p-4 text-sm text-stone-700 font-medium border-r border-stone-200 leading-tight">
                    {row.serviceName}
                    {(isOffInvalid || isOnInvalid) && (
                      <div className="text-[10px] text-red-500 font-bold mt-1 uppercase">Sum exceeds total</div>
                    )}
                  </td>
                  {/* Offline Fields */}
                  {["total", "approved", "rejected", "pending", "sendback"].map((field) => (
                    <td key={`off-${field}`} className="p-1 border-r border-stone-100">
                      <input
                        type="number"
                        min="0"
                        readOnly={field === "total"}
                        value={row.offline[field as keyof ApplicationCounts]}
                        onChange={(e) => handleInputChange(sIdx, "offline", field as keyof ApplicationCounts, e.target.value)}
                        className={cn(
                          "w-full p-2 text-center text-sm bg-transparent focus:bg-white focus:ring-1 focus:ring-stone-900 outline-none rounded transition-all",
                          field === "total" && "bg-stone-50 font-bold text-stone-900 cursor-default",
                          isOffInvalid && field !== "total" && "text-red-600 font-bold"
                        )}
                      />
                    </td>
                  ))}
                  {/* Online Fields */}
                  {["total", "approved", "rejected", "pending", "sendback"].map((field) => (
                    <td key={`on-${field}`} className="p-1 border-r border-stone-100 last:border-r-0">
                      <input
                        type="number"
                        min="0"
                        readOnly={field === "total"}
                        value={row.online[field as keyof ApplicationCounts]}
                        onChange={(e) => handleInputChange(sIdx, "online", field as keyof ApplicationCounts, e.target.value)}
                        className={cn(
                          "w-full p-2 text-center text-sm bg-transparent focus:bg-white focus:ring-1 focus:ring-stone-900 outline-none rounded transition-all",
                          field === "total" && "bg-stone-50 font-bold text-stone-900 cursor-default",
                          isOnInvalid && field !== "total" && "text-red-600 font-bold"
                        )}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
