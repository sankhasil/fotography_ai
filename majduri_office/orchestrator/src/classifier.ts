const KEYWORD_MAP: Record<string, string[]> = {
  test: ["test", "spec", "assert", "mock", "coverage", "unit", "integration"],
  docs: ["doc", "readme", "comment", "javadoc", "kdoc", "document", "explain"],
  bugfix: ["fix", "bug", "error", "crash", "broken", "issue", "resolve"],
  feature: ["add", "create", "implement", "build", "new", "extend", "feature"],
  refactor: ["refactor", "clean", "reorganize", "extract", "simplify", "optimize"],
}

export function classify(task: string): string {
  const lower = task.toLowerCase()
  for (const [tag, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) return tag
  }
  return "feature"
}

export function isValidTag(tag: string, validTags: string[]): boolean {
  return validTags.includes(tag)
}
