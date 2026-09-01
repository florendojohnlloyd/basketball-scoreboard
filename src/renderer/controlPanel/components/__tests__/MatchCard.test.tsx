// @vitest-environment jsdom

/**
 * MatchCard — unit tests (Task 8.5)
 *
 * Validates Requirements 6.4, 6.5, 6.7:
 *  - 6.4: Display team names, seed numbers, and scores
 *  - 6.5: Visually distinguish pending/in-progress/completed matches
 *  - 6.7: Render BYE entries appropriately
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { MatchNode } from '@shared/types'
import MatchCard from '../MatchCard'

// ---------------------------------------------------------------------------
// Helper factory
// ---------------------------------------------------------------------------

function makeMatchNode(overrides: Partial<MatchNode> = {}): MatchNode {
  return {
    id: 'match-1',
    roundIndex: 0,
    position: 0,
    bracketSection: 'winners',
    homeTeamId: 'team-a',
    awayTeamId: 'team-b',
    homeSeed: 1,
    awaySeed: 8,
    homeSourceMatchId: null,
    awaySourceMatchId: null,
    homeSourceIsLoser: false,
    awaySourceIsLoser: false,
    status: 'pending',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    loserTeamId: null,
    scheduledGameId: null,
    gameLogId: null,
    isBye: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MatchCard', () => {
  // ── Requirement 6.4: Display team names, seed numbers, and scores ──────

  it('displays team names when teamNames map is provided', () => {
    const node = makeMatchNode()
    const teamNames = { 'team-a': 'Lakers', 'team-b': 'Celtics' }
    render(<MatchCard node={node} teamNames={teamNames} />)

    expect(screen.getByText('Lakers')).toBeTruthy()
    expect(screen.getByText('Celtics')).toBeTruthy()
  })

  it('displays seed numbers for both teams', () => {
    const node = makeMatchNode({ homeSeed: 1, awaySeed: 8 })
    render(<MatchCard node={node} />)

    expect(screen.getByText('#1')).toBeTruthy()
    expect(screen.getByText('#8')).toBeTruthy()
  })

  it('displays scores when match is completed', () => {
    const node = makeMatchNode({
      status: 'completed',
      homeScore: 95,
      awayScore: 87,
      winnerTeamId: 'team-a',
    })
    render(<MatchCard node={node} />)

    expect(screen.getByText('95')).toBeTruthy()
    expect(screen.getByText('87')).toBeTruthy()
  })

  it('displays "TBD" for pending team slots (homeTeamId null)', () => {
    const node = makeMatchNode({ homeTeamId: null, homeSeed: null })
    render(<MatchCard node={node} />)

    const tbdElements = screen.getAllByText('TBD')
    expect(tbdElements.length).toBeGreaterThanOrEqual(1)
  })

  it('displays "TBD" for pending team slots (awayTeamId null, not BYE)', () => {
    const node = makeMatchNode({ awayTeamId: null, awaySeed: null, isBye: false })
    render(<MatchCard node={node} />)

    const tbdElements = screen.getAllByText('TBD')
    expect(tbdElements.length).toBeGreaterThanOrEqual(1)
  })

  // ── Requirement 6.7: Show "BYE" for BYE matchups ─────────────────────────

  it('displays "BYE" when awayTeamId is null and isBye is true', () => {
    const node = makeMatchNode({
      awayTeamId: null,
      awaySeed: null,
      isBye: true,
      status: 'bye',
    })
    render(<MatchCard node={node} />)

    const byeElements = screen.getAllByText('BYE')
    expect(byeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('does not display score for BYE slot', () => {
    const node = makeMatchNode({
      awayTeamId: null,
      awaySeed: null,
      awayScore: null,
      isBye: true,
      status: 'bye',
      homeScore: null,
    })
    const { container } = render(<MatchCard node={node} />)

    // Score elements should be empty (no numeric value)
    const scoreElements = container.querySelectorAll('.match-card__score')
    scoreElements.forEach((el) => {
      expect(el.textContent?.trim()).toBe('')
    })
  })

  // ── Requirement 6.5: Background color by status ─────────────────────────

  it('applies --pending class for pending status', () => {
    const node = makeMatchNode({ status: 'pending' })
    const { container } = render(<MatchCard node={node} />)

    const card = container.querySelector('.match-card')
    expect(card?.className).toContain('match-card--pending')
  })

  it('applies --in-progress class for in-progress status', () => {
    const node = makeMatchNode({ status: 'in-progress' })
    const { container } = render(<MatchCard node={node} />)

    const card = container.querySelector('.match-card')
    expect(card?.className).toContain('match-card--in-progress')
  })

  it('applies --completed class for completed status', () => {
    const node = makeMatchNode({ status: 'completed', winnerTeamId: 'team-a' })
    const { container } = render(<MatchCard node={node} />)

    const card = container.querySelector('.match-card')
    expect(card?.className).toContain('match-card--completed')
  })

  it('applies --bye class for BYE status', () => {
    const node = makeMatchNode({ status: 'bye', isBye: true, awayTeamId: null })
    const { container } = render(<MatchCard node={node} />)

    const card = container.querySelector('.match-card')
    expect(card?.className).toContain('match-card--bye')
  })

  // ── Additional rendering tests ──────────────────────────────────────────

  it('shows status badge for completed matches', () => {
    const node = makeMatchNode({ status: 'completed', winnerTeamId: 'team-a' })
    render(<MatchCard node={node} />)

    expect(screen.getByText('Final')).toBeTruthy()
  })

  it('shows status badge for in-progress matches', () => {
    const node = makeMatchNode({ status: 'in-progress' })
    render(<MatchCard node={node} />)

    expect(screen.getByText('In Progress')).toBeTruthy()
  })

  it('does not show status badge for pending matches', () => {
    const node = makeMatchNode({ status: 'pending' })
    render(<MatchCard node={node} />)

    expect(screen.queryByText('Pending')).toBeNull()
  })

  it('highlights winner row when winnerTeamId matches homeTeamId', () => {
    const node = makeMatchNode({
      status: 'completed',
      homeScore: 100,
      awayScore: 90,
      winnerTeamId: 'team-a',
    })
    const { container } = render(<MatchCard node={node} />)

    const rows = container.querySelectorAll('.match-card__team-row')
    const homeRow = rows[0] // first row is home
    expect(homeRow?.className).toContain('match-card__team-row--winner')
  })

  it('highlights winner row when winnerTeamId matches awayTeamId', () => {
    const node = makeMatchNode({
      status: 'completed',
      homeScore: 85,
      awayScore: 92,
      winnerTeamId: 'team-b',
    })
    const { container } = render(<MatchCard node={node} />)

    const rows = container.querySelectorAll('.match-card__team-row')
    const awayRow = rows[1] // second row is away
    expect(awayRow?.className).toContain('match-card__team-row--winner')
  })

  it('falls back to teamId when teamNames map is absent', () => {
    const node = makeMatchNode({ homeTeamId: 'team-x', awayTeamId: 'team-y' })
    render(<MatchCard node={node} />)

    expect(screen.getByText('team-x')).toBeTruthy()
    expect(screen.getByText('team-y')).toBeTruthy()
  })
})
