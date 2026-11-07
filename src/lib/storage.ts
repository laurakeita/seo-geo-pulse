"use client";

// Client-side persistence for saved tests and run history. There is no
// backend database in this project, so browser localStorage is the most
// honest "existing persistence" to build on — it's per-browser, not shared
// across devices, and that limitation is surfaced in the UI, not hidden.

import type { SavedTest, TestRun } from "./types";

const SAVED_TESTS_KEY = "seo-geo-pulse:saved-tests:v1";
const RUN_HISTORY_KEY = "seo-geo-pulse:run-history:v1";
const MAX_HISTORY_ENTRIES = 200;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private browsing, storage disabled, or quota exceeded
  }
}

export function loadSavedTests(): SavedTest[] {
  return readJson<SavedTest[]>(SAVED_TESTS_KEY, []);
}

export function writeSavedTests(tests: SavedTest[]): boolean {
  return writeJson(SAVED_TESTS_KEY, tests);
}

export function loadRunHistory(): TestRun[] {
  return readJson<TestRun[]>(RUN_HISTORY_KEY, []);
}

export function writeRunHistory(runs: TestRun[]): boolean {
  // Cap history length so localStorage (typically ~5-10MB) doesn't fill up
  // from response text accumulating over many runs.
  const trimmed = runs.slice(0, MAX_HISTORY_ENTRIES);
  return writeJson(RUN_HISTORY_KEY, trimmed);
}

export function appendRunHistory(run: TestRun): TestRun[] {
  const current = loadRunHistory();
  const next = [run, ...current];
  writeRunHistory(next);
  return next.slice(0, MAX_HISTORY_ENTRIES);
}
