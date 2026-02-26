import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Google Sheets Service Account Auth
const getGoogleAuth = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error("Service account credentials missing");
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
};

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Helper to get sheet data
async function getSheetData(range: string) {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });
  return response.data.values || [];
}

// Helper to update sheet data
async function updateSheetData(range: string, values: any[][]) {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Get Offices List
  app.get("/api/offices", async (req, res) => {
    try {
      const offices = await getSheetData("Offices!A2:E");
      const formattedOffices = offices.map(o => ({
        id: parseInt(o[0]),
        name: o[1],
        role: o[3] || "Office"
      }));
      res.json({ success: true, offices: formattedOffices });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch offices." });
    }
  });

  // Auth API
  app.post("/api/login", async (req, res) => {
    const { officeName, password } = req.body;
    try {
      const offices = await getSheetData("Offices!A2:E");
      const office = offices.find(o => o[1] === officeName && o[2] === password);
      
      if (office) {
        res.json({ 
          success: true, 
          office: { 
            id: parseInt(office[0]), 
            name: office[1],
            role: office[3] || "Office",
            corporationId: office[4] ? parseInt(office[4]) : null
          } 
        });
      } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
      }
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to connect to Sheets." });
    }
  });

  // Change Password API
  app.post("/api/user/change-password", async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    try {
      const offices = await getSheetData("Offices!A2:E");
      const officeIdx = offices.findIndex(o => o[0] === String(userId) && o[2] === currentPassword);
      
      if (officeIdx === -1) {
        return res.status(401).json({ success: false, message: "Invalid current password" });
      }

      // Update password in the sheet (Offices!C is index 2)
      // Note: officeIdx is 0-based for the data range A2:E, so row in sheet is officeIdx + 2
      const rowNum = officeIdx + 2;
      await updateSheetData(`Offices!C${rowNum}`, [[newPassword]]);
      
      res.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to update password." });
    }
  });

  // Data Submission API
  app.post("/api/submit", async (req, res) => {
    const { officeId, month, data } = req.body;
    
    try {
      // Backend Validation
      for (const item of data) {
        const offSum = (item.offline.approved || 0) + (item.offline.rejected || 0) + (item.offline.pending || 0) + (item.offline.sendback || 0);
        const onSum = (item.online.approved || 0) + (item.online.rejected || 0) + (item.online.pending || 0) + (item.online.sendback || 0);
        
        if (offSum > (item.offline.total || 0) || onSum > (item.online.total || 0)) {
          return res.status(400).json({ 
            success: false, 
            message: `Validation failed for service: ${item.serviceName}. Sum of statuses exceeds total.` 
          });
        }
      }

      const allSubmissions = await getSheetData("Submissions!A2:O");
      const offices = await getSheetData("Offices!A2:B");
      const officeName = offices.find(o => parseInt(o[0]) === officeId)?.[1] || "Unknown";

      // Filter out existing rows for this office and month
      const filteredSubmissions = allSubmissions.filter(row => !(row[0] === String(officeId) && row[2] === month));

      // Create new rows
      const newRows = data.map((item: any) => [
        officeId,
        officeName,
        month,
        item.serviceName,
        item.offline.total, item.offline.approved, item.offline.rejected, item.offline.pending, item.offline.sendback,
        item.online.total, item.online.approved, item.online.rejected, item.online.pending, item.online.sendback,
        new Date().toISOString()
      ]);

      // Overwrite Submissions sheet (Headers + Filtered + New)
      const headers = ["Office ID", "Office Name", "Month", "Service Name", "Offline Total", "Offline Approved", "Offline Rejected", "Offline Pending", "Offline Sendback", "Online Total", "Online Approved", "Online Rejected", "Online Pending", "Online Sendback", "Updated At"];
      await updateSheetData("Submissions!A1", [headers, ...filteredSubmissions, ...newRows]);

      res.json({ success: true });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to save to Sheets." });
    }
  });

  // Get Submission for Edit
  app.get("/api/submission/:officeId/:month", async (req, res) => {
    const { officeId, month } = req.params;
    try {
      const allSubmissions = await getSheetData("Submissions!A2:O");
      const filtered = allSubmissions.filter(row => row[0] === officeId && row[2] === month);
      
      if (filtered.length === 0) {
        return res.json({ success: true, data: null });
      }

      const formattedData = filtered.map(d => ({
        serviceName: d[3],
        offline: {
          total: parseInt(d[4]) || 0,
          approved: parseInt(d[5]) || 0,
          rejected: parseInt(d[6]) || 0,
          pending: parseInt(d[7]) || 0,
          sendback: parseInt(d[8]) || 0
        },
        online: {
          total: parseInt(d[9]) || 0,
          approved: parseInt(d[10]) || 0,
          rejected: parseInt(d[11]) || 0,
          pending: parseInt(d[12]) || 0,
          sendback: parseInt(d[13]) || 0
        }
      }));

      res.json({ success: true, data: formattedData });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch from Sheets." });
    }
  });

  // Get Yearly Submission for Dashboard (Financial Year)
  app.get("/api/submission/yearly/:officeId/:yearRange", async (req, res) => {
    const { officeId, yearRange } = req.params; // e.g., "2025-26"
    try {
      const [startYearStr] = yearRange.split("-");
      const startYear = parseInt(startYearStr);
      const endYear = startYear + 1;

      const allSubmissions = await getSheetData("Submissions!A2:O");
      
      // Filter by Financial Year (April startYear to March endYear)
      const officeSubmissions = allSubmissions.filter(row => {
        if (row[0] !== officeId) return false;
        const monthStr = row[2]; // "YYYY-MM"
        const [y, m] = monthStr.split("-").map(Number);
        
        const isStartYear = (y === startYear && m >= 4);
        const isEndYear = (y === endYear && m <= 3);
        return isStartYear || isEndYear;
      });
      
      if (officeSubmissions.length === 0) {
        return res.json({ success: true, data: null });
      }

      // Group by ServiceName
      const serviceMap: Record<string, any> = {};
      
      officeSubmissions.forEach(d => {
        const serviceName = d[3];
        if (!serviceMap[serviceName]) {
          serviceMap[serviceName] = {
            serviceName,
            offline: { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 },
            online: { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 }
          };
        }
        
        serviceMap[serviceName].offline.total += parseInt(d[4]) || 0;
        serviceMap[serviceName].offline.approved += parseInt(d[5]) || 0;
        serviceMap[serviceName].offline.rejected += parseInt(d[6]) || 0;
        serviceMap[serviceName].offline.pending += parseInt(d[7]) || 0;
        serviceMap[serviceName].offline.sendback += parseInt(d[8]) || 0;
        
        serviceMap[serviceName].online.total += parseInt(d[9]) || 0;
        serviceMap[serviceName].online.approved += parseInt(d[10]) || 0;
        serviceMap[serviceName].online.rejected += parseInt(d[11]) || 0;
        serviceMap[serviceName].online.pending += parseInt(d[12]) || 0;
        serviceMap[serviceName].online.sendback += parseInt(d[13]) || 0;
      });

      res.json({ success: true, data: Object.values(serviceMap) });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Dashboard API (Monthly)
  app.get("/api/dashboard/:month", async (req, res) => {
    const { month } = req.params;
    const userId = req.query.userId as string;
    const role = req.query.role as string;

    try {
      const offices = await getSheetData("Offices!A2:E");
      const allSubmissions = await getSheetData("Submissions!A2:O");
      
      let targetOffices = offices.filter(o => o[3] === "Office");

      if (role === "Corporation") {
        targetOffices = targetOffices.filter(o => String(o[4]).trim() === String(userId).trim());
      } else if (role === "Office") {
        targetOffices = targetOffices.filter(o => o[0] === userId);
      }

      const stats = targetOffices.map(office => {
        const officeId = office[0];
        const officeSubmissions = allSubmissions.filter(row => row[0] === officeId && row[2] === month);
        
        const offline = officeSubmissions.reduce((acc, row) => ({
          total: acc.total + (parseInt(row[4]) || 0),
          approved: acc.approved + (parseInt(row[5]) || 0),
          rejected: acc.rejected + (parseInt(row[6]) || 0),
          pending: acc.pending + (parseInt(row[7]) || 0),
          sendback: acc.sendback + (parseInt(row[8]) || 0),
        }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

        const online = officeSubmissions.reduce((acc, row) => ({
          total: acc.total + (parseInt(row[9]) || 0),
          approved: acc.approved + (parseInt(row[10]) || 0),
          rejected: acc.rejected + (parseInt(row[11]) || 0),
          pending: acc.pending + (parseInt(row[12]) || 0),
          sendback: acc.sendback + (parseInt(row[13]) || 0),
        }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

        return {
          officeId: parseInt(officeId),
          officeName: office[1],
          corporationId: office[4] ? parseInt(office[4]) : null,
          offline,
          online,
          total: offline.total + online.total,
          approved: offline.approved + online.approved,
          rejected: offline.rejected + online.rejected,
          pending: offline.pending + online.pending,
          sendback: offline.sendback + online.sendback,
        };
      });

      let corpStats = [];
      if (role === "Admin") {
        const corporations = offices.filter(o => o[3] === "Corporation");
        corpStats = corporations.map(corp => {
          const corpId = corp[0];
          const children = stats.filter(s => s.corporationId === parseInt(corpId));
          
          const offline = children.reduce((acc, curr) => ({
            total: acc.total + curr.offline.total,
            approved: acc.approved + curr.offline.approved,
            rejected: acc.rejected + curr.offline.rejected,
            pending: acc.pending + curr.offline.pending,
            sendback: acc.sendback + curr.offline.sendback,
          }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

          const online = children.reduce((acc, curr) => ({
            total: acc.total + curr.online.total,
            approved: acc.approved + curr.online.approved,
            rejected: acc.rejected + curr.online.rejected,
            pending: acc.pending + curr.online.pending,
            sendback: acc.sendback + curr.online.sendback,
          }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

          return {
            corporationId: parseInt(corpId),
            corporationName: corp[1],
            offline,
            online,
            total: offline.total + online.total,
            approved: offline.approved + online.approved,
            rejected: offline.rejected + online.rejected,
            pending: offline.pending + online.pending,
            sendback: offline.sendback + online.sendback,
          };
        });
      }

      res.json({ success: true, stats, corpStats });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch dashboard data." });
    }
  });

  // Dashboard API (Yearly - Financial Year)
  app.get("/api/dashboard/yearly/:yearRange", async (req, res) => {
    const { yearRange } = req.params; // e.g., "2025-26"
    const userId = req.query.userId as string;
    const role = req.query.role as string;

    try {
      const [startYearStr] = yearRange.split("-");
      const startYear = parseInt(startYearStr);
      const endYear = startYear + 1;

      const offices = await getSheetData("Offices!A2:E");
      const allSubmissions = await getSheetData("Submissions!A2:O");
      
      let targetOffices = offices.filter(o => o[3] === "Office");

      if (role === "Corporation") {
        targetOffices = targetOffices.filter(o => String(o[4]).trim() === String(userId).trim());
      } else if (role === "Office") {
        targetOffices = targetOffices.filter(o => o[0] === userId);
      }

      const stats = targetOffices.map(office => {
        const officeId = office[0];
        
        const officeSubmissions = allSubmissions.filter(row => {
          if (row[0] !== officeId) return false;
          const monthStr = row[2];
          const [y, m] = monthStr.split("-").map(Number);
          const isStartYear = (y === startYear && m >= 4);
          const isEndYear = (y === endYear && m <= 3);
          return isStartYear || isEndYear;
        });
        
        const offline = officeSubmissions.reduce((acc, row) => ({
          total: acc.total + (parseInt(row[4]) || 0),
          approved: acc.approved + (parseInt(row[5]) || 0),
          rejected: acc.rejected + (parseInt(row[6]) || 0),
          pending: acc.pending + (parseInt(row[7]) || 0),
          sendback: acc.sendback + (parseInt(row[8]) || 0),
        }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

        const online = officeSubmissions.reduce((acc, row) => ({
          total: acc.total + (parseInt(row[9]) || 0),
          approved: acc.approved + (parseInt(row[10]) || 0),
          rejected: acc.rejected + (parseInt(row[11]) || 0),
          pending: acc.pending + (parseInt(row[12]) || 0),
          sendback: acc.sendback + (parseInt(row[13]) || 0),
        }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

        return {
          officeId: parseInt(officeId),
          officeName: office[1],
          corporationId: office[4] ? parseInt(office[4]) : null,
          offline,
          online,
          total: offline.total + online.total,
          approved: offline.approved + online.approved,
          rejected: offline.rejected + online.rejected,
          pending: offline.pending + online.pending,
          sendback: offline.sendback + online.sendback,
        };
      });

      let corpStats = [];
      if (role === "Admin") {
        const corporations = offices.filter(o => o[3] === "Corporation");
        corpStats = corporations.map(corp => {
          const corpId = corp[0];
          const children = stats.filter(s => s.corporationId === parseInt(corpId));
          
          const offline = children.reduce((acc, curr) => ({
            total: acc.total + curr.offline.total,
            approved: acc.approved + curr.offline.approved,
            rejected: acc.rejected + curr.offline.rejected,
            pending: acc.pending + curr.offline.pending,
            sendback: acc.sendback + curr.offline.sendback,
          }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

          const online = children.reduce((acc, curr) => ({
            total: acc.total + curr.online.total,
            approved: acc.approved + curr.online.approved,
            rejected: acc.rejected + curr.online.rejected,
            pending: acc.pending + curr.online.pending,
            sendback: acc.sendback + curr.online.sendback,
          }), { total: 0, approved: 0, rejected: 0, pending: 0, sendback: 0 });

          return {
            corporationId: parseInt(corpId),
            corporationName: corp[1],
            offline,
            online,
            total: offline.total + online.total,
            approved: offline.approved + online.approved,
            rejected: offline.rejected + online.rejected,
            pending: offline.pending + online.pending,
            sendback: offline.sendback + online.sendback,
          };
        });
      }

      res.json({ success: true, stats, corpStats });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch dashboard data." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
