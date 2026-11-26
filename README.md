# Daybook

A daily planner inspired by the uncluttered TeuxDeux workflow, with a local Mac mode and a GitHub Pages + Supabase cloud build. Requires Node.js 22.13 or newer. Run `npm ci` to install cloud build and test dependencies.

## Cloud deployment

The hosted app is [Daybook](https://devrevoperator.github.io/daybook/), published from the owner's verified personal repository. Choose **Continue with Google** and use the approved account. Routine sign-in does not send an email. See [DEPLOYMENT.md](DEPLOYMENT.md) for Supabase setup, deployment, and migration checks.

`npm run build` builds only the public interface into `dist/`, using `cloud.config.json` for the Supabase URL and publishable key. The Pages workflow checks the personal repository owner before deployment. Planner data, backups, credentials, proprietary fonts, and local design concepts are excluded from Git and the build.

Cloud saves require sign-in and database authorization. Each user has a separate versioned planner document. Conflicting edits reload the current saved revision and ask you to repeat the change; stale forms, toggles, imports, and undo cannot silently replace newer work. Cloud snapshots are recovery points within Supabase, not independent off-site backups.

## Run

Double-click **Start Daybook.command**, or run these commands from this folder.

```sh
npm start
```

Open <http://127.0.0.1:4399>. Keep the terminal running while using the app. Control+C stops it. The launcher reuses an already running instance.

## Included

- Daily planner with 1, 3, 5, and 7-day views, date picker, Today, and day/page navigation.
- Quick entry, inline editing, completion, notes in a right-side panel, highlights, search, and up to 50 undo/redo steps per session.
- Drag tasks between dates and undated lists, and reorder them within a destination.
- Create, rename, reorder, and delete groups and lists. Drop list headings onto group tabs to move them. Drop a task on a group to choose a destination list. Insertion markers indicate before/after placement.
- Daily, weekday, weekly, monthly, and yearly schedules, with intervals, selected weekdays, end dates, pause/resume, and single-occurrence deletion.
- Automatic rollover on opening and while the app is active, with a preference to disable it.
- A dark Preferences sidebar that slides in from the left, keeping the planner usable. Changes save immediately. Includes 1/3/5/7 columns, text size, spacing, completed-task visibility, plain/circle/square/indented bullets, Today/Yesterday start, ruled lines, light/dark/system appearance, nine accent swatches, and any custom accent colour.
- Local Chip Text typography with Chip Display headings. Defaults use 14px task text and 34px rows.
- Completion confetti with optional cat or dog cameos, a preview button, and an on/off switch. Animations respect the system’s Reduce Motion preference.
- Local SQLite storage, daily JSON backups, and Daybook JSON export/import.
- Inbox for quick captures and unfiled, unscheduled tasks. Click the plus button or press **Q** while using the planner. Capture drafts survive closing the dialog and failed saves.
- **Control + Option + Space** opens a native capture panel from any Mac app while **Daybook Capture.app** is running. Return saves to Inbox and returns you to your work. Escape keeps the draft for later. The companion lives in the menu bar and can restart the local server when capturing if needed.
- Tasks retain their list when scheduled or rescheduled. List and date badges open the other view. Notes, title, and completion are shared. List and daily ordering are independent. Clear the date in task details to unschedule; clear both date and list to return to Inbox.

## Mac quick capture

`Start Daybook.command` launches the companion automatically. You can also open **Daybook Capture.app** directly from this folder. It must remain running for the global shortcut; it does not register itself as a login item. If another app already owns Control + Option + Space, capture remains available from the menu-bar icon and the panel explains the conflict.

The native companion is built from `mac/DaybookCapture.swift` using AppKit and the macOS hotkey API. Build or rebuild after moving the project with `./mac/build.sh` (requires the Xcode command-line tools). The build records the project and Node executable paths. No Accessibility permission is required by the companion. After a verified cloud deployment, building with `DAYBOOK_WEB_URL` switches both the launcher and shortcut to the hosted app; see [DEPLOYMENT.md](DEPLOYMENT.md).

Captures use an atomic, retry-safe API so they cannot overwrite another window's edits. Drafts are retained locally until a save succeeds. Existing version-1 planners upgrade to version 2 with a pre-migration backup. Existing tasks retain their saved locations; historical list membership that the earlier version discarded cannot be reconstructed.

Deleting a list or group now retains tasks: scheduled tasks keep their dates, and unfiled tasks appear in Inbox. Recurring schedules keep running. Lists display the next open occurrence of each linked recurring schedule, plus completed history when enabled.

Calendar-aware planning is **deferred in the [backlog](BACKLOG.md)** and is not implemented in the app. Separate interactive design concepts remain local and are excluded from the repository.

Type a task followed by `every day`, `every weekday`, `every week`, `every month`, or `every year` to create a recurring schedule. The recurring-task panel provides the full editor.

## Data and behavior

The database is `.data/daybook.sqlite`. SQLite uses a write-ahead log and full synchronous writes. Each save includes a revision. A stale window reloads the saved state and asks you to repeat the change, preventing it from overwriting another window's work.

The app retains 30 daily snapshots in `.data/backups`. Restoring a backup also creates a separate pre-import snapshot. These files remain on this Mac. Export a copy to another location for protection against loss of the computer or project folder. Import currently accepts Daybook backups. TeuxDeux migration requires an importer matched to an actual export.

Unfinished dated tasks roll into today on the next day change or opening. Completed tasks and undated lists keep their dates and locations. Multiple missed occurrences of the same recurring schedule collapse into its latest unfinished occurrence. Earlier occurrences remain in the database as skipped history, including their notes. Monthly dates such as the 31st use a shorter month's last day and return to the original day the next month. February 29 annual tasks use February 28 in other years.

Recurring instances are generated through the visible date range or 35 days ahead, whichever is later. Editing a schedule replaces its unfinished occurrences from today onward. Completed occurrences retain their history. Pausing removes future unfinished occurrences while retaining existing work. Stopping a schedule keeps today's and historical tasks as ordinary tasks.

Undo/redo is available during the current page session. The local server runs maintenance when the app requests data. Tasks are reconciled on reopening after the server has been closed.

## Development

```sh
npm run dev
npm test
```

`server.js` serves static assets and a revision-checked persistence API. `public/model.js` owns date arithmetic, recurrence, validation, and rollover. `public/app.js` implements interactions. `public/styles.css` owns presentation. This separation leaves room for future AI actions through the same validation and persistence path.

To use an isolated local database or another port, set `DAYBOOK_DATA_DIR` and `PORT` before starting the server. The local server binds to `127.0.0.1` and rejects requests from other origins. The cloud build uses Supabase directly and does not deploy this local server. AI features remain future work.

Chip fonts are bundled from the supplied DevRev brand skill for this local project. Their rights are separate from the earlier DM Sans and Barlow Condensed fonts, whose SIL Open Font Licenses remain in `public/fonts`. Chip is not covered by those SIL licenses.

The Preferences sidebar mirrors TeuxDeux’s planner appearance controls. Cloud mode adds an account section, sign-out, planner timezone, and cloud recovery snapshots. Holiday calendar subscriptions are not included in this version.
