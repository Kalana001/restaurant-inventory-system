# Restaurant Inventory Management System (Phase 1)

An enterprise-ready, modular, and clean-architecture Restaurant Inventory Management System. It tracks stock across multiple units of measure, calculates conversions, supports batch tracking with expiry alerts, manages suppliers, purchase orders, goods receipts (GRNs), and logs audit actions.

## Technology Stack

*   **Frontend**: React (Vite + TypeScript), Tailwind CSS, ShadCN UI, React Query, Axios, React Router.
*   **Backend**: Node.js, Express.js (TypeScript), Prisma ORM.
*   **Database**: PostgreSQL.

## Folder Directory Structure

```
restaurant-inventory-system/
├── frontend/             # React SPA Client
├── backend/              # Node.js Express REST API
├── database/             # raw DB tools & migrations
├── docs/                 # system architecture plans
└── README.md
```

## Running the Application

### Backend Setup
1. Navigate to `/backend`.
2. Install dependencies: `npm install`.
3. Set up your `.env` database connection.
4. Run migrations: `npx prisma migrate dev`.
5. Start development mode: `npm run dev`.

### Frontend Setup
1. Navigate to `/frontend`.
2. Install dependencies: `npm install`.
3. Start development server: `npm run dev`.
