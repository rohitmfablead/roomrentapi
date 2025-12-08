import mongoose from "mongoose";

const lightBillSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    lease: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },
    
    // Billing period
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    
    // Bill details
    unitsConsumed: { type: Number, required: true },
    ratePerUnit: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    
    // Payment details
    paidAmount: { type: Number, default: 0 },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    
    status: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid", "overdue"],
      default: "unpaid",
    },
    
    // Additional charges
    fixedCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    
    notes: String,
  },
  { timestamps: true }
);

export default mongoose.model("LightBill", lightBillSchema);