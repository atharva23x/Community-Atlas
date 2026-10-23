# CommunityAtlas

CommunityAtlas is a browser-based mapping tool for communities to document local infrastructure: roads, parks, utilities, hazards, accessibility features, and anything else worth putting on the map. Draw points, lines, and areas, save them locally, sign in to support and discuss reports, earn community points and badges, then export clean GeoJSON or CSV data.

Built with plain HTML, CSS, and JavaScript. No build step, no framework, and no API keys. Basemap tiles are raster images loaded from Esri and OpenStreetMap, and place search uses the public Photon service.

Accounts, sessions, votes, and report statuses are a **local demo**, not production authentication. They are stored in this browser's `localStorage`, do not sync between devices, and can be changed by anyone with access to the browser. A real deployment needs a backend and database.

## What is included

- Leaflet 1.9.4 map with six switchable basemaps: Streets, Satellite, Hybrid, Terrain, Light, and Dark
- Streets selected on every page load, with world-wrapping raster tiles
- Place search for areas, streets, landmarks, and transit stops
- Search results center the map and drop a highlighted pin; keyboard navigation and a `/` shortcut are included
- Leaflet-Geoman 2.17 Free for point, line, and area drawing
- Local demo accounts with administrator and reporter roles
- Sign-in gating for adding reports and voting, with the pending action resumed after login
- One vote per signed-in reporter per approved report
- Report statuses: Pending review, Open, In review, In progress, Resolved, and Rejected
- Moderator-only admin role: administrators review and moderate reports but cannot add reports, vote, earn points, or appear in rankings
- New reports stay in the admin review queue until approved; rejected reports are hidden from the public map and list
- GPS nearby feed with 500 m, 2 km, and 5 km radius filters, distance labels, nearest-first sorting, and a show-all fallback
- **Mine** filter for signed-in reporters, showing every report they raised, including pending and rejected reports, regardless of the Nearby radius
- Own reports are labeled **Your report** in the Features list, and the detail view identifies the reporter as you
- Administrator priority queue ordered pending-first, with Approve/Reject actions, inline status controls, and live review stats
- Contributor points, five rank levels, and eight unlockable badges based on approved reports, support received, support given, and resolved reports
- Sidebar impact card and community leaderboard, including guest and moderator views
- Administrator analytics tab with resolution, contributor, support, and recent-activity KPIs plus status, category, trend, and top-contributor charts
- Four selectable position modes: Standard GNSS, RTK Float, RTK Fixed, and Simulation
- Accuracy badge on every report, with mock and simulated fixes clearly labeled
- Position provider abstraction, including clearly labeled mock RTK and simulation providers
- Duplicate detection within 30 meters and 2 hours
- Light and dark interface themes with a remembered preference
- Six color-coded feature categories
- Full report details from any map marker or sidebar row, including photo, notes, status, support count, reporter, accuracy, and geometry type
- Community comments on every report, with sign-in, 600-character limits, and browser-local persistence
- Feature details modal with name validation
- Optional photo upload with drag-and-drop, preview, replace, and remove
- Live feature list with report details, fly-to from the detail view, sorting, and two-step delete confirmation
- Owner/admin delete permissions
- Auto-save to `localStorage` under `communityatlas.features.v1`
- GeoJSON export of approved reports with a CRS84 declaration, accuracy properties, votes, status, and reporter metadata
- CSV export of approved reports with WKT geometry, accuracy, votes, status, and reporter columns
- One-click geojson.io accuracy verification for approved reports
- Sample data loader with seeded support counts and approved statuses
- Mobile bottom-sheet sidebar
- Keyboard shortcuts: `P`, `L`, `A`, `/`, and `Esc`

## File structure

```text
communityatlas/
├── index.html
├── styles.css
├── main.js
├── map.js
├── draw.js
├── auth.js
├── contributors.js
├── storage.js
├── export.js
├── position.js
├── search.js
├── theme.js
└── README.md
```

## How to run on localhost

Do not open `index.html` by double-clicking it. That uses the `file://` protocol, which can break geolocation and other browser APIs. Use a local server.

