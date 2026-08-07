describe('prompt33 matrix progress rain', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
  })

  it('shows matrix rain in the header while enabled', () => {
    cy.get('select[aria-label="Theme"]').select('matrix')
    cy.get('header canvas', { timeout: 5000 }).should('have.length', 2)
    cy.get('header > canvas').should('have.css', 'opacity', '0.25')
    cy.get('header > div.absolute.inset-x-0.bottom-0 canvas').should('exist')
  })

  it('shows rain on every prompt, hiding the panel, until the new message renders', () => {
    cy.get('select[aria-label="Theme"]').select('matrix')
    cy.get('textarea[aria-label="Prompt"]').type('reply with only: one{ctrl}{enter}')
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')
    // Second prompt in the same session: previous output exists, but the rain
    // must reappear and replace the panel until the new reply starts rendering.
    cy.intercept('POST', '**/session/*/message', (req) => {
      req.continue((res) => {
        res.delay = 4000
      })
    })
    cy.get('textarea[aria-label="Prompt"]').type('reply with only: two{ctrl}{enter}')
    cy.get('button').contains('Cancel', { timeout: 5000 }).should('exist')
    cy.get('main section.panel-bg canvas[aria-hidden="true"]', { timeout: 3000 }).should('exist')
    cy.get('main section.panel-bg article', { timeout: 1000 }).should('not.exist')
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')
    cy.get('main section.panel-bg canvas', { timeout: 60000 }).should('not.exist')
  })
})
