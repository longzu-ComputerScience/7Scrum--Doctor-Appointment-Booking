import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { loadPatientAppointments, parsePatientAppointments } = require("../src/lib/patient-appointments.ts");
const { ContractApiError } = require("../src/lib/contract-api.ts");

const id = "11111111-1111-4111-8111-111111111111";
const doctorId = "22222222-2222-4222-8222-222222222222";
const appointment = { id, doctorId, bookingReference: "AB1234567890",
  doctorName: "Dr. Test", specialty: "General", address: "Street", district: "District",
  startAt: "2030-01-02T02:00:00+00:00", endAt: "2030-01-02T02:30:00+00:00", status: "confirmed" };

test("Patient appointment listing sends bearer token to the authenticated read-only endpoint", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/patient/appointments");
      assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers.Authorization, "Bearer patient-token");
      return new Response(JSON.stringify({ appointments: [appointment] }), { status: 200 });
    };
    assert.deepEqual(await loadPatientAppointments("patient-token"), [appointment]);
  } finally { globalThis.fetch = original; }
});

test("Patient appointments validate identities, references, dates, statuses and duplicates", () => {
  assert.deepEqual(parsePatientAppointments({ appointments: [] }), []);
  for (const bad of [
    { ...appointment, id: "not-a-uuid" },
    { ...appointment, doctorId: "wrong" },
    { ...appointment, bookingReference: "../../danger" },
    { ...appointment, doctorName: "" },
    { ...appointment, status: "requested" },
    { ...appointment, endAt: appointment.startAt },
  ]) assert.throws(() => parsePatientAppointments({ appointments: [bad] }), ContractApiError);
  assert.throws(() => parsePatientAppointments({ appointments: [appointment, appointment] }), ContractApiError);
  assert.throws(() => parsePatientAppointments({ wrong: [] }), ContractApiError);
});

test("Patient appointments distinguish HTTP errors from empty legitimate results", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 });
    await assert.rejects(loadPatientAppointments("patient-token"), error => error.status === 503);
    await assert.rejects(loadPatientAppointments(" "), error => error.status === 401);
  } finally { globalThis.fetch = original; }
});
