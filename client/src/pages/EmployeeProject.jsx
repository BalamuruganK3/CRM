import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { StatusBadge, TeamList, Timeline, UpdateComposer, formatDate, formatWhen } from '../components/project';
import { explain, FieldLabel, fieldOrder, Stack, useUi } from '../components/ui';

const SECTIONS = ['idea_label', 'instructions_label', 'team_label', 'updates_heading', 'modules_heading'];

export default function EmployeeProject() {
  return <Stack widgets={{ workspace: Workspace }} />;
}

function Workspace() {
  const { id } = useParams();
  const { user } = useAuth();
  const { text, elements } = useUi();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [notice, setNotice] = useState('');

  async function reload() {
    try {
      const data = await api.project(id);
      setProject(data.project);
      setError('');
    } catch (err) {
      setError(explain(err.code, text));
    }
  }

  useEffect(() => {
    reload();
  }, [id]);

  async function addModule(event) {
    event.preventDefault();
    if (!moduleTitle.trim()) {
      setNotice(text('required'));
      return;
    }
    await api.addModule(id, moduleTitle.trim());
    setModuleTitle('');
    setNotice('');
    reload();
  }

  async function complete() {
    if (!window.confirm(text('confirm_complete'))) return;
    await api.completeProject(id);
    reload();
  }

  if (error) return <p className="form-error">{error}</p>;
  if (!project) return <p className="muted">{text('loading')}</p>;

  const canWrite = user?.role === 'employee' || user?.role === 'developer';
  const sections = {
    idea_label: (
      <section key="idea_label" className="callout">
        <h2><FieldLabel k="idea_label" orderKeys={SECTIONS} /></h2>
        <p>{project.idea}</p>
      </section>
    ),
    instructions_label: (
      <section key="instructions_label" className="callout accent">
        <h2><FieldLabel k="instructions_label" orderKeys={SECTIONS} /></h2>
        <p>{project.manager_instructions || text('no_instructions')}</p>
      </section>
    ),
    team_label: (
      <section key="team_label">
        <h2><FieldLabel k="team_label" orderKeys={SECTIONS} /></h2>
        <TeamList project={project} onChange={reload} />
      </section>
    ),
    updates_heading: (
      <UpdateComposer key="updates_heading" projectId={project.id} moduleId={project.modules[0]?.id} onChange={reload} sectionKeys={SECTIONS} />
    ),
    modules_heading: (
      <section key="modules_heading">
        <h2><FieldLabel k="modules_heading" orderKeys={SECTIONS} /></h2>
        {canWrite && (
          <form className="inline-form" onSubmit={addModule}>
            <label>
              <FieldLabel k="module_label" />
              <input value={moduleTitle} placeholder={text('module_placeholder')} onChange={(event) => setModuleTitle(event.target.value)} />
            </label>
            <button className="btn" type="submit">{text('add_module')}</button>
          </form>
        )}
        {notice && <p className="form-error">{notice}</p>}
        {!project.modules.length && <p className="empty"><FieldLabel k="empty_modules" /></p>}
        <div className="module-list">
          {project.modules.map((module) => (
            <ModuleCard key={module.id} module={module} onChange={reload} />
          ))}
        </div>
      </section>
    ),
  };

  return (
    <article className="workspace">
      <Link className="back" to="/employee" aria-label={text('back_label') || 'Back'}><ArrowLeft /></Link>
      <header className="workspace-head">
        <div>
          <h1>{project.name}</h1>
          <StatusBadge status={project.status} />
          {(project.start_date || project.end_date) && (
            <p className="muted">
              {project.start_date ? `Starts ${formatDate(project.start_date)}` : ''}
              {project.start_date && project.end_date ? ' · ' : ''}
              {project.end_date ? `Ends ${formatDate(project.end_date)}` : ''}
            </p>
          )}
        </div>
      </header>
      {fieldOrder(elements, SECTIONS).map((key) => sections[key])}
      {project.status === 'completed' ? (
        <p className="done-banner">
          <FieldLabel k="completed_banner" /> {project.completed_by_name} · {formatWhen(project.completed_at)}
        </p>
      ) : canWrite && (
        <div className="complete-bar">
          <button type="button" className="btn primary" onClick={complete}>{text('mark_completed')}</button>
        </div>
      )}
    </article>
  );
}

function ModuleCard({ module, onChange }) {
  const { text } = useUi();
  const { user } = useAuth();

  async function remove() {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteModule(module.id);
    onChange();
  }

  return (
    <article className="module-card">
      <div className="card-top">
        <h3>{module.title}</h3>
        {user?.role === 'developer' && (
          <button type="button" className="btn small danger" onClick={remove}>{text('delete_label')}</button>
        )}
      </div>
      <UpdateComposer moduleId={module.id} onChange={onChange} sectionKeys={['updates_heading']} />
      <Timeline updates={module.updates} onDeleted={onChange} />
    </article>
  );
}
