import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { StatusBadge, TeamList, Timeline, UpdateComposer, formatDate, formatWhen } from '../components/project';
import { explain, FieldLabel, fieldOrder, Stack, useUi } from '../components/ui';

const SECTIONS = ['idea_label', 'instructions_label', 'team_label', 'updates_heading', 'modules_heading'];

export default function ManagerProject() {
  return <Stack widgets={{ detail: Detail }} />;
}

function Detail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { text, elements } = useUi();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');

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

  async function removeModule(moduleId) {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteModule(moduleId);
    reload();
  }

  if (error) return <p className="form-error">{error}</p>;
  if (!project) return <p className="muted">{text('loading')}</p>;

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
        {!project.modules.length && <p className="empty"><FieldLabel k="empty_modules" /></p>}
        <div className="module-list">
          {project.modules.map((module) => (
            <article key={module.id} className="module-card">
              <div className="card-top">
                <h3>{module.title}</h3>
                {user?.role === 'developer' && (
                  <button type="button" className="btn small danger" onClick={() => removeModule(module.id)}>{text('delete_label')}</button>
                )}
              </div>
              <UpdateComposer moduleId={module.id} onChange={reload} sectionKeys={['updates_heading']} />
              <Timeline updates={module.updates} onDeleted={reload} />
            </article>
          ))}
        </div>
      </section>
    ),
  };

  return (
    <article className="workspace">
      <Link className="back" to="/manager" aria-label={text('back_label') || 'Back'}><ArrowLeft /></Link>
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
      {project.status === 'completed' && (
        <p className="done-banner">
          <FieldLabel k="completed_by_label" /> {project.completed_by_name || project.team.map((member) => member.full_name).join(', ')} · {formatWhen(project.completed_at)}
        </p>
      )}
    </article>
  );
}
