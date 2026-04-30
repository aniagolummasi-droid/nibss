# Digital Banking Backend

Backend implementation for a digital banking system assignment.

## Features

- Customer onboarding with BVN/NIN verification
- Single account per customer
- Account creation pre-funded with ₦15,000
- Intra-bank and inter-bank transfers
- Name enquiry for recipient verification
- Balance and transaction status checks
- Transaction history with strict customer isolation

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root with:
   ```env
   PORT=4000
   JWT_SECRET=supersecretkey
   BANK_CODE=775
   BANK_NAME=MMA Bank
   MONGO_URI=mongodb://localhost:27017/mma-bank
   # Optional real onboarding integration credentials
   NIBSS_API_KEY=
   NIBSS_API_SECRET=
   NIBSS_ONBOARDING_URL=https://nibssbyphoenix.onrender.com/api/onboarding/verify
   ```
3. Start the server:
   ```bash
   npm start
   ```

## API Endpoints

- `POST /auth/login` - login and receive JWT token
- `POST /customer/onboarding` - onboard and verify a customer
- `POST /customer/accounts` - create account for onboarded customer
- `GET /customer/accounts/balance` - check balance
- `GET /customer/transactions/history` - fetch transaction history
- `GET /customer/transactions/status/:reference` - check transaction status
- `POST /account/payments/name-enquiry` - verify recipient details
- `POST /account/payments/transfer` - execute transfer

## Notes

- A customer can only have one account.
- Accounts are pre-funded with ₦15,000 on creation.
- Transaction history is only visible to the authenticated customer.
- External bank transfers are simulated for inter-bank transfers.

# nibss