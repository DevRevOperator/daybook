# Personal GitHub Pages + Supabase

The code supports local mode and a static cloud build. Deploy only to the verified personal GitHub account. Never use the DevRev company organization or the parent workspace repository. The user explicitly confirmed that `DevRevOperator` (GitHub account ID `134050857`, type `User`) is their renamed personal account and authorized `DevRevOperator/daybook`. Ownership checks pin both the login and immutable account ID.

## Status

The app is deployed at https://devrevoperator.github.io/daybook/ from the verified personal repository https://github.com/DevRevOperator/daybook. Supabase project `qifdhtpgkgkdyvktnurq` belongs to the owner's `Daybook Personal` Free organization in Mumbai. The schema, private email allowlist, and exact authentication redirect are configured. Anonymous planner and backup access is rejected by the live database.

The initial owner planner has been imported with an insert-only operation that refuses to replace an existing planner. Database JSON equality and the local migration verifier confirmed the imported state. Recovery files remain under ignored `.data/migration/`. The owner's first emailed sign-in, authenticated browser reload/export checks, and the Mac shortcut switchover remain pending; the existing local companion is still running until those checks finish.

## Personal account checks

1. Verify the actual identity returned by `gh api user`. The CLI's stored account label alone is not sufficient.
2. Confirm the returned login matches the user's intended personal account and its type is `User`.
3. Create a new, dedicated repository under that owner. Do not push the parent repository or any of its history.
4. Set `cloud.config.json` from the example with the verified owner, repository name, Supabase URL, and **publishable** key. This file contains public configuration only.
5. Configure the local hook with `git config core.hooksPath .githooks`. The hook validates both the actual push URL and authenticated identity.

GitHub Pages on GitHub Free requires a public source repository. The deployment workflow publishes only `dist/`. Data, backups, credentials, native application binaries, proprietary fonts, and design concepts are excluded. Use a private source repository only if the personal account's plan supports Pages for it.

## Supabase setup

Use a personal Supabase organization and a new free project, preferably in an India region. Keep all management and secret API keys out of source and the browser build.

1. Apply `supabase/migrations/202611260001_daybook.sql` through the project's SQL editor or migration tooling.
2. Add the owner's login email, lowercase, to `daybook_private.allowed_emails` using the SQL editor. Do not commit the actual allowlist or user data.
3. Enable email authentication. Set the Site URL and allowed redirect URL to the final Pages URL, including the repository path and trailing slash.
4. The first owner sign-in creates an Auth user. All planner RPCs require a confirmed email on the private allowlist. Other users cannot read or change the owner's records. For a personal pilot, Supabase's default mail delivery can only deliver to allowed organization-member addresses; configure custom SMTP before broader access.
5. Build using `npm ci` and `npm run build`. Enable GitHub Pages with GitHub Actions as the source.

The database stores one versioned planner document per account, preserving the existing task IDs and structure. SQL functions serialize writes and reject stale revisions. Capture retries are idempotent. Browser clients can read only their own rows and cannot write tables directly. Scheduling and rollover use the stored planner timezone, rather than the deployment machine's date.

## Move existing tasks

1. Export a fresh backup from the local app immediately before migration. Retain the original SQLite database and its backups.
2. Sign in to the hosted app using the owner's approved email.
3. Import that backup through Backups & data. The import creates a pre-import snapshot of the cloud planner.
4. Export the cloud planner and compare it to the original:

   `node scripts/verify-migration.mjs BEFORE.json CLOUD-EXPORT.json`

5. Verify task IDs, notes, completion, list membership, recurrence, preferences, and counts. Check persistence after a reload and in a second signed-in session.
6. Switch daily use and the Mac capture shortcut only after the hosted migration is verified. Keep the original local database as recovery material; do not delete it automatically.

The cloud database retains up to 30 daily save-point snapshots and 20 pre-import snapshots. These snapshots share the database's failure domain and are **not independent off-site backups**. Keep periodic exported recovery copies separately. A snapshot is taken when the planner changes; this is not a scheduled unattended backup service.

## Mac shortcut

After the hosted app is working, rebuild with the verified HTTPS URL:

`DAYBOOK_WEB_URL='https://PERSONAL_OWNER.github.io/daybook/' ./mac/build.sh`

In cloud mode, Control + Option + Space opens the hosted quick-capture dialog in the default browser. Browser sign-in protects the Inbox; the helper does not retain cloud passwords or tokens and does not start the local server. Existing unsaved native drafts remain in the Mac's preferences. Without `DAYBOOK_WEB_URL`, the companion retains its original local panel behavior.

## Fonts and source boundaries

The local app can use the supplied Chip fonts. They have a DevRev-specific license and are not included in GitHub or the deployed site. The cloud build uses the bundled SIL-licensed DM Sans and Barlow Condensed fonts, retaining their license files. CSS family aliases preserve existing layout selectors.

Calendar planning remains in the backlog. The local concept files contain embedded proprietary fonts and are excluded from the repository and deployment.
