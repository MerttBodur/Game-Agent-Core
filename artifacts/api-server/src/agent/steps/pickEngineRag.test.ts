import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEngineInvariant,
  detectUserPreferredEngine,
  normalizeEngineDecision,
} from "./pickEngineRag.js";
import { engineSystemPrompt } from "../prompts/advisorPrompts.js";

test("engine prompt routes high-fidelity 3D to Unreal without requiring AAA scope", () => {
  const p = engineSystemPrompt();
  // The rule must not gate Unreal behind "AAA" alone — high-fidelity / combat-focused
  // 3D (indie included) should map to Unreal too.
  assert.match(p, /high[- ]fidelity|high[- ]end graphics|visual fidelity/i);
  assert.match(p, /unreal/i);
  // "indie" must not be treated as a reason to exclude Unreal.
  assert.match(p, /indie/i);
});

test("user_silent required when no engine mentioned", () => {
  assert.throws(() =>
    assertEngineInvariant({
      picked: "unity",
      userPreferred: null,
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    }),
  );
});

test("challenged required when picked differs from preference", () => {
  assert.throws(() =>
    assertEngineInvariant({
      picked: "godot",
      userPreferred: "unreal_engine",
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    }),
  );
});

test("valid agreed decision passes", () => {
  assert.doesNotThrow(() =>
    assertEngineInvariant({
      picked: "unity",
      userPreferred: "unity",
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    }),
  );
});

test("detects a named catalog engine and returns its id", () => {
  assert.equal(detectUserPreferredEngine("I want to build it in Godot"), "godot");
  assert.equal(detectUserPreferredEngine("a Phaser web game"), "phaser");
  assert.equal(detectUserPreferredEngine("using Unreal Engine 5"), "unreal_engine");
  assert.equal(detectUserPreferredEngine("a Three.js 3D scene"), "threejs");
});

test("detects explicit engine preference from project idea", () => {
  assert.equal(detectUserPreferredEngine("I want to make a mobile roguelite in Godot."), "godot");
  assert.equal(detectUserPreferredEngine("Build this with UE5 and stylized 3D art."), "unreal_engine");
});

test("returns null for a non-catalog engine or no engine", () => {
  assert.equal(detectUserPreferredEngine("built in CryEngine"), null);
  assert.equal(detectUserPreferredEngine("a simple 2D game"), null);
});

test("ignores a negated engine mention", () => {
  assert.equal(detectUserPreferredEngine("not Unity"), null);
});

test("does not treat absent engine as a user preference", () => {
  const decision = normalizeEngineDecision(
    {
      picked: "godot",
      userPreferred: "godot",
      agreement: "agreed",
      reasoning: "x",
      alternativesConsidered: [],
    },
    "A cozy farming game for PC and web with simple 2D art.",
  );

  assert.equal(decision.userPreferred, null);
  assert.equal(decision.agreement, "user_silent");
});

test("normalizes challenged agreement when picked engine differs from explicit preference", () => {
  const decision = normalizeEngineDecision(
    {
      picked: "godot",
      userPreferred: null,
      agreement: "user_silent",
      reasoning: "x",
      alternativesConsidered: [],
    },
    "I prefer Unreal Engine for a small 2D puzzle game.",
  );

  assert.equal(decision.userPreferred, "unreal_engine");
  assert.equal(decision.agreement, "challenged");
});

test("normalizeEngineDecision agrees when picked equals detected id", () => {
  const out = normalizeEngineDecision(
    {
      picked: "phaser",
      userPreferred: null,
      agreement: "user_silent",
      reasoning: "fits web 2D",
      alternativesConsidered: [],
    },
    "a Phaser web RPG",
  );
  assert.equal(out.userPreferred, "phaser");
  assert.equal(out.agreement, "agreed");
});
