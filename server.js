require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── DB SETUP ────────────────────────────────────────────────────────────────
async function setupDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      discord_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      discriminator TEXT DEFAULT '0',
      avatar TEXT,
      slug TEXT UNIQUE,
      bio TEXT DEFAULT '',
      links JSONB DEFAULT '[]',
      badges JSONB DEFAULT '[]',
      views INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
  `);
  console.log('✅ DB ready');
}
setupDB().catch(console.error);

// ── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'icyd-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── HELPERS ─────────────────────────────────────────────────────────────────
const BADGE_META = {
  verified:  { label: 'Verified',  emoji: '✅', color: '#3b82f6' },
  premium:   { label: 'Premium',   emoji: '👑', color: '#f59e0b' },
  og:        { label: 'OG',        emoji: '⭐', color: '#8b5cf6' },
  staff:     { label: 'Staff',     emoji: '🔥', color: '#ef4444' },
  supporter: { label: 'Supporter', emoji: '💎', color: '#06b6d4' },
};

function isAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

function isLoggedIn(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

// ── DISCORD OAUTH ───────────────────────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });
    const d = userRes.data;
    const avatar = d.avatar
      ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(d.id) >> 22n) % 6n}.png`;

    const existing = await pool.query('SELECT * FROM users WHERE discord_id=$1', [d.id]);
    let user;
    if (existing.rows.length === 0) {
      const slug = d.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || `user${d.id.slice(-4)}`;
      let finalSlug = slug;
      let counter = 1;
      while (true) {
        const check = await pool.query('SELECT id FROM users WHERE slug=$1', [finalSlug]);
        if (check.rows.length === 0) break;
        finalSlug = `${slug}${counter++}`;
      }
      const ins = await pool.query(
        'INSERT INTO users (discord_id, username, discriminator, avatar, slug) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [d.id, d.username, d.discriminator || '0', avatar, finalSlug]
      );
      user = ins.rows[0];
    } else {
      await pool.query('UPDATE users SET username=$1, avatar=$2 WHERE discord_id=$3',
        [d.username, avatar, d.id]);
      user = existing.rows[0];
      user.username = d.username;
      user.avatar = avatar;
    }
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ── API ──────────────────────────────────────────────────────────────────────
app.get('/api/me', isLoggedIn, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.session.userId]);
  res.json(r.rows[0]);
});

app.post('/api/me/update', isLoggedIn, async (req, res) => {
  const { bio, links, slug } = req.body;
  // validate slug
  if (slug) {
    const clean = slug.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 2) return res.json({ error: 'Slug too short' });
    const check = await pool.query('SELECT id FROM users WHERE slug=$1 AND id!=$2', [clean, req.session.userId]);
    if (check.rows.length > 0) return res.json({ error: 'Username taken' });
    await pool.query('UPDATE users SET slug=$1 WHERE id=$2', [clean, req.session.userId]);
  }
  if (bio !== undefined) {
    await pool.query('UPDATE users SET bio=$1 WHERE id=$2', [bio.slice(0, 160), req.session.userId]);
  }
  if (links !== undefined) {
    await pool.query('UPDATE users SET links=$1 WHERE id=$2', [JSON.stringify(links), req.session.userId]);
  }
  res.json({ ok: true });
});

// ── ADMIN API ────────────────────────────────────────────────────────────────
app.post('/admin/api/badge', isAdmin, async (req, res) => {
  const { slug, badge, action } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE slug=$1', [slug]);
  if (!user.rows[0]) return res.json({ error: 'User not found' });
  let badges = user.rows[0].badges || [];
  if (action === 'add' && !badges.includes(badge)) badges.push(badge);
  if (action === 'remove') badges = badges.filter(b => b !== badge);
  await pool.query('UPDATE users SET badges=$1 WHERE slug=$2', [JSON.stringify(badges), slug]);
  res.json({ ok: true, badges });
});

app.get('/admin/api/users', isAdmin, async (req, res) => {
  const r = await pool.query('SELECT id, username, slug, badges, views, created_at FROM users ORDER BY created_at DESC');
  res.json(r.rows);
});

// ── PAGES ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.redirect('/auth/discord'));
app.get('/dashboard', isLoggedIn, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/get-badge', (req, res) => res.sendFile(path.join(__dirname, 'public', 'get-badge.html')));

app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.post('/admin/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login?error=wrong');
  }
});
app.get('/admin', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ── PROFILE PAGE ─────────────────────────────────────────────────────────────
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  if (['admin','login','logout','auth','api','dashboard','get-badge'].includes(slug)) return;
  const r = await pool.query('SELECT * FROM users WHERE slug=$1', [slug]);
  if (!r.rows[0]) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  await pool.query('UPDATE users SET views=views+1 WHERE slug=$1', [slug]);
  const user = r.rows[0];
  user.views += 1;
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/api/profile/:slug', async (req, res) => {
  const r = await pool.query('SELECT username, avatar, bio, links, badges, views, slug, created_at FROM users WHERE slug=$1', [req.params.slug]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...r.rows[0], badge_meta: BADGE_META });
});

app.listen(PORT, () => console.log(`🚀 icyd running on port ${PORT}`));
