import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useData } from './data';
import { explain, FieldLabel, fieldOrder, useUi } from './ui';

export function formatWhen(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function StatusBadge({ status }) {
  const { text } = useUi();
  return <span className={`badge badge-${status}`}>{text(`status_${status}`) || status}</span>;
}

export function ProjectCard({ project, to, onDeleted }) {
  const { user } = useAuth();
  const { text } = useUi();

  async function remove(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteProject(project.id);
    onDeleted?.();
  }

  const dates = [
    project.start_date ? `Starts ${formatDate(project.start_date)}` : '',
    project.end_date ? `Ends ${formatDate(project.end_date)}` : '',
  ].filter(Boolean).join(' · ');
  const completed = project.status === 'completed' && project.completed_by_name
    ? `${text('completed_by')} ${project.completed_by_name} · ${formatWhen(project.completed_at)}`
    : '';

  return (
    <Link className="project-card" to={to}>
      <div className="card-top">
        <h3>{project.name}</h3>
        <StatusBadge status={project.status} />
      </div>
      <p className="card-idea">{project.idea || '\u00a0'}</p>
      <p className="card-team muted">{project.team.map((member) => member.full_name).join(', ') || '\u00a0'}</p>
      <p className="card-dates muted">{dates || '\u00a0'}</p>
      <p className="card-meta muted">{completed || '\u00a0'}</p>
      <div className="card-actions">
        {user?.role === 'developer' && (
          <button type="button" className="btn small danger" onClick={remove}>{text('delete_label')}</button>
        )}
      </div>
    </Link>
  );
}

export function TeamList({ project, onChange }) {
  const { user } = useAuth();
  const { people } = useData();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const canAdd = user?.role === 'manager' || user?.role === 'developer';
  const available = (people || []).filter((person) => person.role === 'employee' && !project.team.some((member) => member.id === person.id));

  async function add(userId) {
    try {
      await api.addMember(project.id, userId);
      setError('');
      setOpen(false);
      onChange();
    } catch (err) {
      setError(err.code || 'SERVER');
    }
  }

  return (
    <div className="team-line">
      <ul className="chips">
        {project.team.map((member) => <li key={member.id}>{member.full_name}</li>)}
      </ul>
      {canAdd && (
        <button type="button" className="plus-mini" aria-label="Add employee" onClick={() => setOpen((value) => !value)}>
          <Plus />
        </button>
      )}
      {open && (
        <div className="panel member-picker">
          {!available.length && <p className="muted">Every employee is already on this project.</p>}
          {available.map((person) => (
            <button key={person.id} type="button" className="btn ghost" onClick={() => add(person.id)}>{person.full_name}</button>
          ))}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

const UPDATE_PARTS = ['update_placeholder', 'upload_label', 'post_update'];

export function UpdateComposer({ projectId, moduleId, onChange, sectionKeys }) {
  const { text, elements, map } = useUi();
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parts = fieldOrder(elements, UPDATE_PARTS);

  async function submit(event) {
    event.preventDefault();
    if (!note.trim() && files.length === 0) {
      setError(text('update_required') || 'Add a note or at least one file.');
      return;
    }
    const form = new FormData();
    form.append('note', note.trim());
    for (const file of files) form.append('files', file);
    setBusy(true);
    try {
      let target = moduleId;
      if (!target) {
        const created = await api.addModule(projectId, 'Updates');
        target = created.id;
      }
      await api.addUpdate(target, form);
      setNote('');
      setFiles([]);
      setError('');
      onChange();
    } catch (err) {
      setError(explain(err.code, text) || 'The update could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="update-box" onSubmit={submit}>
      <h2>
        <FieldLabel k="updates_heading" orderKeys={sectionKeys} />
        {!map.updates_heading && 'Update'}
      </h2>
      {parts.map((key) => {
        if (key === 'update_placeholder') {
          return (
            <label key={key}>
              <FieldLabel k="update_placeholder" orderKeys={UPDATE_PARTS} />
              <textarea rows={4} value={note} placeholder={text('update_placeholder') || 'Write an update for this project'} onChange={(event) => setNote(event.target.value)} />
            </label>
          );
        }
        if (key === 'upload_label') {
          return (
            <label key={key} className="file-field">
              <FieldLabel k="upload_label" orderKeys={UPDATE_PARTS} />
              {!map.upload_label && 'Photos and documents'}
              <span className="file-drop">
                <input type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx" onChange={(event) => setFiles([...event.target.files])} />
                <button
        type="button"
        className="choose-file-btn"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById(`file-input-${key}`)?.click();
        }}
      >
        Choose Files
      </button>
                <span className="file-drop-text">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose files'}</span>
              </span>
            </label>
          );
        }
        return (
          <div key={key} className="update-action">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : (text('post_update') || 'Post update')}
            </button>
            <FieldLabel k="post_update" orderKeys={UPDATE_PARTS} toolsOnly />
          </div>
        );
      })}
      {!!files.length && <p className="muted">{files.map((file) => file.name).join(', ')}</p>}
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function fileKind(file) {
  const mime = String(file?.mime || '');
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function Timeline({ updates, onDeleted }) {
  const { user } = useAuth();
  const { text } = useUi();
  const [preview, setPreview] = useState(null);

  async function remove(id) {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteUpdate(id);
    onDeleted?.();
  }

  useEffect(() => {
    if (!preview) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') setPreview(null);
      if (event.key === 'ArrowLeft') {
        setPreview((current) => current && current.files.length > 1
          ? { ...current, index: (current.index - 1 + current.files.length) % current.files.length }
          : current);
      }
      if (event.key === 'ArrowRight') {
        setPreview((current) => current && current.files.length > 1
          ? { ...current, index: (current.index + 1) % current.files.length }
          : current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  if (!updates.length) return <p className="empty">{text('empty_updates')}</p>;

  const active = preview?.files?.[preview.index];
  const many = (preview?.files?.length || 0) > 1;

  function step(direction) {
    setPreview((current) => {
      if (!current || current.files.length < 2) return current;
      return { ...current, index: (current.index + direction + current.files.length) % current.files.length };
    });
  }

  return (
    <>
      <ol className="timeline">
        {updates.map((update) => (
          <li key={update.id}>
            <div className="timeline-mark" />
            <div className="timeline-body">
              <div className="card-top">
                <strong>{update.author_name || 'Unknown'}</strong>
                <time>{formatWhen(update.created_at)}</time>
              </div>
              {update.note && <p>{update.note}</p>}
              {!!update.files?.length && (
                <div className="file-grid">
                  {update.files.map((file, index) => (
                    String(file.mime).startsWith('image/') ? (
                      <button type="button" key={file.id} className="thumb" onClick={() => setPreview({ files: update.files, index })}>
                        <img src={`/api/files/${file.id}`} alt={file.original_name} />
                      </button>
                    ) : (
                      <button type="button" key={file.id} className="doc-link" onClick={() => setPreview({ files: update.files, index })}>
                        {file.original_name}
                      </button>
                    )
                  ))}
                </div>
              )}
              {user?.role === 'developer' && (
                <button type="button" className="btn small danger" onClick={() => remove(update.id)}>{text('delete_label')}</button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {active && (
        <div className="lightbox" onClick={() => setPreview(null)} role="presentation">
          <div className="lightbox-frame" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-toolbar">
              <a className="lightbox-icon" href={`/api/files/${active.id}?download=1`} download={active.original_name} aria-label="Download">
                <Download size={18} />
              </a>
              <button type="button" className="lightbox-icon" onClick={() => setPreview(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {many && (
              <button type="button" className="lightbox-nav prev" onClick={() => step(-1)} aria-label="Previous file">
                <ChevronLeft size={22} />
              </button>
            )}
            {many && (
              <button type="button" className="lightbox-nav next" onClick={() => step(1)} aria-label="Next file">
                <ChevronRight size={22} />
              </button>
            )}
            <figure>
              {fileKind(active) === 'image' && <img src={`/api/files/${active.id}`} alt={active.original_name} />}
              {fileKind(active) === 'video' && <video src={`/api/files/${active.id}`} controls autoPlay />}
              {fileKind(active) === 'file' && <p className="lightbox-doc">{active.original_name}</p>}
              <figcaption>{active.original_name}</figcaption>
            </figure>
          </div>
        </div>
      )}
    </>
  );
}
