describe('matrix task progress advances from 0%', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
  })

  it('progress percentage rises above 0% during a run in matrix theme', () => {
    cy.get('select[aria-label="Theme"]').select('matrix')
    // Send a first prompt so the session exists and is warm.
    cy.get('textarea[aria-label="Prompt"]').type('reply with only: warmup{ctrl}{enter}')
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')

    // Delay the prompt response so the SSE stream has time to deliver
    // reasoning/tool/delta events that drive the progress clock forward.
    cy.intercept('POST', '**/session/*/message', (req) => {
      req.continue((res) => {
        res.delay = 6000
      })
    })

    cy.get('textarea[aria-label="Prompt"]').type('reply with only: progress test{ctrl}{enter}')
    cy.get('button').contains('Cancel', { timeout: 5000 }).should('exist')
    cy.get('main section.panel-bg .task-progress', { timeout: 3000 }).should('exist')

    // The core assertion: the percentage must advance above 0% while the run
    // is in flight. Before the fix, observe() kept resetting pct to the
    // reasoning floor (0) on every message.part.updated event.
    cy.get('main section.panel-bg .task-progress__pct', { timeout: 8000 }).should(
      ($el) => {
        const value = Number.parseInt($el.text(), 10)
        expect(value).to.be.greaterThan(0)
      },
    )

    // The run should eventually complete and render the message.
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')
    cy.get('main section.panel-bg .task-progress', { timeout: 60000 }).should('not.exist')
  })

  it('progress reaches 100% on completion', () => {
    cy.get('select[aria-label="Theme"]').select('matrix')
    cy.get('textarea[aria-label="Prompt"]').type('reply with only: warmup{ctrl}{enter}')
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')

    cy.intercept('POST', '**/session/*/message', (req) => {
      req.continue((res) => {
        res.delay = 4000
      })
    })

    cy.get('textarea[aria-label="Prompt"]').type('reply with only: complete test{ctrl}{enter}')
    cy.get('button').contains('Cancel', { timeout: 5000 }).should('exist')
    cy.get('main section.panel-bg .task-progress', { timeout: 3000 }).should('exist')

    // Wait for the run to complete — session.idle fires completeTaskPct(100).
    cy.get('main section.panel-bg article', { timeout: 60000 }).should('exist')
  })
})
