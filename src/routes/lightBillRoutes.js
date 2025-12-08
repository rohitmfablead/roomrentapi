import express from "express";
import LightBill from "../models/LightBill.js";
import Lease from "../models/Lease.js";
import Room from "../models/Room.js";
import Tenant from "../models/Tenant.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/light-bills?status=unpaid&tenantId=...
router.get("/", authRequired, async (req, res) => {
  try {
    const { status, tenantId } = req.query;
    const query = {};
    
    if (status) {
      // Validate status value
      const validStatuses = ["unpaid", "partially_paid", "paid", "overdue"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid status. Valid statuses are: unpaid, partially_paid, paid, overdue" 
        });
      }
      query.status = status;
    }
    
    if (tenantId) {
      query.tenant = tenantId;
    }

    const lightBills = await LightBill.find(query)
      .populate("tenant", "fullName phone email")
      .populate("room", "name floor")
      .populate("lease", "startDate endDate rentPerMonth");
      
    res.status(200).json({
      success: true,
      count: lightBills.length,
      data: lightBills
    });
  } catch (error) {
    console.error("Error fetching light bills:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching light bills" 
    });
  }
});

// POST /api/light-bills
router.post("/", authRequired, async (req, res) => {
  try {
    let {
      room,
      tenant,
      lease,
      periodFrom,
      periodTo,
      unitsConsumed,
      ratePerUnit,
      fixedCharge = 0,
      tax = 0,
      issueDate,
      dueDate,
      notes,
    } = req.body;

    // If room is provided but tenant or lease is not, auto-fetch them
    if (room && (!tenant || !lease)) {
      // Find the active lease for this room
      const activeLease = await Lease.findOne({ 
        room: room, 
        status: { $in: ["active", "upcoming"] } 
      }).populate("tenant", "_id").populate("room", "_id");
      
      if (activeLease) {
        if (!tenant) tenant = activeLease.tenant._id;
        if (!lease) lease = activeLease._id;
      }
    }

    // If tenant and lease are provided but dates are not, try to fetch from related invoice
    if (tenant && lease && (!periodFrom || !periodTo || !issueDate || !dueDate)) {
      // Find the most recent invoice for this tenant and lease
      const Invoice = (await import("../models/Invoice.js")).default;
      const latestInvoice = await Invoice.findOne({ 
        tenant: tenant, 
        lease: lease 
      }).sort({ createdAt: -1 });

      if (latestInvoice) {
        // Use the same period and dates as the latest invoice if not provided
        if (!periodFrom) periodFrom = latestInvoice.periodFrom;
        if (!periodTo) periodTo = latestInvoice.periodTo;
        if (!issueDate) issueDate = latestInvoice.issueDate;
        if (!dueDate) dueDate = latestInvoice.dueDate;
      }
    }

    // Validation
    if (!room || !tenant || !lease) {
      return res.status(400).json({ 
        success: false,
        message: "Room, tenant, and lease are required" 
      });
    }

    if (!periodFrom || !periodTo) {
      return res.status(400).json({ 
        success: false,
        message: "Period from and period to dates are required" 
      });
    }

    if (new Date(periodFrom) >= new Date(periodTo)) {
      return res.status(400).json({ 
        success: false,
        message: "Period from date must be before period to date" 
      });
    }

    if (!unitsConsumed || unitsConsumed <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Units consumed must be a positive number" 
      });
    }

    if (!ratePerUnit || ratePerUnit <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Rate per unit must be a positive number" 
      });
    }

    if (!issueDate || !dueDate) {
      return res.status(400).json({ 
        success: false,
        message: "Issue date and due date are required" 
      });
    }

    // Check if room, tenant, and lease exist
    const roomExists = await Room.findById(room);
    if (!roomExists) {
      return res.status(404).json({ 
        success: false,
        message: "Room not found" 
      });
    }

    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({ 
        success: false,
        message: "Tenant not found" 
      });
    }

    const leaseExists = await Lease.findById(lease);
    if (!leaseExists) {
      return res.status(404).json({ 
        success: false,
        message: "Lease not found" 
      });
    }

    // Check for duplicate light bill for the same room, tenant, lease, and period
    const existingBill = await LightBill.findOne({
      room,
      tenant,
      lease,
      periodFrom: { $eq: new Date(periodFrom) },
      periodTo: { $eq: new Date(periodTo) }
    });
    
    if (existingBill) {
      return res.status(400).json({ 
        success: false,
        message: "Light bill for this period already exists for this room, tenant, and lease" 
      });
    }

    // Calculate total amount
    const totalAmount = (unitsConsumed * ratePerUnit) + fixedCharge + tax;

    const lightBill = await LightBill.create({
      room,
      tenant,
      lease,
      periodFrom,
      periodTo,
      unitsConsumed,
      ratePerUnit,
      fixedCharge,
      tax,
      totalAmount,
      issueDate,
      dueDate,
      notes,
    });

    // Populate references for response
    await lightBill.populate("tenant", "fullName phone email");
    await lightBill.populate("room", "name floor");
    await lightBill.populate("lease", "startDate endDate rentPerMonth");

    res.status(201).json({
      success: true,
      message: "Light bill created successfully",
      data: lightBill
    });
  } catch (error) {
    console.error("Light bill creation error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while creating light bill" 
    });
  }
});

