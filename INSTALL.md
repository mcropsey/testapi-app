# TestAPI App — Installation & Usage Guide

This guide covers how to install, run, and work with the **TestAPI App**:
a simulated user-management service with a REST API, a web UI, and Swagger
API documentation, all in a single Node.js/Express application.

---

## 1. What the app is

- A **simulated backend service** that stores users with personal
  information (full name, email, phone, date of birth, address, job title,
  bio).
- Ships pre-seeded with **10 default users** (`mike1`–`mike10`).
- Provides:
  - A **web UI** (login + user management dashboard)
  - A **REST API** (JSON, Bearer-token auth)
  - **Swagger / OpenAPI docs** (served at `/swagger/`)
- Data is persisted to a local JSON file (`data/users.json`).
- Single process, no external database required.

```
┌────────────┐      ┌─────────────────────────────────────────┐
│  Browser   │ ───▶ │            TestAPI App (Node)           │
│  (Web UI)  │      │  ┌─────┐  ┌──────┐  ┌───────────────┐   │
└────────────┘      │  │  UI │  │ REST │  │ Swagger UI    │   │
                    │  └─────┘  └──┬───┘  └───────────────┘   │
┌────────────┐      │             │                           │
│ curl /     │ ───▶ │  ┌──────────▼─────────┐                 │
│ Postman /  │      │  │  data/users.json   │  (persisted)    │
│ SDKs       │      │  └────────────────────┘                 │
└────────────┘      └─────────────────────────────────────────┘
```

---

## 2. Prerequisites

| Requirement | Version | Check command |
|-------------|---------|---------------|
| Node.js     | 18+ (tested on 22) | `node --version` |
| npm         | 9+  (bundled with Node) | `npm --version` |
| curl (for API testing) | any | `curl --version` |

No database, no external services.

---

## 3. Installation

```bash
# 1. Move to the app directory
cd testapi-app

# 2. Install dependencies (express, swagger-ui-express, js-yaml)
npm install

# 3. (Optional) verify the install
node -e "require('express'); require('swagger-ui-express'); require('js-yaml'); console.log('deps OK')"
```

That's it — there is no build step.

---

## 4. Running the app

### Foreground (development)

```bash
npm start
```

Expected output:

```
Seeded 10 default users (mike1-mike10)      ← only on first run
TestAPI App running at http://localhost:3000
  UI:      http://localhost:3000/
  Swagger: http://localhost:3000/swagger/
  Health:  http://localhost:3000/api/health
```

### Background (server-style)

```bash
nohup npm start > server.log 2>&1 &
```

### Custom port

```bash
PORT=8080 npm start
```

### Stop the app

```bash
# find the process
ps aux | grep '[s]erver.js'

# stop it
kill <PID>
```

---

## 5. Endpoints

| URL                             | What                          |
|---------------------------------|-------------------------------|
| `http://localhost:3000/`        | Web UI (login + dashboard)    |
| `http://localhost:3000/swagger/`| Swagger API documentation     |
| `http://localhost:3000/api/health` | Health check (public)       |
| `http://localhost:3000/api/meta`   | Service metadata (public)   |
| `http://localhost:3000/api/*`     | REST API                      |

From another machine on your network, use the server's IP
(e.g. `http://192.168.1.103:3000/`).

---

## 6. Default accounts

Seeded automatically on first start (see §11 to reset):

| User   | Password      |
|--------|---------------|
| mike1  | Mypassword1   |
| mike2  | Mypassword2   |
| mike3  | Mypassword3   |
| mike4  | Mypassword4   |
| mike5  | Mypassword5   |
| mike6  | Mypassword6   |
| mike7  | Mypassword7   |
| mike8  | Mypassword8   |
| mike9  | Mypassword9   |
| mike10 | Mypassword10  |

> **Note:** Passwords are **case-sensitive** — `Mypassword1` works,
> `mypassword1` does not.

---

## 7. Using the web UI

1. Open `http://localhost:3000/` in a browser.
2. Enter a username and password (e.g. `mike1` / `Mypassword1`) and click
   **Sign in**.
3. The dashboard shows:
   - **Stats** — total users, users currently shown, your signed-in user.
   - **Search box** — filters users by name, email, city, or role as you type.
   - **User table** — all users with their personal info.
   - **+ Add user** — opens a form to create a new user (username, password,
     full name, email, phone, DOB, address, job title, bio).
   - **Edit / Del** buttons per row — edit the profile or delete the user.
4. **Log out** (top right) ends your session.
5. **API docs** (top right) opens the Swagger UI in a new tab.

Your session token is kept in the browser's `localStorage`
(`testapi-token`), so refreshing the page keeps you signed in until the
token expires (1 hour) or you log out.

---

## 8. Using the REST API

### 8.1 Authentication flow

All `/api/users` endpoints require a Bearer token:

```
POST /api/auth/login  ──▶  token  ──▶  Authorization: Bearer <token>
```

### 8.2 Example session (curl)

