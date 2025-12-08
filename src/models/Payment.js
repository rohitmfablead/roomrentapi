import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    lease: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },

    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    mode: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "card"],
      default: "cash",
    },
    note: String,
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
