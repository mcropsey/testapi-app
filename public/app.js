'use strict';

const state = {
  token: localStorage.getItem('testapi-token') || null,
  currentUser: null,
  editingId: null,
};

const $ = (sel) => document.querySelector(sel);
const loginView = $('#login-view');
const appView = $('#app-view');
const modal = $('#modal');
const userForm = $('#user-form');

// ---------- api helper ----------

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && state.currentUser) {
      handleSessionLost();
    }
    let message = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    if (body && Array.isArray(body.details) && body.details.length) {
      message = `${message} — ${body.details.join('; ')}`;
    }
    throw new Error(message);
  }
  return body;
}

// ---------- views ----------

function showLogin() {
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#login-username').focus();
}

function showApp(user) {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  state.currentUser = user;
  $('#current-user').textContent = `@${user.username}`;
  $('#stat-you').textContent = `@${user.username}`;
  loadUsers();
}

function handleSessionLost() {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('testapi-token');
  showLogin();
}

// ---------- auth ----------

async function doLogin(event) {
  event.preventDefault();
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  const errorEl = $('#login-error');
  errorEl.textContent = '';
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = data.token;
    localStorage.setItem('testapi-token', data.token);
    $('#login-password').value = '';
    showApp(data.user);
    toast('Signed in successfully', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function doLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* token may already be expired */
  }
  handleSessionLost();
  toast('Signed out');
}

// ---------- users list ----------

function avatarColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 62%, 45%)`;
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

let searchTimer = null;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadUsers, 250);
});

async function loadUsers() {
  const q = $('#search').value.trim();
  try {
    const data = await api(`/api/users?q=${encodeURIComponent(q)}&limit=100`);
    renderUsers(data);
  } catch (err) {
    if (state.currentUser) toast(err.message, 'error');
  }
}

function renderUsers({ total, users }) {
  const tbody = $('#users-tbody');
  tbody.innerHTML = users
    .map((u) => {
      const p = u.profile || {};
      const loc = [p.address && p.address.city, p.address && p.address.state]
        .filter(Boolean)
        .join(', ');
      return `
        <tr data-id="${esc(u.id)}">
          <td>
            <div class="user-cell">
              <span class="avatar" style="background:${avatarColor(u.username)}">${esc(initials(p.fullName))}</span>
              ${esc(p.fullName)}
            </div>
          </td>
          <td class="muted">@${esc(u.username)}</td>
          <td>${esc(p.email)}</td>
          <td class="muted">${esc(p.phone) || '—'}</td>
          <td class="muted">${esc(loc) || '—'}</td>
          <td>${esc(p.jobTitle) || '—'}</td>
          <td class="muted">${formatDate(u.updatedAt)}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn edit-btn" title="Edit">Edit</button>
              <button class="icon-btn danger delete-btn" title="Delete">Del</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
  $('#stat-total').textContent = total;
  $('#stat-shown').textContent = users.length;
  $('#empty-state').classList.toggle('hidden', users.length > 0);
}

// ---------- modal ----------

function openModal(user) {
  userForm.reset();
  $('#form-error').textContent = '';
  state.editingId = user ? user.id : null;
  $('#modal-title').textContent = user ? `Edit ${user.username}` : 'Add user';
  $('#save-btn').textContent = user ? 'Save changes' : 'Create user';
  $('.opt[data-new-only]').style.display = user ? 'none' : '';
  userForm.username.disabled = Boolean(user);
  if (user) {
    const p = user.profile || {};
    const a = p.address || {};
    userForm.username.value = user.username;
    userForm.fullName.value = p.fullName || '';
    userForm.email.value = p.email || '';
    userForm.phone.value = p.phone || '';
    userForm.dateOfBirth.value = p.dateOfBirth || '';
    userForm.jobTitle.value = p.jobTitle || '';
    userForm.street.value = a.street || '';
    userForm.city.value = a.city || '';
    userForm.state.value = a.state || '';
    userForm.zip.value = a.zip || '';
    userForm.country.value = a.country || '';
    userForm.bio.value = p.bio || '';
  }
  modal.classList.remove('hidden');
  (user ? userForm.fullName : userForm.username).focus();
}

function closeModal() {
  modal.classList.add('hidden');
  state.editingId = null;
}

function formPayload() {
  const f = userForm;
  const base = {
    fullName: f.fullName.value.trim(),
    email: f.email.value.trim(),
    phone: f.phone.value.trim(),
    dateOfBirth: f.dateOfBirth.value,
    jobTitle: f.jobTitle.value.trim(),
    bio: f.bio.value.trim(),
    address: {
      street: f.street.value.trim(),
      city: f.city.value.trim(),
      state: f.state.value.trim(),
      zip: f.zip.value.trim(),
      country: f.country.value.trim(),
    },
  };
  if (!state.editingId) {
    return {
      username: f.username.value.trim(),
      password: f.password.value,
      profile: base,
    };
  }
  const body = { profile: base };
  if (f.password.value) body.password = f.password.value;
  return body;
}

async function saveUser(event) {
  event.preventDefault();
  const errorEl = $('#form-error');
  errorEl.textContent = '';
  const saveBtn = $('#save-btn');
  saveBtn.disabled = true;
  try {
    const payload = formPayload();
    let user;
    if (state.editingId) {
      user = await api(`/api/users/${encodeURIComponent(state.editingId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      toast('User updated', 'success');
    } else {
      user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast('User created', 'success');
    }
    closeModal();
    await loadUsers();
    return user;
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteUser(id) {
  if (!confirm('Delete this user? This cannot be undone.')) return;
  try {
    await api(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('User deleted', 'success');
    await loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- toast ----------

let toastTimer = null;
function toast(message, kind = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ---------- wire up ----------

$('#login-form').addEventListener('submit', doLogin);
$('#logout-btn').addEventListener('click', doLogout);
$('#add-user-btn').addEventListener('click', () => openModal(null));
userForm.addEventListener('submit', saveUser);
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-close]')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});
$('#users-tbody').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('.delete-btn')) return deleteUser(id);
  if (e.target.closest('.edit-btn')) {
    api(`/api/users/${encodeURIComponent(id)}`)
      .then((user) => openModal(user))
      .catch((err) => toast(err.message, 'error'));
  }
});

// ---------- init ----------

(async function init() {
  if (state.token) {
    try {
      const user = await api('/api/users/me');
      showApp(user);
      return;
    } catch {
      /* fall through to login */
    }
  }
  showLogin();
})();
