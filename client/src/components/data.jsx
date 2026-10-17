import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    try {
      const [projectData, userData] = await Promise.all([api.projects(), api.users()]);
      setProjects(projectData.projects);
      setPeople(userData.users);
      setError('');
    } catch (err) {
      setError(err.code || 'SERVER');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <DataContext.Provider value={{ projects, people, loading, error, reload }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
