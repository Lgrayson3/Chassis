# Chassis - Health Protocol Platform

Chassis is a GLP-1 and longevity clinical enablement platform. It combines an Expo-based React Native mobile application for patients with a React-based Vite clinic dashboard for doctors, coordinated by a Supabase serverless backend.

## Project Structure

```
chassis/
├── mobile/                   # Expo React Native App (Patient Client)
│   ├── src/
│   │   ├── lib/supabase.ts   # Supabase client wrapper
│   │   ├── hooks/            # useAuth, usePushNotifications
│   │   ├── navigation/       # Screen routers
│   │   └── screens/          # Onboarding, Today, Meals, Train, Grocery, Settings
│   └── package.json
│
├── clinic-dashboard/         # React SPA (Clinician Dashboard)
│   ├── src/
│   │   ├── lib/supabase.ts   # Supabase client connection
│   │   └── pages/            # LoginPage, PatientPanel, PatientDetail, ClinicSettings
│   └── package.json
│
└── supabase/                 # Backend Config & Migrations
    ├── schema.sql            # Core database schema with RLS, triggers, and RPCs
    └── functions/            # Deno Edge Functions
        ├── nudge-dispatcher/         # Automated push notifications check
        ├── generate-physician-report/ # Monthly PDF generation using pdfkit
        ├── stripe-webhook/           # Subscription webhook processing
        └── create-checkout-session/  # Stripe checkout generation
```

---

## 1. Getting Started Locally

### Prerequisites
Ensure you have Node.js installed.

### Patient Mobile App (Expo)
1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npx expo start
   ```
   Press `a` for Android Emulator, `i` for iOS Simulator, or scan the QR code using the Expo Go app.

### Clinician Dashboard
1. Navigate to the clinic dashboard directory:
   ```bash
   cd clinic-dashboard
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the application:
   ```bash
   npm start
   ```

---

## 2. Environment Variables

Both apps have local `.env` files created with your Supabase credentials:

### Mobile (`mobile/.env`)
```env
EXPO_PUBLIC_SUPABASE_URL=https://rccyzawwruxbbsusiywl.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Clinic Dashboard (`clinic-dashboard/.env`)
```env
REACT_APP_SUPABASE_URL=https://rccyzawwruxbbsusiywl.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 3. Database & Edge Functions Setup

The schema is deployed on your project `rccyzawwruxbbsusiywl`. The edge functions are fully compiled and deployed.

### Deploying Edge Functions Updates
If you update any of the edge functions in `supabase/functions/`, deploy them using your access token:
```bash
# Set your token in the terminal (PowerShell example):
$env:SUPABASE_ACCESS_TOKEN="sbp_your_token_here"

# Deploying a function
npx supabase functions deploy create-checkout-session --project-ref rccyzawwruxbbsusiywl
npx supabase functions deploy stripe-webhook --project-ref rccyzawwruxbbsusiywl --no-verify-jwt
npx supabase functions deploy generate-physician-report --project-ref rccyzawwruxbbsusiywl
npx supabase functions deploy nudge-dispatcher --project-ref rccyzawwruxbbsusiywl --no-verify-jwt
```

### Configuring Supabase Secrets for Stripe Integration
Set your Stripe secrets on the Supabase project to enable checkout and webhooks:
```bash
# Set your token
$env:SUPABASE_ACCESS_TOKEN="sbp_your_token_here"

# Set credentials
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_... --project-ref rccyzawwruxbbsusiywl
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref rccyzawwruxbbsusiywl
npx supabase secrets set STRIPE_PRICE_ID=price_... --project-ref rccyzawwruxbbsusiywl
```
