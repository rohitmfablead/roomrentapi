import cron from "node-cron";
import Invoice from "../models/Invoice.js";
import Lease from "../models/Lease.js";

/**
 * Scheduled task to generate monthly invoices
 * Runs on the 1st day of every month at 2:00 AM
 */
export const scheduleMonthlyInvoiceGeneration = () => {
  // Schedule the task to run on the 1st day of every month at 2:00 AM
  cron.schedule("0 2 1 * *", async () => {
    console.log("Running scheduled monthly invoice generation...");
    
    try {
      const today = new Date();
      // For the 1st of the month, we want to generate invoices for the current month
      const month = today.getMonth(); // 0-indexed (0 = January)
      const year = today.getFullYear();
      
      const leases = await Lease.find({ status: "active" }).populate("room tenant");
      
      const created = [];
      
      for (const lease of leases) {
        // Generate invoice for the current month
        const periodFrom = new Date(year, month, 1);
        const periodTo = new Date(year, month + 1, 0);
        
        // Check for existing invoice for this lease and period
        const exists = await Invoice.findOne({
          lease: lease._id,
          periodFrom,
          periodTo,
        });
        
        if (exists) {
          console.log(`Invoice already exists for lease ${lease._id} for period ${periodFrom} to ${periodTo}`);
          continue;
        }
        
        // Set issue date to today and due date based on billing day
        const issueDate = today;
        const dueDate = new Date(year, month, lease.billingDay || 1);
        
        const invoice = await Invoice.create({
          lease: lease._id,
          tenant: lease.tenant._id,
          room: lease.room._id,
          periodFrom,
          periodTo,
          issueDate,
          dueDate,
          baseAmount: lease.rentPerMonth,
          totalAmount: lease.rentPerMonth,
        });
        
        await invoice.populate("tenant", "fullName phone");
        await invoice.populate("room", "name floor");
        await invoice.populate("lease", "startDate endDate rentPerMonth");
        
        created.push(invoice);
        console.log(`Generated invoice ${invoice._id} for lease ${lease._id}`);
      }
      
      console.log(`Monthly invoice generation completed. Created ${created.length} invoices.`);
    } catch (error) {
      console.error("Error in scheduled monthly invoice generation:", error.message);
    }
  });
  
  console.log("Monthly invoice generation scheduled for the 1st of every month at 2:00 AM");
};