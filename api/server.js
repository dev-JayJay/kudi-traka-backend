// const express = require('express');
// const cors = require('cors');

// const app = express();
// app.use(cors());
// app.use(express.json());

// let transactions = [];

// app.post('/save-transaction', (req, res) => {
//   const { text } = req.body;

//   // Parse the text for transaction details
//   const match = text.match(/save (\w+) transaction #(\d+) charges #(\d+)/i);
//   if (match) {
//     const [, type, amount, charges] = match;
//     const transaction = {
//       type,
//       amount: parseFloat(amount),
//       charges: parseFloat(charges),
//       date: new Date().toISOString(),
//     };
//     transactions.push(transaction);

//     return res.json({ message: Transaction saved!, transaction });
//   }

//   res.status(400).json({ message: "Invalid transaction format!" });
// });

// app.get('/transaction-summary', (req, res) => {
//   const today = new Date().toISOString().split('T')[0];
//   const todayTransactions = transactions.filter(t =>
//     t.date.startsWith(today)
//   );

//   const summary = todayTransactions.reduce(
//     (acc, t) => {
//       acc.totalAmount += t.amount;
//       acc.totalCharges += t.charges;
//       acc.types[t.type] = (acc.types[t.type] || 0) + t.amount;
//       return acc;
//     },
//     { totalAmount: 0, totalCharges: 0, types: {} }
//   );

//   res.json({ summary, transactions: todayTransactions });
// });

// app.listen(5000, () => console.log("Server running on http://localhost:5000"));


const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://kudi-traka.vercel.app'], // Allow both origins
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'], 
  },
});
require("dotenv").config();

// Middleware
app.use(cors({ 
  origin: ["http://localhost:3000", "https://kudi-traka.vercel.app"] 
}));
app.use(bodyParser.json());

// Connect to MongoDB
const connectDB = async () => {
  try {
    const dbUri = process.env.MONGO_URI;
    console.log("Connecting to MongoDB...");
    await mongoose.connect(dbUri);
    console.log("mongoose connected");
  } catch (error) {
    console.error("mongoose did not connect", error);
    process.exit(1);
  }
};
connectDB();

const db = mongoose.connection;
db.on("error", console.error.bind(console, "Connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

// Message Schema and Model
const messageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  sender: { type: String, enum: ["user", "admin"], required: true },
  recipient: { type: String, default: "admin" },
  createdAt: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// Store connected users and admin socket ID
const connectedUsers = {};
let adminSocketId = null;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Register admin
  socket.on("register_admin", () => {
    adminSocketId = socket.id;
    console.log(`Admin connected: ${socket.id}`);
  });

  // Register user
  socket.on("register", ({ userId }) => {
    connectedUsers[userId] = socket.id;
    console.log(`User registered: ${userId} -> ${socket.id}`);
  });

  // Handle user message
  socket.on("user_message", async ({ userId, message }) => {
    try {
      const newMessage = new Message({
        text: message,
        sender: "user",
        recipient: "admin",
      });
      await newMessage.save();

      console.log("Message saved and emitting to admin:", newMessage);

      // Notify admin if connected
      if (adminSocketId) {
        io.to(adminSocketId).emit("new_user_message", {
          ...newMessage.toObject(),
          userId,
          socketId: socket.id,
        });
      }
    } catch (error) {
      console.error("Error saving user message:", error);
    }
  });

  // Handle admin response
  socket.on("admin_message", async ({ message, userSocketId }) => {
    try {
      const newMessage = new Message({
        text: message,
        sender: "admin",
        recipient: userSocketId,
      });
      await newMessage.save();

      console.log("Admin response saved and emitting to user:", newMessage);

      // Notify the specific user
      if (userSocketId) {
        io.to(userSocketId).emit("receive_response", newMessage);
      }
    } catch (error) {
      console.error("Error saving admin response:", error);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (const userId in connectedUsers) {
      if (connectedUsers[userId] === socket.id) {
        delete connectedUsers[userId];
        console.log(`Removed user from active list: ${userId}`);
        break;
      }
    }
  });
});

app.get('/', (req, res) => {
  res.status(200).send('server is runing on forward slash and set mongo IP to anywhere');
  console.log(`checking the check`);
})
app.get('/check', (req, res) => {
  res.status(200).send('server is runing on this url');
  console.log(`checking the check`);
})

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});