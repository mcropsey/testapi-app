# TestAPI App

A simulated user-management service: REST API + web UI + Swagger docs in one
small Node.js/Express app. Ships pre-seeded with 10 default users who have
personal information (profile) stored.

## Quick start

```bash
npm install
npm start
```

Then open:

| What    | URL                      |
|---------|--------------------------|
| UI      | http://localhost:3000/   |
| Swagger | http://localhost:3000/swagger/ |
| Health  | http://localhost:3000/api/health |

## Demo accounts

| User | Password |
|------|----------|
| mike1 | Mypassword1 |
| mike2 | Mypassword2 |
| mike3 | Mypassword3 |
| mike4 | Mypassword4 |
| mike5 | Mypassword5 |
| mike6 | Mypassword6 |
| mike7 | Mypassword7 |
| mike8 | Mypassword8 |
| mike9 | Mypassword9 |
| mike10 | Mypassword10 |

Seeding happens automatically on first start into `data/users.json`.
Delete that file to reset back to the 10 default users.

## API overview

All `/api/users` endpoints require `Authorization: Bearer <token>`, obtained
from `POST /api/auth/login`.

| Method | Path             | Description                          |
|--------|------------------|--------------------------------------|
| GET    | /api/health      | Health check (public)                |
| GET    | /api/meta        | Service metadata (public)            |
| POST   | /api/auth/login  | Log in, get a Bearer token           |
| POST   | /api/auth/logout | Invalidate the current token         |
| GET    | /api/users       | List users (`?q=` filter, paging)    |
| GET    | /api/users/{id}  | Get one user (id or username)        |
| POST   | /api/users       | Create user with profile + password  |
| PUT    | /api/users/{id}  | Update profile / password            |
| DELETE | /api/users/{id}  | Delete a user                        |

Full OpenAPI spec: [`openapi.yaml`](openapi.yaml), rendered at `/swagger/`.

## Example

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"mike1","password":"Mypassword1"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

curl -s localhost:3000/api/users -H "Authorization: Bearer $TOKEN"
```

## Project layout

```
server.js         Express app: API, auth, Swagger, static UI
openapi.yaml      OpenAPI 3.0 spec (the "swagger file")
public/           Web UI (vanilla HTML/CSS/JS)
data/users.json   Persisted users (created on first start)
```

## Notes

- Passwords are stored as scrypt hashes (salted) — never in plain text.
- Tokens are random, server-side sessions that expire after 1 hour.
- This is a simulation/learning app: single process, JSON-file storage,
  no real security hardening — don't put it in front of the internet.