// POST /api/light-bills/:id/pay
router.post("/:id/pay", authRequired, async (req, res) => {
  try {
    const { amount, date, mode, note } = req.body;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Payment amount must be a positive number" 
      });
    }

    if (!date) {
      return res.status(400).json({ 
        success: false,
        message: "Payment date is required" 
      });
    }

    const lightBill = await LightBill.findById(req.params.id);
    
    if (!lightBill) {
      return res.status(404).json({ 
        success: false,
        message: "Light bill not found" 
      });
    }

    // Check if payment would exceed total amount
    const newPaidAmount = lightBill.paidAmount + amount;
    if (newPaidAmount > lightBill.totalAmount) {
      return res.status(400).json({ 
        success: false,
        message: `Payment would exceed total bill amount. Maximum allowable payment: ${lightBill.totalAmount - lightBill.paidAmount}` 
      });
    }

    // Update paid amount
    lightBill.paidAmount = newPaidAmount;
    
    // Update status based on payment
    if (lightBill.paidAmount >= lightBill.totalAmount) {
      lightBill.status = "paid";
    } else if (lightBill.paidAmount > 0) {
      lightBill.status = "partially_paid";
    }
    
    await lightBill.save();

    // Populate references for response
    await lightBill.populate("tenant", "fullName phone email");
    await lightBill.populate("room", "name floor");
    await lightBill.populate("lease", "startDate endDate rentPerMonth");

    res.status(200).json({ 
      success: true,
      message: "Payment recorded successfully",
      data: lightBill 
    });
  } catch (error) {
    console.error("Payment recording error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while recording payment" 
    });
  }
});

// PUT /api/light-bills/:id
router.put("/:id", authRequired, async (req, res) => {
  try {
    const lightBill = await LightBill.findById(req.params.id);
    
    if (!lightBill) {
      return res.status(404).json({ 
        success: false,
        message: "Light bill not found" 
      });
    }

    const {
      periodFrom,
      periodTo,
      unitsConsumed,
      ratePerUnit,
      fixedCharge,
      tax,
      issueDate,
      dueDate,
      notes,
    } = req.body;

    // Validation for dates if provided
    if (periodFrom && periodTo && new Date(periodFrom) >= new Date(periodTo)) {
      return res.status(400).json({ 
        success: false,
        message: "Period from date must be before period to date" 
      });
    }

    if (issueDate && dueDate && new Date(issueDate) >= new Date(dueDate)) {
      return res.status(400).json({ 
        success: false,
        message: "Issue date must be before due date" 
      });
    }

    // Validation for numbers if provided
    if (unitsConsumed !== undefined && (unitsConsumed <= 0)) {
      return res.status(400).json({ 
        success: false,
        message: "Units consumed must be a positive number" 
      });
    }

    if (ratePerUnit !== undefined && (ratePerUnit <= 0)) {
      return res.status(400).json({ 
        success: false,
        message: "Rate per unit must be a positive number" 
      });
    }

    // Check for duplicate light bill if period is being updated
    if ((periodFrom && periodTo) || (periodFrom && !periodTo) || (!periodFrom && periodTo)) {
      const fromDate = periodFrom ? new Date(periodFrom) : lightBill.periodFrom;
      const toDate = periodTo ? new Date(periodTo) : lightBill.periodTo;
      
      const existingBill = await LightBill.findOne({
        room: lightBill.room,
        tenant: lightBill.tenant,
        lease: lightBill.lease,
        periodFrom: { $eq: fromDate },
        periodTo: { $eq: toDate },
        _id: { $ne: req.params.id }
      });
      
      if (existingBill) {
        return res.status(400).json({ 
          success: false,
          message: "Light bill for this period already exists for this room, tenant, and lease" 
        });
      }
    }

    // Update fields if provided
    if (periodFrom !== undefined) lightBill.periodFrom = periodFrom;
    if (periodTo !== undefined) lightBill.periodTo = periodTo;
    if (unitsConsumed !== undefined) lightBill.unitsConsumed = unitsConsumed;
    if (ratePerUnit !== undefined) lightBill.ratePerUnit = ratePerUnit;
    if (fixedCharge !== undefined) lightBill.fixedCharge = fixedCharge;
    if (tax !== undefined) lightBill.tax = tax;
    if (issueDate !== undefined) lightBill.issueDate = issueDate;
    if (dueDate !== undefined) lightBill.dueDate = dueDate;
    if (notes !== undefined) lightBill.notes = notes;

    // Recalculate total amount if units or rate changed
    if (unitsConsumed !== undefined || ratePerUnit !== undefined || 
        fixedCharge !== undefined || tax !== undefined) {
      const units = unitsConsumed !== undefined ? unitsConsumed : lightBill.unitsConsumed;
      const rate = ratePerUnit !== undefined ? ratePerUnit : lightBill.ratePerUnit;
      const fixed = fixedCharge !== undefined ? fixedCharge : lightBill.fixedCharge;
      const taxes = tax !== undefined ? tax : lightBill.tax;
      lightBill.totalAmount = (units * rate) + fixed + taxes;
    }

    await lightBill.save();

    // Populate references for response
    await lightBill.populate("tenant", "fullName phone email");
    await lightBill.populate("room", "name floor");
    await lightBill.populate("lease", "startDate endDate rentPerMonth");

    res.status(200).json({
      success: true,
      message: "Light bill updated successfully",
      data: lightBill
    });
  } catch (error) {
    console.error("Light bill update error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while updating light bill" 
    });
  }
});

// DELETE /api/light-bills/:id
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const lightBill = await LightBill.findById(req.params.id);
    
    if (!lightBill) {
      return res.status(404).json({ 
        success: false,
        message: "Light bill not found" 
      });
    }

    await LightBill.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ 
      success: true,
      message: "Light bill deleted successfully" 
    });
  } catch (error) {
    console.error("Light bill deletion error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while deleting light bill" 
    });
  }
});

export default router;