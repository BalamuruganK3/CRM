import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, pool } from './db.js';
import { persistAsWebp } from './media.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'));
fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const jwtSecret = process.env.JWT_SECRET || 'local-dev-secret';
const production = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.has(clean) || allowedOrigins.has('*')) return callback(null, true);
    try {
      if (new URL(clean).hostname.endsWith('.onrender.com')) return callback(null, true);
    } catch {
      // ignore invalid origin
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

const SHAPES = new Set(['rectangle', 'rounded', 'pill', 'square', 'circle', 'diamond']);

function cleanShape(value) {
  const shape = String(value || '');
  return SHAPES.has(shape) ? shape : null;
}

function cleanSize(value) {
  if (value === '' || value === null || value === undefined) return null;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 12 || size > 40) return null;
  return size;
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username }, jwtSecret, { expiresIn: '7d' });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies.token || null;
}

async function attachUser(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret);
    const [rows] = await pool.query(
      'SELECT id, username, email, full_name, role, is_demo FROM users WHERE id = ?',
      [payload.id],
    );
    req.user = rows[0] || null;
  } catch {
    req.user = null;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ code: 'AUTH' });
  next();
}

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 'AUTH' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ code: 'FORBIDDEN' });
    next();
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|svg|mp4|webm|mov|avi|mkv|m4v|pdf|docx?|txt|xlsx?|pptx?|csv)$/i.test(file.originalname)
      || /^(image\/|video\/|text\/plain|application\/pdf|application\/vnd.openxmlformats|application\/msword|application\/vnd.ms-)/.test(file.mimetype);
    cb(null, allowed);
  },
});

async function assignedIds(userId) {
  const [rows] = await pool.query('SELECT project_id FROM project_assignments WHERE user_id = ?', [userId]);
  return new Set(rows.map((row) => row.project_id));
}

async function canViewProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'manager' || user.role === 'developer') return true;
  const [rows] = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, user.id],
  );
  return rows.length > 0;
}

async function loadProjects(user) {
  const params = [];
  let where = '';
  if (user.role === 'employee') {
    where = 'WHERE p.id IN (SELECT project_id FROM project_assignments WHERE user_id = ?)';
    params.push(user.id);
  }
  const [projects] = await pool.query(
    `SELECT p.*, cb.full_name AS completed_by_name
     FROM projects p
     LEFT JOIN users cb ON cb.id = p.completed_by
     ${where}
     ORDER BY p.created_at DESC`,
    params,
  );
  if (projects.length === 0) return [];
  const ids = projects.map((project) => project.id);
  const [team] = await pool.query(
    `SELECT a.project_id, u.id, u.full_name, u.username
     FROM project_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE a.project_id IN (${ids.map(() => '?').join(',')})
     ORDER BY u.full_name`,
    ids,
  );
  const byProject = new Map();
  for (const member of team) {
    const list = byProject.get(member.project_id) || [];
    list.push({ id: member.id, full_name: member.full_name, username: member.username });
    byProject.set(member.project_id, list);
  }
  return projects.map((project) => ({ ...project, team: byProject.get(project.id) || [] }));
}

