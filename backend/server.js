import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'https://tutedude-assignment-eight.vercel.app',
    'https://tutedude-assignment-black.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://rajivkumarbth111_db_user:SHOYeRpG0q8fDGFG@cluster0.dpzlrbs.mongodb.net/tutedude-proctoring?retryWrites=true&w=majority&appName=Cluster0';
    console.log('🔍 Connecting to MongoDB with URI:', mongoUri.substring(0, 30) + '...');
    
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Event Schema
const EventSchema = new mongoose.Schema({
  candidateId: {
    type: String,
    required: true,
    trim: true
  },
  candidateName: {
    type: String,
    required: true,
    trim: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'face', 'no-face', 'multiple-faces', 'look-away', 'focus-lost',
      'phone-detected', 'notes-detected', 'book', 'laptop', 'keyboard', 
      'mouse', 'notebook', 'paper', 'object-cleared', 'interview-start', 
      'interview-end'
    ]
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sessionId: {
    type: String,
    required: true
  }
}, {
  timestamps: true,
  collection: 'proctoring_events'
});

// Index for better query performance
EventSchema.index({ candidateId: 1, timestamp: -1 });
EventSchema.index({ sessionId: 1 });

const Event = mongoose.model('Event', EventSchema);

// Interview Session Schema for additional tracking
const SessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  candidateId: {
    type: String,
    required: true
  },
  candidateName: {
    type: String,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number // in minutes
  },
  integrityScore: {
    type: Number,
    default: 100
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'terminated'],
    default: 'active'
  }
}, {
  timestamps: true,
  collection: 'interview_sessions'
});

const Session = mongoose.model('Session', SessionSchema);

// Routes

// Root route - API Information
app.get('/', (req, res) => {
  res.json({
    message: '🎥 Tutedude Proctoring System API',
    status: 'Active',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      events: 'POST /events',
      reports: 'GET /reports/:candidateId',
      csv: 'GET /report/csv/:candidateId',
      sessions: 'GET /sessions/:sessionId'
    },
    frontend: 'https://tutedude-assignment-black.vercel.app',
    documentation: 'https://github.com/iwanturequity/Tutedude-assignment',
    timestamp: new Date().toISOString()
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Tutedude Proctoring Backend is running',
    timestamp: new Date().toISOString(),
    database: 'connected',
    frontend: 'https://tutedude-assignment-black.vercel.app'
  });
});

// POST /events - Save a new event log
app.post('/events', async (req, res) => {
  try {
    const { candidateId, candidateName, eventType, message, meta, sessionId } = req.body;

    // Validation
    if (!candidateId || !candidateName || !eventType || !message || !sessionId) {
      return res.status(400).json({
        error: 'Missing required fields: candidateId, candidateName, eventType, message, sessionId'
      });
    }

    // Create new event
    const newEvent = new Event({
      candidateId: candidateId.trim(),
      candidateName: candidateName.trim(),
      eventType,
      message,
      meta: meta || {},
      sessionId,
      timestamp: new Date()
    });

    const savedEvent = await newEvent.save();
    
    console.log(`📝 Event logged: ${eventType} for ${candidateName} (${candidateId})`);
    
    res.status(201).json({
      success: true,
      message: 'Event logged successfully',
      event: savedEvent
    });

  } catch (error) {
    console.error('❌ Error saving event:', error);
    res.status(500).json({
      error: 'Failed to save event',
      details: error.message
    });
  }
});

// POST /sessions - Create or update interview session
app.post('/sessions', async (req, res) => {
  try {
    const { sessionId, candidateId, candidateName, startTime, endTime, integrityScore, status } = req.body;

    if (!sessionId || !candidateId || !candidateName) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, candidateId, candidateName'
      });
    }

    // Try to update existing session or create new one
    const sessionData = {
      sessionId,
      candidateId: candidateId.trim(),
      candidateName: candidateName.trim(),
      startTime: startTime || new Date(),
      status: status || 'active'
    };

    if (endTime) {
      sessionData.endTime = new Date(endTime);
      sessionData.duration = Math.round((new Date(endTime) - new Date(sessionData.startTime)) / (1000 * 60));
      sessionData.status = 'completed';
    }

    if (integrityScore !== undefined) {
      sessionData.integrityScore = integrityScore;
    }

    const session = await Session.findOneAndUpdate(
      { sessionId },
      sessionData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Session updated successfully',
      session
    });

  } catch (error) {
    console.error('❌ Error updating session:', error);
    res.status(500).json({
      error: 'Failed to update session',
      details: error.message
    });
  }
});

