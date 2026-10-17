import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useData } from '../components/data';
import { FieldLabel, RemoteElements, Stack, explain, useUi } from '../components/ui';

export default function DeveloperHome() {
  const navigate = useNavigate();
  return (
    <>
      <Appearance />
      <Stack
        widgets={{ user_admin: UserAdmin, demo_admin: DemoAdmin }}
        onAction={(action) => {
          if (action === 'open_manager') navigate('/manager');
          if (action === 'open_employee') navigate('/employee');
        }}
      />
    </>
  );
}

const COLOR_FIELDS = [
  ['theme_accent', 'Accent'],
  ['theme_paper', 'Background'],
  ['theme_ink', 'Text'],
  ['theme_card', 'Cards'],
];
const SHAPE_OPTIONS = ['rectangle', 'rounded', 'pill'];

function Appearance() {
  const { map, reload } = useUi();

  async function save(key, content) {
    const element = map[key];
    if (!element) return;
    await api.patchUi(element.id, { content });
    await reload();
  }

  return (
    <section className="panel appearance">
      <h2>Appearance</h2>
      <p className="muted">These colors and shapes apply to every page, including sign-in. Icon and field size are set on each item with its edit button.</p>
      <div className="color-grid">
        {COLOR_FIELDS.map(([key, label]) => (
          <label key={key}>
            {label}
            <input type="color" value={toColor(map[key]?.content)} onChange={(event) => save(key, event.target.value)} />
          </label>
        ))}
      </div>
      <div className="shape-choices">
        <div>
          <span className="picker-label">Field shape</span>
          <div className="choice-row">
            {SHAPE_OPTIONS.map((shape) => (
              <button key={shape} type="button" className={map.field_shape?.content === shape ? 'btn small primary' : 'btn small ghost'} onClick={() => save('field_shape', shape)}>{shape}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="picker-label">Button shape</span>
          <div className="choice-row">
            {SHAPE_OPTIONS.map((shape) => (
              <button key={shape} type="button" className={map.button_shape?.content === shape ? 'btn small primary' : 'btn small ghost'} onClick={() => save('button_shape', shape)}>{shape}</button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function toColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#0c9b84';
}

const blank = { username: '', email: '', full_name: '', password: '', role: 'employee' };

function UserAdmin() {
  const { people, loading, reload } = useData();
  const { text } = useUi();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const accounts = people.filter((person) => person.role !== 'developer');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.username.trim() || !form.email.trim() || !form.full_name.trim() || (!editing && form.password.length < 6)) {
      setError(text('required'));
      return;
    }
    try {
      if (editing) await api.updateUser(editing, form);
      else await api.createUser(form);
      setForm(blank);
      setEditing(null);
      setError('');
      reload();
    } catch (err) {
      setError(explain(err.code, text));
    }
  }

  async function remove(id) {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteUser(id);
    reload();
  }

  if (loading) return <p className="muted">{text('loading')}</p>;

  return (
    <div className="admin-grid">
      <form className="panel" onSubmit={submit}>
        <h3>{editing ? text('edit_user') : text('add_user')}</h3>
        <label><FieldLabel k="full_name" /><input value={form.full_name} onChange={(event) => update('full_name', event.target.value)} /></label>
        <label><FieldLabel k="username" /><input value={form.username} onChange={(event) => update('username', event.target.value)} /></label>
        <label><FieldLabel k="email" /><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
        <label>
          <FieldLabel k="role" />
          <select value={form.role} onChange={(event) => update('role', event.target.value)}>
            <option value="manager">{text('manager_role')}</option>
            <option value="employee">{text('employee_role')}</option>
          </select>
        </label>
        <label>
          <FieldLabel k={editing ? 'password_optional' : 'password'} />
          <input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="row-actions">
          <button className="btn primary" type="submit">{editing ? text('save') : text('add_user')}</button>
          {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setForm(blank); }}>{text('cancel')}</button>}
        </div>
      </form>
      <div className="account-list peek-down">
        {!accounts.length && <p className="empty"><FieldLabel k="empty_users" /></p>}
        {accounts.map((person) => (
          <article key={person.id} className="account-row">
            <div>
              <strong>{person.full_name}</strong>
              <p className="muted">{person.role} · {person.username} · {person.email}</p>
            </div>
            <div className="row-actions">
              <button type="button" className="btn small" onClick={() => {
                setEditing(person.id);
                setForm({ username: person.username, email: person.email, full_name: person.full_name, password: '', role: person.role });
              }}>{text('edit_user')}</button>
              <button type="button" className="btn small danger" onClick={() => remove(person.id)}>{text('delete_user')}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DemoAdmin() {
  const { projects, people, reload, loading } = useData();
  const { text } = useUi();
  const demoProjects = projects.filter((project) => project.is_demo);
  const demoUsers = people.filter((person) => person.is_demo);

  async function purge() {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.purgeDemo();
    reload();
  }

  async function removeProject(id) {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteProject(id);
    reload();
  }

  async function removeUser(id) {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteUser(id);
    reload();
  }

  if (loading) return <p className="muted">{text('loading')}</p>;

  return (
    <div>
      <p className="lede"><FieldLabel k="purge_help" /></p>
      <button type="button" className="btn danger" onClick={purge}>{text('purge')}</button>
      {!demoProjects.length && !demoUsers.length && <p className="empty"><FieldLabel k="empty_demo" /></p>}
      <div className="account-list">
        {demoUsers.map((person) => (
          <article key={person.id} className="account-row">
            <div>
              <strong>{person.full_name}</strong>
              <p className="muted">{person.role} · {person.username}</p>
            </div>
            <button type="button" className="btn small danger" onClick={() => removeUser(person.id)}>{text('delete_label')}</button>
          </article>
        ))}
        {demoProjects.map((project) => (
          <article key={project.id} className="account-row">
            <div>
              <strong>{project.name}</strong>
              <p className="muted">{project.status}</p>
            </div>
            <button type="button" className="btn small danger" onClick={() => removeProject(project.id)}>{text('delete_label')}</button>
          </article>
        ))}
      </div>
      <h3 className="login-copy-title"><FieldLabel k="login_heading" /></h3>
      <RemoteElements page="login" />
    </div>
  );
}
