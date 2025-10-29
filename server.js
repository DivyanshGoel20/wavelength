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
      submissions: {}
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
    const { code, playerName, angle, clue } = data || {}
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
    io.to(roomCode).emit('round-started', { code: roomCode })
  })

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
