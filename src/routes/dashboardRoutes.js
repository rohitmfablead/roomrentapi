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

    // 3. This Month's Collection (Payments) - Enhanced breakdown
    // Get all invoices for the current month
    const currentMonthInvoices = await Invoice.find({
      periodFrom: { $lte: endOfMonth },
      periodTo: { $gte: startOfMonth }
    });
    
    // Calculate total expected from invoices for the month
    let totalExpectedFromInvoices = 0;
    currentMonthInvoices.forEach(invoice => {
      totalExpectedFromInvoices += invoice.totalAmount || 0;
    });
    
    // Get actual payments received for invoices in the current month
    const thisMonthInvoicePayments = await Payment.aggregate([
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
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const invoicePaymentsReceived = thisMonthInvoicePayments.length > 0 ? thisMonthInvoicePayments[0].total : 0;
    const invoicePaymentCount = thisMonthInvoicePayments.length > 0 ? thisMonthInvoicePayments[0].count : 0;
    
    // Get light bills for the current month
    const currentMonthLightBills = await LightBill.find({
      issueDate: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    });
    
    // Calculate total expected from light bills for the month
    let totalExpectedFromLightBills = 0;
    currentMonthLightBills.forEach(bill => {
      totalExpectedFromLightBills += bill.totalAmount || 0;
    });
    
    // Get actual payments received for light bills in the current month
    const thisMonthLightBillPayments = await LightBill.aggregate([
      {
        $match: {
          updatedAt: {
            $gte: startOfMonth,
            $lte: endOfMonth
          },
          paidAmount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$paidAmount" },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const lightBillPaymentsReceived = thisMonthLightBillPayments.length > 0 ? thisMonthLightBillPayments[0].total : 0;
    const lightBillPaymentCount = thisMonthLightBillPayments.length > 0 ? thisMonthLightBillPayments[0].count : 0;
    
    // Total collection includes both invoice and light bill payments
    const thisMonthCollection = invoicePaymentsReceived + lightBillPaymentsReceived;
    
    // Total expected includes both invoices and light bills
    const totalExpectedCollection = totalExpectedFromInvoices + totalExpectedFromLightBills;
    
    // Payment count
    const totalPaymentsCount = invoicePaymentCount + lightBillPaymentCount;

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
    // Get invoice payments
    const monthlyInvoicePayments = await Payment.aggregate([
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

    // Get light bill payments (based on paidAmount and updatedAt)
    const monthlyLightBillPayments = await LightBill.aggregate([
      {
        $match: {
          updatedAt: { $gte: sixMonthsAgo },
          paidAmount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$updatedAt" },
            month: { $month: "$updatedAt" }
          },
          total: { $sum: "$paidAmount" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Combine invoice and light bill payments by month
    const monthlyCollectionsMap = new Map();
    
    // Add invoice payments to map
    monthlyInvoicePayments.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      if (!monthlyCollectionsMap.has(key)) {
        monthlyCollectionsMap.set(key, {
          year: item._id.year,
          month: item._id.month,
          revenue: 0,
          expenses: 0,
          count: 0
        });
      }
      const existing = monthlyCollectionsMap.get(key);
      existing.revenue += item.total;
      existing.count += item.count;
    });
    
    // Add light bill payments to map
    monthlyLightBillPayments.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      if (!monthlyCollectionsMap.has(key)) {
        monthlyCollectionsMap.set(key, {
          year: item._id.year,
          month: item._id.month,
          revenue: 0,
          expenses: 0,
          count: 0
        });
      }
      const existing = monthlyCollectionsMap.get(key);
      existing.expenses += item.total;
      existing.count += item.count;
    });
    
    // Convert map to array and format for charts
    const formattedCollections = Array.from(monthlyCollectionsMap.values()).map(item => ({
      month: `${item.month}/${item.year}`,
      revenue: item.revenue,
      expenses: item.expenses,
      profit: item.revenue - item.expenses,
      transactions: item.count
    })).sort((a, b) => {
      const [aMonth, aYear] = a.month.split('/').map(Number);
      const [bMonth, bYear] = b.month.split('/').map(Number);
      return new Date(aYear, aMonth - 1) - new Date(bYear, bMonth - 1);
    });

    // 15. Month-wise payment details
    // Get detailed payment information for the current month
    const thisMonthPaymentDetails = await Payment.find({
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    })
      .populate("tenant", "fullName")
      .populate("invoice", "periodFrom periodTo totalAmount")
      .sort({ date: -1 });

    // Get detailed light bill payment information for the current month
    const thisMonthLightBillDetails = await LightBill.find({
      updatedAt: {
        $gte: startOfMonth,
        $lte: endOfMonth
      },
      paidAmount: { $gt: 0 }
    })
      .populate("tenant", "fullName")
      .populate("room", "name")
      .sort({ updatedAt: -1 });

    // Format payment details
    const formattedPaymentDetails = [
      ...thisMonthPaymentDetails.map(payment => ({
        _id: payment._id,
        type: "invoice",
        tenant: payment.tenant?.fullName || "Unknown Tenant",
        amount: payment.amount,
        date: payment.date,
        mode: payment.mode,
        period: payment.invoice ? 
          `${new Date(payment.invoice.periodFrom).toLocaleDateString()} - ${new Date(payment.invoice.periodTo).toLocaleDateString()}` : 
          "N/A"
      })),
      ...thisMonthLightBillDetails.map(bill => ({
        _id: bill._id,
        type: "lightBill",
        tenant: bill.tenant?.fullName || "Unknown Tenant",
        amount: bill.paidAmount,
        date: bill.updatedAt,
        mode: "Cash",
        period: bill.periodFrom ? 
          `${new Date(bill.periodFrom).toLocaleDateString()} - ${new Date(bill.periodTo).toLocaleDateString()}` : 
          "N/A"
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // 16. Enhanced Overview with payment breakdown
    // Count total payments for the month
    const totalMonthlyPayments = formattedPaymentDetails.length;
    
    // Sum up invoice payments and light bill payments separately
    let invoicePaymentsTotal = 0;
    let lightBillPaymentsTotal = 0;
    
    formattedPaymentDetails.forEach(payment => {
      if (payment.type === "invoice") {
        invoicePaymentsTotal += payment.amount;
      } else if (payment.type === "lightBill") {
        lightBillPaymentsTotal += payment.amount;
      }
    });

    // 17. Room status distribution (chart data)
    const roomStatusDistribution = await Room.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // 18. Tenant status distribution (chart data)
    const tenantStatusDistribution = await Tenant.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // 19. Detailed room information
    const detailedRooms = await Room.find()
      .populate({
        path: "currentLease",
        populate: [
          { path: "tenant", select: "fullName phone" }
        ]
      });

    // 20. Recent Light Bills (last 5)
    const recentLightBills = await LightBill.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("tenant", "fullName")
      .populate("room", "name");

    // 21. Light Bill Summary
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
          thisMonthCollection: {
            collected: thisMonthCollection,
            expected: totalExpectedCollection,
            percentage: totalExpectedCollection > 0 ? Math.round((thisMonthCollection / totalExpectedCollection) * 100) : 0,
            from: {
              invoices: {
                collected: invoicePaymentsReceived,
                expected: totalExpectedFromInvoices,
                count: invoicePaymentCount
              },
              lightBills: {
                collected: lightBillPaymentsReceived,
                expected: totalExpectedFromLightBills,
                count: lightBillPaymentCount
              }
            }
          },
          thisMonthExpenses,
          revenueVsExpenses,
          overdueInvoices,
          pendingLightBills,
          // Enhanced payment breakdown
          monthlyPaymentBreakdown: {
            totalPayments: totalMonthlyPayments,
            invoicePayments: invoicePaymentsTotal,
            lightBillPayments: lightBillPaymentsTotal
          }
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
        // Month-wise payment details
        thisMonthPayments: formattedPaymentDetails,
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