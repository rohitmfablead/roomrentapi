import mongoose from "mongoose";

const leaseSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    
    rentPerMonth: { type: Number, required: true },
    depositAgreed: { type: Number, required: true },
    depositPaid: { type: Number, default: 0 },
    depositRefunded: { type: Number, default: 0 },
    
    billingDay: { type: Number, default: 1 }, // 1st of month
    
    status: {
      type: String,
      enum: ["upcoming", "active", "ended", "cancelled"],
      default: "active",
    },
    notes: String,
  },
  { timestamps: true }
);

// Index for better query performance
leaseSchema.index({ room: 1, status: 1 });
leaseSchema.index({ tenant: 1, status: 1 });

export default mongoose.model("Lease", leaseSchema);