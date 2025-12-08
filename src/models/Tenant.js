import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    idProofType: { type: String }, // Aadhaar, PAN, etc.
    idProofNumber: { type: String },
    address: { type: String },
    emergencyContact: {
      name: String,
      phone: String,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    notes: String,
  },
  { timestamps: true }
);

export default mongoose.model("Tenant", tenantSchema);
