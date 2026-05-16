import assert from "node:assert/strict";
import xlsx from "xlsx";
import { gidFromUrl, googleSheetPreviewFromWorkbook, normalizePhone, sheetIdFromUrl } from "../src/lib/sheets";

const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(
  workbook,
  xlsx.utils.json_to_sheet([
    { Name: "Hamza Test", Number: "0790000001" },
    { Name: "Ignored", Number: "" },
  ]),
  "Hamza",
);
xlsx.utils.book_append_sheet(
  workbook,
  xlsx.utils.json_to_sheet([{ "Guest Name": "Shouq Test", WhatsApp: "+962790000002" }]),
  "Shouq",
);

const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
const all = googleSheetPreviewFromWorkbook(buffer, "sheet-test");
assert.equal(all.tabs.length, 2);
assert.equal(all.contacts.length, 2);
assert.deepEqual(all.tabs.map((tab) => tab.name), ["Hamza", "Shouq"]);
assert.equal(all.tabs[0].contactCount, 1);

const selected = googleSheetPreviewFromWorkbook(buffer, "sheet-test", ["Shouq"]);
assert.equal(selected.tabs.length, 1);
assert.equal(selected.tabs[0].name, "Shouq");
assert.equal(selected.contacts[0].phone, "962790000002");

assert.equal(sheetIdFromUrl("https://docs.google.com/spreadsheets/d/abc123/edit#gid=99"), "abc123");
assert.equal(gidFromUrl("https://docs.google.com/spreadsheets/d/abc123/edit#gid=99"), "99");
assert.equal(normalizePhone("079 000 0003"), "962790000003");

console.log("sheets tests passed");
