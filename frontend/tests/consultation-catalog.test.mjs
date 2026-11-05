import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { withCatalogSuggestions } = require("../src/lib/consultation-api.ts");
const doctor = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "BS. Nguyễn Minh An (Demo)", specialty: "Da liễu",
  bio: "Skin care", district: "Thủ Đức", address: "Demo Clinic A",
};
const incomplete = {
  reply: "Consult dermatology", specialty: "Da liễu",
  doctors: [], demoMode: true, followUpRequired: false,
  urgent: false, mode: "rule-based", usedAI: false,
};

test("old consultation backend can supply doctor cards via public catalog fallback", async () => {
  const original = globalThis.fetch;
  let called = 0;
  try {
    globalThis.fetch = async (path, options) => {
      called++;
      const parsed = new URL(path, "https://preview.example");
      assert.equal(parsed.pathname, "/api/doctors");
      assert.equal(parsed.searchParams.get("specialty"), "Da liễu");
      assert.equal(options.cache, "no-store");
      return new Response(JSON.stringify({ doctors: [doctor], demoMode: true }), { status: 200 });
    };
    const hydrated = await withCatalogSuggestions(incomplete);
    assert.equal(hydrated.doctors[0].id, doctor.id);
    assert.equal(hydrated.doctors[0].name, doctor.name);
    assert.equal(hydrated.usedAI, false);
    assert.equal(hydrated.demoMode, true);
    assert.equal(called, 1);
  } finally { globalThis.fetch = original; }
});

test("no catalog request for urgent, incomplete, or populated consultation", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw new Error("catalog must not be fetched"); };
    for (const result of [
      { ...incomplete, urgent: true },
      { ...incomplete, followUpRequired: true },
      { ...incomplete, doctors: [doctor] },
      { ...incomplete, specialty: null },
    ]) assert.equal(await withCatalogSuggestions(result), result);
  } finally { globalThis.fetch = original; }
});

test("catalog fallback does not fabricate specialties or records on errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      doctors: [{ ...doctor, specialty: "Tim mạch" }], demoMode: false,
    }), { status: 200 });
    assert.equal(await withCatalogSuggestions(incomplete), incomplete);
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    assert.equal(await withCatalogSuggestions(incomplete), incomplete);
    globalThis.fetch = async () => { throw new TypeError("offline"); };
    assert.equal(await withCatalogSuggestions(incomplete), incomplete);
  } finally { globalThis.fetch = original; }
});