// GET /reports/:candidateId - Get all events for a candidate
app.get('/reports/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { sessionId } = req.query;

    // Build query
    const query = { candidateId };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const events = await Event.find(query)
      .sort({ timestamp: 1 })
      .lean();

    // Get session info if available
    const sessionQuery = { candidateId };
    if (sessionId) {
      sessionQuery.sessionId = sessionId;
    }
    
    const session = await Session.findOne(sessionQuery)
      .sort({ createdAt: -1 })
      .lean();

    // Calculate statistics
    const stats = {
      totalEvents: events.length,
      focusLostCount: events.filter(e => e.eventType === 'look-away' || e.eventType === 'focus-lost').length,
      suspiciousEvents: events.filter(e => 
        ['multiple-faces', 'no-face', 'phone-detected', 'notes-detected', 'book', 'laptop'].includes(e.eventType)
      ).length,
      integrityScore: session?.integrityScore || (100 - (
        events.filter(e => e.eventType === 'look-away').length * 5 +
        events.filter(e => ['multiple-faces', 'no-face', 'phone-detected', 'notes-detected'].includes(e.eventType)).length * 10
      ))
    };

    res.json({
      success: true,
      candidateId,
      candidateName: events[0]?.candidateName || 'Unknown',
      session: session || null,
      statistics: stats,
      events,
      totalEvents: events.length
    });

  } catch (error) {
    console.error('❌ Error fetching reports:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      details: error.message
    });
  }
});

// GET /report/csv/:candidateId - Download CSV report
app.get('/report/csv/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { sessionId } = req.query;

    // Build query
    const query = { candidateId };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const events = await Event.find(query)
      .sort({ timestamp: 1 })
      .lean();

    if (events.length === 0) {
      return res.status(404).json({
        error: 'No events found for this candidate'
      });
    }

    // Get session info
    const sessionQuery = { candidateId };
    if (sessionId) {
      sessionQuery.sessionId = sessionId;
    }
    
    const session = await Session.findOne(sessionQuery)
      .sort({ createdAt: -1 })
      .lean();

    // Calculate statistics
    const focusLostCount = events.filter(e => e.eventType === 'look-away' || e.eventType === 'focus-lost').length;
    const suspiciousEvents = events.filter(e => 
      ['multiple-faces', 'no-face', 'phone-detected', 'notes-detected', 'book', 'laptop'].includes(e.eventType)
    ).length;
    const integrityScore = session?.integrityScore || (100 - (focusLostCount * 5 + suspiciousEvents * 10));

    // Generate CSV content
    const candidateName = events[0]?.candidateName || 'Unknown';
    const startTime = session?.startTime || events[0]?.timestamp;
    const endTime = session?.endTime || events[events.length - 1]?.timestamp;
    const duration = session?.duration || Math.round((new Date(endTime) - new Date(startTime)) / (1000 * 60));

    let csvContent = '';
    
    // Summary Section
    csvContent += 'PROCTORING REPORT SUMMARY\\n';
    csvContent += '========================\\n';
    csvContent += `Candidate Name,${candidateName}\\n`;
    csvContent += `Candidate ID,${candidateId}\\n`;
    csvContent += `Interview Start Time,${new Date(startTime).toISOString()}\\n`;
    csvContent += `Interview End Time,${new Date(endTime).toISOString()}\\n`;
    csvContent += `Interview Duration (minutes),${duration}\\n`;
    csvContent += `Focus Lost Count,${focusLostCount}\\n`;
    csvContent += `Suspicious Events Count,${suspiciousEvents}\\n`;
    csvContent += `Integrity Score,${integrityScore}\\n`;
    csvContent += `Total Events Logged,${events.length}\\n`;
    csvContent += '\\n';
    
    // Events Section
    csvContent += 'DETAILED EVENT LOGS\\n';
    csvContent += '==================\\n';
    csvContent += 'Event Type,Message,Timestamp,Session ID\\n';
    
    events.forEach(event => {
      const timestamp = new Date(event.timestamp).toISOString();
      const message = event.message.replace(/,/g, ';'); // Replace commas to avoid CSV issues
      csvContent += `${event.eventType},${message},${timestamp},${event.sessionId}\\n`;
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ProctoringReport_${candidateId}_${Date.now()}.csv"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log(`📊 CSV report generated for ${candidateName} (${candidateId})`);
    
    res.status(200).send(csvContent);

  } catch (error) {
    console.error('❌ Error generating CSV report:', error);
    res.status(500).json({
      error: 'Failed to generate CSV report',
      details: error.message
    });
  }
});

// GET /sessions/:sessionId - Get session details
app.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOne({ sessionId }).lean();
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    const events = await Event.find({ sessionId })
      .sort({ timestamp: 1 })
      .lean();

    res.json({
      success: true,
      session,
      eventsCount: events.length,
      events
    });

  } catch (error) {
    console.error('❌ Error fetching session:', error);
    res.status(500).json({
      error: 'Failed to fetch session',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔴 Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Connect to MongoDB and start server
const startServer = async () => {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 CORS enabled for frontend origins`);
  });
};

startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
