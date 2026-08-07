describe('themes', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.connectToConsole()
  })

  it('switches themes without a reload', () => {
    cy.get('select[aria-label="Theme"]').select('cartoony')
    cy.get('html').should('have.attr', 'data-theme', 'cartoony')
    cy.get('select[aria-label="Theme"]').select('jarvis')
    cy.get('html').should('have.attr', 'data-theme', 'jarvis')
    cy.get('select[aria-label="Theme"]').select('matrix')
    cy.get('html').should('have.attr', 'data-theme', 'matrix')
    // Matrix is dark-only; the tone can't be changed while it is active.
    cy.get('html').should('have.attr', 'data-tone', 'dark')
    cy.get('button').contains('dark').should('not.exist')
  })

  it('persists the theme across reloads', () => {
    cy.get('select[aria-label="Theme"]').select('cartoony')
    cy.reload()
    cy.get('select[aria-label="Theme"]').should('have.value', 'cartoony')
    cy.get('html').should('have.attr', 'data-theme', 'cartoony')
  })

  it('runs the matrix rain animation', () => {
    cy.get('select[aria-label="Theme"]').select('matrix')
    cy.get('canvas[aria-hidden="true"]').should('exist')
    // The rAF loop repaints every frame; prove it is alive by diffing pixels.
    cy.get('canvas[aria-hidden="true"]').then(($canvas) => {
      const first = $canvas[0].getContext('2d')!.getImageData(0, 0, 16, 16).data.join(',')
      cy.wait(600)
      cy.get('canvas[aria-hidden="true"]').then(($canvas2) => {
        const second = $canvas2[0].getContext('2d')!.getImageData(0, 0, 16, 16).data.join(',')
        expect(first).not.to.equal(second)
      })
    })
  })

  it('toggles the rain on and off', () => {
    cy.get('select[aria-label="Theme"]').select('matrix')
    cy.get('button').contains('rain: on').click()
    cy.get('button').should('contain', 'rain: off')
    cy.get('canvas[aria-hidden="true"]').should('not.exist')
    cy.get('button').contains('rain: off').click()
    cy.get('button').should('contain', 'rain: on')
    cy.get('canvas[aria-hidden="true"]').should('exist')
  })
})
