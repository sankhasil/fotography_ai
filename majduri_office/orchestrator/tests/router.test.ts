import { describe, it, expect } from "vitest"
import { hasOverlappingPaths } from "../src/router.js"

describe("hasOverlappingPaths", () => {
  it("detects overlapping paths", () => {
    expect(hasOverlappingPaths("fix src/auth/login.ts", "update src/auth/utils.ts")).toBe(true)
  })

  it("detects nested paths", () => {
    expect(hasOverlappingPaths("update src/components/Button.tsx", "fix src/components/Button.tsx:25")).toBe(true)
  })

  it("detects no overlap for different directories", () => {
    expect(hasOverlappingPaths("fix src/auth/login.ts", "update lib/utils/helper.ts")).toBe(false)
  })

  it("returns false when no paths found", () => {
    expect(hasOverlappingPaths("fix the bug", "update the docs")).toBe(false)
  })

  it("returns false when only one prompt has paths", () => {
    expect(hasOverlappingPaths("fix src/auth/login.ts", "update the docs")).toBe(false)
  })
})
