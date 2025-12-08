import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    currency: { type: String, default: "INR" },
    defaultBillingDay: { type: Number, default: 1 }, // 1st of month
    lateFeeConfig: {
      type: {
        type: String,
        enum: ["per_day", "percentage"],
        default: "per_day",
      },
      graceDays: { type: Number, default: 3 },
      perDayAmount: { type: Number, default: 5 },
      percentage: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", settingsSchema);
