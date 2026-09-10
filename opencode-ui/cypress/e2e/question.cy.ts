// The question dialog appears when the console reports a pending question for
// the active session, and answering it issues the scoped REST call. The
// /question endpoints are stubbed so the flow is deterministic and never
// depends on a model choosing to ask a question.
describe('question flow', () => {
  it('shows the pending question dialog and sends the answer over REST', () => {
    cy.visit('/')
    cy.connectToConsole()

    // The console auto-activates the most recent session of the active folder
    // on connect, so the active session box is the question target — no session
    // is created and the pool's session limit never interferes.
    //
    // Anchor on the `dir:` line: the id span alone is duplicated by the header
    // (same id, but its next sibling is the status indicator, not the
    // directory), so reading the sibling's text off a bare id selector yields
    // "connecteddir: ..." instead of "dir: ...".
    cy.contains('span', /^dir:\s*/, { timeout: 15000 }).then(($dirSpan) => {
      const dir = $dirSpan.text().replace(/^dir:\s*/, '')
      cy.wrap($dirSpan)
        .prev()
        .invoke('attr', 'data-session-id')
        .then((id) => {
          let answered = false
          cy.intercept('GET', '**/question**', (req) => {
            // After the answer the server would drop the request; return an
            // empty list so the card does not reappear on the next poll.
            req.reply(
              answered
                ? []
                : [
                    {
                      id: 'que-e2e-1',
                      sessionID: id,
                      questions: [
                        {
                          header: 'Scope',
                          question: 'Which option do you prefer?',
                          options: [
                            { label: 'Option One', description: 'First' },
                            { label: 'Option Two', description: 'Second' },
                          ],
                        },
                      ],
                    },
                  ],
            )
          })
          cy.intercept('POST', '**/question/*/reply*', (req) => {
            const url = new URL(req.url)
            expect(url.pathname).to.include('/question/que-e2e-1/reply')
            // Regression: the reply must carry the same directory the list was
            // scoped to, or the server answers 404 QuestionNotFoundError.
            expect(url.searchParams.get('directory') ?? '').to.equal(dir)
            expect(req.body).to.deep.equal({ answers: [['Option One']] })
            answered = true
            req.reply(200, { answered: true })
          }).as('reply')

          // Trigger the poll without creating or sending anything: hop to
          // another configured folder and back. Each hop flips the active
          // session id, which fires the poll watch; the return hop restores the
          // captured session, so the poll reports its pending question.
          // selectFolder is async, so each hop waits until the active session
          // actually settled before the next click — otherwise a stale hop can
          // resolve out of order and swap the session away mid-test.
          cy.contains('label', 'Folders')
            .siblings('div')
            .find('button[title]')
            .then(($tabs) => {
              const tabs = $tabs.toArray()
              const activeTab = tabs.find((tab) => tab.getAttribute('title') === dir) ?? tabs[0]
              const otherTab = tabs.find((tab) => tab !== activeTab) ?? activeTab
              expect(tabs.length, 'needs at least two configured folders').to.be.at.least(2)
              cy.wrap(otherTab).click()
              // Settle: the away folder is active — its session differs from the
              // captured one (an empty folder clears the box entirely, which is
              // also a settled state; body.find yields an empty set rather than
              // failing on a disappearing selector).
              cy.get('body')
                .find('span[data-session-id]')
                .should(($span) => {
                  if ($span.length === 0) return
                  expect($span.attr('data-session-id')).not.to.equal(id)
                })
              cy.wrap(activeTab).click()
              cy.get('span[data-session-id]', { timeout: 10000 })
                .invoke('attr', 'data-session-id')
                .should('eq', id)
            })

          // The QuestionCard is the only `article.max-w-lg` in main; message
          // and tool cards use rounded-lg. Anchoring on it keeps the assertions
          // immune to the live conversation, which legitimately echoes the card
          // text inside tool outputs from the session.
          cy.get('main article.max-w-lg', { timeout: 10000 }).should('exist')
          cy.get('main article.max-w-lg').contains('Which option do you prefer?').should('exist')
          cy.get('main article.max-w-lg').contains('Option One').click()
          cy.get('main article.max-w-lg').contains('Send answer').click()

          cy.wait('@reply')
          cy.get('main article.max-w-lg').should('not.exist')
        })
    })
  })
})
