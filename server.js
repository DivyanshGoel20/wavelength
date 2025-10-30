import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const server = http.createServer(app)

// Enable CORS for all origins
app.use(cors())

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// Resolve project directory in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load clues once at startup
let clues = []
try {
  const cluesPath = path.join(__dirname, 'clues.json')
  const raw = fs.readFileSync(cluesPath, 'utf-8')
  clues = JSON.parse(raw)
  if (!Array.isArray(clues)) clues = []
} catch (e) {
  console.error('Failed to load clues.json:', e)
  clues = []
}

// Store active rooms
const rooms = new Map()
// Track which socket belongs to which room and player
const socketToPlayer = new Map()

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  // Handle room creation
  socket.on('create-room', (data) => {
    const { code, host, playerName } = data
    const roomCode = String(code).toUpperCase()
    
    if (rooms.has(roomCode)) {
      socket.emit('room-error', { message: 'Room already exists!' })
      return
    }

    const roomData = {
      code: roomCode,
      host,
      players: [playerName],
      status: 'waiting',
      createdAt: Date.now(),
      submissions: {},
      scores: {}
    }

    rooms.set(roomCode, roomData)
    socket.join(roomCode)
    socketToPlayer.set(socket.id, { code: roomCode, playerName })
    
    console.log('Room created:', roomCode)
    socket.emit('room-created', roomData)
  })

  // Handle room joining
  socket.on('join-room', (data) => {
    const { code, playerName } = data
    const roomCode = String(code).toUpperCase()
    
    if (!rooms.has(roomCode)) {
      socket.emit('room-error', { message: 'Room not found!' })
      return
    }

    const room = rooms.get(roomCode)
    
    // Check if player already exists
    if (room.players.includes(playerName)) {
      socket.emit('room-error', { message: 'Player name already taken!' })
      return
    }

    // Add player to room
    room.players.push(playerName)
    rooms.set(roomCode, room)
    
    socket.join(roomCode)
    socketToPlayer.set(socket.id, { code: roomCode, playerName })
    
    console.log('Player joined:', playerName, 'to room:', roomCode)
    
    // Notify the joining player
    socket.emit('room-joined', room)
    
    // Notify all other players in the room
    socket.to(roomCode).emit('player-joined', room)
  })

  // Handle leaving room
  socket.on('leave-room', (data) => {
    const providedCode = data && data.code ? String(data.code).toUpperCase() : undefined
    const mapping = socketToPlayer.get(socket.id)
    const roomCode = providedCode || (mapping && mapping.code)

    if (!roomCode || !rooms.has(roomCode)) {
      return
    }

    const room = rooms.get(roomCode)
    const nameToRemove = (mapping && mapping.playerName) || (data && data.playerName)
    
    if (nameToRemove) {
      room.players = room.players.filter(p => p !== nameToRemove)
    }

        if (room.players.length === 0) {
      rooms.delete(roomCode)
      console.log('Room deleted:', roomCode)
        } else {
      rooms.set(roomCode, room)
          // Notify remaining players
      socket.to(roomCode).emit('player-left', room)
    }
    
    socket.leave(roomCode)
    socketToPlayer.delete(socket.id)
    console.log('Player left room:', roomCode)
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
    const mapping = socketToPlayer.get(socket.id)
    if (!mapping) {
      return
    }
    const { code: roomCode, playerName } = mapping
    if (!rooms.has(roomCode)) {
      socketToPlayer.delete(socket.id)
      return
    }
    const room = rooms.get(roomCode)
    room.players = room.players.filter(p => p !== playerName)
    if (room.players.length === 0) {
      rooms.delete(roomCode)
      console.log('Room deleted:', roomCode)
    } else {
      rooms.set(roomCode, room)
      socket.to(roomCode).emit('player-left', room)
    }
    socketToPlayer.delete(socket.id)
  })

  // Handle starting the game (host only)
  socket.on('start-game', async (data) => {
    const { code, playerName } = data || {}
    const roomCode = String(code || '').toUpperCase()
    if (!roomCode || !rooms.has(roomCode)) {
      socket.emit('room-error', { message: 'Room not found!' })
      return
    }
    const room = rooms.get(roomCode)
    if (room.host !== playerName) {
      socket.emit('room-error', { message: 'Only the host can start the game!' })
      return
    }
    if (!Array.isArray(room.players) || room.players.length < 2) {
      socket.emit('room-error', { message: 'Need at least 2 players to start.' })
      return
    }
    if (!Array.isArray(clues) || clues.length === 0) {
      socket.emit('room-error', { message: 'No clues available.' })
      return
    }

    // Assign a unique random clue to each player in the room
    const socketIds = await io.in(roomCode).allSockets()
    const count = socketIds.size
    const available = clues.slice()
    // Simple shuffle (Fisher–Yates)
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = available[i]; available[i] = available[j]; available[j] = tmp
    }

    room.status = 'in_progress'
    rooms.set(roomCode, room)

    let index = 0
    for (const id of socketIds) {
      const assigned = available[index % available.length]
      io.to(id).emit('game-started', { code: roomCode, clue: assigned })
      index++
    }
  })

  // Store a player's submission (angle + clue)
  socket.on('submit-clue', (data) => {
    const { code, playerName, angle, clue, left, right } = data || {}
    const roomCode = String(code || '').toUpperCase()
    if (!roomCode || !rooms.has(roomCode)) {
      socket.emit('room-error', { message: 'Room not found!' })
      return
    }
    const room = rooms.get(roomCode)
    if (!room.submissions) room.submissions = {}
    room.submissions[playerName] = {
      angle: Number(angle),
      clue: String(clue || ''),
      left: left,
      right: right,
      submittedAt: Date.now(),
      socketId: socket.id
    }
    rooms.set(roomCode, room)
    socket.emit('clue-submitted', { ok: true })
    socket.to(roomCode).emit('player-submitted', { playerName })

    // If all players have submitted, notify room
    const totalPlayers = Array.isArray(room.players) ? room.players.length : 0
    const submittedCount = Object.keys(room.submissions || {}).length
    if (totalPlayers > 0 && submittedCount >= totalPlayers) {
      io.to(roomCode).emit('all-submitted', { code: roomCode, submittedCount, totalPlayers })
    }
  })

  // Placeholder for round start (no-op logic for now)
  socket.on('start-round', (data) => {
    const { code, playerName } = data || {}
    const roomCode = String(code || '').toUpperCase()
    if (!roomCode || !rooms.has(roomCode)) return
    const room = rooms.get(roomCode)
    if (room.host !== playerName) return

    const order = Array.isArray(room.players) ? room.players.slice() : []
    const submissions = room.submissions || {}
    // Pick the first player who has a submission
    const first = order.find(p => submissions[p])
    if (!first) {
      io.to(roomCode).emit('room-error', { message: 'No submissions to present yet.' })
      return
    }

    room.round = { index: 0, order, presenter: first, ready: {} }
    rooms.set(roomCode, room)

    // Intro screen (5s)
    io.to(roomCode).emit('show-clue-giver', { code: roomCode, presenter: first })

    setTimeout(() => {
      const latest = rooms.get(roomCode)
      if (!latest) return
      const presenter = latest.round && latest.round.order ? latest.round.order[0] : first
      latest.round.presenter = presenter
      latest.round.ready = {}
      rooms.set(roomCode, latest)
      const sub = (latest.submissions || {})[presenter]
      if (!sub) return
      io.to(roomCode).emit('present-clue', {
        code: roomCode,
        presenter,
        angle: sub.angle,
        clueText: sub.clue,
        left: sub.left,
        right: sub.right
      })
      // Broadcast initial ready state
      const totalOthers = (latest.players ? latest.players.length : 0) - 1
      io.to(roomCode).emit('ready-updated', { code: roomCode, readyCount: 0, totalOthers })
    }, 5000)
  })

  // Toggle player's ready state during presentation
  socket.on('player-ready', (data) => {
    const { code, playerName, ready, guessAngle } = data || {}
    const roomCode = String(code || '').toUpperCase()
    if (!roomCode || !rooms.has(roomCode)) return
    const room = rooms.get(roomCode)
    if (!room.round) return
    if (!room.round.ready) room.round.ready = {}
    if (!room.round.guesses) room.round.guesses = {}
    room.round.ready[playerName] = !!ready
    if (typeof guessAngle === 'number') {
      room.round.guesses[playerName] = Number(guessAngle)
    }
    rooms.set(roomCode, room)
    const presenter = room.round.presenter
    const totalOthers = (room.players ? room.players.length : 0) - 1
    const readyCount = Object.entries(room.round.ready)
      .filter(([name, val]) => name !== presenter && val).length
    io.to(roomCode).emit('ready-updated', { code: roomCode, readyCount, totalOthers, playerName, ready: !!ready })

    // If all non-presenters are ready, begin reveal sequence
    if (totalOthers > 0 && readyCount >= totalOthers) {
      io.to(roomCode).emit('reveal-start', { code: roomCode })
      const sub = (room.submissions || {})[presenter]
      const angle = sub ? Number(sub.angle) : 90
      const scores = {}
      try {
        const bands = computeBands(angle)
        room.players.forEach((p) => {
          if (p === presenter) return
          const g = room.round.guesses ? room.round.guesses[p] : undefined
          scores[p] = { points: pointsForAngle(g, bands), guessAngle: g }
        })
        // accumulate
        room.scores = room.scores || {}
        Object.keys(scores).forEach((p) => {
          room.scores[p] = (room.scores[p] || 0) + (scores[p].points || 0)
        })
        rooms.set(roomCode, room)
      } catch (e) {}
      setTimeout(() => {
        io.to(roomCode).emit('reveal-target', {
          code: roomCode,
          presenter,
          angle,
          left: sub && sub.left,
          right: sub && sub.right,
          clueText: sub && sub.clue,
          scores,
          isLastCycle: room.round && room.round.index === (room.round.order.length - 1)
        })
      }, 1500)
    }
  })

  // Move to next presenter/round (host only)
  socket.on('next-round', (data) => {
    const { code, playerName } = data || {}
    const roomCode = String(code || '').toUpperCase()
    if (!roomCode || !rooms.has(roomCode)) return
    const room = rooms.get(roomCode)
    if (room.host !== playerName) return
    if (!room.round || !Array.isArray(room.round.order) || room.round.order.length === 0) return

    const order = room.round.order
    const nextIndex = ((room.round.index || 0) + 1) % order.length
    const presenter = order[nextIndex]
    room.round.index = nextIndex
    room.round.presenter = presenter
    room.round.ready = {}
    rooms.set(roomCode, room)

    io.to(roomCode).emit('show-clue-giver', { code: roomCode, presenter })

    setTimeout(() => {
      const latest = rooms.get(roomCode)
      if (!latest) return
      const sub = (latest.submissions || {})[presenter]
      if (!sub) return
      io.to(roomCode).emit('present-clue', {
        code: roomCode,
        presenter,
        angle: sub.angle,
        clueText: sub.clue,
        left: sub.left,
        right: sub.right
      })
      const totalOthers = (latest.players ? latest.players.length : 0) - 1
      io.to(roomCode).emit('ready-updated', { code: roomCode, readyCount: 0, totalOthers })
    }, 5000)
  })

  // End game and send leaderboard
  socket.on('end-game', (data) => {
    const { code, playerName } = data || {}
    const roomCode = String(code || '').toUpperCase()
    console.log('[server] end-game received', { roomCode, playerName })
    if (!roomCode || !rooms.has(roomCode)) {
      console.log('[server] end-game rejected: room not found', { roomCode })
      return
    }
    const room = rooms.get(roomCode)
    if (room.host !== playerName) {
      console.log('[server] end-game rejected: not host', { expectedHost: room.host, playerName })
      return
    }
    const scores = room.scores || {}
    const leaderboard = Object.entries(scores)
      .map(([name, pts]) => ({ name, points: pts }))
      .sort((a,b) => b.points - a.points)
    console.log('[server] emitting game-ended', { roomCode, entries: leaderboard.length })
    io.to(roomCode).emit('game-ended', { code: roomCode, leaderboard })
  })

  function computeBands(rotationDeg) {
    const wedgeHalf = 6
    const pointsArr = [2,3,4,3,2]
    const bands = []
    let cursor = rotationDeg - wedgeHalf * 5
    for (let i=0;i<5;i++) {
      const start = cursor
      const end = cursor + wedgeHalf*2
      bands.push({ start, end, points: pointsArr[i] })
      cursor = end
    }
    return bands
  }

  function pointsForAngle(angleDeg, bands) {
    if (typeof angleDeg !== 'number') return 0
    for (const b of bands) {
      if (angleDeg >= b.start && angleDeg <= b.end) return b.points
    }
    return 0
  }

  // Provide a new random clue to a single requester
  socket.on('new-spectrum', (data) => {
    const { code } = data || {}
    const roomCode = String(code || '').toUpperCase()
    if (!Array.isArray(clues) || clues.length === 0) {
      socket.emit('room-error', { message: 'No clues available.' })
      return
    }
    if (!roomCode || !rooms.has(roomCode)) {
      // still allow a clue even if room mapping missing, but keep behavior simple
      const randomIndex = Math.floor(Math.random() * clues.length)
      socket.emit('clue-updated', { clue: clues[randomIndex] })
      return
    }
    const randomIndex = Math.floor(Math.random() * clues.length)
    const clue = clues[randomIndex]
    socket.emit('clue-updated', { code: roomCode, clue })
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  })
})

// Get active rooms (for debugging)
app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([code, room]) => ({
    code,
    players: room.players.length,
    status: room.status,
    createdAt: room.createdAt
  }))
  
  res.json({ rooms: roomList })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📡 Socket.IO server ready`)
  console.log(`🌐 Health check: http://localhost:${PORT}/health`)
  console.log(`📊 Active rooms: http://localhost:${PORT}/rooms`)
})
