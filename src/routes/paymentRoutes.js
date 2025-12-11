import express from "express";
import Payment from "../models/Payment.js";
import LightBill from "../models/LightBill.js";
import Tenant from "../models/Tenant.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/payments - Get all payments grouped by tenant (includes both invoice and light bill payments)
router.get("/", authRequired, async (req, res) => {
  try {
    const { tenantId, leaseId, invoiceId, startDate, endDate, mode } = req.query;
    const query = {};

    // Apply filters if provided
    if (tenantId) query.tenant = tenantId;
    if (leaseId) query.lease = leaseId;
    if (invoiceId) query.invoice = invoiceId;
    if (mode) query.mode = mode;

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Get invoice payments
    const invoicePayments = await Payment.find(query)
      .populate("tenant", "fullName phone email")
      .populate("lease", "startDate endDate rentPerMonth room")
      .populate("invoice", "periodFrom periodTo baseAmount totalAmount status");

    // Build light bill query
    const lightBillQuery = {};
    if (tenantId) lightBillQuery.tenant = tenantId;
    if (leaseId) lightBillQuery.lease = leaseId;
    
    // Date range filter for light bills (using updatedAt since that's when payments are recorded)
    if (startDate || endDate) {
      lightBillQuery.updatedAt = {};
      if (startDate) lightBillQuery.updatedAt.$gte = new Date(startDate);
      if (endDate) lightBillQuery.updatedAt.$lte = new Date(endDate);
    }
    
    // Only get light bills that have payments
    lightBillQuery.paidAmount = { $gt: 0 };

    const lightBills = await LightBill.find(lightBillQuery)
      .populate("tenant", "fullName phone email")
      .populate("lease", "startDate endDate rentPerMonth room")
      .populate("room", "name floor");

    // Transform payments to a consistent format
    const transformedInvoicePayments = invoicePayments.map(payment => ({
      _id: payment._id,
      tenant: payment.tenant,
      lease: payment.lease,
      relatedId: payment.invoice ? payment.invoice._id : null,
      amount: payment.amount,
      date: payment.date,
      mode: payment.mode,
      note: payment.note,
      type: "invoice",
      period: payment.invoice ? {
        from: payment.invoice.periodFrom,
        to: payment.invoice.periodTo,
        formatted: `${new Date(payment.invoice.periodFrom).toLocaleDateString()} to ${new Date(payment.invoice.periodTo).toLocaleDateString()}`
      } : null,
      status: payment.invoice ? payment.invoice.status : null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    }));

    const transformedLightBillPayments = lightBills.map(bill => ({
      _id: bill._id,
      tenant: bill.tenant,
      lease: bill.lease,
      relatedId: bill._id, // For light bills, the bill itself is the related entity
      amount: bill.paidAmount, // Use paidAmount, not totalAmount
      date: bill.updatedAt, // Using updatedAt as the payment date
      mode: "cash", // Default mode for light bills
      note: "Light bill payment",
      type: "lightBill",
      period: {
        from: bill.periodFrom,
        to: bill.periodTo,
        formatted: `${new Date(bill.periodFrom).toLocaleDateString()} to ${new Date(bill.periodTo).toLocaleDateString()}`
      },
      status: bill.status,
      createdAt: bill.createdAt,
      updatedAt: bill.updatedAt
    }));

    // Combine all payments
    const allPayments = [...transformedInvoicePayments, ...transformedLightBillPayments];

    // Group payments by tenant
    const tenantMap = {};
    
    allPayments.forEach(payment => {
      const tenantId = payment.tenant._id.toString();
      
      if (!tenantMap[tenantId]) {
        tenantMap[tenantId] = {
          tenant: payment.tenant,
          totalAmount: 0,
          paymentCount: 0,
          payments: []
        };
      }
      
      tenantMap[tenantId].totalAmount += payment.amount;
      tenantMap[tenantId].paymentCount++;
      tenantMap[tenantId].payments.push(payment);
    });
    
    // Convert map to array
    const groupedPayments = Object.values(tenantMap);
    
    // Calculate overall summary statistics
    let totalCount = 0;
    let totalAmount = 0;
    groupedPayments.forEach(group => {
      totalCount += group.paymentCount;
      totalAmount += group.totalAmount;
    });

    res.status(200).json({
      success: true,
      count: totalCount,
      totalAmount: totalAmount,
      data: groupedPayments
    });
  } catch (error) {
    console.error("Error fetching payments:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching payments"
    });
  }
});

