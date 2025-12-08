# Room Rental Backend

A backend application for managing room rentals, tenants, leases, invoices, and payments.

## Features Added

### Light Bill Management
- Create and manage electricity bills for rooms
- Track units consumed, rates, and additional charges
- Record payments against light bills
- Update and delete light bills
- Filter light bills by status and tenant

### Dashboard
- Comprehensive unified dashboard with all key metrics
- Single endpoint for all dashboard data
- Filter dashboard data by month/year

### Relationship Endpoints
- Get tenants for a specific room
- Get rooms for a specific tenant

### Automatic Invoice Generation
- Automatically generates invoices on the 1st of every month at 2:00 AM
- Uses cron job scheduling for reliable monthly invoicing
- Respects tenant billing day preferences

## Duplicate Prevention

All entities include duplicate prevention mechanisms:

### Rooms
- Prevent duplicate room names

### Tenants
- Prevent duplicate phone numbers
- Prevent duplicate email addresses

### Leases
- Prevent overlapping leases for the same room
- Prevent creating leases for occupied rooms

### Invoices
- Prevent duplicate invoices for the same lease and period
- Automatic duplicate checking during monthly generation

### Light Bills
- Prevent duplicate bills for the same room, tenant, lease, and period

### Users
- Prevent duplicate email addresses

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register admin user
- `POST /api/auth/login` - Login

### Dashboard
- `GET /api/dashboard` - Get unified dashboard statistics (supports filtering by month, year)

### Rooms
- `GET /api/rooms` - Get all rooms (supports filtering by status)
- `GET /api/rooms/:id/tenants` - Get tenants for a specific room
- `POST /api/rooms` - Create a new room
- `PUT /api/rooms/:id` - Update a room

### Tenants
- `GET /api/tenants` - Get all tenants (supports filtering by status)
- `GET /api/tenants/:id/rooms` - Get rooms for a specific tenant
- `POST /api/tenants` - Create a new tenant
- `PUT /api/tenants/:id` - Update a tenant

### Leases
- `GET /api/leases` - Get all leases (supports filtering by status)
- `POST /api/leases` - Create a new lease
- `PATCH /api/leases/:id/end` - End a lease

### Invoices
- `GET /api/invoices` - Get all invoices (supports filtering by status, tenantId, month, year)
- `POST /api/invoices/generate-monthly` - Generate monthly invoices
- `POST /api/invoices/:id/pay` - Record payment for an invoice
- `POST /api/invoices/recalculate-late-fees` - Recalculate late fees

### Light Bills
- `GET /api/light-bills` - Get all light bills (supports filtering by status and tenantId)
- `POST /api/light-bills` - Create a new light bill
- `POST /api/light-bills/:id/pay` - Record payment for a light bill
- `PUT /api/light-bills/:id` - Update a light bill
- `DELETE /api/light-bills/:id` - Delete a light bill

### Settings
- `GET /api/settings` - Get application settings
- `PUT /api/settings` - Update application settings

## Dashboard Metrics

The unified dashboard API provides all the following key metrics in a single endpoint:

### Overview Metrics
- **Total Rooms** - Count of all rooms in the system
- **Active Tenants** - Count of tenants with active status
- **Active Leases** - Count of currently active leases
- **Upcoming Leases** - Count of future leases
- **This Month's Collection** - Sum of payments received this month
- **This Month's Expenses** - Sum of light bill expenses this month
- **Revenue vs Expenses** - Profit calculation for current month
- **Overdue Invoices** - Count of invoices past their due date
- **Pending Light Bills** - Count of unpaid/partially paid light bills

### Room Availability
- Breakdown of rooms by status (vacant, occupied, maintenance)

### Financial Summary
- **Total Expected** - Sum of all invoice amounts
- **Total Collected** - Sum of all payments received
- **Total Pending** - Difference between expected and collected

### Recent Activity
- **Recent Invoices** - Last 5 created invoices
- **Recent Payments** - Last 5 recorded payments

### Charts Data
- **Monthly Collections** - Revenue trends for last 6 months
- **Room Status Distribution** - Pie chart data for room statuses
- **Tenant Status Distribution** - Pie chart data for tenant statuses

### Detailed Information
- **Detailed Rooms** - Complete room information with current lease data

## Response Structure

The dashboard API returns a structured response with all data organized in logical sections:

```javascript
{
  success: true,
  data: {
    overview: { /* Main metrics */ },
    roomAvailability: { /* Room status breakdown */ },
    invoiceSummary: { /* Financial summary */ },
    recentActivity: { /* Recent invoices and payments */ },
    charts: { /* Chart data for visualization */ },
    detailedRooms: { /* Complete room information */ }
  }
}
```

## Filtering by Month/Year

You can now filter both invoices and dashboard data by specific month and year:

### Invoices
```
GET /api/invoices?month=4&year=2024
```

### Dashboard
```
GET /api/dashboard?month=4&year=2024
```

