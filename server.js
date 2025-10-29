import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'

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
      createdAt: Date.now()
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
