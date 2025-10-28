import React from 'react'
import './App.css'

function App() {
  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-brand">
          Wavelength
        </div>
      </nav>

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          {/* Main Title */}
          <h1 className="hero-title">
            <span className="gradient-text">Wavelength</span>
          </h1>
          
          {/* Subtitle */}
          <p className="hero-subtitle">
            The ultimate party game where intuition meets precision. 
            Give clues, guess positions, and score big when you hit the sweet spot!
          </p>

          {/* Game Actions */}
          <div className="action-buttons">
            <button className="btn-primary">
              Create New Game
            </button>
            <button className="btn-secondary">
              Join with Code
            </button>
          </div>

          {/* Features Grid */}
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3 className="feature-title">Precision Matters</h3>
              <p className="feature-description">The closer you get to the target, the more points you earn. Perfect positioning wins!</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3 className="feature-title">Team Play</h3>
              <p className="feature-description">Work together with your teammates to decode clues and find the perfect wavelength.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="feature-title">Real-time Fun</h3>
              <p className="feature-description">Instant updates, live scoring, and seamless multiplayer experience.</p>
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}

export default App