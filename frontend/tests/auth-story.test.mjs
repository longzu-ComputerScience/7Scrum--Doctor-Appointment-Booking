import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/auth/auth-story.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const storyModule = { exports: {} };
const link = ({ children, ...props }) => React.createElement("a", props, children);
const css = new Proxy({}, { get: (_, name) => String(name) });
const load = specifier => {
  if (specifier === "next/link") return { __esModule: true, default: link };
  if (specifier === "./auth.module.css") return css;
  return require(specifier);
};
new Function("require", "module", "exports", output)(load, storyModule, storyModule.exports);
const { AuthStory } = storyModule.exports;

test("The left login/register story follows the selected Patient or Doctor role", () => {
  const patient = renderToStaticMarkup(React.createElement(AuthStory, { role: "patient" }));
  const doctor = renderToStaticMarkup(React.createElement(AuthStory, { role: "doctor" }));

  assert.match(patient, /Expert care\./);
  assert.match(patient, /A little closer\./);
  assert.match(patient, /Care that fits your day/);
  assert.doesNotMatch(patient, /Care on your schedule/);

  assert.match(doctor, /More time for/);
  assert.match(doctor, /the people/);
  assert.match(doctor, /Care on your schedule/);
  assert.doesNotMatch(doctor, /Care that fits your day/);
  assert.notEqual(patient, doctor);
});

test("Both auth modes pass their selected role into the shared left story", () => {
  const form = readFileSync(new URL("../src/app/auth/auth-form.tsx", import.meta.url), "utf8");
  assert.match(form, /<AuthStory role=\{role\} \/>/);
});