### Option 1 — Using VS Code Live Server (easiest)

1. Install the "Live Server" extension in VS Code.
2. Right-click `index.html`.
3. Choose "Open with Live Server".
4. Your browser opens at `http://127.0.0.1:5500`.

### Option 2 — Using Python (built into most systems)

```bash
cd communityatlas
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

### Option 3 — Using Node.js

From the directory that contains the `communityatlas` folder:

```bash
npx serve communityatlas
```

Then open the URL it prints, usually http://localhost:3000.

### Option 4 — Using npx http-server

From the directory that contains the `communityatlas` folder:

```bash
npx http-server communityatlas -p 8080
```

Then open http://localhost:8080.

> Do not just double-click `index.html` — that opens with the `file://` protocol and breaks geolocation and some browser APIs. Always use a local server.

## Accounts, votes, and moderation

The account and moderation features are a **local demo**. Accounts, password hashes, sessions, votes, report statuses, and comments are stored only in the current browser under `communityatlas.users.v1`, `communityatlas.session.v1`, and `communityatlas.features.v1`. They do not sync across browsers or devices. Anyone with access to the browser profile can inspect or edit this data, so do not reuse a real password.

- The seeded administrator is `admin@communityatlas.app` with password `admin123`. Use **Use demo admin** in the account dialog to fill it automatically.
- Reporters create an account with a full name, email address, and a password of at least 8 characters.
- Signed-out visitors can browse, search, filter, open report details, read comments, and export. They cannot add reports, vote, or post comments.
- New reports are saved as **Pending review**. They are visible to their owner in the sidebar with a Pending review badge and are hidden from other visitors until an administrator approves them. The **Mine** filter collects every report that reporter raised, including pending, rejected, and far-away reports.
- The administrator cannot add reports or vote. Drawing tools are disabled in moderator mode, and report support counts are read-only.
- Votes are toggles. Each signed-in reporter can support an approved report once; clicking the support button again removes the vote. Pending and rejected reports cannot be voted on.
- Comments require a signed-in account. Each comment stores its author, display name, timestamp, and up to 600 characters. Comments live inside the report in browser-local storage and are not included in GeoJSON or CSV exports.
- Reporters can delete reports they created. Administrators can delete any report. Pre-existing reports without a known owner are effectively admin-only.
- The administrator sees a priority queue in the sidebar and a **Priority queue** entry in the account menu. Pending reports appear first, followed by published reports and then rejected reports. Approve moves a report to Open and publishes it; Reject hides it from the public map and list. Votes recorded by an administrator in an earlier build are removed when reports load, so moderator accounts cannot influence rankings.
- Status changes are saved immediately, update the map/list visibility, and recalculate contributor points.
- Sample reports start with seeded support counts and approved statuses. Those seeded votes have no voter identities; new votes are tracked per account. Sample reports are fixtures and are not part of the approval workflow.
- To reset the demo, clear the three keys above in the browser's developer tools and reload. The seeded administrator is recreated, but reporter accounts and reports are lost.

For a real multi-user deployment, replace this demo with server-side authentication, authorization, vote uniqueness, and shared storage.

## Community impact and analytics

Contributor progress is calculated from the reports and votes already stored in this browser. Nothing extra is uploaded or stored for points.

