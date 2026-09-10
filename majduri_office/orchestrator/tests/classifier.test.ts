import { describe, it, expect } from "vitest"
import { classify, isValidTag } from "../src/classifier.js"

describe("classify", () => {
  it("classifies test tasks", () => {
    expect(classify("write unit tests for auth module")).toBe("test")
    expect(classify("add integration tests")).toBe("test")
    expect(classify("create spec file")).toBe("test")
  })

  it("classifies docs tasks", () => {
    expect(classify("write documentation")).toBe("docs")
    expect(classify("update readme")).toBe("docs")
    expect(classify("add comments")).toBe("docs")
  })

  it("classifies bugfix tasks", () => {
    expect(classify("fix bug in login")).toBe("bugfix")
    expect(classify("resolve crash issue")).toBe("bugfix")
    expect(classify("handle error case")).toBe("bugfix")
  })

  it("classifies feature tasks", () => {
    expect(classify("add new feature")).toBe("feature")
    expect(classify("create user profile")).toBe("feature")
    expect(classify("implement auth flow")).toBe("feature")
  })

  it("classifies refactor tasks", () => {
    expect(classify("refactor auth module")).toBe("refactor")
    expect(classify("clean up code")).toBe("refactor")
    expect(classify("simplify logic")).toBe("refactor")
  })

  it("defaults to feature for unknown tasks", () => {
    expect(classify("do something random")).toBe("feature")
    expect(classify("hello world")).toBe("feature")
  })
})

describe("isValidTag", () => {
  it("validates known tags", () => {
    expect(isValidTag("test", ["test", "feature"])).toBe(true)
    expect(isValidTag("feature", ["test", "feature"])).toBe(true)
  })

  it("rejects unknown tags", () => {
    expect(isValidTag("unknown", ["test", "feature"])).toBe(false)
    expect(isValidTag("test", ["feature"])).toBe(false)
  })
})