```bash
BASE=http://localhost:3000

# 1. Log in and grab the token
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"mike1","password":"Mypassword1"}' \
  | sed 's/.*"token":"\([^"]*\)".*/\1/')

echo "token: $TOKEN"

# 2. List all users
curl -s $BASE/api/users -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Search users
curl -s "$BASE/api/users?q=mike" -H "Authorization: Bearer $TOKEN"

# 4. Get one user (by id or username)
curl -s $BASE/api/users/mike5 -H "Authorization: Bearer $TOKEN"

# 5. Create a user
curl -s -X POST $BASE/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "username": "mike11",
        "password": "Mypassword11",
        "profile": {
          "fullName": "Mike Eleven",
          "email": "mike11@example.com",
          "phone": "+1-555-9999",
          "dateOfBirth": "1990-05-05",
          "address": {
            "street": "1 Elm Street",
            "city": "Shelbyville",
            "state": "IL",
            "zip": "62501",
            "country": "United States"
          },
          "jobTitle": "Engineer",
          "bio": "Created via the API."
        }
      }'

# 6. Update a user (partial profile update + optional new password)
curl -s -X PUT $BASE/api/users/mike11 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"profile":{"jobTitle":"Senior Engineer"}}'

# 7. Delete a user
curl -s -X DELETE $BASE/api/users/mike11 \
  -H "Authorization: Bearer $TOKEN" -w '[%{http_code}]\n'   # → [204]

# 8. Log out (invalidates the token)
curl -s -X POST $BASE/api/auth/logout \
  -H "Authorization: Bearer $TOKEN" -w '[%{http_code}]\n'   # → [204]
```

### 8.3 Endpoint reference

| Method | Path              | Auth | Description                              |
|--------|-------------------|------|------------------------------------------|
| GET    | `/api/health`     | no   | Health check                              |
| GET    | `/api/meta`       | no   | Service metadata (UI, Swagger, health)    |
| POST   | `/api/auth/login` | no   | Log in → returns Bearer token             |
| GET    | `/api/auth/me`    | yes  | Get the currently authenticated user      |
| POST   | `/api/auth/logout`| yes  | Invalidate the current token              |
| GET    | `/api/users`      | yes  | List users (`?q=` filter, `?page`, `?limit`) |
| GET    | `/api/users/{id}` | yes  | Get one user (id **or** username)         |
| POST   | `/api/users`      | yes  | Create user (username, password, profile) |
| PUT    | `/api/users/{id}` | yes  | Update profile and/or password            |
| DELETE | `/api/users/{id}` | yes  | Delete a user                             |

### 8.4 User object shape

```json
{
  "id": "usr_0001",
  "username": "mike1",
  "profile": {
    "fullName": "Mike 1",
    "email": "mike1@example.com",
    "phone": "+1-555-0101",
    "dateOfBirth": "1991-02-11",
    "address": {
      "street": "101 Maple Street",
      "city": "Springfield",
      "state": "IL",
      "zip": "62701",
      "country": "United States"
    },
    "jobTitle": "Designer",
    "bio": "Default profile for user mike1. Update this with your own details."
  },
  "createdAt": "2026-09-11T12:00:01.000Z",
  "updatedAt": "2026-09-11T12:00:01.000Z"
}
```

### 8.5 Error shape

```json
{
  "error": "Bad Request",
  "message": "Validation failed",
  "details": ["username is required", "password must be at least 6 characters"]
}
```

Common status codes:

| Code | Meaning                                   |
|------|-------------------------------------------|
| 200  | Success                                   |
| 201  | Created                                   |
| 204  | Success, no content (logout / delete)     |
| 400  | Validation failed (see `details`)         |
| 401  | Missing/invalid token, or bad credentials |
| 404  | User or endpoint not found                |
| 500  | Server error                              |

---

## 9. Swagger / OpenAPI

- The OpenAPI 3.0.3 spec lives in **`openapi.yaml`**.
- It is rendered automatically at **`/swagger/`** — use it to explore and
  "Try it out" every endpoint without curl.
- To try an authenticated endpoint in Swagger:
  1. `POST /api/auth/login` with `mike1` / `Mypassword1`.
  2. Copy the `token` from the response.
  3. Click **Authorize** (top right of the Swagger UI) and paste the token.
  4. All other endpoints will now send `Authorization: Bearer <token>`.

---

## 10. Data & storage

- Users are stored in **`data/users.json`** (created on first start).
- Passwords are stored as **salted scrypt hashes** — never in plain text.
- Auth sessions are **in-memory only**: restarting the server logs everyone
  out (the stored users are not affected).
- The file is human-readable — you can inspect it, but prefer the API/UI
  for changes so timestamps and hashes stay consistent.

### Reset to the 10 default users

```bash
# stop the app first (see §4), then:
rm data/users.json
# start the app again — it re-seeds automatically
npm start
```

### Back up the data

```bash
cp data/users.json backup-users-$(date +%F).json
```

---

## 11. Project layout

```
testapi-app/
├── package.json      # dependencies + npm scripts
├── server.js         # the whole backend: API, auth, Swagger, static UI
├── openapi.yaml      # OpenAPI 3.0.3 spec ("the swagger file")
├── README.md         # short overview
├── INSTALL.md        # ← this document
├── public/           # web UI (vanilla HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   └── users.json    # persisted users (created on first start)
└── server.log        # runtime log (when started with nohup)
```

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `EADDRINUSE` on start | Another instance is already running on port 3000. Kill it or use `PORT=8080 npm start`. |
| `Invalid username or password` | Wrong credentials. Passwords are case-sensitive — `Mypassword1`, not `mypassword1`. Check the browser password manager isn't auto-filling a different password. |
| Logged out after a restart | Sessions are in-memory by design. Just log in again; users are still in `data/users.json`. |
| Port 3000 unreachable from another machine | Make sure you're using the server's LAN IP (e.g. `http://192.168.1.103:3000`) and the firewall/SELinux allow it (on this machine both are disabled). |
| `node: command not found` | Install Node.js 18+ (e.g. `sudo dnf install nodejs` on Rocky/EL). |
| UI looks broken / old | Hard-refresh (Ctrl+Shift+R) to bypass the browser cache. |

---

## 13. Security notes

- This is a **simulation / learning app**: single process, JSON-file storage,
  in-memory sessions. It is intentionally simple, not hardened.
- Do **not** expose it to untrusted networks.
- Tokens expire after 1 hour.
