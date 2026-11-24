# RentMate: AI-Powered Rental and Roommate Finder

RentMate is a full-stack web app that helps people find rental homes and compatible roommates. It combines listings, AI-based matching and rent analysis, in-app chat, visit scheduling, and an admin dashboard.

## Features

- **Two user roles:** seekers look for homes and roommates, owners post and manage listings. Admins moderate the platform.
- **Browse and search listings** with location search and a map view.
- **AI roommate matcher** that scores compatibility between people.
- **AI rent tools:** rent analysis and trend charts, price recommendations, and a negotiation advisor.
- **AI document analyzer** for rental documents, and an **agreement generator**.
- **AI chatbot** to answer questions inside the app.
- **Chat, notifications, and visit scheduling** between seekers and owners.
- **Bookmarks, reviews, and reports** for listings and users.
- **Contact requests and payments** for unlocking owner contact details and premium features.
- **Fraud detection** and an admin dashboard for moderation and support queries.
- **PDF export** of reports.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React 19, Vite, React Router, Axios, Chart.js, Recharts, Leaflet |
| Backend | Node.js, Express 5, JWT authentication, bcrypt, Multer |
| Database | MySQL |
| AI | Groq API (backend), Google Generative AI SDK (frontend) |
| Other | Tesseract.js (OCR for ID documents), pdf-parse, jsPDF |

## Project structure

```
rentalproject/
├── rental-roommate-finder/   # React frontend (Vite)
│   └── src/
│       ├── components/       # Reusable UI pieces
│       ├── pages/            # Screens (dashboards, listings, chat, admin...)
│       └── utils/            # API helpers, payments, storage
└── rentmate-backend/         # Express API
    ├── routes/               # API endpoints
    ├── services/             # Matching, fraud detection, notifications
    ├── middleware/           # Auth
    ├── setup.js              # Creates the database and base tables
    └── migrate_*.js          # Schema migration scripts
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- [MySQL](https://dev.mysql.com/downloads/) running locally
- A [Groq API key](https://console.groq.com) for the AI features

### 1. Clone the repository

```
git clone https://github.com/muhsinaacr/rentalproject.git
cd rentalproject
```

### 2. Set up the backend

```
cd rentmate-backend
npm install
```

Create a file named `.env` inside `rentmate-backend` with these values (use your own):

```
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=rentmate_db
JWT_SECRET=a_long_random_string
PORT=5000
GROQ_API_KEY=your_groq_api_key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=choose_a_strong_password
```

> The `.env` file holds secrets and is excluded from Git. Never commit it.

`setup.js` uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create the admin account you log in with at `/admin`.

Create the database and tables, then run the migration scripts that your setup needs:

```
node setup.js
node migrate.js
```

The other `migrate_*.js` files add later schema changes. Run them as needed for a fresh database.

Start the server:

```
npm start
```

The API runs at `http://localhost:5000`.

### 3. Set up the frontend

In a second terminal:

```
cd rental-roommate-finder
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

> The frontend calls the API at `http://localhost:5000/api`, and the backend only allows requests from `http://localhost:5173`. Change these in `src/utils/api.js` and `server.js` when you deploy.

## Scripts

**Frontend** (`rental-roommate-finder`)

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

**Backend** (`rentmate-backend`)

| Command | What it does |
| --- | --- |
| `npm start` | Start the API server |

## Notes

- Uploaded listing photos and ID documents are stored in `rentmate-backend/uploads/`. This folder is excluded from Git because it can contain personal data.
- The backend needs an `uploads` folder to exist. Create it (and `uploads/id_docs`) if it's missing.

## Author

Built by [muhsinaacr](https://github.com/muhsinaacr).
