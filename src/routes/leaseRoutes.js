import express from "express";
import Lease from "../models/Lease.js";
import Room from "../models/Room.js";
import Tenant from "../models/Tenant.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/leases?status=active
router.get("/", authRequired, async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const leases = await Lease.find(query)
      .populate("tenant", "fullName phone")
      .populate("room", "name floor defaultRent");
    res.status(200).json({
      success: true,
      count: leases.length,
      data: leases
    });
  } catch (error) {
    console.error("Error fetching leases:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching leases" 
    });
  }
});

// POST /api/leases  (create booking)
router.post("/", authRequired, async (req, res) => {
  try {
    const { tenant, room, startDate, endDate, rentPerMonth, depositAgreed, billingDay } = req.body;

    // Validation
    if (!tenant || !room) {
      return res.status(400).json({ 
        success: false,
        message: "Tenant and room are required" 
      });
    }

    if (!startDate) {
      return res.status(400).json({ 
        success: false,
        message: "Start date is required" 
      });
    }

    if (!rentPerMonth || rentPerMonth <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Rent per month must be a positive number" 
      });
    }

    if (!depositAgreed || depositAgreed < 0) {
      return res.status(400).json({ 
        success: false,
        message: "Deposit agreed must be zero or a positive number" 
      });
    }

    // Check if tenant and room exist
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({ 
        success: false,
        message: "Tenant not found" 
      });
    }

    const roomExists = await Room.findById(room);
    if (!roomExists) {
      return res.status(404).json({ 
        success: false,
        message: "Room not found" 
      });
    }

    // Check if room is already occupied
    if (roomExists.status === "occupied") {
      return res.status(400).json({ 
        success: false,
        message: "Room is already occupied" 
      });
    }

    // Check for overlapping leases for the same room
    const leaseQuery = { 
      room: room, 
      status: { $in: ["upcoming", "active"] }
    };
    
    // If endDate is provided, check for overlapping periods
    if (endDate) {
      leaseQuery.$or = [
        { startDate: { $lte: new Date(startDate) }, endDate: { $gte: new Date(startDate) } },
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(endDate) } },
        { startDate: { $gte: new Date(startDate) }, endDate: { $lte: new Date(endDate) } }
      ];
    } else {
      // If no endDate, check if there's any lease that starts before or at the same time
      leaseQuery.startDate = { $lte: new Date(startDate) };
    }
    
    const existingLease = await Lease.findOne(leaseQuery);
    
    if (existingLease) {
      return res.status(400).json({ 
        success: false,
        message: "Room already has an active or upcoming lease during this period" 
      });
    }

    const lease = await Lease.create({
      tenant,
      room,
      startDate,
      endDate,
      rentPerMonth,
      depositAgreed,
      billingDay,
    });

    // Update room status and currentLease reference
    await Room.findByIdAndUpdate(room, { 
      status: "occupied",
      currentLease: lease._id
    });

    // Populate references
    await lease.populate("tenant", "fullName phone");
    await lease.populate("room", "name floor");

    res.status(201).json({
      success: true,
      message: "Lease created successfully",
      data: lease
    });
  } catch (error) {
    console.error("Lease creation error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while creating lease" 
    });
  }
});

// PATCH /api/leases/:id/end   (end booking)
router.patch("/:id/end", authRequired, async (req, res) => {
  try {
    const { endDate, notes } = req.body;

    const lease = await Lease.findById(req.params.id);
    if (!lease) return res.status(404).json({ 
      success: false,
      message: "Lease not found" 
    });

    lease.endDate = endDate || new Date();
    lease.status = "ended";
    lease.notes = notes;
    await lease.save();

    // Update room status and clear currentLease reference
    await Room.findByIdAndUpdate(lease.room, { 
      status: "vacant",
      currentLease: null
    });

    // Populate references
    await lease.populate("tenant", "fullName phone");
    await lease.populate("room", "name floor");

    res.json({
      success: true,
      message: "Lease ended successfully",
      data: lease
    });
  } catch (error) {
    console.error("Lease end error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while ending lease" 
    });
  }
});

export default router;