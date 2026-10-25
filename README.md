# Ibex Quarterly Actual Effort Dashboard Web App

A lightweight, secure, responsive, and themeable Google Apps Script web app for viewing and analyzing Quarterly Planning actual effort (Story Points) across all Ibex engineering and cross-functional teams.

- **Google Sites Portal:** [Ibex PPM Delivery Hub](https://sites.google.com/ibex-ai.com/ibex-ppm-delivery-hub/quarterly-actuals)
- **Live Web App:** [Open Web App](https://script.google.com/a/macros/ibex-ai.com/s/AKfycbzdd-yRObJ2BBcI4gmBL3NUdIqg7zL6uimjxrjvhygvaGkndy22hlPtL43gFtYrIqrbqg/exec)
- **GitHub Repository:** https://github.com/Lavi-ibex/gapps_script_jira_quarterly_actuals
- **Google Apps Script IDE:** [Project Editor](https://script.google.com/d/1FoLe-xnmAfSh9p2E_1-5DeeE6Otz6lVFqVwhlmBEDuVFOPDVH-RZBaXi/edit)
- **Script ID:** `1FoLe-xnmAfSh9p2E_1-5DeeE6Otz6lVFqVwhlmBEDuVFOPDVH-RZBaXi`
- **Deployment ID:** `AKfycbzdd-yRObJ2BBcI4gmBL3NUdIqg7zL6uimjxrjvhygvaGkndy22hlPtL43gFtYrIqrbqg`

---

## 1. Features & Architecture

- **Live Jira Cloud API Integration:** Scans all Jira Agile boards for active and completed sprints matching the selected quarter (e.g. `2026_Q3`, `2026_Q4`), retrieves completed child issues (`statusCategory = Done`), sums completed Story Points, attributes them to teams, and links them to parent epics.
- **Dynamic Quarter Selection:** Effortlessly switch between quarters (`2026_Q3`, `2026_Q4`) via a dropdown control.
- **Dual Perspectives (Teams & Buckets):**
  - **Section 2A (By Epic Bucket):** Inspect actual effort distributed across strategic epic buckets (e.g. *Ibex v4.2*, *Infrastructure*, *Clinical + Studies*, *Pharma / Base model*).
  - **Section 2B (By Team):** View delivery grouped by the 10 canonical teams (*Algo*, *Backend*, *Clinical*, *Cloud*, *Data*, *PPM*, *QARA*, *Quantification*, *SQA*, *Web Applications*).
- **Interactive Deep Dive:** Click any epic row to expand and view its full list of underlying child tickets, including Ticket Key, Type, Status, Summary, Assignee, Sprint, and Story Points.
- **Direct Jira Hyperlinks:** All Epic and Child ticket keys are direct clickable links opening the issue in Jira in a new tab (`https://ibex-ai.atlassian.net/browse/KEY`).
- **Interactive Search & Filtering:** Filter epics and children in real time across all teams and buckets via quick-filter pills and free-text search.
- **Secure Backend Proxy:** Jira credentials (`JIRA_BASE_URL`, `JIRA_USER_EMAIL`, and `JIRA_API_TOKEN`) reside exclusively inside Apps Script `Script Properties` - never exposed in client HTML or JavaScript.
- **Hourly Caching:** Google Apps Script `CacheService` caches results for 1 hour (3600 seconds) using multi-chunk storage for instant loading, with an on-demand **Refresh Live** button.
- **Dark / Light Mode Support:** High-contrast color palettes for both modes with automatic OS detection and `localStorage` persistence.
- **Google Sites & Confluence Embedding:** Configured with `XFrameOptionsMode.ALLOWALL` for seamless embedding inside Google Sites.

---

## 2. Canonical Teams & Custom Fields

| Dimension | Jira Custom Field | Description |
|:---|:---|:---|
| **Quarter** | `customfield_10217` | Quarter value on Epic (e.g. `2026_Q3`, `2026_Q4`) |
| **Epic Bucket** | `customfield_12204` | Strategic bucket classification |
| **Story Points** | `customfield_10037` | Completed effort per child issue |
| **Sprints** | `customfield_10020` | Assigned sprint(s) |
| **Team / iTeam** | `customfield_10001` / `customfield_10128` | Team attribution (normalized to 10 canonical teams) |

---

## 3. Development & Deployment Workflow (clasp)

### Syncing Code with Clasp
- **Push local changes to Google Apps Script:**
  ```bash
  npx @google/clasp push
  ```
- **Pull remote changes from Google Apps Script:**
  ```bash
  npx @google/clasp pull
  ```

### Script Properties Setup (One-Time Setup)
1. In the Apps Script project editor ([Project Settings](https://script.google.com/d/1FoLe-xnmAfSh9p2E_1-5DeeE6Otz6lVFqVwhlmBEDuVFOPDVH-RZBaXi/edit)), click **Project Settings** (gear icon ⚙️).
2. Under **Script Properties**, ensure the following properties are configured:
   - `JIRA_BASE_URL`: `https://ibex-ai.atlassian.net`
   - `JIRA_USER_EMAIL`: your Atlassian account email
   - `JIRA_API_TOKEN`: your Atlassian API token (from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens))

### Deploying a New Version
```bash
npx @google/clasp deploy --description "Update description"
```
