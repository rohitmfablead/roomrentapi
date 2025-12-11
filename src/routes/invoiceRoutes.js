import express from "express";
import Invoice from "../models/Invoice.js";
import Lease from "../models/Lease.js";
import Payment from "../models/Payment.js";
import Settings from "../models/Settings.js";
import { authRequired } from "../middleware/authMiddleware.js";
import { createPaymentNotification, createInvoiceNotification } from "../services/notificationService.js";

const router = express.Router();

// GET /api/invoices?status=unpaid&tenantId=...&month=...&year=...
router.get("/", authRequired, async (req, res) => {
  try {
    const { status, tenantId, month, year } = req.query;
    const query = {};

    if (status) query.status = status;
    if (tenantId) query.tenant = tenantId;

    // Filter by specific month/year if provided
    if (month && year) {
      const startDate = new Date(year, month - 1, 1); // month is 1-indexed
      const endDate = new Date(year, month, 0); // Last day of the month

      query.periodFrom = { $gte: startDate };
      query.periodTo = { $lte: endDate };
    }

    const invoices = await Invoice.find(query)
      .populate("tenant", "fullName phone")
      .populate("room", "name floor")
      .populate("lease", "startDate endDate rentPerMonth");

    // Calculate totals
    let totalExpected = 0;
    let totalCollected = 0;
    let totalPending = 0;

    invoices.forEach((invoice) => {
      totalExpected += invoice.totalAmount || 0;
      totalCollected += invoice.paidAmount || 0;
      totalPending += invoice.totalAmount - (invoice.paidAmount || 0);
    });

    res.status(200).json({
      success: true,
      count: invoices.length,
      data: invoices,
      summary: {
        totalExpected,
        totalCollected,
        totalPending,
      },
    });
  } catch (error) {
    console.error("Invoice fetch error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching invoices",
    });
  }
});

// POST /api/invoices/generate-monthly
router.post("/generate-monthly", authRequired, async (req, res) => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // JavaScript months are 0-indexed

    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Find all active leases
    const leases = await Lease.find({ status: "active" }).populate(
      "tenant room",
      "fullName phone name floor"
    );

    const created = [];

    for (const lease of leases) {
      // Check if invoice already exists for this lease and period
      const existingInvoice = await Invoice.findOne({
        lease: lease._id,
        periodFrom: firstDay,
        periodTo: lastDay,
      });

      if (existingInvoice) {
        console.log(
          `Invoice already exists for lease ${lease._id} for period ${firstDay} to ${lastDay}`
        );
        continue;
      }

      const periodFrom = firstDay;
      const periodTo = lastDay;
      const issueDate = today;
      const dueDate = new Date(year, month, lease.billingDay || 1);

      const invoice = await Invoice.create({
        lease: lease._id,
        tenant: lease.tenant._id,
        room: lease.room._id,
        periodFrom,
        periodTo,
        issueDate,
        dueDate,
        baseAmount: lease.rentPerMonth,
        totalAmount: lease.rentPerMonth,
      });

      await invoice.populate("tenant", "fullName phone");
      await invoice.populate("room", "name floor");
      await invoice.populate("lease", "startDate endDate rentPerMonth");

      created.push(invoice);

      // Create notification for new invoice
      try {
        await createInvoiceNotification(invoice);
      } catch (notificationError) {
        console.error("Failed to create invoice notification:", notificationError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `${created.length} invoices generated successfully`,
      data: created,
    });
  } catch (error) {
    console.error("Invoice generation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while generating invoices",
    });
  }
});

// POST /api/invoices/:id/pay
router.post("/:id/pay", authRequired, async (req, res) => {
  try {
    const { amount, date, mode, note } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be a positive number",
      });
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Check if payment would exceed total amount
    const newPaidAmount = (invoice.paidAmount || 0) + amount;
    if (newPaidAmount > invoice.totalAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment would exceed total invoice amount. Maximum allowable payment: ${
          invoice.totalAmount - (invoice.paidAmount || 0)
        }`,
      });
    }

    // Create payment record
    const payment = await Payment.create({
      invoice: invoice._id,
      lease: invoice.lease,
      tenant: invoice.tenant,
      amount,
      date: date || new Date(),
      mode: mode || "cash",
      note,
    });

    // Update invoice
    invoice.paidAmount = newPaidAmount;
    if (invoice.paidAmount >= invoice.totalAmount) {
      invoice.status = "paid";
    } else if (invoice.paidAmount > 0) {
      invoice.status = "partially_paid";
    }
    await invoice.save();

    // Populate references
    await payment.populate("tenant", "fullName phone");
    await payment.populate("lease", "startDate endDate rentPerMonth");
    await payment.populate("invoice", "periodFrom periodTo baseAmount totalAmount status");

    // Create notification for payment
    try {
      await createPaymentNotification(payment, "invoice");
    } catch (notificationError) {
      console.error("Failed to create payment notification:", notificationError.message);
    }

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: { payment, invoice },
    });
  } catch (error) {
    console.error("Payment recording error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while recording payment",
    });
  }
});

// POST /api/invoices/recalculate-late-fees
router.post("/recalculate-late-fees", authRequired, async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: "Settings not configured",
      });
    }

    const { lateFeeConfig } = settings;
    const today = new Date();

    const invoices = await Invoice.find({
      status: { $in: ["unpaid", "partially_paid"] },
    });

    let updatedCount = 0;

    for (const invoice of invoices) {
      const diffDays = Math.floor(
        (today - invoice.dueDate) / (1000 * 60 * 60 * 24)
      );

      let lateFee = 0;

      if (diffDays > lateFeeConfig.graceDays) {
        const effectiveDays = diffDays - lateFeeConfig.graceDays;

        if (lateFeeConfig.type === "per_day") {
          lateFee = effectiveDays * lateFeeConfig.perDayAmount;
        } else if (lateFeeConfig.type === "percentage") {
          lateFee = (invoice.baseAmount * lateFeeConfig.percentage) / 100;
        }
      }

      if (lateFee !== invoice.lateFee) {
        invoice.lateFee = lateFee;
        invoice.totalAmount = invoice.baseAmount + lateFee;
        await invoice.save();
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Late fees recalculated for ${updatedCount} invoices`,
    });
  } catch (error) {
    console.error("Late fee recalculation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while recalculating late fees",
    });
  }
});

export default router;