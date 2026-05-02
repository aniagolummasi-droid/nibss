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
   # Optional real NIBSS/Phoenix integration credentials
   NIBSS_BASE_URL=https://nibssbyphoenix.onrender.com
   NIBSS_API_KEY=
   NIBSS_API_SECRET=
   NIBSS_ONBOARDING_URL=https://nibssbyphoenix.onrender.com/api/fintech/onboard
   NIBSS_AUTH_URL=https://nibssbyphoenix.onrender.com/api/auth/token
   NIBSS_AUTH_EMAIL=
   NIBSS_AUTH_PASSWORD=
   NIBSS_NAME_ENQUIRY_URL=
   NIBSS_TRANSFER_URL=
   NIBSS_TRANSFER_TOKEN=
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
- Inter-bank transfers use `NIBSS_BASE_URL` by default: `GET /api/account/name-enquiry/:accountNo` and `POST /api/transfer`.
- Set `NIBSS_TRANSFER_TOKEN`, or set `NIBSS_AUTH_EMAIL` and `NIBSS_AUTH_PASSWORD` so the app can call `POST /api/auth/token` before NIBSS-protected requests.
- To send to another NIBSS-registered bank or fintech, supply that institution's bank code on the transfer request.
