# Walkthrough - Orchid Heights Production Portal Upgrade

I have upgraded the **Orchid Heights Gate & Resident Portal** into a fully production-ready application. I overhauled the UI design system into a **Classic, Minimal, and Professional** theme, and aligned the resident portal layout with your uploaded screenshot layout. 

---

## Logins Registry & Firebase Auth Mappings

The application automatically maps user logins to Firebase Auth accounts using virtual email address mapping:

| Target User | Selected Portal Credentials | Internal Firebase Auth Email | Default Password |
| :--- | :--- | :--- | :--- |
| **Gate Security** | Security Portal: `admin` | `security@orchidheights.com` | `admin@123` |
| **Flat Resident** | Wing/Flat Selection | `{wing.toLowerCase()}_{flat}@orchidheights.com` | `admin@123` |
| **Super Admin** | Wing B, Flat 1104 (**Rahul Popat**) | `b_1104@orchidheights.com` | `9898180810` |

> [!NOTE]
> **Automatic Account Creation**: When a user logs in for the first time with their correct default database password, the client-side JavaScript automatically calls `createUserWithEmailAndPassword` to register them in Firebase Auth, creates their profile document in the `users` collection, and log them in!

---

## UI Overhaul Highlights

As requested, I removed the heavy gradients and glowing buttons in favor of a **Classic, Minimal, Professional Light UI** (reminiscent of Tailwind UI and Stripe dashboard):
- **Mockup Alignment**: The Resident portal displays a royal blue header banner featuring the resident name, flat details, dynamic notification icons, a "Community" / "Personal" tab bar, and the 6-card grid (Visitors, MOM, Help Desk, Resident Directory, Staff, Amenities) matching your screenshot.
- **Card Actions**: Clicking any of the 6 cards dynamically opens its sub-panel below the grid (e.g. clicking "Visitors" draws the visitor log; clicking "Resident Directory" loads directory cards with click-to-call links).
- **Responsive Tables & Clean Grids**: Designed clean data grids and tables with thin borders (`#cbd5e1`) and solid Slate backgrounds (`#f8fafc`).

---

## Production Services Implemented

1. **Cloud Firestore Integration**: All data is bound to real Firestore collections (`users`, `buildingDirectory`, `visitorRequests`, `visitorHistory`, `notifications`). All timestamps utilize `firebase.firestore.FieldValue.serverTimestamp()` for exact logging.
2. **Real-time Snapshot Sync**: Built-in `onSnapshot` listeners query Firestore in real time. When a resident approves/rejects a visitor from their phone, the status on the guard's screen instantly flips to "Approved" or "Rejected" with sound chimes.
3. **FCM Background Notifications**: Integrates real FCM client push alerts. When the guard registers a guest, the app pulls the resident's FCM registration token from Firestore and fires a push request.
4. **Interactive Action Buttons in SW**: The background Service Worker (`firebase-messaging-sw.js`) intercepts push events and attaches actions (`✅ Approve Entry` / `❌ Reject Entry`). When clicked in your phone's notification drawer:
   - The Service Worker initializes Firebase Firestore in the background thread.
   - It updates the Firestore visitor request document directly.
   - It adds a log to `visitorHistory` auditing the background action.
   - The change propagates back to the active guard and resident screens immediately!
5. **SheetJS Excel/CSV Engine**: Preloaded client-side Excel utilities. Admins can upload a `.xlsx` or `.csv` sheet containing WING, FLATE_NO, English/Gujarati names, and Mobile numbers, and the app will execute a batch write seeding it to Firestore. Admins can also export the database in one click.
6. **Guard Restriction**: Completely removed the delete button from the Gate Visitor Log for security roles. Only Admins can delete history records.
7. **Broadcast Alerts**: Admins can dispatch alerts to a single flat, a single wing (Wing A/Wing B), or the entire society.

---

## Deployment & Security Rules

I added the raw rules files to your project folder:
- **[firestore.rules](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/orchid-heights/firestore.rules)** - Enforces that residents can only read/update their own flat details and visitor requests; security can register but not delete records; and admins have full access.
- **[storage.rules](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/orchid-heights/storage.rules)** - Protects visitor photos stored in `/visitor_photos/` folder.

---

## Local Git & Remote GitHub Automation

A standalone local Git repository has been successfully initialized and configured.
- **Branch**: `main`
- **Staged & Committed Files**: All code files (.gitignore, package.json, index.html, style.css, app.js, firebase-config.js, firebase-messaging-sw.js, firestore.rules, storage.rules, create-repo.ps1) are committed.

To automate uploading this codebase to GitHub, I created a helper script: **[create-repo.ps1](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/orchid-heights/create-repo.ps1)**.

### Running the GitHub uploader:
1. Open PowerShell terminal in your directory: `C:\Users\ADMIN\.gemini\antigravity\scratch\orchid-heights`.
2. Run the script:
   ```powershell
   ./create-repo.ps1
   ```
3. The script will securely ask for your **GitHub Username**, desired **Repository Name** (defaults to `orchid-heights`), and your **GitHub Personal Access Token (PAT)**.
4. It will automatically call the GitHub REST API, create the remote repository, link it to your local project, push all code files, and secure your credentials from local logs.

---

## Step-by-Step Validation Guide

1. Open [index.html](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/orchid-heights/index.html) in your browser.
2. Toggle portal views using the bottom **Portal Simulator** helper bar.
3. Log in as Super Admin (`B-1104`, password `9898180810`).
4. Click the **Firebase Production Project Settings Wizard** card, input your Firebase console API Keys, Database URL, FCM VAPID Key, and Legacy Server Key, and click **Save Settings**.
5. Log out. The app will automatically seed the 96 Orchid Heights flats into your Firestore database.
6. Open two tabs side-by-side:
   - **Tab 1**: Log in as Gate Security Guard (`admin` / `admin@123`).
   - **Tab 2**: Log in as Resident Rahul Popat (B-1104, password `9898180810`). Click **Enable FCM Push Alerts** in the Personal tab to link your browser.
7. On **Tab 1**, register a guest for B-1104.
8. On **Tab 2**, notice the instant chime and popup. Select **Approve**.
9. Observe **Tab 1**: The status immediately switches to Approved!
