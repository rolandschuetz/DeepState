import { describe, expect, it } from "vitest";

import {
  isLogicWorkspaceReady,
  LOGIC_WORKSPACE_NAME,
} from "../src/index.js";

describe("logic workspace bootstrap", () => {
  it("exposes a stable package identity", () => {
    expect(LOGIC_WORKSPACE_NAME).toBe("@ineedabossagent/logic");
  });

  it("reports the workspace as bootstrapped", () => {
    expect(isLogicWorkspaceReady()).toBe(true);
  });
});
