require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const axios = require('axios');
const path = require('path');
const Datastore = require('nedb-promises');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ────────────────────────────────────────────────
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const db = {
  users: Datastore.create({ filename: path.join(dbDir, 'users.db'), autoload: true }),
  sessions_store: Datastore.create({ filename: path.join(dbDir, 'sessions.db'), autoload: true }),
  activity: Datastore.create({ filename: path.join(dbDir, 'activity.db'), autoload: true }),
};

// index for fast lookup
db.users.ensureIndex({ fieldName: 'githubId', unique: true });
db.activity.ensureIndex({ fieldName: 'userId' });

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'devplanet-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Passport GitHub Strategy ─────────────────────────────────
passport.use(new GitHubStrategy({
  clientID:     process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL:  process.env.GITHUB_CALLBACK_URL || `http://localhost:${PORT}/auth/github/callback`,
  scope: ['read:user', 'public_repo']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const githubId = profile.id.toString();
    const now = new Date().toISOString();

    // fetch extended data
    const headers = { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github.v3+json' };
    let repos = [], totalStars = 0, totalForks = 0, langs = {};

    try {
      const reposRes = await axios.get(
        `https://api.github.com/users/${profile.username}/repos?per_page=100&sort=updated`,
        { headers }
      );
      repos = reposRes.data;
      for (const r of repos) {
        totalStars += r.stargazers_count || 0;
        totalForks += r.forks_count || 0;
        if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
      }
    } catch (e) { /* non-fatal */ }

    const score = calcScore(profile._json, repos, langs);

    const userData = {
      githubId,
      login: profile.username,
      name: profile.displayName || profile.username,
      email: profile.emails?.[0]?.value || null,
      avatarUrl: profile.photos?.[0]?.value || '',
      bio: profile._json.bio || '',
      location: profile._json.location || '',
      company: profile._json.company || '',
      publicRepos: profile._json.public_repos || 0,
      followers: profile._json.followers || 0,
      following: profile._json.following || 0,
      createdAt: profile._json.created_at,
      accessToken,
      totalStars,
      totalForks,
      langMap: langs,
      repoCount: repos.length,
      score,
      lastLogin: now,
    };

    // upsert user
    let user = await db.users.findOne({ githubId });
    if (user) {
      await db.users.update({ githubId }, { $set: { ...userData, firstSeen: user.firstSeen } });
      user = await db.users.findOne({ githubId });
    } else {
      userData.firstSeen = now;
      user = await db.users.insert(userData);
    }

    // log activity
    await db.activity.insert({
      userId: githubId,
      event: 'login',
      score,
      ts: now,
    });

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.users.findOne({ _id: id });
    done(null, user);
  } catch (e) { done(e); }
});

// ── Score calculator (same formula as frontend) ──────────────
function calcScore(ghUser, repos, langs) {
  let score = 0;
  score += (ghUser.public_repos || 0) * 3;
  score += (ghUser.followers || 0) * 5;
  score += (ghUser.following || 0) * 0.5;
  score += Math.min(ghUser.public_gists || 0, 50);
  let stars = 0, forks = 0;
  for (const r of repos) { stars += r.stargazers_count || 0; forks += r.forks_count || 0; }
  score += stars * 4;
  score += forks * 3;
  score += Object.keys(langs).length * 8;
  score += Math.min(repos.length, 100) * 1.5;
  const years = (Date.now() - new Date(ghUser.created_at)) / (1000*60*60*24*365);
  score += Math.floor(years) * 20;
  return Math.floor(score);
}

// ── Auth Routes ──────────────────────────────────────────────
app.get('/auth/github', passport.authenticate('github', { scope: ['read:user', 'public_repo'] }));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// ── API Routes ───────────────────────────────────────────────
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

app.get('/api/me', ensureAuth, (req, res) => {
  const u = req.user;
  // don't expose token
  const { accessToken, ...safe } = u;
  res.json(safe);
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await db.users.find({}).sort({ score: -1 }).limit(20);
    res.json(users.map(u => ({
      login: u.login, name: u.name, avatarUrl: u.avatarUrl,
      score: u.score, publicRepos: u.publicRepos, followers: u.followers,
      totalStars: u.totalStars, langMap: u.langMap,
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/activity/:githubId', ensureAuth, async (req, res) => {
  try {
    const logs = await db.activity.find({ userId: req.params.githubId }).sort({ ts: -1 }).limit(30);
    res.json(logs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SPA fallback ─────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🪐 DevPlanet running → http://localhost:${PORT}`);
  console.log(`   DB path: ${dbDir}`);
});
