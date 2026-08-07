// These specs exercise a real console and a working model. The console's
// configured default may be an unreliable local model, so the model picker
// selects a known-good provider model first. If that model is unavailable, the
// send/cancel assertions fail with the surfaced session error — a useful
// signal, not a UI bug.
describe('session flow', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
  })

  it('sends a prompt, auto-creating a session, and renders the user turn', () => {
    cy.get('textarea[aria-label="Prompt"]').type('Say hello and confirm you are alive.')
    cy.get('button').contains('Send').click()
    // A session is auto-created and the user turn renders instantly from the
    // prompt response (before any streamed events arrive).
    cy.get('main').contains('Say hello and confirm you are alive.').should('exist')
    cy.get('main').contains('.uppercase', 'user').should('exist')
    // The turn eventually settles: the Send button returns.
    cy.get('button').contains('Send', { timeout: 180000 }).should('exist')
  })

  it('renders the assistant reply when the model responds', () => {
    // Pick a working model like the CLI /model command: qwen2.5-coder tends to
    // answer via a write tool call, so force a plain-text capable model.
    cy.get('select[aria-label="Model"]').select('Big Pickle', { force: true })
    cy.get('textarea[aria-label="Prompt"]').type(
      'Do not use any tools. Reply with only the single word: pong',
    )
    cy.get('button').contains('Send').click()
    // Scope to assistant articles only: the user turn also contains "pong",
    // so matching the bare word would pass spuriously.
    cy.get('main article', { timeout: 180000 }).should((articles) => {
      const assistantText = [...articles]
        .filter((el) =>
          [...el.querySelectorAll('.uppercase')].some((b) => b.textContent === 'assistant'),
        )
        .map((el) => el.textContent ?? '')
        .join(' ')
      expect(assistantText).to.contain('pong')
    })
  })

  it('cancels an in-flight generation', () => {
    cy.get('select[aria-label="Model"]').select('Big Pickle', { force: true })
    cy.get('textarea[aria-label="Prompt"]').type(
      'Write a very long detailed essay about the history of computing, do not stop early.',
    )
    cy.get('button').contains('Send').click()
    cy.get('button').contains('Cancel', { timeout: 30000 }).should('exist')
    cy.get('button').contains('Cancel').click()
    cy.get('button').contains('Send').should('exist')
  })
})
