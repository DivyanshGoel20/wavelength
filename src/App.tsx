import React, { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'

// WebSocket connection
const socket: Socket = io('http://localhost:3001', {
  autoConnect: false
})

function App() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [gameRoom, setGameRoom] = useState<any>(null)
  const [joinError, setJoinError] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  // WebSocket event handlers
  useEffect(() => {
    if (!socket.connected) {
      socket.connect()
    }

    const onConnect = () => {
      console.log('Connected to server')
      setIsConnected(true)
    }
    const onDisconnect = () => {
      console.log('Disconnected from server')
      setIsConnected(false)
    }
    const onRoomCreated = (roomData: any) => {
      console.log('Room created:', roomData)
      setGameRoom(roomData)
      setRoomCode(roomData.code)
    }
    const onRoomJoined = (roomData: any) => {
      console.log('Room joined:', roomData)
      setGameRoom(roomData)
      setRoomCode(roomData.code)
      setJoinError('')
      setShowJoinModal(false)
    }
    const onRoomError = (error: any) => {
      console.log('Room error:', error)
      setJoinError(error.message)
    }
    const onPlayerJoined = (roomData: any) => {
      console.log('Player joined:', roomData)
      setGameRoom(roomData)
    }
    const onPlayerLeft = (roomData: any) => {
      console.log('Player left:', roomData)
      setGameRoom(roomData)
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

    // Cleanup
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room-created', onRoomCreated)
      socket.off('room-joined', onRoomJoined)
      socket.off('room-error', onRoomError)
      socket.off('player-joined', onPlayerJoined)
      socket.off('player-left', onPlayerLeft)
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
    
    // Send create room request to server
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
    
    // Send join room request to server
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

      {/* Game Room Screen */}
      {gameRoom && (
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
                    {gameRoom.players.map((player: string, index: number) => (
                      <li key={index} className={index === 0 ? 'host' : ''}>
                        {player} {index === 0 && '(Host)'}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App