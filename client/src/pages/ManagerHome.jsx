import { useState } from 'react';
import { useData } from '../components/data';
import { ProjectCard } from '../components/project';
import { api } from '../api';
import { explain, FieldLabel, fieldOrder, Stack, useUi } from '../components/ui';

const FORM_FIELDS = ['name_label', 'idea_label', 'instructions_label', 'start_date_label', 'end_date_label', 'modules_label', 'assign_label'];

export default function ManagerHome() {
  return (
    <Stack widgets={{
      project_list: ProjectList,
      employees: Employees,
      completed_list: CompletedList,
      create_project: CreateProject,
    }} />
  );
}

function ProjectList() {
  const { projects, loading, error, reload } = useData();
  const { text } = useUi();
  const active = projects.filter((project) => project.status !== 'completed');
  if (loading) return <p className="muted">{text('loading')}</p>;
  if (error) return <p className="form-error">{text('generic_error')}</p>;
  if (!active.length) return <p className="empty"><FieldLabel k="empty_active" /></p>;
  return (
    <div className="peek-row">
      {active.map((project) => (
        <ProjectCard key={project.id} project={project} to={`/manager/projects/${project.id}`} onDeleted={reload} />
      ))}
    </div>
  );
}

function Employees() {
  const { people, projects, loading, reload } = useData();
  const { text } = useUi();
  const [selected, setSelected] = useState(null);
  const employees = people.filter((person) => person.role === 'employee');
  if (loading) return <p className="muted">{text('loading')}</p>;
  if (!employees.length) return <p className="empty"><FieldLabel k="empty_employees" /></p>;
  const chosen = employees.find((person) => person.id === selected);
  const assigned = projects.filter((project) => project.status !== 'completed' && project.team.some((member) => member.id === selected));

  return (
    <div className="split">
      <ul className="people peek-down">
        {employees.map((person) => (
          <li key={person.id}>
            <button type="button" className={person.id === selected ? 'active' : ''} onClick={() => setSelected(person.id)}>
              <strong>{person.full_name}</strong>
              <span>{person.username}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        {!chosen && <p className="muted">{text('pick_employee')}</p>}
        {chosen && !assigned.length && <p className="empty"><FieldLabel k="empty_employee_projects" /></p>}
        {chosen && !!assigned.length && (
          <div className="peek-row">
            {assigned.map((project) => (
              <ProjectCard key={project.id} project={project} to={`/manager/projects/${project.id}`} onDeleted={reload} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompletedList() {
  const { projects, loading, reload } = useData();
  const { text } = useUi();
  const done = projects.filter((project) => project.status === 'completed');
  if (loading) return <p className="muted">{text('loading')}</p>;
  if (!done.length) return <p className="empty"><FieldLabel k="empty_completed" /></p>;
  return (
    <div className="peek-row">
      {done.map((project) => (
        <ProjectCard key={project.id} project={project} to={`/manager/projects/${project.id}`} onDeleted={reload} />
      ))}
    </div>
  );
}

function CreateProject() {
  const { people, reload } = useData();
  const { text, elements, map } = useUi();
  const employees = people.filter((person) => person.role === 'employee');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
  const [instructions, setInstructions] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modules, setModules] = useState(['']);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit(event) {
    event.preventDefault();
    if (!name.trim() || !idea.trim() || !startDate || !endDate || startDate > endDate) {
      setError(text('required'));
      return;
    }
    if (!selected.length) {
      setError(text('need_employee'));
      return;
    }
    setBusy(true);
    try {
      await api.createProject({
        name: name.trim(),
        idea: idea.trim(),
        manager_instructions: instructions.trim(),
        start_date: startDate,
        end_date: endDate,
        modules: modules.map((item) => item.trim()).filter(Boolean),
        employee_ids: selected,
      });
      setName('');
      setIdea('');
      setInstructions('');
      setStartDate('');
      setEndDate('');
      setModules(['']);
      setSelected([]);
      setError('');
      setOpen(false);
      reload();
    } catch (err) {
      setError(explain(err.code, text));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="plus-launch" onClick={() => setOpen(true)} aria-label={text('create_button')}>+</button>
      {open && (
        <form className="panel" onSubmit={submit}>
          {fieldOrder(elements, FORM_FIELDS).map((key, _index, ordered) => {
            if (key === 'name_label') {
              return (
                <label key={key}>
                  <FieldLabel k="name_label" orderKeys={FORM_FIELDS} />
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
              );
            }
            if (key === 'idea_label') {
              return (
                <label key={key}>
                  <FieldLabel k="idea_label" orderKeys={FORM_FIELDS} />
                  <textarea rows={3} value={idea} onChange={(event) => setIdea(event.target.value)} />
                </label>
              );
            }
            if (key === 'instructions_label') {
              return (
                <label key={key}>
                  <FieldLabel k="instructions_label" orderKeys={FORM_FIELDS} />
                  <textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
                </label>
              );
            }
            if (key === 'start_date_label' || key === 'end_date_label') {
              const firstDate = ordered.find((item) => item === 'start_date_label' || item === 'end_date_label');
              if (key !== firstDate) return null;
              return (
                <div key="project-dates" className="date-row">
                  <label>
                    <FieldLabel k="start_date_label" orderKeys={FORM_FIELDS} />
                    {!map.start_date_label && <span className="field-label">Start date</span>}
                    <input type="date" value={startDate} required onChange={(event) => setStartDate(event.target.value)} />
                  </label>
                  <label>
                    <FieldLabel k="end_date_label" orderKeys={FORM_FIELDS} />
                    {!map.end_date_label && <span className="field-label">End date</span>}
                    <input type="date" value={endDate} required onChange={(event) => setEndDate(event.target.value)} />
                  </label>
                </div>
              );
            }
            if (key === 'modules_label') {
              return (
                <fieldset key={key}>
                  <legend><FieldLabel k="modules_label" orderKeys={FORM_FIELDS} /></legend>
                  {modules.map((value, index) => (
                    <input key={index} value={value} onChange={(event) => {
                      const next = [...modules];
                      next[index] = event.target.value;
                      setModules(next);
                    }} />
                  ))}
                  <button type="button" className="btn small ghost" onClick={() => setModules([...modules, ''])}>{text('module_add')}</button>
                </fieldset>
              );
            }
            return (
              <fieldset key={key}>
                <legend><FieldLabel k="assign_label" orderKeys={FORM_FIELDS} /></legend>
                {!employees.length && <p className="empty">{text('empty_employees')}</p>}
                <div className="peek-down compact">
                  {employees.map((person) => (
                    <label key={person.id} className="check">
                      <input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} />
                      {person.full_name}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            <button className="btn primary" type="submit" disabled={busy}>{text('create_button')}</button>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>{text('cancel')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
