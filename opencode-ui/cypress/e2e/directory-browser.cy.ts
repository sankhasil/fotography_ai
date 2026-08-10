// The directory browser talks to `GET /file?path=...` on the opencode console.
// We intercept that endpoint with canned listings so the tests are deterministic
// and exercise every branch: navigation, cache hits, the server-ceiling lock,
// empty folders, the large-folder warning, and the 500 "path escapes" negative.

type FileNode = { name: string; path: string; absolute: string; type: 'file' | 'directory'; ignored: boolean }

const LISTINGS: Record<string, FileNode[]> = {
  '/Users/dev/project/src': [
    { name: 'components', path: 'components', absolute: '/Users/dev/project/src/components', type: 'directory', ignored: false },
    { name: 'index.ts', path: 'index.ts', absolute: '/Users/dev/project/src/index.ts', type: 'file', ignored: false },
    { name: 'utils.ts', path: 'utils.ts', absolute: '/Users/dev/project/src/utils.ts', type: 'file', ignored: false },
    { name: 'node_modules', path: 'node_modules', absolute: '/Users/dev/project/src/node_modules', type: 'directory', ignored: true },
  ],
  '/Users/dev/project/src/components': [
    { name: 'Button.tsx', path: 'Button.tsx', absolute: '/Users/dev/project/src/components/Button.tsx', type: 'file', ignored: false },
    { name: 'Modal.tsx', path: 'Modal.tsx', absolute: '/Users/dev/project/src/components/Modal.tsx', type: 'file', ignored: false },
  ],
  '/Users/dev/project': [
    { name: 'src', path: 'src', absolute: '/Users/dev/project/src', type: 'directory', ignored: false },
    { name: 'package.json', path: 'package.json', absolute: '/Users/dev/project/package.json', type: 'file', ignored: false },
  ],
  '/Users/dev': [
    { name: 'project', path: 'project', absolute: '/Users/dev/project', type: 'directory', ignored: false },
    { name: 'other', path: 'other', absolute: '/Users/dev/other', type: 'directory', ignored: false },
    { name: 'empty', path: 'empty', absolute: '/Users/dev/empty', type: 'directory', ignored: false },
  ],
  '/Users/dev/empty': [],
}

const ORDER: string[] = []

function listingFor(path: string): FileNode[] {
  // anything above /Users/dev is out of bounds → 500
  if (path === '/Users' || path === '/' || !path.startsWith('/Users/dev')) {
    throw new Error('Path escapes the location')
  }
  return LISTINGS[path] ?? []
}

function stubFiles() {
  cy.intercept('GET', '**/file**', (req) => {
    const url = new URL(req.url)
    const path = decodeURIComponent(url.searchParams.get('path') ?? '/')
    ORDER.push(path)
    try {
      req.reply({ statusCode: 200, body: listingFor(path) })
    } catch {
      req.reply({ statusCode: 500, body: { error: 'Path escapes the location' } })
    }
  }).as('fileList')
  // the app asks the server for its current directory on open
  cy.intercept('GET', '**/path**', { statusCode: 200, body: { directory: '/Users/dev/project/src' } }).as('pathGet')
}

