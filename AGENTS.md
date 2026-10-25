# Project Instructions

## Purpose

This project is a direct Google Apps Script web app for viewing and analyzing Quarterly Planning actual effort (Story Points) across all Ibex engineering and cross-functional teams (Algo, Backend, Clinical, Cloud, Data, PPM, QARA, Quantification, SQA, Web Applications). It can be accessed directly or embedded inside Google Sites via iframes.

## Project Structure

- `Code.gs` is the server-side Apps Script entry point, Jira Cloud API proxy, and quarterly actuals aggregation engine.
- `Index.html` is the client-side single-page dashboard served by `HtmlService`.
- `appsscript.json` is the Google Apps Script project manifest.
- `.clasp.json` configures the project connection to Google Apps Script.

## Security Requirements

- Keep Jira credentials only in Apps Script Script Properties: `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, and `JIRA_API_TOKEN`.
- Never put tokens, passwords, API keys, or user credentials in source files, HTML, logs, or error messages.
- Preserve server-side Jira fetching through `UrlFetchApp`; do not expose Jira authentication to the client browser.
- Ensure embedding capability using `HtmlService.XFrameOptionsMode.ALLOWALL`.
