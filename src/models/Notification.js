import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["info", "warning", "success", "error", "payment", "invoice", "maintenance"],
      default: "info",
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relatedEntity: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "relatedEntityType",
    },
    relatedEntityType: {
      type: String,
      enum: ["Payment", "Invoice", "Lease", "Tenant", "Room", "LightBill"],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
  },
  { timestamps: true }
);

// Index for efficient querying
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);