- **Points:** 10 per approved report created, 5 per vote received, 1 per vote cast, and 15 when one of your approved reports is marked resolved. Pending, rejected, admin-created, and sample reports earn nothing.
- **Ranks:** Newcomer (0), Neighborhood Scout (30), Civic Navigator (80), Community Guardian (160), and Atlas Legend (300).
- **Badges:** First Pin (1 report), Street Scholar (5 reports), Map Maker (10 reports), Crowd Favorite (10 votes received), People's Champion (25 votes received), Community Backer (10 votes cast), Problem Solver (1 resolved report), and Atlas Legend (top rank). Only approved, non-sample reports and votes on approved reports count.
- **Live recalculation:** Approving or rejecting a report, removing support, or changing a report's status immediately recalculates points, rank progress, and unlocked badges.
- **Moderators are not ranked:** Administrator accounts are excluded from points, ranks, badges, and the leaderboard. Their COMMUNITY card links to rankings but shows a moderator view, and the account menu labels the link **Community rankings**.
- **Sample data:** Sample reports are marked as demo data, show the reporter as "Sample data," and are excluded from contributor points, rankings, and badges. Votes on sample reports do not award voter points or count toward the Community Backer badge. Samples are still included in admin analytics so the dashboard has data to display.
- **Where to find it:** The COMMUNITY card in the sidebar shows the signed-in reporter's points and rank. Click it, or choose **My impact & badges** from the account menu, to open the leaderboard. Signed-out visitors can preview the leaderboard and badges and sign in from the call to action. Administrators see a moderator card with a link to the priority queue.
- **Admin analytics:** Open the admin priority queue and switch to the **Analytics** tab for resolution rate, active contributors, average support, last-seven-days activity, a status donut, support by category, a seven-day report trend, and the top five contributors. Analytics counts every report in the browser, including pending, rejected, and sample reports; contributor rankings exclude samples, unapproved reports, and moderators.

Like the rest of the account and moderation system, points and rankings are local to this browser. They are a demo and can be edited through developer tools.

## Nearby reports

The sidebar includes a **Near me** feed that filters the report list by distance from the current device location.

- Nearby filtering is on by default for visitors and reporters, with a **2 km** radius. Choose **500 m**, **2 km**, or **5 km**, or turn Near me off to see every report.
- When nearby filtering is active and a location fix is available, reports are sorted nearest-first and each row shows its distance. Approving a report does not bypass the radius filter.
- If no location fix is available, or permission is denied, the feed shows all reports and explains why the radius is not active. If nothing is inside the selected radius, the empty state offers **Show all reports**.
- The filter uses the browser's GNSS `watchPosition` fix. If you switch to a mock RTK or Simulation position mode, the last real GNSS fix is still used for distance calculations. Moving more than 25 meters refreshes the feed.
- The map continues to show all approved reports; only the sidebar feed is radius-filtered. Report distances are measured from each report's representative point: the point itself for points, and a representative center for lines and areas.
- Nearby filtering is off by default for administrator accounts so their review queue is not affected. Administrator accounts can still turn it on from the sidebar.
- This is device-local proximity, not server-side area membership. There are no push notifications, saved home areas, or cross-device feeds. Those require a backend.

## Map data and accuracy

- Basemaps are ordinary Leaflet raster tile layers, so panning, wheel zoom, double-click zoom, and touch gestures work in every modern browser without WebGL.
- Streets uses OpenStreetMap tiles, the default and the most detailed source for local streets, apartment names, and shops. Satellite, Hybrid, Terrain, Light, and Dark use Esri ArcGIS tile services. Light and Dark use native tiles up to zoom 16 and are smoothly upscaled beyond that.
- Hybrid stacks Esri satellite imagery with Esri road and place-label overlays, so buildings, streets, and labels stay visible together.
- Streets tiles come from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and are intended for light, local use.
- Raster tiles wrap horizontally, and `worldCopyJump` keeps the map continuous when you pan across the date line, so you can zoom out and view the whole world.
- Search queries are sent to Photon (`https://photon.komoot.io/api/`) and results are biased toward the current map center. Search needs a network connection, but drawing, saving, and exports continue to work without it.
- Streets is selected on every page load. Basemap changes apply to the current session only and are not remembered; the old `communityatlas.basemap.v1` key is ignored.
- Map geometry is captured at full click precision in WGS84 / EPSG:4326. GeoJSON exports include `urn:ogc:def:crs:OGC:1.3:CRS84`.
- CSV exports include an EXIF-friendly UTF-8 byte order mark, all requested columns, and a WKT column.
- Photos are optional, resized to a maximum dimension of 1280 px, compressed as JPEG, and saved with the feature in `localStorage`. Use a few photos per browser: `localStorage` usually holds about 5 MB.
- GeoJSON exports include the photo as a `photo` data URL, so the export stays self-contained. CSV exports and the geojson.io verification link omit photos to keep those formats small.