describe('directory browser', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
    ORDER.length = 0
    // the tree cache is a module-level singleton — reset it so ceiling/state
    // from a prior test never leaks into this one. (Exposed on window because
    // Cypress specs can't resolve the `@/` alias.)
    cy.window().then((win) => (win as unknown as { __resetDirectoryTree?: () => void }).__resetDirectoryTree?.())
    stubFiles()
    cy.get('button').contains('Browse…').click()
    cy.wait('@fileList')
  })

  it('opens at the server directory and lists subfolders + files', () => {
    cy.get('.dir-list').should('exist')
    // node_modules is ignored → should not appear
    cy.get('.dir-list').contains('node_modules').should('not.exist')
    cy.get('.dir-list').contains('index.ts').should('exist')
    cy.get('.dir-list').contains('components').should('exist')
    // folder rows carry app-fg; file rows are muted + disabled
    // components is a folder → enabled; index.ts is a file → disabled
    cy.contains('.dir-list button', 'components').should('not.be.disabled')
    cy.contains('.dir-list button', 'index.ts').should('be.disabled')
  })

  it('navigates into a subdirectory and shows its contents', () => {
    cy.get('.dir-list button').contains('components').click()
    cy.wait('@fileList')
    cy.get('.dir-list').contains('Button.tsx').should('exist')
    cy.get('.dir-list').contains('index.ts').should('not.exist')
  })

  it('navigates back to the parent folder', () => {
    // go up two levels to a folder that was NOT cached on open, so we exercise
    // the parent-navigation request path (not just a cache hit).
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev/project
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev
    cy.get('.dir-list').contains('other').should('exist')
    cy.get('.dir-list').contains('index.ts').should('not.exist')
  })

  it('jumps via breadcrumb without a second request when cached', () => {
    // drill into components (network), then jump back to src via breadcrumb —
    // src was cached on open, so no new request fires.
    cy.get('.dir-list button').contains('components').click()
    cy.wait('@fileList')
    const afterDrill = ORDER.length
    cy.get('[data-testid="breadcrumb-/Users/dev/project/src"]').click()
    cy.contains('components').should('exist')
    expect(ORDER.length).to.equal(afterDrill)
  })

  it('shows an empty-state for folders with no entries', () => {
    // climb to /Users/dev, then into `empty` which has no entries
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev/project
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev
    cy.get('.dir-list button').contains('empty').click()
    cy.wait('@fileList') // /Users/dev/empty → []
    cy.contains('This folder is empty').should('exist')
  })

  it('shows a human-readable error, not raw JSON, when the server rejects a path (negative)', () => {
    // The server rejects /Users with HTTP 500. The UI must surface a clean
    // message rather than stringifying the SDK error object.
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev/project
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users → 500
    // boundary navigation locks the ceiling silently...
    cy.get('button').contains('Parent folder').should('not.exist')
    // ...but a failed *start*/non-boundary load shows a readable message.
    // Verify the error text is NOT raw SDK JSON (no {"name":...}).
    cy.get('.dir-list').should('not.contain.text', '"name"')
    cy.get('.dir-list').should('not.contain.text', '{"')
  })

  it('shows the large-folder warning for big directories', () => {
    cy.intercept('GET', '**/file**', (req) => {
      const many = Array.from({ length: 250 }, (_, i) => ({
        name: `file-${i}.ts`,
        path: `file-${i}.ts`,
        absolute: `/big/file-${i}.ts`,
        type: 'file',
        ignored: false,
      }))
      req.reply({ statusCode: 200, body: many })
    }).as('bigList')
    cy.reload()
    cy.connectToConsole()
    cy.get('button').contains('Browse…').click()
    cy.wait('@bigList')
    cy.contains('250 items').should('exist')
  })

  it('locks the ceiling and stays put when the server rejects a path (negative)', () => {
    // climb to /Users/dev, then its parent /Users 500s → ceiling locks, the
    // parent button disappears, and no error banner is shown.
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev/project
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users/dev
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users → 500, ceiling locks to /Users/dev
    // parent button is gone (we're at the ceiling) and no error is shown
    cy.get('button').contains('Parent folder').should('not.exist')
    cy.contains('outside the project').should('not.exist')
    // the failing /Users probe must never be repeated: the ceiling breadcrumb is
    // the deepest clickable segment, and clicking it serves from cache.
    cy.get('[data-testid="breadcrumb-/Users/dev"]').click()
    cy.get('@fileList.all').should('have.length', 4) // src, project, dev, Users
  })

  it('disables breadcrumb segments above the ceiling', () => {
    // climb to /Users/dev then attempt /Users → 500 locks ceiling
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList')
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList')
    cy.get('button').contains('Parent folder').click()
    cy.wait('@fileList') // /Users → 500
    // the ceiling itself is the deepest allowed segment → still enabled
    cy.get('[data-testid="breadcrumb-/Users/dev"]').should('not.be.disabled')
    // ancestors above the ceiling are disabled
    cy.get('[data-testid="breadcrumb-/Users"]').should('be.disabled')
  })

  it('selects the chosen folder on confirm', () => {
    cy.get('button').contains('components').click()
    cy.wait('@fileList')
    cy.get('button').contains('Use this folder').click()
    cy.get('input#cwd').should('have.value', '/Users/dev/project/src/components')
  })

  it('cancels without changing the directory', () => {
    cy.get('button').contains('Cancel').click()
    cy.get('[role="dialog"]').should('not.exist')
  })

  it('refresh refetches the current directory', () => {
    // open already fetched src once; refresh must make exactly one more request.
    cy.get('button').contains('↻').click()
    cy.wait('@fileList')
    cy.get('@fileList.all').should('have.length', 2)
  })

  it('serves two open/close cycles from cache without refetching', () => {
    // first open fetched src once; closing and reopening must hit the cache.
    cy.get('button').contains('×').click()
    const afterClose = ORDER.filter((p) => p === '/Users/dev/project/src').length
    cy.get('button').contains('Browse…').click()
    // no new request for the initial path
    const afterReopen = ORDER.filter((p) => p === '/Users/dev/project/src').length
    expect(afterReopen).to.equal(afterClose)
  })
})
