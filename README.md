# TestAPI App

A simulated user-management service: REST API + web UI + Swagger docs in one
small Node.js/Express app, packaged as a container. Ships pre-seeded with
10 default users who have personal information (profile) stored.

## Quick start (podman)

```bash
make run     # build the image and start the container on port 3000
make test    # smoke test (health + login)
```

Or manually:

```bash
podman build --format docker -t testapi-app:latest .
podman run -d --name testapi-app --restart unless-stopped \
  -p 3000:3000 -v testapi-app-data:/app/data testapi-app:latest
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

Users are seeded automatically on first start into the container's data
volume (`testapi-app-data` → `/app/data/users.json`).
Reset to the defaults: `make clean && podman volume rm testapi-app-data && make start`.

Running without a container (development): `npm install && npm start`.
Full docs: [`INSTALL.md`](INSTALL.md).

## API overview

All `/api/users` endpoints require `Authorization: Bearer <token>`, obtained
from `POST /api/auth/login`.

| Method | Path             | Description                          |
|--------|------------------|--------------------------------------|
| GET    | /api/health      | Health check (public)                |
| GET    | /api/meta        | Service metadata (public)            |
| POST   | /api/auth/login  | Log in, get a Bearer token           |
| GET    | /api/auth/me     | Get the currently authenticated user |
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

## CI/CD (Jenkins)

A `Jenkinsfile` (declarative pipeline) is included. On every build (the job is
pinned to the `main` branch and polls GitHub):

1. **Build** — `docker build` in the Jenkins dind sidecar, tagged with the git SHA.
2. **Test** — runs the image, then smoke-tests the API (health, login, create/list/delete user).
3. **Deploy** — saves the image, ships it to the podman host
   (`192.168.1.103`), `podman load`s it and re-runs the container. The
   `testapi-app-data` volume is kept, so your users survive a deploy.
4. **Verify** — health-check + login against the live app.

So the workflow is: push to `main` → Jenkins builds, tests, deploys, verifies.

The pipeline expects:
- Jenkins reachable at `192.168.1.100:8080` with the `jenkins-docker` dind sidecar.
- SSH from the Jenkins container to `mcropsey@192.168.1.103` (key already in place).
- The app host running podman with the `testapi-app-data` volume.

To (re)deploy manually without Jenkins, see `INSTALL.md`.

## Project layout

```
server.js         Express app: API, auth, Swagger, static UI
openapi.yaml      OpenAPI 3.0 spec (the "swagger file")
public/           Web UI (vanilla HTML/CSS/JS)
Dockerfile        Container image (podman/docker)
.dockerignore     Keeps node_modules/data out of the image
Makefile          podman build/run/logs/test helpers
Jenkinsfile       CI/CD pipeline (build -> test -> deploy -> verify)
data/users.json   Persisted users (container volume /app/data)
```

## Notes

- Passwords are stored as scrypt hashes (salted) — never in plain text.
- Tokens are random, server-side sessions that expire after 1 hour.
- This is a simulation/learning app: single process, JSON-file storage,
  no real security hardening — don't put it in front of the internet.
