import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function getSheetData(range: string) {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });
  return response.data.values || [];
}

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

let submissionQueue = Promise.resolve();

const app = express();
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
}

// ---- ALL YOUR API ROUTES (unchanged) ----

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
    res.status(500).json({ success: false, message: error.message || "Failed to fetch offices." });
  }
});

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
    res.status(500).json({ success: false, message: error.message || "Failed to connect to Sheets." });
  }
});

app.post("/api/user/change-password", async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  try {
    const offices = await getSheetData("Offices!A2:E");
    const officeIdx = offices.findIndex(o => o[0] === String(userId) && o[2] === currentPassword);
    if (officeIdx === -1) {
      return res.status(401).json({ success: false, message: "Invalid current password" });
    }
    const rowNum = officeIdx + 2;
    await updateSheetData(`Offices!C${rowNum}`, [[newPassword]]);
    res.json({ success: true, message: "Password updated successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to update password." });
  }
});

app.post("/api/submit", async (req, res) => {
  const { officeId, month, data } = req.body;
  submissionQueue = submissionQueue.then(async () => {
    try {
      for (const item of data) {
        const offSum = (item.offline.approved || 0) + (item.offline.rejected || 0) + (item.offline.pending || 0) + (item.offline.sendback || 0);
        const onSum = (item.online.approved || 0) + (item.online.rejected || 0) + (item.online.pending || 0) + (item.online.sendback || 0);
        if (offSum > (item.offline.total || 0) || onSum > (item.online.total || 0)) {
          res.status(400).json({ success: false, message: `Validation failed for service: ${item.serviceName}.` });
          return;
        }
      }
      const allSubmissions = await getSheetData("Submissions!A2:O");
      const offices = await getSheetData("Offices!A2:B");
      const officeName = offices.find(o => parseInt(o[0]) === officeId)?.[1] || "Unknown";
      const filteredSubmissions = allSubmissions.filter(row => !(row[0] === String(officeId) && row[2] === month));
      const newRows = data.map((item: any) => [
        officeId, officeName, month, item.serviceName,
        item.offline.total, item.offline.approved, item.offline.rejected, item.offline.pending, item.offline.sendback,
        item.online.total, item.online.approved, item.online.rejected, item.online.pending, item.online.sendback,
        new Date().toISOString()
      ]);
      const headers = ["Office ID", "Office Name", "Month", "Service Name", "Offline Total", "Offline Approved", "Offline Rejected", "Offline Pending", "Offline Sendback", "Online Total", "Online Approved", "Online Rejected", "Online Pending", "Online Sendback", "Updated At"];
      await updateSheetData("Submissions!A1", [headers, ...filteredSubmissions, ...newRows]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Failed to save to Sheets." });
    }
  }).catch(() => Promise.resolve());
});

app.get("/api/submission/:officeId/:month", async (req, res) => {
  const { officeId, month } = req.params;
  try {
    const allSubmissions = await getSheetData("Submissions!A2:O");
    const filtered = allSubmissions.filter(row => row[0] === officeId && row[2] === month);
    if (filtered.length === 0) return res.json({ success: true, data: null });
    const formattedData = filtered.map(d => ({
      serviceName: d[3],
      offline: { total: parseInt(d[4]) || 0, approved: parseInt(d[5]) || 0, rejected: parseInt(d[6]) || 0, pending: parseInt(d[7]) || 0, sendback: parseInt(d[8]) || 0 },
      online: { total: parseInt(d[9]) || 0, approved: parseInt(d[10]) || 0, rejected: parseInt(d[11]) || 0, pending: parseInt(d[12]) || 0, sendback: parseInt(d[13]) || 0 }
    }));
    res.json({ success: true, data: formattedData });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch from Sheets." });
  }
});

// ... (keep your /api/submission/yearly, /api/dashboard, /api/dashboard/yearly routes exactly as they are)

// Catch-all: serve React app for all non-API routes (production)
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

// For local dev only
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
  app.listen(3000, "0.0.0.0", () => console.log("Dev server on http://localhost:3000"));
}

export default app;
