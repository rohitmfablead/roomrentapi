import Notification from "../models/Notification.js";
import User from "../models/User.js";

/**
 * Create a new notification
 * @param {Object} notificationData - The notification data
 * @param {string} notificationData.title - The notification title
 * @param {string} notificationData.message - The notification message
 * @param {string} notificationData.type - The notification type
 * @param {string} notificationData.recipient - The recipient user ID
 * @param {string} notificationData.relatedEntity - The related entity ID (optional)
 * @param {string} notificationData.relatedEntityType - The related entity type (optional)
 * @param {string} notificationData.priority - The notification priority (optional)
 * @returns {Promise<Object>} The created notification
 */
export const createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error.message);
    throw error;
  }
};

/**
 * Create notifications for all admins
 * @param {Object} notificationData - The notification data
 * @returns {Promise<Array>} Array of created notifications
 */
export const createAdminNotifications = async (notificationData) => {
  try {
    // Find all admin users
    const admins = await User.find({ role: "admin" });
    
    // Create notifications for each admin
    const notifications = [];
    for (const admin of admins) {
      const notification = await createNotification({
        ...notificationData,
        recipient: admin._id,
      });
      notifications.push(notification);
    }
    
    return notifications;
  } catch (error) {
    console.error("Error creating admin notifications:", error.message);
    throw error;
  }
};

/**
 * Create payment notification
 * @param {Object} payment - The payment object
 * @param {string} paymentType - The type of payment (invoice or lightBill)
 * @returns {Promise<Object>} The created notification
 */
export const createPaymentNotification = async (payment, paymentType) => {
  try {
    let title, message, relatedEntity, relatedEntityType;
    
    if (paymentType === "invoice") {
      title = "Payment Received";
      message = `Payment of ₹${payment.amount} received for invoice #${payment.invoice._id}`;
      relatedEntity = payment.invoice._id;
      relatedEntityType = "Invoice";
    } else {
      title = "Light Bill Payment Received";
      message = `Payment of ₹${payment.paidAmount} received for light bill`;
      relatedEntity = payment._id;
      relatedEntityType = "LightBill";
    }
    
    const notification = await createAdminNotifications({
      title,
      message,
      type: "payment",
      relatedEntity,
      relatedEntityType,
      priority: "medium",
    });
    
    return notification;
  } catch (error) {
    console.error("Error creating payment notification:", error.message);
    throw error;
  }
};

/**
 * Create invoice notification
 * @param {Object} invoice - The invoice object
 * @returns {Promise<Object>} The created notification
 */
export const createInvoiceNotification = async (invoice) => {
  try {
    const notification = await createAdminNotifications({
      title: "New Invoice Generated",
      message: `Invoice #${invoice._id} generated for ${invoice.tenant.fullName} for period ${new Date(invoice.periodFrom).toLocaleDateString()} to ${new Date(invoice.periodTo).toLocaleDateString()}`,
      type: "invoice",
      relatedEntity: invoice._id,
      relatedEntityType: "Invoice",
      priority: "medium",
    });
    
    return notification;
  } catch (error) {
    console.error("Error creating invoice notification:", error.message);
    throw error;
  }
};

/**
 * Create overdue invoice notification
 * @param {Object} invoice - The overdue invoice object
 * @returns {Promise<Object>} The created notification
 */
export const createOverdueInvoiceNotification = async (invoice) => {
  try {
    const notification = await createAdminNotifications({
      title: "Overdue Invoice",
      message: `Invoice #${invoice._id} for ${invoice.tenant.fullName} is overdue`,
      type: "warning",
      relatedEntity: invoice._id,
      relatedEntityType: "Invoice",
      priority: "high",
    });
    
    return notification;
  } catch (error) {
    console.error("Error creating overdue invoice notification:", error.message);
    throw error;
  }
};

/**
 * Create maintenance notification
 * @param {Object} room - The room object
 * @param {string} message - The maintenance message
 * @returns {Promise<Object>} The created notification
 */
export const createMaintenanceNotification = async (room, message) => {
  try {
    const notification = await createAdminNotifications({
      title: "Room Maintenance Required",
      message: `Room ${room.name} requires maintenance. ${message}`,
      type: "maintenance",
      relatedEntity: room._id,
      relatedEntityType: "Room",
      priority: "high",
    });
    
    return notification;
  } catch (error) {
    console.error("Error creating maintenance notification:", error.message);
    throw error;
  }
};

export default {
  createNotification,
  createAdminNotifications,
  createPaymentNotification,
  createInvoiceNotification,
  createOverdueInvoiceNotification,
  createMaintenanceNotification,
};