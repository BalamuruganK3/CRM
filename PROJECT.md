# Project Management Application

This document describes the role-based project management web application: what it does, how it is built, where every piece of data lives, and how to point it at another Postgres database later.

## 1. Purpose

The application is a shared workspace for three kinds of people.

- A **developer** owns the product. They edit the live manager and employee websites, including the words and the shapes on those pages. They also create and remove accounts, and they can delete the starter data.
- A **manager** sees the whole team's work, inspects what employees have added, and creates new projects.
- An **employee** sees only the projects assigned to them, adds modules and updates, and marks a project completed.

One login page serves every role. After a successful sign-in, the person is sent to the home page for their role.

## 2. How the pieces fit together

```
Browser (React, port 5173)
        |
        |  /api  proxied in development
        v
Express API (port 3001)
        |
        +-- Supabase Postgres (project fqhdcxmxabnlvptrsust)
        |
        +-- server/uploads/   photos and documents on disk
```

The React app never talks to the database directly. Every screen loads and saves through the API. The API checks the signed-in user and their role before it reads or writes data. The database is the Supabase Postgres project [fqhdcxmxabnlvptrsust](https://supabase.com/dashboard/project/fqhdcxmxabnlvptrsust), in region `ap-northeast-1`. The API connects with the session pooler described in the [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres), because the direct database host is IPv6-only and did not resolve from this machine.

In development, Vite serves the interface and forwards any request that starts with `/api` to the Express server. The browser stays on `http://localhost:5173`, so the login cookie is sent with later requests, including image previews.

## 3. Roles in detail

### Employee

The home page lists only projects assigned to that employee. They are grouped into three sections:

- **Completed** — status `completed`
- **Ongoing** — status `ongoing`
- **Others** — status `not_started` or `on_hold`

Opening a project shows the name, the project idea, the instructions written by the assigning manager, and the assigned team. The employee types a module title and adds it. Each module is its own card. Under a module they can post a note, upload photos, and upload documents. Each update stores the author and the date and time, and the page shows them as a vertical timeline. Photos open in a larger preview. Documents download. **Mark as Completed** at the bottom sets the project to completed, records who clicked it and when, and moves the project into the Completed section. The manager can then see that completion.

An employee who is not assigned to a project cannot open it. The API returns "not found" rather than the project.

### Manager

The dashboard is four rows.

1. **Project List** — projects that are not completed. Opening one shows modules, notes, photos, and documents.
2. **Employees** — every employee account. Choosing a name lists that person's projects. Opening a project shows the same update history.
3. **Completed Projects** — finished work, including who marked it complete and when, plus the full history.
4. **Create New Project** — the plus control opens a form. Project name and project idea are required. Manager instructions are saved and shown to the team. Modules are optional. At least one employee must be assigned. New projects start as ongoing.

### Developer

The developer home page has two site cards, **Manager** and **Employee**. Each opens that role's website with editing controls on the page. Those controls are not shown to managers or employees.

On a live page the developer can:

- Change the text of a heading, label, card, button, or note.
- Change the icon name (a Lucide icon name such as `Plus` or `Users`).
- Change the **shape** of that element, or add a new shape block.
- Move an element up or down within its section.
- Delete an element.
- Add a heading, subheading, paragraph, card, shape, icon, button, label, section, or widget.

A shape is one of: rectangle, rounded, pill, square, circle, or diamond. Choosing a shape updates that element for every user, and the choice is stored in Postgres. Refreshing or signing out does not undo it.

The same page also manages accounts and demo data.

- **Accounts:** add, edit, or delete manager and employee users, including passwords. The developer cannot delete the account they are currently signed in with, and cannot delete the developer role from this screen.
- **Demo data:** delete one seeded user or project, or delete all seeded managers, employees, projects, modules, and updates in one action. The signed-in developer account remains so the application can still be used. After that purge, empty screens say that nothing is assigned yet.

Login-screen wording is edited from the developer page under **Login screen copy**. It is stored in the same table as the other interface text.

## 4. Where data is stored

There are two stores. Records live in Supabase Postgres. Uploaded files live on disk.

### Supabase Postgres

| Item | Value |
| --- | --- |
| Project | [fqhdcxmxabnlvptrsust](https://supabase.com/dashboard/project/fqhdcxmxabnlvptrsust) |
| Engine | Postgres 17 |
| Connection | Session pooler, `aws-0-ap-northeast-1.pooler.supabase.com` port `5432` |
| Database name | `postgres` |
| User | `postgres.fqhdcxmxabnlvptrsust` |
| Password | Stored in `server/.env` as `DB_PASSWORD` |

The API reads those values from `server/.env` before it opens the connection. Tables are created on startup if they are missing. Row level security is enabled and the `anon` and `authenticated` roles have no access, so the Supabase Data API cannot read passwords or project data. The Express server connects as the database owner, which is allowed to bypass those policies.

You can inspect the rows in the Supabase dashboard under Table Editor.

### Tables

| Table | What it holds |
| --- | --- |
| `users` | Username, email, full name, role (`developer`, `manager`, `employee`), bcrypt password hash, and whether the row is starter data |
| `projects` | Name, idea, manager instructions, status, who created it, who completed it, completion time, demo flag |
| `project_assignments` | Which employees are on which project |
| `modules` | Module title for a project, who added it, demo flag |
| `updates` | Note text, author, time, and the module it belongs to |
| `files` | Original file name, stored file name, MIME type, size, and the update it belongs to |
| `ui_elements` | Every editable heading, label, card, button, section, widget, and shape |

`ui_elements.shape` is `rectangle`, `rounded`, `pill`, `square`, `circle`, `diamond`, or empty when the element keeps its normal look.

Passwords are never stored in plain text and are never returned by the API.

### Files on disk

Photos and documents are saved under:

```text
CRM_0.2/server/uploads/
```

The database stores only the file name and metadata. The bytes stay in that folder. The API serves a file only after it checks that the signed-in user is allowed to see the project. Images are shown inline. Other files are downloaded.

Deleting a project, module, update, or the demo data also deletes the matching files from `server/uploads/`.

### What is not in the database

The React source, CSS, and server code are files in this project. They define the behavior. The words and shapes the developer changes are data, so they live in `ui_elements`, not in the React files.

## 5. How to use your own database later

The application already uses this Supabase database. To point it at a different Postgres database later, change `server/.env` and restart the API.

### 5.1 Create the database

Create an empty Postgres database, or another Supabase project, and a user that can create tables in it. You do not need to create the tables yourself. On startup the API runs `CREATE TABLE IF NOT EXISTS` for every table and turns on row level security.

### 5.2 Point the API at that database

Edit `server/.env`:

```text
PORT=3001
DB_HOST=your-pooler-or-database-host
DB_PORT=5432
DB_USER=your-user
DB_PASSWORD=a-password-you-choose
DB_NAME=postgres
JWT_SECRET=replace-this-with-a-long-random-string
CLIENT_ORIGIN=http://localhost:5173
```

For another Supabase project, use the session pooler host from the [connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres). The user looks like `postgres.<project-ref>`.

`CLIENT_ORIGIN` must be the exact address of the website. If you later host the site somewhere else, change this value so the browser is allowed to call the API with cookies.

Restart:

```bash
npm run dev
```

### 5.3 What happens on the first connection

- If `users` is empty, the API inserts four accounts (developer, manager1, employee1, employee2) with password `password123`, plus two sample projects. Change those passwords after you sign in, or delete the sample projects from the developer page.
- If `users` already has rows, nothing is inserted. Your existing accounts stay as they are.
- If `ui_elements` is empty, the API inserts the default headings, labels, and buttons. If it already has rows, your edited interface stays as it is.

So an empty database becomes the demo workspace. A database you already filled is left alone, as long as the table names and columns match this application.

### 5.4 Moving the current data to the new database

1. Export from the Supabase dashboard (Database → Backups, or `pg_dump` through the session pooler).
2. Import that dump into the new Postgres database.
3. Copy the folder `server/uploads/` to the machine that will run the API. The `files` table points at those stored names. A database import without that folder leaves download links broken.
4. Update `server/.env` as in section 5.2 and restart.

### 5.5 Starting from your own records with no demo data

1. Point `.env` at an empty database and start the API once so it creates the tables and the starter accounts.
2. Sign in as `developer` / `password123`.
3. Use **Delete all demo data** to remove the sample manager, employees, and projects.
4. Add your real manager and employee accounts from **Accounts**.
5. Change the developer password from the Supabase SQL editor if you want it different from `password123`:

```sql
-- Generate the hash in Node: bcrypt.hashSync('your-new-password', 10)
UPDATE users SET password_hash = 'paste-bcrypt-hash-here' WHERE username = 'developer';
```

The application does not include a developer self-service password form. Account editing on the developer page is for manager and employee accounts.

## 6. Sign-in and access control

The login form accepts a username or an email, plus a password. The API compares the password with the bcrypt hash. A match sets an HTTP-only cookie named `token` for seven days. The cookie is a signed JWT. Every project, file, user, and interface-write route checks that cookie.

| Action | Employee | Manager | Developer |
| --- | --- | --- | --- |
| See own assigned projects | Yes | Yes, and everyone else's | Yes, and everyone else's |
| Add modules and updates | On assigned projects | No | Yes |
| Mark a project completed | On assigned projects | No | Yes |
| Create a project | No | Yes | Yes |
| Edit interface text and shapes | No | No | Yes |
| Manage manager and employee accounts | No | No | Yes |
| Delete projects, modules, updates, demo data | No | No | Yes |

## 7. Interface elements

Each visible chrome string is a row in `ui_elements`.

| Column | Meaning |
| --- | --- |
| `page` | `login`, `employee_home`, `employee_project`, `manager_home`, `manager_project`, `developer_home`, or `common` |
| `slot` | Which area of that page the element belongs to, such as `main`, `board`, `form`, or `fields` |
| `element_key` | Stable name used by the screen, such as `mark_completed`. Extra elements the developer adds have no key |
| `element_type` | `heading`, `subheading`, `text`, `card`, `shape`, `icon`, `button`, `label`, `section`, or `widget` |
| `content` | The words shown on the page |
| `icon` | Optional Lucide icon name |
| `shape` | Optional visual shape |
| `action_key` | What a card, button, or widget does. `open_manager` and `open_employee` navigate. Widget keys mount a working part of the page, such as `project_board` or `create_project` |
| `sort_order` | Order within the slot |

A `widget` row is a working part of the product (the project board, the create form, account management). Deleting it removes that part from the page until you add a widget with the same action key.

## 8. API map

All paths are under `/api`.

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/login` | Public |
| POST | `/auth/logout` | Public |
| GET | `/auth/me` | Signed in |
| GET | `/ui/:page` | Public read, so the login page can load its text |
| POST | `/ui` | Developer |
| PATCH | `/ui/:id` | Developer. Body may include `content`, `icon`, `shape`, `action_key`, `element_type` |
| DELETE | `/ui/:id` | Developer |
| POST | `/ui/reorder` | Developer |
| GET | `/users` | Signed in. Managers receive employees. Developers receive every account |
| POST, PATCH, DELETE | `/users` and `/users/:id` | Developer |
| GET | `/projects` and `/projects/:id` | Signed in, limited by role |
| POST | `/projects` | Manager or developer |
| POST | `/projects/:id/complete` | Assigned employee or developer |
| DELETE | `/projects/:id` | Developer |
| POST | `/projects/:id/modules` | Assigned employee or developer |
| DELETE | `/modules/:id` | Developer |
| POST | `/modules/:id/updates` | Assigned employee or developer. Multipart field `note` and files named `files` |
| DELETE | `/updates/:id` | Developer |
| GET | `/files/:id` | Signed in, and only if that person can see the project |
| DELETE | `/demo` | Developer |

Uploads accept images and common documents (PDF, Word, Excel, PowerPoint, text, CSV) up to 10 MB each, and up to 8 files on one update.

## 9. Starter data

Created only when the `users` table is empty:

| Username | Password | Role | Name |
| --- | --- | --- | --- |
| developer | password123 | Developer | Developer |
| manager1 | password123 | Manager | Morgan Hale |
| employee1 | password123 | Employee | Avery Cole |
| employee2 | password123 | Employee | Riley Shah |

Sample projects:

- **Customer onboarding portal** — ongoing, assigned to both employees, with one module and one note.
- **Field visit tracker** — not started, assigned only to employee1, so it appears under Others for that employee and is hidden from employee2.

## 10. Project folders

```text
CRM_0.2/
  PROJECT.md              this document
  README.md               short setup steps
  docker-compose.yml      MySQL 8.4 for local use
  package.json            runs the API and the website together
  client/                 React interface
    src/pages/            login, employee, manager, developer screens
    src/components/       editing tools, project cards, timeline
    src/api.js            browser calls to the API
  server/
    .env                  database host, name, user, password, JWT secret
    src/index.js          HTTP API
    src/db.js             tables, starter data, and the shape column
    uploads/              stored photos and documents
```

## 11. Run it locally

Requirements: Node.js 18 or newer. The database connection is already set in `server/.env`.

```bash
npm install
npm run install:all
npm run dev
```

Open http://localhost:5173.

`npm run dev` starts the API on port 3001 and the website on port 5173.

To build the website for a static host:

```bash
npm run build --prefix client
```

The built files are in `client/dist`. They still need this API, and `CLIENT_ORIGIN` must match the site address you serve them from.

## 12. Limits to know before a production deploy

- `JWT_SECRET` in `server/.env` is a local value. Replace it before anyone else can reach the server.
- The Docker passwords in `docker-compose.yml` are for this machine only.
- The API cookie is not marked `Secure`, which is correct for `http://localhost`. A public HTTPS site should set the cookie `Secure`.
- There is no password-reset email flow.
- The developer page can edit interface content. It does not edit the application code.
