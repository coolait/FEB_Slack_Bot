import { google, sheets_v4 } from 'googleapis';

export type SheetsClient = sheets_v4.Sheets;

const getAuth = () => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Missing Google service account credentials in environment.');
  }

  // Handle escaped newlines
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
};

export const getSheetsClient = (): SheetsClient => {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
};

export const appendRow = async (values: string[]): Promise<void> => {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || 'slack_budget';

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is not set.');
  }

  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:C`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
};