async function loadProject(id) {
  const [projects] = await pool.query(
    `SELECT p.*, cb.full_name AS completed_by_name
     FROM projects p
     LEFT JOIN users cb ON cb.id = p.completed_by
     WHERE p.id = ?`,
    [id],
  );
  if (!projects[0]) return null;
  const [team] = await pool.query(
    `SELECT u.id, u.full_name, u.username
     FROM project_assignments a JOIN users u ON u.id = a.user_id
     WHERE a.project_id = ? ORDER BY u.full_name`,
    [id],
  );
  const [modules] = await pool.query(
    `SELECT m.*, u.full_name AS created_by_name
     FROM modules m LEFT JOIN users u ON u.id = m.created_by
     WHERE m.project_id = ? ORDER BY m.created_at ASC, m.id ASC`,
    [id],
  );
  const moduleIds = modules.map((mod) => mod.id);
  let updates = [];
  let files = [];
  if (moduleIds.length) {
    const placeholders = moduleIds.map(() => '?').join(',');
    const [updateRows] = await pool.query(
      `SELECT up.*, u.full_name AS author_name
       FROM updates up LEFT JOIN users u ON u.id = up.user_id
       WHERE up.module_id IN (${placeholders})
       ORDER BY up.created_at ASC, up.id ASC`,
      moduleIds,
    );
    updates = updateRows;
    const updateIds = updates.map((item) => item.id);
    if (updateIds.length) {
      const [fileRows] = await pool.query(
        `SELECT * FROM files WHERE update_id IN (${updateIds.map(() => '?').join(',')}) ORDER BY id`,
        updateIds,
      );
      files = fileRows;
    }
  }
  const filesByUpdate = new Map();
  for (const file of files) {
    const list = filesByUpdate.get(file.update_id) || [];
    list.push(file);
    filesByUpdate.set(file.update_id, list);
  }
  const updatesByModule = new Map();
  for (const update of updates) {
    const list = updatesByModule.get(update.module_id) || [];
    list.push({ ...update, files: filesByUpdate.get(update.id) || [] });
    updatesByModule.set(update.module_id, list);
  }
  return {
    ...projects[0],
    team,
    modules: modules.map((mod) => ({ ...mod, updates: updatesByModule.get(mod.id) || [] })),
  };
}

app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(400).json({ code: 'LOGIN_REQUIRED' });
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
    [identifier, identifier],
  );
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ code: 'LOGIN_INVALID' });
  }
  const token = signToken(user);
  res.cookie('token', token, cookieOptions());
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token', cookieOptions());
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ code: 'AUTH' });
  res.json({ user: req.user });
});

app.get('/api/ui/:page', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM ui_elements WHERE page = ? ORDER BY sort_order ASC, id ASC',
    [req.params.page],
  );
  res.json({ elements: rows });
});

