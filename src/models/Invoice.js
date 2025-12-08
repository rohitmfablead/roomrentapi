import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    lease: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },

    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },

    baseAmount: { type: Number, required: true },
    lateFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid", "overdue"],
      default: "unpaid",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Invoice", invoiceSchema);
