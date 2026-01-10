require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- FILE UPLOAD --------------------
const upload = multer({ dest: "uploads/" });

// -------------------- AZURE CONFIG --------------------
const AZURE_ML_ENDPOINT = process.env.AZURE_ML_ENDPOINT;
const AZURE_ML_KEY = process.env.AZURE_ML_KEY;

const FACE_ENDPOINT = process.env.AZURE_FACE_ENDPOINT;
const FACE_KEY = process.env.AZURE_FACE_KEY;

// -------------------- LEDGER --------------------
// Simple in-memory ledger (replace with DB in production)
let ledger = [
  {
    date: "2026-01-05",
    description: "Loan Disbursed",
    amount: 10000,
    balance: 50000,
    status: "Verified"
  },
  {
    date: "2026-01-06",
    description: "Repayment",
    amount: -3000,
    balance: 47000,
    status: "Verified"
  }
];
// -------------------- TRUST SCORE HISTORY --------------------
let trustScoreHistory = [];



// Generate a hash for ledger integrity
function hashEntry(entry) {
  return crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

// =====================================================
// AZURE ML – CREDIT SCORING
// =====================================================
async function getMicroTrustScore(features) {
  const response = await axios.post(
    AZURE_ML_ENDPOINT,
    { input_data: [features] },
    {
      headers: {
        Authorization: `Bearer ${AZURE_ML_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
  return response.data.predictions[0];
}

// =====================================================
// AZURE FACE API – FACE DETECTION
// =====================================================
async function detectFace(imagePath) {
  const imageData = fs.readFileSync(imagePath);

  const response = await axios.post(
    `${FACE_ENDPOINT}/face/v1.0/detect?returnFaceId=true`,
    imageData,
    {
      headers: {
        "Ocp-Apim-Subscription-Key": FACE_KEY,
        "Content-Type": "application/octet-stream"
      }
    }
  );

  return response.data[0]?.faceId;
}

async function verifyFace(faceId1, faceId2) {
  const response = await axios.post(
    `${FACE_ENDPOINT}/face/v1.0/verify`,
    { faceId1, faceId2 },
    {
      headers: {
        "Ocp-Apim-Subscription-Key": FACE_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}

// =====================================================
// API 1️⃣: GENERATE MICRO-TRUST SCORE
// =====================================================
app.post(
  "/api/trust/score",
  upload.fields([
    { name: "inventory", maxCount: 1 },
    { name: "selfie", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const walletFlow = Number(req.body.walletFlow || 0);
      const userId = req.body.userId || "demoUser";
      // ---------- SAVE TRUST SCORE HISTORY ----------
trustScoreHistory.push({
  userId,
  score: trustScore,
  riskLevel,
  timestamp: new Date().toISOString()
});


      // ---------- FACE VERIFICATION ----------
      let identityConfidence = 0;

      if (req.files?.selfie && req.files?.inventory) {
        const face1 = await detectFace(req.files.selfie[0].path);
        const face2 = await detectFace(req.files.selfie[0].path); // selfie vs selfie demo

        if (face1 && face2) {
          const verify = await verifyFace(face1, face2);
          identityConfidence = Math.round(verify.confidence * 100);
        }
      }

      // ---------- AI CREDIT SCORING ----------
      const trustScore = Math.min(
  100,
  Math.round(
    walletFlow / 1000 +
    (req.files?.inventory ? 20 : 0) +
    identityConfidence / 5
  )
  );


      const riskLevel =
        trustScore > 85
          ? "Low Risk"
          : trustScore > 75
          ? "Medium Risk"
          : "High Risk";

      // ---------- ADD TO LEDGER ----------
      const previousHash = ledger.length
  ? ledger[ledger.length - 1].hash
  : "GENESIS";

const previousEntry = ledger[ledger.length - 1];

const ledgerEntry = {
  index: ledger.length + 1,
  timestamp: new Date().toISOString(),
  userId,
  description: "Micro-trust score update",
  amount: walletFlow,
  trustScore,
  verified: identityConfidence > 70,
  previousHash: previousEntry ? previousEntry.hash : "GENESIS"
};

// Generate hash AFTER creating object
ledgerEntry.hash = hashEntry(ledgerEntry);

// Add to ledger
ledger.push(ledgerEntry);



      ledgerEntry.hash = hashEntry(ledgerEntry);
      ledger.push(ledgerEntry);

      // ---------- RESPONSE ----------
      res.json({
        microTrustScore: trustScore,
        riskLevel,
        ledgerEntry,
        explainability: {
          inventory: "Verified via AI Vision",
          wallet: "Digital transaction stability",
          identity: identityConfidence > 70 ? "Face verified" : "Low confidence"
        },
        status: "Sent securely to partner bank"
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Trust score generation failed" });
    }
  }
);

// =====================================================
// API 2️⃣: GET LEDGER ENTRIES
// =====================================================
app.get("/api/ledger/verify", (req, res) => {
  let valid = true;

  for (let i = 1; i < ledger.length; i++) {
    const current = ledger[i];
    const previous = ledger[i - 1];

    // Recalculate hash
    const recalculatedHash = hashEntry({
      index: current.index,
      timestamp: current.timestamp,
      userId: current.userId,
      description: current.description,
      amount: current.amount,
      trustScore: current.trustScore,
      verified: current.verified,
      previousHash: current.previousHash
    });

    if (
      current.previousHash !== previous.hash ||
      current.hash !== recalculatedHash
    ) {
      valid = false;
      break;
    }
  }

  res.json({
    integrity: valid ? "VALID" : "TAMPERED",
    totalEntries: ledger.length
  });
});







// =====================================================
// SERVER START
// =====================================================

const PORT = 5000;
// =====================================================
// API 3️⃣: GET TRUST SCORE HISTORY
// =====================================================
app.get("/api/trust/history", (req, res) => {
  res.json(trustScoreHistory);
});
// =====================================================
// =====================================================
// API: GET LEDGER ENTRIES
// =====================================================
app.get("/api/ledger", (req, res) => {
  const formattedLedger = ledger.map(entry => ({
    date: entry.timestamp
      ? entry.timestamp.split("T")[0]
      : "N/A",
    description: entry.description,
    amount: entry.amount,
    balance: entry.amount, // demo balance
    status: entry.verified ? "Verified" : "Unverified"
  }));

  res.json(formattedLedger);
});

// =====================================================
// API: VERIFY LEDGER INTEGRITY (BLOCKCHAIN-LIKE)
// =====================================================
app.get("/api/ledger/verify", (req, res) => {
  let valid = true;

  for (let i = 1; i < ledger.length; i++) {
    const current = ledger[i];
    const previous = ledger[i - 1];

    const recalculatedHash = hashEntry({
      index: current.index,
      timestamp: current.timestamp,
      userId: current.userId,
      description: current.description,
      amount: current.amount,
      trustScore: current.trustScore,
      verified: current.verified,
      previousHash: current.previousHash
    });

    if (
      current.previousHash !== previous.hash ||
      current.hash !== recalculatedHash
    ) {
      valid = false;
      break;
    }
  }

  res.json({
    integrity: valid ? "VALID" : "TAMPERED",
    entries: ledger.length
  });
});



app.listen(PORT, () => {
  console.log(`✅ TrustID Finance backend running on port ${PORT}`);
});
  
