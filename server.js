require("dotenv").config(); // load .env
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");


const app = express();
app.use(cors());
app.use(express.json());

// ✅ Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/event_registration", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ✅ Schema & Model
const registrationSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  event: String,
  paymentStatus: { type: String, default: "pending_payment" },
  amountPaid: { type: Number, default: 0 },
});

const Registration = mongoose.model("Registration", registrationSchema);

// ✅ API: Registration (Step 1)
app.post("/api/register", async (req, res) => {
  try {
    const registration = new Registration(req.body);
    await registration.save();
    res.json({ id: registration._id }); // send back ID
  } catch (err) {
    res.status(500).json({ error: "Failed to register" });
  }
});

// -------------------- PAYPAL --------------------

// Helper: get PayPal access token
async function getPayPalAccessToken() {
  const auth = Buffer.from(
    process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET
  ).toString("base64");

const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});


  const data = await res.json();
  return data.access_token;
}

// Create order
app.post("/api/paypal/order", async (req, res) => {
  try {
    const { amount } = req.body;
    const accessToken = await getPayPalAccessToken();

    const orderRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: amount.toString(),
            },
          },
        ],
      }),
    });

    const orderData = await orderRes.json();
    res.json(orderData); // send order ID to frontend
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create PayPal order" });
  }
});

// Capture payment
// Capture payment
app.post("/api/paypal/capture", async (req, res) => {
  try {
    const { orderID, registrationId } = req.body;
    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const captureData = await captureRes.json();

    // 🛠 Check if payment succeeded
    if (
      captureData.status !== "COMPLETED" ||
      !captureData.purchase_units
    ) {
      console.error("❌ PayPal Capture Failed:", captureData);
      return res.status(400).json({ error: "Payment not completed", captureData });
    }

    const paidAmount =
      captureData.purchase_units[0].payments.captures[0].amount.value;

    // ✅ Update MongoDB registration with payment info
    const registration = await Registration.findByIdAndUpdate(
      registrationId,
      { amountPaid: paidAmount, paymentStatus: "completed" },
      { new: true }
    );

    res.json({ registration, captureData });
  } catch (err) {
    console.error("❌ Error in capture:", err);
    res.status(500).json({ error: "Failed to capture PayPal payment" });
  }
});


// -------------------- END PAYPAL --------------------

// ✅ Serve Frontend (index.html inside public/)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