app.post('/api/ui', allow('developer'), async (req, res) => {
  const page = String(req.body.page || '').slice(0, 64);
  const slot = String(req.body.slot || 'main').slice(0, 64);
  const elementType = String(req.body.element_type || 'text');
  const content = String(req.body.content || '').trim();
  const types = ['heading', 'subheading', 'text', 'card', 'icon', 'button', 'label', 'section', 'widget', 'shape'];
  if (!page || !content || !types.includes(elementType)) return res.status(400).json({ code: 'VALIDATION' });
  const [maxRow] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM ui_elements WHERE page = ? AND slot = ?',
    [page, slot],
  );
  const [result] = await pool.query(
    `INSERT INTO ui_elements (page, slot, element_key, element_type, content, icon, shape, action_key, sort_order)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [page, slot, elementType, content, req.body.icon || null, cleanShape(req.body.shape), req.body.action_key || null, maxRow[0].max_order + 1],
  );
  const [rows] = await pool.query('SELECT * FROM ui_elements WHERE id = ?', [result.insertId]);
  res.status(201).json({ element: rows[0] });
});

app.patch('/api/ui/:id', allow('developer'), async (req, res) => {
  const [existing] = await pool.query('SELECT * FROM ui_elements WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const content = req.body.content !== undefined ? String(req.body.content) : existing[0].content;
  const icon = req.body.icon !== undefined ? req.body.icon || null : existing[0].icon;
  const actionKey = req.body.action_key !== undefined ? req.body.action_key || null : existing[0].action_key;
  const elementType = req.body.element_type || existing[0].element_type;
  const shape = req.body.shape !== undefined ? cleanShape(req.body.shape) : existing[0].shape;
  const iconSize = req.body.icon_size !== undefined ? cleanSize(req.body.icon_size) : existing[0].icon_size;
  const textSize = req.body.text_size !== undefined ? cleanSize(req.body.text_size) : existing[0].text_size;
  await pool.query(
    'UPDATE ui_elements SET content = ?, icon = ?, shape = ?, action_key = ?, element_type = ?, icon_size = ?, text_size = ? WHERE id = ?',
    [content, icon, shape, actionKey, elementType, iconSize, textSize, req.params.id],
  );
  const [rows] = await pool.query('SELECT * FROM ui_elements WHERE id = ?', [req.params.id]);
  res.json({ element: rows[0] });
});

app.delete('/api/ui/:id', allow('developer'), async (req, res) => {
  await pool.query('DELETE FROM ui_elements WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/ui/reorder', allow('developer'), async (req, res) => {
  const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
  const page = String(req.body.page || '');
  const slot = String(req.body.slot || '');
  for (let index = 0; index < orderedIds.length; index += 1) {
    await pool.query(
      'UPDATE ui_elements SET sort_order = ? WHERE id = ? AND page = ? AND slot = ?',
      [index, orderedIds[index], page, slot],
    );
  }
  res.json({ ok: true });
});

app.get('/api/users', requireUser, async (req, res) => {
  if (req.user.role === 'employee') {
    return res.json({ users: [req.user] });
  }
  const sql = req.user.role === 'manager'
    ? "SELECT id, username, email, full_name, role, is_demo, created_at FROM users WHERE role = 'employee' ORDER BY full_name"
    : 'SELECT id, username, email, full_name, role, is_demo, created_at FROM users ORDER BY role, full_name';
  const [rows] = await pool.query(sql);
  res.json({ users: rows });
});

app.post('/api/users', allow('developer'), async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'manager' ? 'manager' : 'employee';
  if (!username || !email || !fullName || password.length < 6) return res.status(400).json({ code: 'VALIDATION' });
  try {
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, full_name, role, is_demo) VALUES (?, ?, ?, ?, ?, 0) RETURNING id',
      [username, email, bcrypt.hashSync(password, 10), fullName, role],
    );
    const [rows] = await pool.query(
      'SELECT id, username, email, full_name, role, is_demo FROM users WHERE id = ?',
      [result.insertId],
    );
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ code: 'DUPLICATE' });
    throw error;
  }
});

app.patch('/api/users/:id', allow('developer'), async (req, res) => {
  const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  const user = existing[0];
  if (!user || user.role === 'developer') return res.status(404).json({ code: 'NOT_FOUND' });
  const username = String(req.body.username || user.username).trim();
  const email = String(req.body.email || user.email).trim();
  const fullName = String(req.body.full_name || user.full_name).trim();
  const role = req.body.role === 'manager' || req.body.role === 'employee' ? req.body.role : user.role;
  const password = String(req.body.password || '');
  if (!username || !email || !fullName) return res.status(400).json({ code: 'VALIDATION' });
  try {
    if (password) {
      if (password.length < 6) return res.status(400).json({ code: 'VALIDATION' });
      await pool.query(
        'UPDATE users SET username = ?, email = ?, full_name = ?, role = ?, password_hash = ? WHERE id = ?',
        [username, email, fullName, role, bcrypt.hashSync(password, 10), user.id],
      );
    } else {
      await pool.query(
        'UPDATE users SET username = ?, email = ?, full_name = ?, role = ? WHERE id = ?',
        [username, email, fullName, role, user.id],
      );
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ code: 'DUPLICATE' });
    throw error;
  }
  const [rows] = await pool.query(
    'SELECT id, username, email, full_name, role, is_demo FROM users WHERE id = ?',
    [user.id],
  );
  res.json({ user: rows[0] });
});

app.delete('/api/users/:id', allow('developer'), async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ code: 'SELF' });
  const [existing] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
  if (!existing[0] || existing[0].role === 'developer') return res.status(404).json({ code: 'NOT_FOUND' });
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/projects', requireUser, async (req, res) => {
  res.json({ projects: await loadProjects(req.user) });
});

app.get('/api/projects/:id', requireUser, async (req, res) => {
  if (!(await canViewProject(req.user, Number(req.params.id)))) return res.status(404).json({ code: 'NOT_FOUND' });
  const project = await loadProject(Number(req.params.id));
  if (!project) return res.status(404).json({ code: 'NOT_FOUND' });
  res.json({ project });
});

app.post('/api/projects', allow('manager', 'developer'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const idea = String(req.body.idea || '').trim();
  const instructions = String(req.body.manager_instructions || '').trim();
  const startDate = String(req.body.start_date || '').trim();
  const endDate = String(req.body.end_date || '').trim();
  const modules = Array.isArray(req.body.modules) ? req.body.modules.map((item) => String(item).trim()).filter(Boolean) : [];
  const employeeIds = Array.isArray(req.body.employee_ids)
    ? [...new Set(req.body.employee_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (!name || !idea || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    return res.status(400).json({ code: 'VALIDATION' });
  }
  if (employeeIds.length === 0) return res.status(400).json({ code: 'NEED_EMPLOYEE' });
  const [employees] = await pool.query(
    `SELECT id FROM users WHERE role = 'employee' AND id IN (${employeeIds.map(() => '?').join(',')})`,
    employeeIds,
  );
  if (employees.length !== employeeIds.length) return res.status(400).json({ code: 'NEED_EMPLOYEE' });
  const [result] = await pool.query(
    `INSERT INTO projects (name, idea, manager_instructions, start_date, end_date, status, created_by, is_demo)
     VALUES (?, ?, ?, ?::date, ?::date, 'ongoing', ?, 0) RETURNING id`,
    [name, idea, instructions, startDate, endDate, req.user.id],
  );
  for (const employeeId of employeeIds) {
    await pool.query('INSERT INTO project_assignments (project_id, user_id) VALUES (?, ?)', [result.insertId, employeeId]);
  }
  for (const title of modules) {
    await pool.query(
      'INSERT INTO modules (project_id, title, created_by, is_demo) VALUES (?, ?, ?, 0) RETURNING id',
      [result.insertId, title, req.user.id],
    );
  }
  res.status(201).json({ project: await loadProject(result.insertId) });
});

app.post('/api/projects/:id/members', allow('manager', 'developer'), async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = Number(req.body.user_id);
  if (!Number.isInteger(projectId) || !Number.isInteger(userId)) return res.status(400).json({ code: 'VALIDATION' });
  const existingProject = await loadProject(projectId);
  if (!existingProject) return res.status(404).json({ code: 'NOT_FOUND' });
  const [employees] = await pool.query("SELECT id FROM users WHERE id = ? AND role = 'employee'", [userId]);
  if (!employees[0]) return res.status(400).json({ code: 'NEED_EMPLOYEE' });
  const [already] = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id = ? AND user_id = ?',
    [projectId, userId],
  );
  if (!already.length) {
    await pool.query('INSERT INTO project_assignments (project_id, user_id) VALUES (?, ?)', [projectId, userId]);
  }
  res.json({ project: await loadProject(projectId) });
});

app.post('/api/projects/:id/complete', requireUser, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await canViewProject(req.user, projectId))) return res.status(404).json({ code: 'NOT_FOUND' });
  if (req.user.role === 'manager') return res.status(403).json({ code: 'FORBIDDEN' });
  const allowed = req.user.role === 'developer' || (await assignedIds(req.user.id)).has(projectId);
  if (!allowed) return res.status(403).json({ code: 'FORBIDDEN' });
  await pool.query(
    "UPDATE projects SET status = 'completed', completed_by = ?, completed_at = NOW() WHERE id = ?",
    [req.user.id, projectId],
  );
  res.json({ project: await loadProject(projectId) });
});

async function unlinkStored(names) {
  for (const name of names) fs.unlink(path.join(uploadDir, path.basename(name)), () => {});
}

app.delete('/api/projects/:id', allow('developer'), async (req, res) => {
  const [files] = await pool.query(
    `SELECT f.stored_name FROM files f
     JOIN updates u ON u.id = f.update_id
     JOIN modules m ON m.id = u.module_id
     WHERE m.project_id = ?`,
    [req.params.id],
  );
  await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
  await unlinkStored(files.map((file) => file.stored_name));
  res.json({ ok: true });
});

app.post('/api/projects/:id/modules', requireUser, async (req, res) => {
  const projectId = Number(req.params.id);
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ code: 'VALIDATION' });
  if (!(await canViewProject(req.user, projectId))) return res.status(404).json({ code: 'NOT_FOUND' });
  const [result] = await pool.query(
    'INSERT INTO modules (project_id, title, created_by, is_demo) VALUES (?, ?, ?, 0) RETURNING id',
    [projectId, title, req.user.id],
  );
  res.status(201).json({ id: result.insertId });
});

app.delete('/api/modules/:id', allow('developer'), async (req, res) => {
  const [files] = await pool.query(
    `SELECT f.stored_name FROM files f
     JOIN updates u ON u.id = f.update_id
     WHERE u.module_id = ?`,
    [req.params.id],
  );
  await pool.query('DELETE FROM modules WHERE id = ?', [req.params.id]);
  await unlinkStored(files.map((file) => file.stored_name));
  res.json({ ok: true });
});

app.post('/api/modules/:id/updates', requireUser, (req, res, next) => {
  upload.array('files', 8)(req, res, (error) => {
    if (error) return res.status(400).json({ code: 'FILE' });
    next();
  });
}, async (req, res) => {
  const [modules] = await pool.query('SELECT * FROM modules WHERE id = ?', [req.params.id]);
  const moduleRow = modules[0];
  if (!moduleRow) return res.status(404).json({ code: 'NOT_FOUND' });
  if (!(await canViewProject(req.user, moduleRow.project_id))) return res.status(404).json({ code: 'NOT_FOUND' });
  const note = String(req.body.note || '').trim();
  const files = req.files || [];
  if (!note && files.length === 0) {
    for (const file of files) fs.unlink(file.path, () => {});
    return res.status(400).json({ code: 'UPDATE_REQUIRED' });
  }
  const [result] = await pool.query(
    'INSERT INTO updates (module_id, user_id, note, is_demo) VALUES (?, ?, ?, 0) RETURNING id',
    [moduleRow.id, req.user.id, note],
  );
  for (const file of files) {
    const saved = await persistAsWebp(file, uploadDir);
    await pool.query(
      'INSERT INTO files (update_id, original_name, stored_name, mime, size) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, saved.original_name, saved.stored_name, saved.mime, saved.size],
    );
  }
  res.status(201).json({ id: result.insertId });
});

app.delete('/api/updates/:id', allow('developer'), async (req, res) => {
  const [files] = await pool.query('SELECT stored_name FROM files WHERE update_id = ?', [req.params.id]);
  await pool.query('DELETE FROM updates WHERE id = ?', [req.params.id]);
  for (const file of files) {
    fs.unlink(path.join(uploadDir, file.stored_name), () => {});
  }
  res.json({ ok: true });
});

app.get('/api/files/:id', requireUser, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT f.*, m.project_id
     FROM files f
     JOIN updates u ON u.id = f.update_id
     JOIN modules m ON m.id = u.module_id
     WHERE f.id = ?`,
    [req.params.id],
  );
  const file = rows[0];
  if (!file || !(await canViewProject(req.user, file.project_id))) return res.status(404).json({ code: 'NOT_FOUND' });
  const fullPath = path.join(uploadDir, path.basename(file.stored_name));
  if (!fs.existsSync(fullPath)) return res.status(404).json({ code: 'NOT_FOUND' });
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  const forceDownload = String(req.query.download || '') === '1';
  const disposition = forceDownload || !String(file.mime).startsWith('image/') ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${file.original_name.replace(/"/g, '')}"`);
  res.sendFile(fullPath);
});

app.delete('/api/demo', allow('developer'), async (req, res) => {
  const [fileRows] = await pool.query(
    `SELECT f.stored_name FROM files f
     JOIN updates u ON u.id = f.update_id
     JOIN modules m ON m.id = u.module_id
     JOIN projects p ON p.id = m.project_id
     WHERE p.is_demo = 1`,
  );
  await pool.query('DELETE FROM projects WHERE is_demo = 1');
  await pool.query("DELETE FROM users WHERE is_demo = 1 AND role <> 'developer'");
  await unlinkStored(fileRows.map((file) => file.stored_name));
  res.json({ ok: true });
});

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(clientDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ code: 'SERVER' });
});

const port = Number(process.env.PORT || 3001);
async function boot(attempt = 1) {
  try {
    await initDatabase();
    app.listen(port, '0.0.0.0', () => {
      console.log(`API ready on port ${port}`);
    });
  } catch (error) {
    const retry = attempt < 4 && /concurrently updated|duplicate key/i.test(error.message);
    if (retry) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      return boot(attempt + 1);
    }
    console.error('Database startup failed.', error.message);
    process.exit(1);
  }
}

boot();
