import express from "express";
import Room from "../models/Room.js";
import Lease from "../models/Lease.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/rooms?status=vacant
router.get("/", authRequired, async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const rooms = await Room.find(query);
    res.status(200).json({
      success: true,
      count: rooms.length,
      data: rooms
    });
  } catch (error) {
    console.error("Error fetching rooms:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching rooms" 
    });
  }
});

// GET /api/rooms/:id/tenants - Get tenants for a specific room
router.get("/:id/tenants", authRequired, async (req, res) => {
  try {
    const roomId = req.params.id;
    
    // Find all leases for this room
    const leases = await Lease.find({ room: roomId })
      .populate("tenant", "fullName phone email status")
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: leases.length,
      data: leases
    });
  } catch (error) {
    console.error("Error fetching room tenants:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching room tenants" 
    });
  }
});

// POST /api/rooms
router.post("/", authRequired, async (req, res) => {
  try {
    const { name, floor, capacity, defaultRent, defaultDeposit, status, notes } = req.body;
    
    // Validation
    if (!name) {
      return res.status(400).json({ 
        success: false,
        message: "Room name is required" 
      });
    }
    
    if (!defaultRent || defaultRent <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Default rent must be a positive number" 
      });
    }
    
    if (!defaultDeposit || defaultDeposit < 0) {
      return res.status(400).json({ 
        success: false,
        message: "Default deposit must be zero or a positive number" 
      });
    }
    
    // Check for duplicate room name
    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return res.status(400).json({ 
        success: false,
        message: "Room with this name already exists" 
      });
    }
    
    const room = await Room.create(req.body);
    res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: room
    });
  } catch (error) {
    console.error("Room creation error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while creating room" 
    });
  }
});

// PUT /api/rooms/:id
router.put("/:id", authRequired, async (req, res) => {
  try {
    const { name, defaultRent, defaultDeposit } = req.body;
    
    // Validation
    if (name !== undefined && !name) {
      return res.status(400).json({ 
        success: false,
        message: "Room name cannot be empty" 
      });
    }
    
    if (defaultRent !== undefined && (defaultRent <= 0)) {
      return res.status(400).json({ 
        success: false,
        message: "Default rent must be a positive number" 
      });
    }
    
    if (defaultDeposit !== undefined && (defaultDeposit < 0)) {
      return res.status(400).json({ 
        success: false,
        message: "Default deposit must be zero or a positive number" 
      });
    }
    
    // Check if updating name and if it already exists
    if (name) {
      const existingRoom = await Room.findOne({ name, _id: { $ne: req.params.id } });
      if (existingRoom) {
        return res.status(400).json({ 
          success: false,
          message: "Room with this name already exists" 
        });
      }
    }
    
    const updated = await Room.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    if (!updated) {
      return res.status(404).json({ 
        success: false,
        message: "Room not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Room updated successfully",
      data: updated
    });
  } catch (error) {
    console.error("Room update error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while updating room" 
    });
  }
});

export default router;