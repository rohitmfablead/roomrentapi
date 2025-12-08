import express from "express";
import Room from "../models/Room.js";
import Tenant from "../models/Tenant.js";
import Lease from "../models/Lease.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import LightBill from "../models/LightBill.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/dashboard - Get comprehensive dashboard statistics
router.get("/", authRequired, async (req, res) => {
  try {
    // Get current date for filtering or use provided month/year
    const { month, year } = req.query;
    let currentDate, startOfMonth, endOfMonth;
    
    if (month && year) {
      // Use provided month/year
      const monthIndex = parseInt(month) - 1; // JS months are 0-indexed
      currentDate = new Date(year, monthIndex, 1);
      startOfMonth = new Date(year, monthIndex, 1);
      endOfMonth = new Date(year, monthIndex + 1, 0);
    } else {
      // Use current date
      currentDate = new Date();
      startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    }
    
    const sixMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);

    // 1. Total Rooms
    const totalRooms = await Room.countDocuments();

    // 2. Active Tenants
    const activeTenants = await Tenant.countDocuments({ status: "active" });

    // 3. This Month's Collection (Payments)
    const thisMonthPayments = await Payment.aggregate([
      {
        $match: {
          date: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]);

    const thisMonthCollection = thisMonthPayments.length > 0 ? thisMonthPayments[0].total : 0;

    // 4. Overdue Invoices
    const overdueInvoices = await Invoice.countDocuments({ 
      status: "overdue",
      dueDate: { $lt: currentDate }
    });

    // 5. Room Availability
    const roomAvailability = await Room.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert room availability to object format
    const roomAvailabilityObj = {};
    roomAvailability.forEach(item => {
      roomAvailabilityObj[item._id] = item.count;
    });

    // 6. Recent Invoices (last 5)
    const recentInvoices = await Invoice.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("tenant", "fullName")
      .populate("room", "name");

    // 7. Active Leases
    const activeLeases = await Lease.countDocuments({ status: "active" });

    // 8. Upcoming Leases
    const upcomingLeases = await Lease.countDocuments({ 
      status: "upcoming",
      startDate: { $gte: currentDate }
    });

    // 9. This Month's Expenses (Light Bills)
    const thisMonthLightBills = await LightBill.aggregate([
      {
        $match: {
          issueDate: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" }
        }
      }
    ]);

    const thisMonthExpenses = thisMonthLightBills.length > 0 ? thisMonthLightBills[0].total : 0;

    // 10. Pending Light Bills
    const pendingLightBills = await LightBill.countDocuments({ 
      status: { $in: ["unpaid", "partially_paid"] }
    });

    // 11. Recent Payments (last 5)
    const recentPayments = await Payment.find()
      .sort({ date: -1 })
      .limit(5)
      .populate("tenant", "fullName")
      .populate("invoice", "periodFrom periodTo");

    // 12. Revenue vs Expenses for current month
    const revenueVsExpenses = {
      revenue: thisMonthCollection,
      expenses: thisMonthExpenses,
      profit: thisMonthCollection - thisMonthExpenses
    };

    // 13. Invoice Summary (for the specified month if provided)
    // Build query for invoices based on month/year
    let invoiceQuery = {};
    if (month && year) {
      invoiceQuery.periodFrom = { $gte: startOfMonth };
      invoiceQuery.periodTo = { $lte: endOfMonth };
    }
    
    const allInvoices = await Invoice.find(invoiceQuery);
    let totalExpected = 0;
    let totalCollected = 0;
    let totalPending = 0;
    
    allInvoices.forEach(invoice => {
      totalExpected += invoice.totalAmount || 0;
      totalCollected += invoice.paidAmount || 0;
      totalPending += (invoice.totalAmount - (invoice.paidAmount || 0));
    });

    // 14. Monthly collections for the last 6 months (chart data)
    const monthlyCollections = await Payment.aggregate([
      {
        $match: {
          date: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" }
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Format the data for charts
    const formattedCollections = monthlyCollections.map(item => ({
      month: `${item._id.month}/${item._id.year}`,
      amount: item.total,
      transactions: item.count
    }));

    // 15. Room status distribution (chart data)
    const roomStatusDistribution = await Room.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // 16. Tenant status distribution (chart data)
    const tenantStatusDistribution = await Tenant.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // 17. Detailed room information
    const detailedRooms = await Room.find()
      .populate({
        path: "currentLease",
        populate: [
          { path: "tenant", select: "fullName phone" }
        ]
      });

    // 18. Recent Light Bills (last 5)
    const recentLightBills = await LightBill.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("tenant", "fullName")
      .populate("room", "name");

    // 19. Light Bill Summary
    const allLightBills = await LightBill.find();
    let totalLightBillAmount = 0;
    let totalLightBillPaid = 0;
    let totalLightBillPending = 0;
    
    allLightBills.forEach(bill => {
      totalLightBillAmount += bill.totalAmount || 0;
      totalLightBillPaid += bill.paidAmount || 0;
      totalLightBillPending += (bill.totalAmount - (bill.paidAmount || 0));
    });

    res.status(200).json({
      success: true,
      data: {
        // Main dashboard metrics
        overview: {
          totalRooms,
          activeTenants,
          activeLeases,
          upcomingLeases,
          thisMonthCollection,
          thisMonthExpenses,
          revenueVsExpenses,
          overdueInvoices,
          pendingLightBills
        },
        // Room availability breakdown
        roomAvailability: roomAvailabilityObj,
        // Financial summary
        invoiceSummary: {
          totalExpected,
          totalCollected,
          totalPending
        },
        // Light Bill Summary
        lightBillSummary: {
          totalAmount: totalLightBillAmount,
          totalPaid: totalLightBillPaid,
          totalPending: totalLightBillPending
        },
        // Recent activity
        recentActivity: {
          recentInvoices,
          recentPayments,
          recentLightBills
        },
        // Chart data
        charts: {
          monthlyCollections: formattedCollections,
          roomStatusDistribution,
          tenantStatusDistribution
        },
        // Detailed information
        detailedRooms
      }
    });
  } catch (error) {
    console.error("Dashboard data fetch error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching dashboard data" 
    });
  }
});

export default router;