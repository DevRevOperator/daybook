# Personal GitHub Pages + Supabase

The code supports local mode and a static cloud build. Deploy only to the verified personal GitHub account. Never use the DevRev company organization or the parent workspace repository. The user explicitly confirmed that `DevRevOperator` (GitHub account ID `134050857`, type `User`) is their renamed personal account and authorized `DevRevOperator/daybook`. Ownership checks pin both the login and immutable account ID.

## Status

The app is deployed at https://devrevoperator.github.io/daybook/ from the verified personal repository https://github.com/DevRevOperator/daybook. Supabase project `qifdhtpgkgkdyvktnurq` belongs to the owner's `Daybook Personal` Free organization in Mumbai. The schema, private email allowlist, and exact authentication redirect are configured. Anonymous planner and backup access is rejected by the live database.

The initial owner planner has been imported with an insert-only operation that refuses to replace an existing planner. Google sign-in is configured in the personal Google Cloud project `daybook-personal-20261126` and enabled in Supabase. Only basic identity scopes are configured; the OAuth secret stays in Supabase. The approved Google identity linked to the existing owner account. Authenticated browser reload and cloud export checks passed, with all original tasks, lists, groups, schedules, and preferences preserved. A fresh local export also matched the cloud planner before cutover.

The installed Mac companion and launcher now target the hosted app. Global shortcut registration succeeded, and the hosted quick-capture destination was verified. Its default browser may require its own first sign-in. The original local app, SQLite database, exports, and unsaved native capture draft remain available as recovery material under ignored local storage. No local planner data or recovery files are published.

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
3. Set the Site URL and allowed redirect URL to the final Pages URL, including the repository path and trailing slash.
4. Register and verify the owner's Auth account through trusted administration, then disable new-user signup in Supabase. All planner RPCs require a confirmed email on the private allowlist. Retired accounts must be banned, with planner and backup ownership transferred transactionally before access changes are finalized. Never commit real email addresses or migration data.
5. Build using `npm ci` and `npm run build`. Enable GitHub Pages with GitHub Actions as the source.

### Google sign-in

Create a dedicated project in the owner's personal Google Cloud account, with no company organization. Configure Google Auth Platform with only the basic `openid`, email, and profile scopes, and add the approved account as a test user while the app is in testing.

Create a **Web application** OAuth client with:

- Authorized JavaScript origin: `https://devrevoperator.github.io`
- Authorized redirect URI: `https://qifdhtpgkgkdyvktnurq.supabase.co/auth/v1/callback`

Store the client ID and client secret in **Supabase → Authentication → Sign In / Providers → Google**, then enable the provider. Keep **Skip nonce checks** and **Allow users without an email** off. Never put the OAuth secret in source, GitHub Actions, `cloud.config.json`, the Pages build, or a screenshot. The frontend needs only the existing publishable Supabase key.

The browser uses PKCE, exchanges the callback code through the Supabase SDK, and persists and refreshes the Supabase session. Google sign-in uses no sign-in email and does not request offline Google access. The approved, confirmed email identity links to the matching Google identity on the existing account, preserving its user ID and planner. Verify this after the first Google login. Keep Supabase new-user signup disabled and the database allowlist in place; the Google button is not an authorization boundary.

Before switching daily use, verify the approved login, callback failure recovery, the unchanged account ID, saved tasks after reload, and a cloud export against the migration backup. A new unapproved account must remain unable to register or access planner RPCs. Email delivery is not needed for routine Google login; custom SMTP is only needed if emailed sign-in or recovery is offered separately.

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
