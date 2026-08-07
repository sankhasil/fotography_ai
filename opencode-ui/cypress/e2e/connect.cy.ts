describe('connect', () => {
  it('boots, connects to the console and shows the workspace controls', () => {
    cy.visit('/')
    cy.connectToConsole()
    cy.get('#cwd').should('be.visible')
    cy.contains('Working directory').should('exist')
    cy.contains('History').should('exist')
  })

  it('renders an offline state when the console is unreachable', () => {
    // A fresh origin with no server on :4096 and no fallback: the app must
    // surface offline instead of silently hanging.
    cy.intercept('http://localhost:4096/config', { forceNetworkError: true }).as('probe')
    cy.intercept('/opencode-resolve', { forceNetworkError: true }).as('fallback')
    cy.visit('/')
    cy.contains('offline', { timeout: 15000 }).should('exist')
    cy.contains('retry').should('exist')
    cy.get('[title*="No OpenCode console reachable"]').should('exist')
  })
})
