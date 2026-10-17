# Role-Based Project Management

A responsive web application with three roles: Developer, Manager, and Employee. The interface is React. The API is Node.js and Express. Records are stored in MySQL, including every visible label, heading, card, and layout block so a developer can change the live manager and employee sites without editing source code.

## What each role can do

- **Employee:** sees only assigned projects, grouped into Completed, Ongoing, and Others. Opens a project to read the idea, manager instructions, and team, then adds modules, notes, photos, and documents on a timeline. Marks the project completed.
- **Manager:** four rows — active projects, employees and their work, completed projects with who finished them, and a create-project form.
- **Developer:** opens live editable copies of the manager and employee sites, adds or edits or deletes or reorders interface text and shapes, manages manager and employee accounts, and removes the starter data one item at a time or all at once.

Employees cannot open another person's projects. Passwords are hashed. A signed cookie protects every data route.

The database also starts with two sample projects so the screens are understandable. The developer can delete that demo data. With nothing left, each screen shows an empty state.

## Setup

Requirements: Node.js 18 or newer. The database is already the Supabase project linked from `server/.env`. Docker is not required.

```bash
npm install
npm run install:all
npm run dev
```

Open http://localhost:5173. The API listens on port 3001. Database settings live in `server/.env` and point at the Supabase project.

## Folder layout

- `client/` — React interface
- `server/` — Express API, uploads, and database setup
- `docker-compose.yml` — optional local MySQL, not used while Supabase is configured
- `PROJECT.md` — full project guide, including where data is stored
