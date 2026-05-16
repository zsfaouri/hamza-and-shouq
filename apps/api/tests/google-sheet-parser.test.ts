import assert from "node:assert/strict";
import xlsx from "xlsx";

import {
  gidFromUrl,
  googleSheetPreviewFromWorkbook,
  sheetIdFromUrl,
} from "../src/google-sheet.js";
import { parseContactsFromRows } from "../src/spreadsheet.js";

assert.equal(
  sheetIdFromUrl("https://docs.google.com/spreadsheets/d/abc123DEF456/edit?gid=987#gid=987"),
  "abc123DEF456",
);
assert.equal(
  sheetIdFromUrl("https://docs.google.com/spreadsheets/d/abc123DEF456/export?format=csv&gid=987"),
  "abc123DEF456",
);
assert.equal(gidFromUrl("https://docs.google.com/spreadsheets/d/abc/edit?gid=987#gid=987"), "987");

const contacts = parseContactsFromRows([
  { "Guest Name": "Ahmad Test", "WhatsApp Number": "0790000001" },
  { "الاسم": "سارة اختبار", "رقم الهاتف": "0790000002" },
]);
assert.deepEqual(contacts.map((contact) => contact.name), ["Ahmad Test", "سارة اختبار"]);
assert.deepEqual(contacts.map((contact) => contact.phone), ["0790000001", "0790000002"]);

const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(
  workbook,
  xlsx.utils.json_to_sheet([{ Name: "Hamza Test", Phone: "0790000003" }]),
  "Hamza",
);
xlsx.utils.book_append_sheet(
  workbook,
  xlsx.utils.json_to_sheet([{ "Guest Name": "Shouq Test", Mobile: "0790000004" }]),
  "Shouq",
);

const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
const preview = googleSheetPreviewFromWorkbook(buffer);

assert.equal(preview.worksheets.length, 2);
assert.equal(preview.contacts.length, 2);
assert.deepEqual(preview.worksheets.map((sheet) => sheet.title), ["Hamza", "Shouq"]);
assert.deepEqual(preview.contacts.map((contact) => contact.name), ["Hamza Test", "Shouq Test"]);

const selected = googleSheetPreviewFromWorkbook(buffer, ["Shouq"]);
assert.equal(selected.worksheets.length, 1);
assert.equal(selected.contacts.length, 1);
assert.equal(selected.contacts[0].name, "Shouq Test");

console.log("google-sheet-parser tests passed");
