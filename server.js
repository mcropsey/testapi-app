'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 60 * 60 * 1000;

const app = express();
app.use(express.json());

// ---------- password hashing ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const candidate = crypto.scryptSync(String(password), salt, 32);
    return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// ---------- seed data ----------

function buildSeedUsers() {
  const jobTitles = ['Engineer', 'Designer', 'Analyst', 'Manager', 'Support'];
  return Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const now = new Date(Date.UTC(2026, 8, 11, 12, 0, n)).toISOString();
    return {
      id: `usr_${String(n).padStart(4, '0')}`,
      username: `mike${n}`,
      passwordHash: hashPassword(`Mypassword${n}`),
      profile: {
        fullName: `Mike ${n}`,
        email: `mike${n}@example.com`,
        phone: `+1-555-010${n}`,
        dateOfBirth: `199${n % 10}-0${(n % 9) + 1}-1${n % 9}`,
        address: {
          street: `${100 + n} Maple Street`,
          city: 'Springfield',
          state: 'IL',
          zip: `6270${n}`,
          country: 'United States',
        },
        jobTitle: jobTitles[n % 5],
        bio: `Default profile for user mike${n}. Update this with your own details.`,
      },
      createdAt: now,
      updatedAt: now,
    };
  });
}

// ---------- data layer ----------

let users = [];
const sessions = new Map(); // token -> { username, expiresAt }

function saveUsers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      return;
    } catch (err) {
      console.warn('Could not read data/users.json, reseeding:', err.message);
    }
  }
  users = buildSeedUsers();
  saveUsers();
  console.log(`Seeded ${users.length} default users (mike1-mike10)`);
}

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function findUser(idOrUsername) {
  return users.find(
    (u) => u.id === idOrUsername || u.username === idOrUsername
  );
}

// ---------- auth ----------

function issueToken(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function authRequired(req, res, next) {
  const token = bearerToken(req);
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expiresAt < Date.now()) {
    return res
      .status(401)
      .json({ error: 'Unauthorized', message: 'Missing, invalid or expired token.' });
  }
  req.sessionUsername = session.username;
  next();
}

// ---------- validation ----------

function validateProfile(profile, { partial = false } = {}) {
  const errors = [];
  const p = profile || {};
  for (const field of ['fullName', 'email']) {
    if (partial && p[field] === undefined) continue;
    if (!String(p[field] || '').trim()) errors.push(`profile.${field} is required`);
  }
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email))) {
    errors.push('profile.email must be a valid email address');
  }
  return errors;
}

function normalizeProfile(p) {
  return {
    fullName: String(p.fullName || '').trim(),
    email: String(p.email || '').trim().toLowerCase(),
    phone: String(p.phone || '').trim(),
    dateOfBirth: String(p.dateOfBirth || '').trim(),
    address: {
      street: String((p.address && p.address.street) || '').trim(),
      city: String((p.address && p.address.city) || '').trim(),
      state: String((p.address && p.address.state) || '').trim(),
      zip: String((p.address && p.address.zip) || '').trim(),
      country: String((p.address && p.address.country) || '').trim(),
    },
    jobTitle: String(p.jobTitle || '').trim(),
    bio: String(p.bio || '').trim(),
  };
}

// ---------- meta ----------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'testapi-app', time: new Date().toISOString() });
});

app.get('/api/meta', (req, res) => {
  res.json({
    name: 'TestAPI App',
    version: '1.0.0',
    ui: '/',
    swagger: '/swagger/',
    health: '/api/health',
  });
});

// ---------- auth routes ----------

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: 'Bad Request', message: 'username and password are required' });
  }
  const user = users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res
      .status(401)
      .json({ error: 'Unauthorized', message: 'Invalid username or password' });
  }
  const token = issueToken(user.username);
  res.json({ token, tokenType: 'Bearer', expiresIn: 3600, user: publicUser(user) });
});

