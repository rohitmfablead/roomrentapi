import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // Room 101
    floor: { type: String },
    capacity: { type: Number, default: 1 },
    currentOccupancy: { type: Number, default: 0 },
    defaultRent: { type: Number, required: true },
    defaultDeposit: { type: Number, required: true },
    status: {
      type: String,
      enum: ["vacant", "occupied", "partially_occupied", "maintenance"],
      default: "vacant",
    },
    currentLease: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Lease" 
    },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Room", roomSchema);