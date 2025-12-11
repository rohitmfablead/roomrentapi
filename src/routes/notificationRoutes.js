import express from "express";
import Notification from "../models/Notification.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/notifications/unread-count - Get count of unread notifications
router.get("/unread-count", authRequired, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("Error fetching unread notification count:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching unread notification count",
    });
  }
});

// GET /api/notifications/read-all - Mark all notifications as read
router.put("/read-all", authRequired, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while marking notifications as read",
    });
  }
});

// GET /api/notifications - Get all notifications for the logged-in user
router.get("/", authRequired, async (req, res) => {
  try {
    const { isRead, type, limit = 20, page = 1 } = req.query;
    const query = { recipient: req.user._id };

    // Apply filters
    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }
    if (type) {
      query.type = type;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("relatedEntity");

    const totalNotifications = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      count: notifications.length,
      total: totalNotifications,
      page: parseInt(page),
      pages: Math.ceil(totalNotifications / limit),
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching notifications",
    });
  }
});

// GET /api/notifications/:id - Get a specific notification by ID
router.get("/:id", authRequired, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id)
      .populate("recipient", "name email")
      .populate("relatedEntity");

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Check if the notification belongs to the logged-in user
    if (notification.recipient._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this notification",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Error fetching notification:", error.message);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while fetching notification",
    });
  }
});

// PUT /api/notifications/:id/read - Mark a notification as read
router.put("/:id/read", authRequired, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Check if the notification belongs to the logged-in user
    if (notification.recipient._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this notification",
      });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Error updating notification:", error.message);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while updating notification",
    });
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Check if the notification belongs to the logged-in user
    if (notification.recipient._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this notification",
      });
    }

    await notification.remove();

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error.message);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while deleting notification",
    });
  }
});

// DELETE /api/notifications - Delete all read notifications
router.delete("/", authRequired, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id,
      isRead: true,
    });

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} read notifications`,
    });
  } catch (error) {
    console.error("Error deleting read notifications:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while deleting read notifications",
    });
  }
});

export default router;