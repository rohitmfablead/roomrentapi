import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import leaseRoutes from "./routes/leaseRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import lightBillRoutes from "./routes/lightBillRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import { scheduleMonthlyInvoiceGeneration } from "./services/invoiceCronService.js";

dotenv.config();
const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/leases", leaseRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/light-bills", lightBillRoutes);
app.use("/api/dashboard", dashboardRoutes);

// start
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on port ${PORT}`);
  
  // Schedule monthly invoice generation
  scheduleMonthlyInvoiceGeneration();
});