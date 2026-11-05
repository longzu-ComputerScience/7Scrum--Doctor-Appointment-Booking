import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { postConsultation, parseConsultation, responseSource } = require("../src/lib/consultation-api.ts");
const { ContractApiError } = require("../src/lib/contract-api.ts");
const followUp = { reply: "When did it start?", followUpRequired: true, specialty: null,
  doctors: [], urgent: false, usedAI: false, mode: "controlled-prototype", demoMode: false };
const specialty = { ...followUp, reply: "Consider dermatology.", followUpRequired: false,
  specialty: "Da liễu", doctors: [{ id: "doctor-from-api" }] };

test("consultation sends patient-authored turns in order and reads the server's follow-up and specialty", async () => {
  const original = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (path, options) => {
      assert.equal(path, "/api/consult");
      assert.equal(options.method, "POST");
      requests.push(JSON.parse(options.body));
      return new Response(JSON.stringify(requests.length === 1 ? followUp : specialty), { status: 200 });
    };
    assert.equal((await postConsultation(["I have a rash"])).followUpRequired, true);
    assert.equal((await postConsultation(["I have a rash", "Since yesterday"])).specialty, "Da liễu");
    assert.deepEqual(requests, [{ messages: ["I have a rash"] }, { messages: ["I have a rash", "Since yesterday"] }]);
  } finally { globalThis.fetch = original; }
});

test("invalid input and malformed responses cannot appear as successful advice", async () => {
  await assert.rejects(postConsultation(["x"]), error => error instanceof ContractApiError && error.status === 422);
  assert.throws(() => parseConsultation({ ...specialty, urgent: "false" }), ContractApiError);
  assert.throws(() => parseConsultation({ ...specialty, reply: "" }), ContractApiError);
});

test("urgent results keep the service warning and source available to the UI", () => {
  const result = parseConsultation({ ...specialty, urgent: true, reply: "Seek emergency help.", mode: "fallback", usedAI: false });
  assert.equal(result.urgent, true);
  assert.equal(result.reply, "Seek emergency help.");
  assert.equal(responseSource(result), "Fallback");
  assert.equal(responseSource({ ...result, mode: "ai" }), "AI");
});
