describe('jarvis progress orb', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
  })

  it('shows the plasma orb on every prompt, hiding the panel, until the message renders', () => {
    cy.get('select[aria-label="Theme"]').select('jarvis')
    cy.get('textarea[aria-label="Prompt"]').type('reply with only: one{ctrl}{enter}')
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')
    // Second prompt in the same session: previous output exists, but the orb
    // must reappear and replace the panel until the new reply starts rendering.
    cy.intercept('POST', '**/session/*/message', (req) => {
      req.continue((res) => {
        res.delay = 4000
      })
    })
    cy.get('textarea[aria-label="Prompt"]').type('reply with only: two{ctrl}{enter}')
    cy.get('button').contains('Cancel', { timeout: 5000 }).should('exist')
    cy.get('main section.panel-bg .plasma-orb', { timeout: 3000 }).should('exist')
    cy.get('main section.panel-bg article', { timeout: 1000 }).should('not.exist')
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')
    cy.get('main section.panel-bg .plasma-orb', { timeout: 60000 }).should('not.exist')
  })
})
