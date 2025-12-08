import express from "express";
import Tenant from "../models/Tenant.js";
import Lease from "../models/Lease.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/tenants?status=active
router.get("/", authRequired, async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const tenants = await Tenant.find(query);
    res.status(200).json({
      success: true,
      count: tenants.length,
      data: tenants
    });
  } catch (error) {
    console.error("Error fetching tenants:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching tenants" 
    });
  }
});

// GET /api/tenants/:id/rooms - Get rooms for a specific tenant
router.get("/:id/rooms", authRequired, async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    // Find all leases for this tenant
    const leases = await Lease.find({ tenant: tenantId })
      .populate("room", "name floor status")
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: leases.length,
      data: leases
    });
  } catch (error) {
    console.error("Error fetching tenant rooms:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching tenant rooms" 
    });
  }
});

// POST /api/tenants
router.post("/", authRequired, async (req, res) => {
  try {
    const { fullName, phone, email } = req.body;
    
    // Validation
    if (!fullName) {
      return res.status(400).json({ 
        success: false,
        message: "Full name is required" 
      });
    }
    
    if (!phone) {
      return res.status(400).json({ 
        success: false,
        message: "Phone number is required" 
      });
    }
    
    // Check for duplicate tenant by phone
    const existingTenant = await Tenant.findOne({ phone });
    if (existingTenant) {
      return res.status(400).json({ 
        success: false,
        message: "Tenant with this phone number already exists" 
      });
    }
    
    // Check for duplicate tenant by email if provided
    if (email) {
      const existingEmail = await Tenant.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ 
          success: false,
          message: "Tenant with this email already exists" 
        });
      }
    }
    
    const tenant = await Tenant.create(req.body);
    res.status(201).json({
      success: true,
      message: "Tenant created successfully",
      data: tenant
    });
  } catch (error) {
    console.error("Tenant creation error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while creating tenant" 
    });
  }
});

// PUT /api/tenants/:id
router.put("/:id", authRequired, async (req, res) => {
  try {
    const { fullName, phone, email } = req.body;
    
    // Validation
    if (fullName !== undefined && !fullName) {
      return res.status(400).json({ 
        success: false,
        message: "Full name cannot be empty" 
      });
    }
    
    if (phone !== undefined && !phone) {
      return res.status(400).json({ 
        success: false,
        message: "Phone number cannot be empty" 
      });
    }
    
    // Check for duplicate tenant by phone (excluding current tenant)
    if (phone) {
      const existingTenant = await Tenant.findOne({ phone, _id: { $ne: req.params.id } });
      if (existingTenant) {
        return res.status(400).json({ 
          success: false,
          message: "Tenant with this phone number already exists" 
        });
      }
    }
    
    // Check for duplicate tenant by email if provided (excluding current tenant)
    if (email) {
      const existingEmail = await Tenant.findOne({ email, _id: { $ne: req.params.id } });
      if (existingEmail) {
        return res.status(400).json({ 
          success: false,
          message: "Tenant with this email already exists" 
        });
      }
    }
    
    const updated = await Tenant.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    if (!updated) {
      return res.status(404).json({ 
        success: false,
        message: "Tenant not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Tenant updated successfully",
      data: updated
    });
  } catch (error) {
    console.error("Tenant update error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while updating tenant" 
    });
  }
});

export default router;