# EventFlow

Open-source event and workshop management platform for organizers, speakers, and participants.

EventFlow is a small, intentionally simple MVP: an organizer can create and manage events, participants can register, and a dashboard shows basic statistics. Two small Python services (FastAPI analytics and a Django admin) sit next to the main Node.js backend.

## Features

- Create, list, view, edit and delete events
- Register a participant for an event (name + email)
- Duplicate registrations (same email, same event) are rejected
- Registration is closed once an event reaches its capacity
- View the registered participants of an event
- Dashboard: total events, total registrations, upcoming events
- Loading, error, empty and "not found" states in the UI
- FastAPI analytics service (`/analytics/events`)
- Django admin to inspect the data (read-only snapshot, see [Admin](#admin))

Authentication is intentionally **out of scope** for this MVP.

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS 4, React Router |
| Main backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose |
| Analytics service | Python, FastAPI, PyMongo |
| Admin | Python, Django (admin site) |
| Tests | Vitest + Supertest (backend), Vitest + Testing Library (frontend), pytest (FastAPI), Django test runner |

## Project Structure

```
EventFlow/
├── frontend/           React + Vite + Tailwind single-page app
│   └── src/            api/ client, components/, pages/, hooks/, utils/, test/
├── backend/            Express API (primary backend)
│   ├── src/            config/, models/, controllers/, routes/, middleware/, services/
│   └── tests/          API tests (in-memory MongoDB)
├── analytics-service/  FastAPI service: /health and /analytics/events
├── admin/              Django project: read-only admin over a snapshot of the data
├── docs/               Architecture notes
├── LICENSE
└── README.md
```

How the pieces relate (more in [docs/architecture.md](docs/architecture.md)):

- The **Express backend is the only service that writes data** to MongoDB.
- The **frontend** talks only to Express (`/api/*`).
- **FastAPI** reads the same MongoDB collections and computes statistics.
- **Django admin** keeps its own small SQLite database holding a *snapshot* copied from MongoDB by a management command. It does not duplicate the business API.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (developed with Node 24)
- [Python](https://www.python.org/) 3.10 or newer
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) running locally (default `mongodb://127.0.0.1:27017`), or a MongoDB Atlas connection string

The automated tests do **not** need a running MongoDB: the backend tests download and start a temporary in-memory MongoDB (the first run downloads a `mongod` binary, which takes a minute), and the Python tests use `mongomock`.

## Setup

Run each service in its own terminal, starting from the repository root. Start MongoDB first.

### 1. Backend (Express, port 5000)

```bash
cd backend
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run dev                 # or: npm start
```

Check it: <http://localhost:5000/api/health> returns `{"status":"ok"}`.

### 2. Frontend (React, port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. In development, Vite proxies `/api` to `http://localhost:5000`. For a separate deployment set `VITE_API_URL` (see `frontend/.env.example`). `npm run build` creates a production build in `frontend/dist`.

### 3. FastAPI analytics (port 8000)

```bash
cd analytics-service
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Interactive docs: <http://localhost:8000/docs>.

### 4. Django admin (port 8001)

```bash
cd admin
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py sync_from_mongo
python manage.py runserver 8001
```

Open <http://localhost:8001> and log in with the superuser you created.

## Environment Variables

Every service ships a `.env.example`; copy it to `.env` (which is git-ignored). Never commit real credentials.

| File | Variable | Purpose |
| --- | --- | --- |
| `backend/.env` | `PORT` | Express port (default `5000`) |
| | `MONGODB_URI` | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/eventflow` |
| | `CORS_ORIGIN` | Allowed frontend origin(s), comma separated (default `http://localhost:5173`) |
| | `NODE_ENV` | Set to `production` to hide error messages from 500 responses |
| `frontend/.env` | `VITE_API_URL` | Optional API base URL (default `/api`) |
| `analytics-service/.env` | `MONGODB_URI` | Same database as the backend |
| `admin/.env` | `MONGODB_URI` | Same database as the backend (used by `sync_from_mongo`) |
| | `DJANGO_SECRET_KEY` | Required when `DJANGO_DEBUG=false` |
| | `DJANGO_DEBUG` | `true` for local development |
| | `DJANGO_ALLOWED_HOSTS` | Comma separated hosts |

## API Endpoints

Base URL: `http://localhost:5000/api`. All bodies are JSON.

| Method | Path | Description | Success |
| --- | --- | --- | --- |
| GET | `/health` | Health check | 200 |
| POST | `/events` | Create an event | 201 |
| GET | `/events` | List events with pagination and search (`?page=1&limit=10&search=term`) | 200 |
| GET | `/events/:id` | Event details, including `registrationCount` | 200 |
| PUT | `/events/:id` | Replace event fields | 200 |
| DELETE | `/events/:id` | Delete an event and its registrations | 200 |
| POST | `/events/:eventId/register` | Register a participant | 201 |
| GET | `/events/:eventId/registrations` | List an event's registrations | 200 |
| GET | `/stats` | `{ totalEvents, totalRegistrations, upcomingEvents }` | 200 |

**Event body**

```json
{
  "title": "Node Meetup",
  "description": "Optional, up to 2000 characters",
  "date": "2026-11-15",
  "time": "18:30",
  "location": "Hyderabad",
  "organizer": "NxtLabTech",
  "capacity": 50
}
```

Rules: `title` (max 100), `date` (valid `YYYY-MM-DD`), `time` (`HH:MM`, 24h), `location` (max 200), `organizer` (max 100) are required; `capacity` must be a positive whole number. A capacity below the current number of registrations is rejected on update.

**Registration body**: `{ "name": "Asha", "email": "asha@example.com" }`. Emails are stored lowercase.

**Status codes**

| Code | When |
| --- | --- |
| 400 | Validation error (`{ "error": "Validation failed", "details": { "field": "message" } }`) or invalid JSON |
| 404 | Event or route not found (a malformed id is also a 404) |
| 409 | Duplicate registration, or the event is full |
| 500 | Unexpected error (`{ "error": "Internal server error" }`; no stack traces) |

"Upcoming" means the event date is today (UTC) or later.

## Analytics API

Base URL: `http://localhost:8000`

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/analytics/events` | `{ "totalEvents": 5, "totalRegistrations": 42, "upcomingEvents": 3 }` |

`/analytics/events` returns `503` if MongoDB is unreachable.

## Admin

The Django admin is a **read-only viewer** over a snapshot of the EventFlow data:

1. Express + MongoDB own the data. Django never writes back to MongoDB, so there is no second source of truth to conflict with the app.
2. `python manage.py sync_from_mongo` replaces Django's local SQLite copy with the current MongoDB contents. Re-run it whenever you want to see fresh data.
3. The admin lists events (with registration counts and inline registrations) and registrations, with filters and search. Add/change/delete are disabled.

Django's own SQLite database (`admin/db.sqlite3`) also stores the admin login users; it is git-ignored.

## Testing

```bash
# Backend (17 tests) - spins up an in-memory MongoDB
cd backend && npm test

# Frontend (11 tests)
cd frontend && npm test

# FastAPI (5 tests) - with the venv active
cd analytics-service && python -m pytest

# Django admin (4 tests) - with the venv active
cd admin && python manage.py test
```

## Future Improvements

Ideas that are **not** implemented yet:

- Authentication and organizer accounts
- Cancel a registration; participant self-service
- Search, filtering and pagination on the events list
- Race-safe capacity enforcement (currently check-then-insert)
- Past events shown separately / event status
- Editing data from the Django admin
- Time zones for event times
- Continuous integration and linting
- Deployment guide (production build, hosting)

## License

[MIT](LICENSE)
