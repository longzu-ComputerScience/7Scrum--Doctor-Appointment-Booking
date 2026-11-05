import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const bridge = require("../src/lib/specialty-handoff.ts");
const { loadDiscoveryCatalog } = require("../src/lib/doctor-catalog.ts");
const { ContractApiError } = require("../src/lib/contract-api.ts");
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const doctor = { id, name: "Synthetic Test Doctor", specialty: "Da liễu", bio: "Test bio", address: "Test address",
  district: "Test district", certificates: [], rating: null, ratingCount: 0 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  try { globalThis.fetch = handler; await run(); } finally { globalThis.fetch = original; }
}

test("Specialty URLs round-trip NFC, spaces and reserved characters without injecting query keys", () => {
  for (const specialty of ["Da liễu", "Ear, nose & throat + care/other?district=bad#fragment", "Tim mạch"]) {
    const url = new URL(bridge.discoveryHref(specialty, id), "http://localhost");
    assert.equal(url.hash, "#book");
    assert.deepEqual(bridge.readDiscoveryContext(url.searchParams), { specialty: bridge.canonicalSpecialty(specialty), doctorId: id });
    assert.equal(url.searchParams.size, 2);
  }
  assert.deepEqual(bridge.readDiscoveryContext(new URLSearchParams("specialty=%20&doctor=bad")), { specialty: null, doctorId: null });
  assert.equal(bridge.discoveryHref(), "/#book");
});

test("Vietnamese/English aliases mirror backend specialties and match either catalog language", () => {
  for (const values of [["Dermatology", "Da liễu", "da lieu"], ["Cardiology", "Tim mạch", "tim mach"], ["General Medicine", "Nội tổng quát", "general", "noi tong quat"]]) {
    for (const actual of values) for (const selected of values) assert.ok(bridge.specialtyMatches(actual, selected));
  }
  assert.equal(bridge.specialtyMatches("Tim mạch", "Dermatology"), false);
  assert.equal(bridge.specialtyMatches("Da liễu", "Unknown specialty"), false);
  assert.ok(bridge.specialtyMatches("Da liễu", null));
});

test("Discovery reloads the public catalog using aliases, excludes mismatches/inactive rows, preserves V2 metadata", async () => {
  const certificate = { name: "Test credential", issuer: "Test issuer", issuedYear: 2020, credentialUrl: null };
  const source = { ...doctor, certificates: [certificate], rating: 4.7, ratingCount: 3 };
  await withFetch(async (path, options) => {
    const url = new URL(path, "http://localhost");
    assert.equal(url.pathname, "/api/doctors"); assert.equal(url.searchParams.get("specialty"), "Da liễu");
    assert.equal(url.searchParams.get("keyword"), "Nguyễn & Test"); assert.equal(options.cache, "no-store");
    return json({ doctors: [source, { ...doctor, id: other, specialty: "Tim mạch" }, { ...doctor, active: false }], demoMode: false });
  }, async () => {
    const data = await loadDiscoveryCatalog("Dermatology", "Nguyễn & Test");
    assert.deepEqual(data, { doctors: [source], demoMode: false });
  });
});

test("Empty catalog and mismatching consultation suggestions cannot manufacture doctors", async () => {
  for (const doctors of [[], [{ ...doctor, specialty: "Tim mạch" }]]) {
    await withFetch(async () => json({ doctors, demoMode: false }), async () => {
      assert.deepEqual((await loadDiscoveryCatalog("Dermatology", "")).doctors, []);
    });
  }
});

test("API failures and malformed/legacy V2 responses stay failures; retry is an explicit fresh GET", async () => {
  let calls = 0;
  await withFetch(async () => ++calls === 1 ? json({ error: "private provider detail" }, 503) : json({ doctors: [doctor], demoMode: false }), async () => {
    await assert.rejects(loadDiscoveryCatalog("Da liễu", ""), error => error instanceof ContractApiError && error.status === 503);
    assert.equal(calls, 1);
    assert.equal((await loadDiscoveryCatalog("Da liễu", "")).doctors[0].id, id);
    assert.equal(calls, 2);
  });
  for (const row of [{ ...doctor, id: "made-up" }, { ...doctor, address: undefined, clinicAddress: "Legacy address" }, { ...doctor, certificates: undefined }, { ...doctor, ratingCount: undefined }]) {
    await withFetch(async () => json({ doctors: [row], demoMode: true }), async () => assert.rejects(loadDiscoveryCatalog(null, ""), ContractApiError));
  }
  await withFetch(async () => { throw new Error("offline"); }, async () => assert.rejects(loadDiscoveryCatalog(null, ""), ContractApiError));
});

test("Demo mode is retained and the catalog loader never submits bookings or produces confirmation", async () => {
  await withFetch(async (_path, options) => {
    assert.equal(options.method, "GET");
    return json({ doctors: [doctor], demoMode: true });
  }, async () => assert.deepEqual(await loadDiscoveryCatalog(null, ""), { doctors: [doctor], demoMode: true }));
});

test("Profile booking links retain doctor/specialty context for refreshed calendar return", () => {
  const href = bridge.doctorBookingHref(id, "Cardiology");
  const url = new URL(href, "http://localhost");
  assert.equal(url.pathname, `/doctors/${id}/book`);
  const context = bridge.readDiscoveryContext(url.searchParams);
  assert.deepEqual(context, { specialty: "Tim mạch", doctorId: id });
  assert.equal(bridge.discoveryHref(context.specialty, context.doctorId), bridge.discoveryHref("Cardiology", id));
  assert.throws(() => bridge.doctorBookingHref("made-up", "Cardiology"));
});

test("Emergency, pending follow-up, missing safety flags and missing specialty never expose a routine CTA", () => {
  const ready = { specialty: "Dermatology", urgent: false, followUpRequired: false };
  assert.equal(bridge.recommendationHref(ready), bridge.discoveryHref("Da liễu"));
  for (const value of [{ ...ready, urgent: true }, { ...ready, followUpRequired: true }, { specialty: "Dermatology" }, { ...ready, specialty: null }]) {
    assert.equal(bridge.recommendationHref(value), null);
  }
});
