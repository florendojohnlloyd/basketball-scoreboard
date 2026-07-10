import React from 'react'
import './SportSelector.css'

interface Sport {
  id: string
  name: string
  icon: string
  available: boolean
}

const SPORTS: Sport[] = [
  { id: 'basketball', name: 'Basketball', icon: '🏀', available: true },
  { id: 'badminton', name: 'Badminton', icon: '🏸', available: false },
  { id: 'volleyball', name: 'Volleyball', icon: '🏐', available: false },
  { id: 'sepak-takraw', name: 'Sepak Takraw', icon: '🦶', available: false },
  { id: 'table-tennis', name: 'Table Tennis', icon: '🏓', available: false },
]

interface SportSelectorProps {
  onSelectSport: (sportId: string) => void
}

export function SportSelector({ onSelectSport }: SportSelectorProps): React.ReactElement {
  return (
    <div className="sport-selector">
      <div className="sport-selector__content">
        <h1 className="sport-selector__title">SELECT SPORT</h1>
        <p className="sport-selector__subtitle">Choose a sport module for this session</p>

        <div className="sport-selector__grid">
          {SPORTS.map((sport) => (
            <button
              key={sport.id}
              className={`sport-card ${sport.available ? 'sport-card--available' : 'sport-card--disabled'}`}
              onClick={() => sport.available && onSelectSport(sport.id)}
              disabled={!sport.available}
            >
              <div className="sport-card__icon">{sport.icon}</div>
              <div className="sport-card__name">{sport.name}</div>
              <div className="sport-card__badge">
                {sport.available ? 'AVAILABLE' : 'COMING SOON'}
              </div>
            </button>
          ))}
        </div>

        <div className="sport-selector__footer">
          V17.10 — BASKETBALL FULLY IMPLEMENTED. OTHERS COMING IN FUTURE UPDATES.
        </div>
      </div>
    </div>
  )
}
