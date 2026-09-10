// Verifies the model picker exposes the local ollama models. Requires the
// ollama daemon to be up (npm run ollama:serve) so the opencode console lists
// gemma4 and the qwen2.5 tool-call proxy provider.
describe('model picker', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
  })

  it('lists the Zen and local ollama models', () => {
    cy.get('select[aria-label="Model"] option').should((options) => {
      const texts = options.map((_, o) => o.textContent).get()
      expect(texts).to.contain('Gemma4')
      expect(texts).to.contain('Qwen 2.5 Coder 14B')
    })
  })

  it('selects a local model and persists it', () => {
    cy.get('select[aria-label="Model"]').select('Gemma4')
    cy.get('select[aria-label="Model"] option:selected').should('have.text', 'Gemma4')
    cy.window().its('localStorage').invoke('getItem', 'opencode-ui:model').should('contain', 'gemma4')
  })
})