Attribution: © OpenStreetMap contributors by default; Tiles © Esri, Maxar, Earthstar Geographics for satellite and hybrid; Tiles © Esri for terrain, light, and dark. Search by Photon, with data © OpenStreetMap contributors.

## Place search

- Type at least two characters in the search box above the map. Results include areas, streets, landmarks, and transit stops, with distance, location, and type shown under each name.
- Results are biased toward the current map view, so a nearby place usually appears before a same-named place elsewhere. Press the arrow keys to move through results, `Enter` to select one, and `Esc` to close the list.
- Selecting a result fits its boundary when one is available, or centers it at up to zoom 17. A cobalt pin marks the result. Searching does not create, move, or modify saved features and does not change exports.
- Press `/` anywhere outside a form field to focus search. The clear button removes the query, results, and result pin.
- Search queries go to the public Photon service and are subject to its availability and usage limits. If search is unavailable, the app shows a retry message; mapping and saved data remain usable.

## Position modes and accuracy honesty

Every report is stamped at save time with the active position mode, source, accuracy in meters, a mock flag, and a timestamp. Accuracy badges appear in the sidebar, in feature rows, in map tooltips, and in both export formats.

- **Standard GNSS** uses the browser's `watchPosition` with high accuracy enabled. The badge shows the accuracy reported by the device, for example `± 20 m`. If permission is denied or no fix arrives, the badge shows `± —`.
- **RTK Float** and **RTK Fixed** are mock providers. They are not connected to real RTK hardware and do not pretend to be survey-grade. Their badges always include `MOCK` (`± 0.35 m MOCK`, `± 0.02 m MOCK`), and exports carry `positionMock: true`.
- **Simulation** is a labeled simulation provider with a fixed 5 m accuracy. Its badge includes `SIM`, and exports carry `positionMock: true`.
- Reports saved by older versions have no position metadata. They stay valid and display `± —` with an "Unspecified" mode instead of inventing an accuracy value.
- GNSS fixes are used only to center the map at street-level zoom 17 and anchor sample data. Report geometry always comes from what you draw; position metadata never overrides it.

Geolocation still requires a secure context. The map falls back to New Delhi when no position is available.

## Duplicate detection

When the details modal opens, the app compares the new geometry's representative point with reports saved in the last 2 hours. If any are within 30 meters, an amber warning lists up to three close reports with their distance and age, and the save button changes to "Save anyway." Duplicates are a warning, not a block, so it is always your decision.

## Dark mode

Use the sun/moon button in the header to switch themes. The choice is saved in `localStorage` under `communityatlas.theme.v1`. On a first visit, CommunityAtlas follows the operating system theme. The theme changes the interface only; it does not change the selected basemap. Reloading always returns the basemap to Streets, regardless of the saved theme.

## Export details

- GeoJSON and CSV include only approved reports. Pending and rejected reports are excluded, including an owner's own pending report. Approved statuses are Open, In review, In progress, and Resolved.
- GeoJSON properties include `accuracyMeters`, `accuracyLabel`, `positionMode`, `positionModeLabel`, `positionSource`, `positionMock`, `positionTimestamp`, `votes`, `status`, `createdBy`, and `createdByName`. Photos are embedded when present.
- CSV appends `accuracy_m`, `position_mode`, `position_source`, `position_mock`, `votes`, `status`, and `reporter` after the existing columns.
- Voter identities are never exported. Only the support count and reporter metadata are included.
- CSV exports and the geojson.io verification link omit photos to keep those formats small.
- The export buttons stay disabled until at least one approved report exists. Admin analytics are not exported.

## How to use