app.post('/api/auth/logout', authRequired, (req, res) => {
  sessions.delete(bearerToken(req));
  res.status(204).end();
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = users.find((u) => u.username === req.sessionUsername);
  if (!user) {
    return res
      .status(401)
      .json({ error: 'Unauthorized', message: 'Session user not found' });
  }
  res.json(publicUser(user));
});

// ---------- user routes ----------

app.get('/api/users', authRequired, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  let list = users;
  if (q) {
    list = users.filter((u) =>
      [
        u.username,
        u.profile.fullName,
        u.profile.email,
        u.profile.jobTitle,
        u.profile.address && u.profile.address.city,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const start = (page - 1) * limit;
  res.json({
    total: list.length,
    page,
    limit,
    users: list.slice(start, start + limit).map(publicUser),
  });
});

app.get('/api/users/:id', authRequired, (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Not Found', message: 'User not found' });
  }
  res.json(publicUser(user));
});

app.post('/api/users', authRequired, (req, res) => {
  const { username, password, profile } = req.body || {};
  const errors = [];
  const name = String(username || '').trim();
  if (!name) errors.push('username is required');
  else {
    if (name.length < 3) errors.push('username must be at least 3 characters');
    if (/\s/.test(name)) errors.push('username must not contain spaces');
    if (
      users.some((u) => u.username.toLowerCase() === name.toLowerCase())
    ) {
      errors.push(`username '${name}' is already taken`);
    }
  }
  if (!password || String(password).length < 6) {
    errors.push('password must be at least 6 characters');
  }
  errors.push(...validateProfile(profile));
  if (errors.length) {
    return res
      .status(400)
      .json({ error: 'Bad Request', message: 'Validation failed', details: errors });
  }

  const now = new Date().toISOString();
  const user = {
    id: `usr_${crypto.randomBytes(6).toString('hex')}`,
    username: name.toLowerCase(),
    passwordHash: hashPassword(password),
    profile: normalizeProfile(profile),
    createdAt: now,
    updatedAt: now,
  };
  users.push(user);
  saveUsers();
  res.status(201).location(`/api/users/${user.id}`).json(publicUser(user));
});

app.put('/api/users/:id', authRequired, (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Not Found', message: 'User not found' });
  }
  const { password, profile } = req.body || {};
  const errors = [];
  if (profile) {
    errors.push(...validateProfile(profile, { partial: true }));
    if (
      profile.email &&
      users.some(
        (u) => u.id !== user.id && u.profile.email === String(profile.email).trim().toLowerCase()
      )
    ) {
      errors.push(`email '${profile.email}' is already in use by another user`);
    }
  }
  if (password && String(password).length < 6) {
    errors.push('password must be at least 6 characters');
  }
  if (errors.length) {
    return res
      .status(400)
      .json({ error: 'Bad Request', message: 'Validation failed', details: errors });
  }

  if (profile) {
    user.profile = {
      ...user.profile,
      ...profile,
      address: { ...user.profile.address, ...(profile.address || {}) },
    };
  }
  if (password) user.passwordHash = hashPassword(password);
  user.updatedAt = new Date().toISOString();
  saveUsers();
  res.json(publicUser(user));
});

app.delete('/api/users/:id', authRequired, (req, res) => {
  const idx = users.findIndex(
    (u) => u.id === req.params.id || u.username === req.params.id
  );
  if (idx === -1) {
    return res.status(404).json({ error: 'Not Found', message: 'User not found' });
  }
  users.splice(idx, 1);
  saveUsers();
  res.status(204).end();
});

// ---------- swagger ----------

const swaggerDocument = YAML.load(
  fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8')
);
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'TestAPI App - API Docs',
}));

// ---------- static UI ----------

app.use(express.static(path.join(__dirname, 'public')));

// ---------- 404 + error handling ----------

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `No such endpoint: ${req.method} ${req.originalUrl}`,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Bad Request', message: 'Invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error', message: 'Something went wrong' });
});

loadUsers();
app.listen(PORT, () => {
  console.log(`TestAPI App running at http://localhost:${PORT}`);
  console.log(`  UI:      http://localhost:${PORT}/`);
  console.log(`  Swagger: http://localhost:${PORT}/swagger/`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
});