// GET /api/payments/:id - Get payment details by ID
router.get("/:id", authRequired, async (req, res) => {
  try {
    // Try to find as invoice payment first
    let payment = await Payment.findById(req.params.id)
      .populate("tenant", "fullName phone email address")
      .populate("lease", "startDate endDate rentPerMonth room billingDay")
      .populate("invoice", "periodFrom periodTo baseAmount totalAmount status dueDate");

    let paymentType = "invoice";

    // If not found as invoice payment, try as light bill
    if (!payment) {
      payment = await LightBill.findById(req.params.id)
        .populate("tenant", "fullName phone email address")
        .populate("lease", "startDate endDate rentPerMonth room billingDay")
        .populate("room", "name floor");
      paymentType = "lightBill";
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    let enhancedPayment;

    if (paymentType === "invoice") {
      // Get full invoice payment details
      enhancedPayment = {
        _id: payment._id,
        type: "invoice",
        tenant: {
          _id: payment.tenant._id,
          fullName: payment.tenant.fullName,
          phone: payment.tenant.phone,
          email: payment.tenant.email,
          address: payment.tenant.address
        },
        lease: {
          _id: payment.lease._id,
          startDate: payment.lease.startDate,
          endDate: payment.lease.endDate,
          rentPerMonth: payment.lease.rentPerMonth,
          billingDay: payment.lease.billingDay,
          room: payment.lease.room
        },
        invoice: {
          _id: payment.invoice._id,
          periodFrom: payment.invoice.periodFrom,
          periodTo: payment.invoice.periodTo,
          baseAmount: payment.invoice.baseAmount,
          lateFee: payment.invoice.lateFee || 0,
          totalAmount: payment.invoice.totalAmount,
          paidAmount: payment.invoice.paidAmount || 0,
          status: payment.invoice.status,
          issueDate: payment.invoice.issueDate,
          dueDate: payment.invoice.dueDate
        },
        payment: {
          amount: payment.amount,
          date: payment.date,
          mode: payment.mode,
          note: payment.note
        },
        period: {
          from: payment.invoice.periodFrom,
          to: payment.invoice.periodTo,
          formatted: `${new Date(payment.invoice.periodFrom).toLocaleDateString()} to ${new Date(payment.invoice.periodTo).toLocaleDateString()}`
        },
        status: payment.invoice.status,
        paymentContext: {
          purpose: "Rent payment for period",
          period: `${new Date(payment.invoice.periodFrom).toLocaleDateString()} to ${new Date(payment.invoice.periodTo).toLocaleDateString()}`,
          dueDate: new Date(payment.invoice.dueDate).toLocaleDateString(),
          paymentTiming: payment.date <= payment.invoice.dueDate ? "On time" : "Late"
        },
        timestamps: {
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt
        }
      };
    } else {
      // Get full light bill payment details
      enhancedPayment = {
        _id: payment._id,
        type: "lightBill",
        tenant: {
          _id: payment.tenant._id,
          fullName: payment.tenant.fullName,
          phone: payment.tenant.phone,
          email: payment.tenant.email,
          address: payment.tenant.address
        },
        lease: {
          _id: payment.lease._id,
          startDate: payment.lease.startDate,
          endDate: payment.lease.endDate,
          rentPerMonth: payment.lease.rentPerMonth,
          billingDay: payment.lease.billingDay,
          room: payment.lease.room
        },
        room: {
          _id: payment.room._id,
          name: payment.room.name,
          floor: payment.room.floor
        },
        lightBill: {
          _id: payment._id,
          periodFrom: payment.periodFrom,
          periodTo: payment.periodTo,
          unitsConsumed: payment.unitsConsumed,
          ratePerUnit: payment.ratePerUnit,
          fixedCharge: payment.fixedCharge || 0,
          tax: payment.tax || 0,
          totalAmount: payment.totalAmount,
          paidAmount: payment.paidAmount,
          status: payment.status,
          issueDate: payment.issueDate,
          dueDate: payment.dueDate,
          notes: payment.notes
        },
        payment: {
          amount: payment.paidAmount,
          date: payment.updatedAt,
          mode: "cash",
          note: "Light bill payment"
        },
        period: {
          from: payment.periodFrom,
          to: payment.periodTo,
          formatted: `${new Date(payment.periodFrom).toLocaleDateString()} to ${new Date(payment.periodTo).toLocaleDateString()}`
        },
        status: payment.status,
        paymentContext: {
          purpose: "Electricity bill payment",
          period: `${new Date(payment.periodFrom).toLocaleDateString()} to ${new Date(payment.periodTo).toLocaleDateString()}`,
          dueDate: payment.dueDate ? new Date(payment.dueDate).toLocaleDateString() : "N/A",
          paymentTiming: payment.dueDate ? 
            (payment.updatedAt <= payment.dueDate ? "On time" : "Late") : 
            "N/A"
        },
        timestamps: {
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt
        }
      };
    }

    res.status(200).json({
      success: true,
      data: enhancedPayment
    });
  } catch (error) {
    console.error("Error fetching payment details:", error.message);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID"
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while fetching payment details"
    });
  }
});

