/**
 * AdvancedMetricsPanel — Requirement 21
 *
 * Displays PEI, plus/minus, and Efficiency for every player on both teams.
 * Subscribes to the Zustand store so it updates within 200 ms of any
 * relevant stat or game-clock change.
 */
import React from 'react'
import {
  useControlPanelStore,
  computeMinutesPlayed,
  computePlusMinus,
  computeEfficiency,
  computePEI,
} from '../store'
import './AdvancedMetricsPanel.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPEI(value: number | null): string {
  if (value === null) return '—'
  return value.toFixed(2)
}

function formatPlusMinus(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function formatMinutes(minutes: number): string {
  const totalSec = Math.round(minutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Single-player row
// ---------------------------------------------------------------------------

interface PlayerMetricsRowProps {
  player: {
    id: string
    number: string
    name: string
    active: boolean
    fouledOut: boolean
    fouls: number
    points: number
    rebounds: number
    assists: number
    steals: number
    blocks: number
    fga: number
    fgm: number
    substitutions: { clockMs: number; period: number; active: boolean }[]
  }
  team: 'home' | 'away'
}

function PlayerMetricsRow({ player, team }: PlayerMetricsRowProps): React.ReactElement {
  const gameState = useControlPanelStore((s) => s.gameState)
  const currentClockMs = gameState.gameClock.displayMs

  const minutes = computeMinutesPlayed(player, currentClockMs)
  const pei = computePEI(player, currentClockMs)
  const plusMinus = computePlusMinus(player, team, gameState)
  const efficiency = computeEfficiency(player)

  const statusClass = player.fouledOut
    ? 'amp-row--fouled-out'
    : player.active
      ? 'amp-row--active'
      : 'amp-row--bench'

  return (
    <tr
      className={`amp-row ${statusClass}`}
      aria-label={`${player.name} advanced metrics`}
    >
      <td className="amp-cell amp-cell--identity">
        <span className="amp-num">#{player.number}</span>
        <span className="amp-name">{player.name}</span>
      </td>
      <td className="amp-cell amp-cell--min" title="Minutes played">
        {formatMinutes(minutes)}
      </td>
      <td className="amp-cell amp-cell--pei" title="Player Efficiency Index">
        {formatPEI(pei)}
      </td>
      <td
        className={`amp-cell amp-cell--pm${plusMinus > 0 ? ' amp-cell--pm-pos' : plusMinus < 0 ? ' amp-cell--pm-neg' : ''}`}
        title="Plus / Minus"
      >
        {formatPlusMinus(plusMinus)}
      </td>
      <td className="amp-cell amp-cell--eff" title="Efficiency">
        {efficiency}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Team section
// ---------------------------------------------------------------------------

interface TeamMetricsSectionProps {
  team: 'home' | 'away'
}

function TeamMetricsSection({ team }: TeamMetricsSectionProps): React.ReactElement {
  const teamState = useControlPanelStore((s) => s.gameState[team])
  const { config, players } = teamState

  return (
    <section
      className="amp-section"
      aria-label={`${config.name} advanced metrics`}
    >
      <h3 className="amp-section__title">{config.name}</h3>
      <table className="amp-table" role="table">
        <thead>
          <tr>
            <th className="amp-th amp-th--identity" scope="col">Player</th>
            <th className="amp-th" scope="col" title="Minutes Played">MIN</th>
            <th className="amp-th" scope="col" title="Player Efficiency Index">PEI</th>
            <th className="amp-th" scope="col" title="Plus / Minus">+/−</th>
            <th className="amp-th" scope="col" title="Efficiency">EFF</th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="amp-cell amp-cell--empty"
              >
                No players on roster
              </td>
            </tr>
          ) : (
            players.map((p) => (
              <PlayerMetricsRow key={p.id} player={p} team={team} />
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

// ---------------------------------------------------------------------------
// AdvancedMetricsPanel
// ---------------------------------------------------------------------------

/**
 * Shows PEI, +/−, and Efficiency per player for both teams.
 * Placed in the Control Panel alongside the player list (Roster tab).
 *
 * Updates within 200 ms of any relevant stat change because it subscribes
 * directly to the Zustand store which is driven by IPC state pushes.
 */
function AdvancedMetricsPanel(): React.ReactElement {
  return (
    <div className="advanced-metrics-panel" aria-label="Advanced player metrics">
      <h2 className="amp-header">Advanced Metrics</h2>
      <TeamMetricsSection team="home" />
      <TeamMetricsSection team="away" />
    </div>
  )
}

export default AdvancedMetricsPanel
