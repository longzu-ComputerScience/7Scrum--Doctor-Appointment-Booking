import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Compile the actual pure TS modules without adding a test framework dependency.
function loadModule(name, fetcher, modules = {}) {
  const source = readFileSync(new URL(`../src/app/staff/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, fetch: fetcher, Date, Intl, require: path => modules[path] });
  return exports;
}
const data = loadModule("appointment-data");
const fixture = JSON.parse(JSON.stringify(data.sampleAppointments[0]));
const client = fetcher => loadModule("staff-api", fetcher, { "./appointment-data": data });
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

test("V2 preserves all statuses, names, phone strings, and response order", () => {
  const api = client();
  const rows = api.parseAppointments({ appointments: data.sampleAppointments });
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map(row => row.status)).size, 5);
  assert.equal(rows[0].status, "requested");
  assert.equal(rows[0].patientPhone, fixture.patientPhone);
  assert.equal(rows[0].doctorName, fixture.doctorName);
  assert.equal(Object.keys(rows[0]).length, 8);
});

test("rejects V1, malformed timestamps, missing IDs and unknown statuses", () => {
  const api = client();
  for (const row of [{ ...fixture, clinicName: "Legacy" }, { ...fixture, doctorId: undefined }, { ...fixture, patientPhone: 900000101 }, { ...fixture, startAt: "2026-11-04" }, { ...fixture, status: "pending" }]) {
    assert.throws(() => api.parseAppointments({ appointments: [row] }), error => error.status === 502);
  }
  assert.throws(() => api.parseAppointments({}), error => error.status === 502);
});

test("empty response is valid; over-limit response is not silently treated as a full catalog", () => {
  const api = client();
  assert.equal(api.parseAppointments({ appointments: [] }).length, 0);
  assert.throws(() => api.parseAppointments({ appointments: Array(101).fill(fixture) }), error => error.status === 502);
});

test("GET sends Bearer only in the header, with no doctor query and no cache", async () => {
  const api = client(async (url, options) => {
    assert.equal(url, "/api/staff/appointments");
    assert.equal(options.headers.Authorization, "Bearer test-session");
    assert.equal(options.cache, "no-store");
    assert.equal(options.body, undefined);
    return json({ appointments: [fixture] });
  });
  assert.equal((await api.loadStaffAppointments("test-session"))[0].id, fixture.id);
});

test("missing session fails before any network request", async () => {
  const api = client(() => assert.fail("must not fetch without token"));
  await assert.rejects(api.loadStaffAppointments(""), error => error.status === 401);
});

for (const status of [401, 403, 404, 409, 422, 503]) {
  test(`HTTP ${status} is classified without leaking raw response data`, async () => {
    const api = client(async () => new Response("private patient payload", { status }));
    await assert.rejects(api.loadStaffAppointments("test-session"), error => error.status === status && !error.message.includes("private patient"));
  });
}

test("non-JSON success has a safe, actionable error", async () => {
  const api = client(async () => new Response("<html>proxy page</html>"));
  await assert.rejects(api.loadStaffAppointments("test-session"), error => error.status === 502 && error.message.includes("unreadable"));
});

test("confirm sends only status and validates PATCH response identity", async () => {
  const api = client(async (url, options) => {
    assert.equal(url, `/api/appointments/${fixture.id}`);
    assert.equal(options.method, "PATCH");
    assert.equal(options.headers.Authorization, "Bearer test-session");
    assert.deepEqual(JSON.parse(options.body), { status: "confirmed" });
    return json({ appointment: { id: fixture.id, status: "confirmed" } });
  });
  await api.confirmStaffAppointment(fixture, "test-session");
  const bad = client(async () => json({ appointment: { id: "another-id", status: "confirmed" } }));
  await assert.rejects(bad.confirmStaffAppointment(fixture, "test-session"), error => error.status === 502);
});

test("no confirm request for terminal or already confirmed appointments", async () => {
  const api = client(() => assert.fail("invalid transition must not fetch"));
  for (const status of ["confirmed", "checked_in", "completed", "cancelled"]) {
    await assert.rejects(api.confirmStaffAppointment({ ...fixture, status }, "test-session"), error => error.status === 409);
  }
});

test("Vietnam date and time remain correct across the UTC date boundary", () => {
  assert.equal(data.clinicDate("2026-11-03T18:00:00Z"), "2026-11-04");
  assert.equal(data.displayTime("2026-11-03T18:00:00Z"), "01:00");
});
