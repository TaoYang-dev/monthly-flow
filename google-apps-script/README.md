# Monthly Flow Google Drive Sync

This Apps Script receives backups from the Monthly Flow web app and writes them to the `Monthly Flow Sync` Google Sheet in Tao's Google Drive.

## Deploy

1. Open [Google Apps Script](https://script.google.com/).
2. Create a new project.
3. Replace `Code.gs` with the contents of `Code.gs` in this folder.
4. Click **Deploy > New deployment**.
5. Choose **Web app**.
6. Set **Execute as** to **Me**.
7. Set **Who has access** to **Anyone**.
8. Deploy and copy the web app URL.
9. Open Monthly Flow, tap **Drive backup > Settings**, and paste the URL.

The app sends data only when you tap **Sync**.