Parameters:
- `month` - Month number (1-12)
- `year` - Full year (e.g., 2024)

This will return data for April 2024.

## Relationship Endpoints

### Get Tenants for a Room
```
GET /api/rooms/:id/tenants
```
Returns all tenants who have had leases for a specific room, sorted by lease start date (most recent first).

### Get Rooms for a Tenant
```
GET /api/tenants/:id/rooms
```
Returns all rooms a specific tenant has had leases for, sorted by lease start date (most recent first).

## Models

### Room
```javascript
{
  name: String,           // Unique room name
  floor: String,
  capacity: Number,
  currentOccupancy: Number,
  defaultRent: Number,
  defaultDeposit: Number,
  status: String,         // vacant, occupied, partially_occupied, maintenance
  currentLease: ObjectId, // Reference to current lease
  notes: String
}
```

### Tenant
```javascript
{
  fullName: String,
  phone: String,          // Unique phone number
  email: String,          // Unique email
  idProofType: String,
  idProofNumber: String,
  address: String,
  emergencyContact: {
    name: String,
    phone: String
  },
  status: String,         // active, inactive
  notes: String
}
```

### Lease
```javascript
{
  tenant: ObjectId,       // Reference to Tenant
  room: ObjectId,         // Reference to Room
  startDate: Date,
  endDate: Date,
  rentPerMonth: Number,
  depositAgreed: Number,
  depositPaid: Number,
  depositRefunded: Number,
  billingDay: Number,     // Day of month when invoice is due (1-31)
  status: String,         // upcoming, active, ended, cancelled
  notes: String
}
```

### Invoice
```javascript
{
  lease: ObjectId,        // Reference to Lease
  tenant: ObjectId,       // Reference to Tenant
  room: ObjectId,         // Reference to Room
  periodFrom: Date,
  periodTo: Date,
  issueDate: Date,
  dueDate: Date,
  baseAmount: Number,
  lateFee: Number,
  totalAmount: Number,
  paidAmount: Number,
  status: String          // unpaid, partially_paid, paid, overdue
}
```

### LightBill
```javascript
{
  room: ObjectId,         // Reference to Room
  tenant: ObjectId,       // Reference to Tenant
  lease: ObjectId,        // Reference to Lease
  periodFrom: Date,       // Billing period start
  periodTo: Date,         // Billing period end
  unitsConsumed: Number,  // Electricity units consumed
  ratePerUnit: Number,    // Rate per unit
  totalAmount: Number,    // Calculated total amount
  paidAmount: Number,     // Amount paid (default: 0)
  issueDate: Date,        // Bill issue date
  dueDate: Date,          // Bill due date
  status: String,         // unpaid, partially_paid, paid, overdue
  fixedCharge: Number,    // Fixed charges (default: 0)
  tax: Number,            // Tax amount (default: 0)
  notes: String           // Additional notes
}
```

### Settings
```javascript
{
  currency: String,
  defaultBillingDay: Number,
  lateFeeConfig: {
    type: String,         // per_day, percentage
    graceDays: Number,
    perDayAmount: Number,
    percentage: Number
  }
}
```

## Validation and Error Handling

All endpoints include comprehensive validation:

### POST /api/rooms
- Requires room name
- Validates defaultRent and defaultDeposit are positive numbers
- Prevents duplicate room names

### POST /api/tenants
- Requires full name and phone number
- Prevents duplicate phone numbers and emails

### POST /api/leases
- Requires tenant and room references
- Validates rentPerMonth and depositAgreed are positive numbers
- Prevents overlapping leases for the same room
- Prevents creating leases for occupied rooms

### POST /api/light-bills
- Requires room, tenant, and lease references
- Validates date ranges (periodFrom < periodTo, issueDate < dueDate)
- Ensures unitsConsumed and ratePerUnit are positive numbers
- Checks that referenced entities exist
- Prevents duplicate bills for the same period

### PUT /api/light-bills/:id
- Validates date ranges when updated
- Ensures numeric values are positive when updated
- Recalculates totalAmount when relevant fields change
- Prevents duplicate bills when period is updated

### POST /api/light-bills/:id/pay and POST /api/invoices/:id/pay
- Validates payment amount is positive
- Prevents payments that would exceed total amount
- Updates bill/invoice status based on payment amount

## Response Format

All endpoints return consistent response formats:

### Success Responses
```javascript
{
  success: true,
  message: "Description of action",
  data: { /* ... */ } // For GET, POST, PUT operations
}
```

### Error Responses
```javascript
{
  success: false,
  message: "Error description"
}
```

## Installation

1. Clone the repository
2. Run `npm install`
3. Set up environment variables in `.env` file
4. Run `npm run dev` to start the development server

## Environment Variables

- `PORT` - Server port (default: 5000)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT token generation

## Postman Collection

Import the `Room Rental Backend.postman_collection.json` file into Postman to access all API endpoints with examples.