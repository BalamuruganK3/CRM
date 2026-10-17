import { useData } from '../components/data';
import { ProjectCard } from '../components/project';
import { FieldLabel, Stack, useUi } from '../components/ui';

export default function EmployeeHome() {
  return <Stack widgets={{ project_board: ProjectBoard }} />;
}

function ProjectBoard() {
  const { projects, loading, error, reload } = useData();
  const { elements, text } = useUi();
  const groups = [
    { key: 'completed', match: (project) => project.status === 'completed' },
    { key: 'ongoing', match: (project) => project.status === 'ongoing' },
    { key: 'others', match: (project) => project.status === 'not_started' || project.status === 'on_hold' },
  ];
  const headings = elements.filter((element) => ['completed', 'ongoing', 'others'].includes(element.action_key));
  groups.sort((a, b) => {
    const aOrder = headings.find((item) => item.action_key === a.key)?.sort_order ?? 0;
    const bOrder = headings.find((item) => item.action_key === b.key)?.sort_order ?? 0;
    return aOrder - bOrder;
  });

  if (loading) return <p className="muted">{text('loading')}</p>;
  if (error) return <p className="form-error">{text('generic_error')}</p>;
  if (!projects.length) return <p className="empty large"><FieldLabel k="empty_projects" /></p>;

  return (
    <div className="group-rows">
      {groups.map((group) => {
        const items = projects.filter(group.match);
        return (
          <section key={group.key} className="group-row">
            <h2><FieldLabel k={`${group.key}_heading`} orderKeys={['completed_heading', 'ongoing_heading', 'others_heading']} /></h2>
            {items.length === 0 && <p className="empty"><FieldLabel k="empty_section" /></p>}
            {!!items.length && (
              <div className="peek-row">
                {items.map((project) => (
                  <ProjectCard key={project.id} project={project} to={`/employee/projects/${project.id}`} onDeleted={reload} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
