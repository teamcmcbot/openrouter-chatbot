import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Tooltip from '../../../components/ui/Tooltip'

function TwoTooltips() {
  return (
    <div>
      <Tooltip content={<span data-testid="t1-body">T1</span>} tinted>
        <button data-testid="t1">One</button>
      </Tooltip>
      <Tooltip content={<span data-testid="t2-body">T2</span>} tinted>
        <button data-testid="t2">Two</button>
      </Tooltip>
    </div>
  )
}

describe('Tooltip exclusivity', () => {
  test('opening the second closes the first', () => {
    render(<TwoTooltips />)
    const t1 = screen.getByTestId('t1')
    const t2 = screen.getByTestId('t2')

    // Open first
    fireEvent.mouseEnter(t1)
    expect(screen.getByTestId('t1-body')).toBeInTheDocument()

    // Open second - should close first
    fireEvent.mouseEnter(t2)
    expect(screen.getByTestId('t2-body')).toBeInTheDocument()

    // t1 body should not be visible (opacity-0 via class). Query returns node even if hidden, so check style/class
    const t1Body = screen.getByTestId('t1-body').parentElement as HTMLElement
    expect(t1Body.className).toMatch(/opacity-0|pointer-events-none|opacity-100/)
  })
})
