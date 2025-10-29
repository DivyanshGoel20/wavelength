import React, { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import './App.css'

// WebSocket connection
const socket = io('http://localhost:3001', {
  autoConnect: false
})

function App() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [gameRoom, setGameRoom] = useState(null)
  const [joinError, setJoinError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isGameStarted, setIsGameStarted] = useState(false)
  const [currentClue, setCurrentClue] = useState(null)
  const [yourClue, setYourClue] = useState('')
  const [spectrumAngle, setSpectrumAngle] = useState(0)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [allSubmitted, setAllSubmitted] = useState(false)
  const [presenter, setPresenter] = useState(null)
  const [presentData, setPresentData] = useState(null)
  const [isIntro, setIsIntro] = useState(false)

  const getRandomRotation = () => 20 + Math.random() * 140 // keep wedges fully inside 0..180

  // WebSocket event handlers
  useEffect(() => {
    if (!socket.connected) {
      socket.connect()
    }

    const onConnect = () => {
      setIsConnected(true)
    }
    const onDisconnect = () => {
      setIsConnected(false)
    }
    const onRoomCreated = (roomData) => {
      setGameRoom(roomData)
      setRoomCode(roomData.code)
      setIsGameStarted(false)
      setCurrentClue(null)
    }
    const onRoomJoined = (roomData) => {
      setGameRoom(roomData)
      setRoomCode(roomData.code)
      setJoinError('')
      setShowJoinModal(false)
      setIsGameStarted(false)
      setCurrentClue(null)
    }
    const onRoomError = (error) => {
      setJoinError(error.message)
    }
    const onPlayerJoined = (roomData) => {
      setGameRoom(roomData)
    }
    const onPlayerLeft = (roomData) => {
      setGameRoom(roomData)
    }
    const onGameStarted = (payload) => {
      setIsGameStarted(true)
      setCurrentClue(payload.clue)
      setSpectrumAngle(getRandomRotation())
    }
    const onClueUpdated = (payload) => {
      setCurrentClue(payload.clue)
      setSpectrumAngle(getRandomRotation())
    }
    const onClueSubmitted = () => {
      setIsSubmitted(true)
    }
    const onAllSubmitted = () => {
      setAllSubmitted(true)
    }
    const onShowClueGiver = (payload) => {
      setPresenter(payload.presenter)
      setIsIntro(true)
      setPresentData(null)
      // Ensure we leave the create-clue screen even if local submit ack hasn't landed
      setIsSubmitted(true)
    }
    const onPresentClue = (payload) => {
      setIsIntro(false)
      setPresenter(payload.presenter)
      setPresentData({ angle: payload.angle, clueText: payload.clueText, left: payload.left, right: payload.right })
    }

    // Connection events
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    // Room events
    socket.on('room-created', onRoomCreated)
    socket.on('room-joined', onRoomJoined)
    socket.on('room-error', onRoomError)
    socket.on('player-joined', onPlayerJoined)
    socket.on('player-left', onPlayerLeft)
    socket.on('game-started', onGameStarted)
    socket.on('clue-updated', onClueUpdated)
    socket.on('clue-submitted', onClueSubmitted)
    socket.on('all-submitted', onAllSubmitted)
    socket.on('show-clue-giver', onShowClueGiver)
    socket.on('present-clue', onPresentClue)

    // Cleanup
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room-created', onRoomCreated)
      socket.off('room-joined', onRoomJoined)
      socket.off('room-error', onRoomError)
      socket.off('player-joined', onPlayerJoined)
      socket.off('player-left', onPlayerLeft)
      socket.off('game-started', onGameStarted)
      socket.off('clue-updated', onClueUpdated)
      socket.off('clue-submitted', onClueSubmitted)
      socket.off('all-submitted', onAllSubmitted)
      socket.off('show-clue-giver', onShowClueGiver)
      socket.off('present-clue', onPresentClue)
      socket.disconnect()
    }
  }, [])

  // Generate a random room code
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // Handle creating a new game
  const handleCreateGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name!')
      return
    }
    const newRoomCode = generateRoomCode()
    socket.emit('create-room', {
      code: newRoomCode,
      host: playerName,
      playerName: playerName
    })
    setRoomCode(newRoomCode)
    setShowCreateModal(false)
  }

  // Handle joining a game
  const handleJoinGame = () => {
    setJoinError('')
    if (!playerName.trim() || !roomCode.trim()) {
      setJoinError('Please enter both your name and room code!')
      return
    }
    if (roomCode.length !== 6) {
      setJoinError('Room code must be 6 characters!')
      return
    }
    const upperRoomCode = roomCode.toUpperCase()
    socket.emit('join-room', {
      code: upperRoomCode,
      playerName: playerName
    })
  }

  // Handle going back to main menu
  const handleBackToMenu = () => {
    if (gameRoom) {
      socket.emit('leave-room', { code: gameRoom.code })
    }
    setGameRoom(null)
    setPlayerName('')
    setRoomCode('')
    setJoinError('')
    setIsGameStarted(false)
    setCurrentClue(null)
    setYourClue('')
    setIsSubmitted(false)
    setAllSubmitted(false)
  }

  const handleStartGame = () => {
    if (!gameRoom) return
    socket.emit('start-game', { code: gameRoom.code, playerName })
  }

  const handleSubmitClue = () => {
    if (!gameRoom) return
    if (!yourClue.trim()) return
    socket.emit('submit-clue', {
      code: gameRoom.code,
      playerName,
      angle: spectrumAngle,
      clue: yourClue,
      left: currentClue?.left,
      right: currentClue?.right
    })
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-brand">
          Wavelength
        </div>
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
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
            <button 
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              Create New Game
            </button>
            <button 
              className="btn-secondary"
              onClick={() => setShowJoinModal(true)}
            >
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

      {/* Create Game Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Game</h2>
              <button 
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="input-group">
                <label htmlFor="create-name">Your Name</label>
                <input
                  id="create-name"
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleCreateGame}
                >
                  Create Game
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Game Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Join Game</h2>
              <button 
                className="modal-close"
                onClick={() => setShowJoinModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="input-group">
                <label htmlFor="join-name">Your Name</label>
                <input
                  id="join-name"
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="input-group">
                <label htmlFor="join-code">Room Code</label>
                <input
                  id="join-code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{ textTransform: 'uppercase' }}
                />
                {joinError && (
                  <div className="error-message">{joinError}</div>
                )}
              </div>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleJoinGame}
                >
                  Join Game
                </button>
              </div>
            </div>
          </div>
      </div>
      )}

      {/* Game Room Screen - Lobby */}
      {gameRoom && !isGameStarted && (
        <div className="game-room">
          <div className="game-room-content">
            <div className="room-header">
              <h2>Room: {gameRoom.code}</h2>
              <button 
                className="btn-secondary"
                onClick={handleBackToMenu}
              >
                Leave Room
              </button>
            </div>
            
            <div className="room-info">
              <div>
                <p className="room-status">Waiting for players to join...</p>
                <p className="room-instructions">
                  Share this room code with your friends: <strong>{gameRoom.code}</strong>
                </p>
                <div className="players-list">
                  <h3>Players ({gameRoom.players.length})</h3>
                  <ul>
                    {gameRoom.players.map((player, index) => (
                      <li key={index} className={index === 0 ? 'host' : ''}>
                        {player} {index === 0 && '(Host)'}
                      </li>
                    ))}
                  </ul>
                </div>
                {(playerName === gameRoom.host && gameRoom.players.length >= 2) && (
                  <div style={{ marginTop: '16px' }}>
                    <button className="btn-primary" onClick={handleStartGame}>Start Game</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Clue Screen */}
      {gameRoom && isGameStarted && currentClue && !isSubmitted && (
        <div className="game-room">
          <div className="game-room-content">
            <div className="room-header">
              <h2>Room: {gameRoom.code}</h2>
              <button 
                className="btn-secondary"
                onClick={handleBackToMenu}
              >
                Leave Room
              </button>
            </div>

            <div className="create-clue">
              <h2 style={{ marginBottom: '24px', fontSize: '32px', fontWeight: 700 }}>Type a clue</h2>

              <Spectrum rotation={spectrumAngle} />

              {/* Labels below spectrum, under arrows */}
              <div className="spectrum-labels" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>←</span>
                  <div style={{ fontWeight: 600 }}>{currentClue.left}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontWeight: 600 }}>{currentClue.right}</div>
                  <span style={{ fontSize: '18px' }}>→</span>
                </div>
              </div>

              {/* YOUR CLUE input styled like pill */}
              <input
                type="text"
                placeholder="YOUR CLUE"
                value={yourClue}
                onChange={(e) => setYourClue(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  border: '1px solid #374151',
                  background: '#1f2937',
                  color: 'white',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase'
                }}
              />

              <div className="action-buttons" style={{ display: 'flex', gap: '16px', marginTop: '18px' }}>
                <button className="btn-secondary" style={{ padding: '12px 18px', borderRadius: '20px' }} onClick={() => {
                  if (gameRoom) {
                    socket.emit('new-spectrum', { code: gameRoom.code })
                  } else {
                    setSpectrumAngle(getRandomRotation())
                  }
                }}>New Spectrum</button>
                <button className="btn-primary" disabled={!yourClue.trim()} style={{ padding: '12px 18px', borderRadius: '20px', opacity: yourClue.trim() ? 1 : 0.5, cursor: yourClue.trim() ? 'pointer' : 'not-allowed' }} onClick={handleSubmitClue}>SUBMIT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Waiting Screen after submit / and round phases */}
      {gameRoom && isGameStarted && isSubmitted && (
        <div className="game-room">
          <div className="game-room-content" style={{ textAlign: 'center' }}>
            <div className="room-header" style={{ justifyContent: 'space-between' }}>
              <h2>Room: {gameRoom.code}</h2>
              <button 
                className="btn-secondary"
                onClick={handleBackToMenu}
              >
                Leave Room
              </button>
            </div>
            {!isIntro && !presentData && (
              <div style={{ marginTop: '60px' }}>
                <h1 style={{ fontSize: '40px', fontWeight: 700, marginBottom: '12px' }}>Waiting for others to finish...</h1>
                {playerName === gameRoom.host && allSubmitted && (
                  <div style={{ marginTop: '24px' }}>
                    <button className="btn-primary" onClick={() => socket.emit('start-round', { code: gameRoom.code, playerName })}>
                      Start Round
                    </button>
                  </div>
                )}
              </div>
            )}

            {isIntro && presenter && (
              <div style={{ marginTop: '40px' }}>
                <h2 style={{ fontSize: '20px', letterSpacing: '1px', opacity: 0.8 }}>CLUE GIVER</h2>
                <h1 style={{ fontSize: '64px', fontWeight: 800 }}>{presenter}</h1>
                <p style={{ marginTop: '8px', opacity: 0.8 }}>Get ready...</p>
              </div>
            )}

            {presentData && presenter && (
              playerName === presenter ? (
                <YourClueView data={presentData} totalPlayers={gameRoom.players.length} />
              ) : (
                <OtherClueView data={presentData} />
              )
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default App

// ----- Spectrum (SVG semicircle with 2-3-4-3-2 wedges) -----
function Spectrum({ rotation = 0 }) {
  const width = 600
  const height = 320
  const cx = width / 2
  const cy = height
  const r = Math.min(width, height * 2) * 0.48

  const color2 = '#F59E0B' // 2-point wedges
  const color3 = '#F97316' // 3-point wedges
  const color4 = '#3B82F6' // 4-point center

  // Use small, equal angular half-widths for all wedges to match reference
  const wedgeHalf = 6
  const w2 = wedgeHalf
  const w3 = wedgeHalf
  const w4 = wedgeHalf

  // Compute bands: [2,3,4,3,2] around rotation
  const bands = [
    { half: w2, color: color2 },
    { half: w3, color: color3 },
    { half: w4, color: color4 },
    { half: w3, color: color3 },
    { half: w2, color: color2 },
  ]

  // Convert polar angle (deg) to cartesian point on circle
  const polar = (angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
  }

  // Build a single wedge path; slightly expand angles to remove tiny gaps
  const wedgePath = (startAngle, endAngle) => {
    const expand = 0.8 // degrees of overlap to cover gaps between wedges
    const s = startAngle - expand
    const e = endAngle + expand
    const p1 = polar(s)
    const p2 = polar(e)
    const largeArc = Math.abs(e - s) > 180 ? 1 : 0
    const sweep = e > s ? 1 : 0
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${p2.x} ${p2.y} Z`
  }

  // Background semicircle
  const bgPath = (() => {
    const left = polar(180)
    const right = polar(0)
    return `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${right.x} ${right.y} L ${cx} ${cy} Z`
  })()

  // Compute cumulative band start/end angles centered at rotation
  const totalHalf = w2 + w3 + w4 + w3 + w2
  const startCenter = rotation - totalHalf
  const bandAngles = []
  let cursor = startCenter
  for (let i = 0; i < bands.length; i++) {
    const a1 = cursor
    const a2 = cursor + bands[i].half * 2
    bandAngles.push([a1, a2])
    cursor = a2
  }

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: 720 }}>
        {/* Background semicircle */}
        <path d={bgPath} fill="#EDE7D6" stroke="#111827" strokeWidth="2" />

        {/* Wedges */}
        {bandAngles.map(([a1, a2], idx) => (
          <path key={idx} d={wedgePath(a1, a2)} fill={bands[idx].color} opacity="0.95" />
        ))}

        {/* Numbers over arc */}
        {bandAngles.map(([a1, a2], idx) => {
          const mid = (a1 + a2) / 2
          const p = polar(mid)
          const labelRadiusOffset = 18
          const tx = cx + (r - labelRadiusOffset) * Math.cos((mid * Math.PI) / 180)
          const ty = cy - (r - labelRadiusOffset) * Math.sin((mid * Math.PI) / 180)
          const label = idx === 2 ? '4' : (idx === 1 || idx === 3 ? '3' : '2')
          return (
            <text key={`n-${idx}`} x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fill="#111827" fontWeight="700" fontSize="16">
              {label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}


// ----- Presentation Views -----
function YourClueView({ data, totalPlayers }) {
  const others = Math.max((totalPlayers || 0) - 1, 0)
  return (
    <div style={{ marginTop: '16px' }}>
      {/* Header matches create-clue */}
      <h2 style={{ marginBottom: '24px', fontSize: '32px', fontWeight: 700 }}>YOUR CLUE</h2>

      {/* Use the same Spectrum component and label layout */}
      <Spectrum rotation={data.angle} />
      <div className="spectrum-labels" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>←</span>
          <div style={{ fontWeight: 600 }}>{data.left}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontWeight: 600 }}>{data.right}</div>
          <span style={{ fontSize: '18px' }}>→</span>
        </div>
      </div>

      {/* Instructions exactly as requested */}
      <div style={{ marginTop: '8px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: 6 }}>This is your clue!</h3>
        <p style={{ opacity: 0.9 }}>You're not allowed to say ANYTHING until the target is revealed!</p>
      </div>

      {/* Ready pill */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          marginTop: 20,
          padding: '14px 18px',
          borderRadius: 28,
          border: '1px solid #6B7280',
          background: 'rgba(255,255,255,0.05)',
          fontWeight: 700,
          letterSpacing: '0.5px'
        }}>
          {`0 OF ${others} PLAYERS READY`}
        </div>
      </div>
    </div>
  )
}

function OtherClueView({ data }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <h2 style={{ opacity: 0.9, letterSpacing: '1px' }}>CLUE</h2>
      <h1 style={{ fontSize: '56px', fontWeight: 800, margin: '8px 0 24px' }}>{data.clueText}</h1>
      <Gauge angle={data.angle} left={data.left} right={data.right} />
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontWeight: 700, fontSize: '24px' }}>This is their clue!</h3>
        <p style={{ opacity: 0.8 }}>You're not allowed to say ANYTHING until the target is revealed!</p>
      </div>
    </div>
  )
}

function Gauge({ angle = 90, left, right }) {
  const width = 600
  const height = 320
  const cx = width / 2
  const cy = height
  const r = Math.min(width, height * 2) * 0.48

  const polar = (a) => {
    const rad = (a * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
  }
  const leftPoint = polar(180)
  const rightPoint = polar(0)
  const knob = polar(angle)
  const bgPath = `M ${leftPoint.x} ${leftPoint.y} A ${r} ${r} 0 0 1 ${rightPoint.x} ${rightPoint.y} L ${cx} ${cy} Z`

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: 720 }}>
        <path d={bgPath} fill="#6BBBC0" stroke="#111827" strokeWidth="2" />
        <circle cx={knob.x} cy={knob.y} r="60" fill="#D12B42" stroke="#111827" strokeWidth="2" />
      </svg>
      <div style={{ position: 'relative', width: '100%', maxWidth: 720, marginTop: -20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>←</span>
            <strong>{left}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>{right}</strong>
            <span>→</span>
          </div>
        </div>
      </div>
    </div>
  )
}

