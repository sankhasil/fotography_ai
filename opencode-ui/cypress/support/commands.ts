// Wait for the app to boot and the console probe + fallback spawn to finish.
Cypress.Commands.add('connectToConsole', () => {
  cy.get('header').should('contain', 'OpenCode WebUI')
  cy.contains('connected', { timeout: 30000 }).should('exist')
})

// ponytail: Cypress command augmentation requires a global namespace; the
// `no-namespace` rule has no alternative for extending Cypress's Chainable.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      connectToConsole(): void
    }
  }
}

export {}
