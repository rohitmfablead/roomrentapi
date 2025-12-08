import express from "express";
import Settings from "../models/Settings.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/settings
router.get("/", authRequired, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error("Error fetching settings:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching settings" 
    });
  }
});

// PUT /api/settings
router.put("/", authRequired, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create(req.body);
    } else {
      Object.assign(settings, req.body);
      await settings.save();
    }
    res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: settings
    });
  } catch (error) {
    console.error("Settings update error:", error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        error: error.message 
      });
    }
    res.status(500).json({ 
      success: false,
      message: "Server error while updating settings" 
    });
  }
});

export default router;