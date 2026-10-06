import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("demo balance controls are hidden when demo mode is disabled", async () => {
  const component = await readFile(new URL("../src/components/GroupDetail.tsx", import.meta.url), "utf8");
  assert.match(
    component,
    /NEXT_PUBLIC_ENABLE_DEMO_MODE === "true" && isCreator && groupTotal === 0/
  );
});

test("group reads retain cached balances when live balance sync fails", async () => {
  const balances = await readFile(new URL("../src/lib/server/balances.ts", import.meta.url), "utf8");
  assert.match(balances, /event: "balance_sync_failed"/);
  assert.match(balances, /catch \(error\)[\s\S]*return members;/);
});