// GET /api/payments/tenant/:tenantId - Get complete payment history for a tenant
router.get("/tenant/:tenantId", authRequired, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // Get tenant details
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    // Get invoice payments for this tenant
    const invoicePayments = await Payment.find({ tenant: tenantId })
      .populate("lease", "startDate endDate rentPerMonth room")
      .populate("invoice", "periodFrom periodTo baseAmount totalAmount status dueDate");

    // Get light bills for this tenant that have payments (paidAmount > 0)
    const lightBills = await LightBill.find({ 
      tenant: tenantId,
      paidAmount: { $gt: 0 }
    })
      .populate("lease", "startDate endDate rentPerMonth room")
      .populate("room", "name floor");

    // Transform payments to a consistent format
    const transformedInvoicePayments = invoicePayments.map(payment => ({
      _id: payment._id,
      amount: payment.amount,
      date: payment.date,
      mode: payment.mode,
      note: payment.note,
      type: "invoice",
      period: payment.invoice ? {
        from: payment.invoice.periodFrom,
        to: payment.invoice.periodTo,
        formatted: `${new Date(payment.invoice.periodFrom).toLocaleDateString()} to ${new Date(payment.invoice.periodTo).toLocaleDateString()}`
      } : null,
      status: payment.invoice ? payment.invoice.status : null,
      relatedInfo: {
        invoice: payment.invoice,
        lease: payment.lease
      },
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    }));

    const transformedLightBillPayments = lightBills.map(bill => ({
      _id: bill._id,
      amount: bill.paidAmount, // Use paidAmount, not totalAmount
      date: bill.updatedAt, // Using updatedAt as the payment date
      mode: "cash", // Default mode for light bills
      note: "Light bill payment",
      type: "lightBill",
      period: {
        from: bill.periodFrom,
        to: bill.periodTo,
        formatted: `${new Date(bill.periodFrom).toLocaleDateString()} to ${new Date(bill.periodTo).toLocaleDateString()}`
      },
      status: bill.status,
      relatedInfo: {
        lightBill: {
          periodFrom: bill.periodFrom,
          periodTo: bill.periodTo,
          unitsConsumed: bill.unitsConsumed,
          ratePerUnit: bill.ratePerUnit,
          totalAmount: bill.totalAmount,
          paidAmount: bill.paidAmount,
          status: bill.status,
          dueDate: bill.dueDate
        },
        lease: bill.lease,
        room: bill.room
      },
      createdAt: bill.createdAt,
      updatedAt: bill.updatedAt
    }));

    // Combine all payments
    const allPayments = [...transformedInvoicePayments, ...transformedLightBillPayments];

    // Sort payments by date (newest first)
    allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate totals
    let totalInvoicePayments = 0;
    let totalLightBillPayments = 0;
    
    invoicePayments.forEach(payment => {
      totalInvoicePayments += payment.amount;
    });
    
    lightBills.forEach(bill => {
      totalLightBillPayments += bill.paidAmount;
    });

    res.status(200).json({
      success: true,
      data: {
        tenant: {
          _id: tenant._id,
          fullName: tenant.fullName,
          phone: tenant.phone,
          email: tenant.email
        },
        payments: allPayments,
        summary: {
          totalPayments: allPayments.length,
          totalInvoicePayments,
          totalLightBillPayments,
          totalAmountPaid: totalInvoicePayments + totalLightBillPayments
        }
      }
    });
  } catch (error) {
    console.error("Error fetching tenant payment history:", error.message);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant ID"
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while fetching tenant payment history"
    });
  }
});

export default router;