Visitors can browse, search, and export without an account. Sign in or create a reporter account to add reports and vote; administrator demo credentials are listed under [Accounts, votes, and moderation](#accounts-votes-and-moderation). Administrators moderate reports but do not add reports, vote, earn points, or appear in rankings.

1. Allow location access when prompted. Near me is enabled by default with a 2 km radius; use the Nearby feed controls to choose 500 m, 2 km, or 5 km, or turn it off to show all reports. Under POSITION, keep Standard GNSS for live device accuracy, or choose a clearly labeled mock RTK or Simulation mode. Mock badges always say MOCK or SIM.
2. Use the sun/moon button in the header to switch between light and dark mode. Use the basemap button in the top-right corner to switch between Streets, Satellite, Hybrid, Terrain, Light, and Dark. The theme is remembered and does not change the basemap, while the map returns to Streets on each reload.
3. Search for an area, street, or landmark in the box above the map. Select a result to center it and show a cobalt pin; press `Esc` or clear the box to remove the pin.
4. Sign in or create a reporter account. Opening a drawing tool while signed out prompts for sign-in and resumes the tool afterward.
5. Choose Point, Line, or Area under DRAW.
6. Draw on the map. Double-click or click the last point to finish a line, and click the first point or double-click to close an area. Press `Esc` to cancel while drawing.
7. Enter a required name, choose a category, and add optional notes. The report position card shows the mode and accuracy that will be saved.
8. Add an optional photo by browsing for one or dragging an image onto the photo area. You can replace or remove it before saving.
9. If a possible duplicate is detected, review the nearby reports and choose "Save anyway" if it is genuinely new.
10. Select Save Feature. The report is saved as **Pending review** and the drawing tool turns back on. Your own pending report stays visible in Features with a **Your report** label, but other visitors cannot see or vote on it yet. Use the **Mine** filter beside the sort control to show every report you raised, including pending and rejected ones, even outside the Nearby radius.
11. An administrator must approve the report from the priority queue before it appears on the public map and list and can receive votes.
12. Click any map marker or feature row to open the full report: photo, notes, status, support count, reporter, accuracy, geometry type, and comments. Use **Show on map** to fly to it. Signed-in users can post a comment with Enter; Shift + Enter adds a new line. The thumbnail still opens the photo directly.
13. Support an approved report with its vote button. Click again to remove your vote; each reporter can vote once per report. Pending and rejected reports cannot be voted on, and administrators see a read-only support count.
14. Open the COMMUNITY card in the sidebar, or choose **My impact & badges** from the account menu, to see your points, rank progress, badges, and the leaderboard. Administrators see a moderator card instead and are not ranked.
15. Delete one of your reports with its trash button, then click Confirm within three seconds. Administrators can delete any report.
16. Administrators can open the priority queue from the sidebar or account menu. Pending reports appear first; use Approve to publish them as Open or Reject to hide them. Published reports can be moved through the remaining statuses inline, and rejected reports can be approved again.
17. In the admin dialog, switch to **Analytics** for charts.
18. Export GeoJSON or CSV from the sidebar, or use the header Export menu. Only approved reports are exported, with accuracy, votes, status, and reporter metadata.
19. Use "Verify export accuracy →" to open the approved reports in geojson.io.
20. If the list is empty, use "Load sample features" to inspect approved sample reports.

## Accuracy verification loop

1. Add a point on a known landmark.
2. Note the accuracy badge saved with the report. GNSS accuracy is device-reported; mock RTK and Simulation values are labeled and are not survey measurements.
3. Export GeoJSON.
4. Open the file in geojson.io, QGIS, or Google Earth.
5. The exported point should land on the same real-world location. Compare the error you observe with the accuracy badge rather than assuming a fixed tolerance.
6. Or click "Verify export accuracy →" inside the app to open the approved feature collection directly in geojson.io.

## Keyboard shortcuts

- `P` — Point tool
- `L` — Line tool
- `A` — Area tool
- `/` — Focus place search
- `↑` / `↓` — Move through search results; `Enter` selects the active result
- `Esc` — Close search results, cancel drawing, close the feature/report/auth/admin/leaderboard dialog, close the export or basemap menu, or close the mobile panel

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Geolocation requires a secure context; `http://localhost` and `http://127.0.0.1` are treated as secure by modern browsers.
