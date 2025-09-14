const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- MongoDB ----------------
mongoose.connect("mongodb://127.0.0.1:27017/event_registration", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.error("❌ MongoDB Error:",err));

// ---------------- Schema ----------------
const registrationSchema = new mongoose.Schema({
  name:String,
  email:String,
  phone:String,
  event:String,
  paymentStatus:{type:String,default:"pending_payment"},
  amountPaid:{type:Number,default:0},
  payerName:String,
  transactionId:String
});
const Registration = mongoose.model("Registration",registrationSchema);

// ---------------- Registration ----------------
app.post("/api/register",async(req,res)=>{
  try{
    const registration=new Registration(req.body);
    await registration.save();
    res.json({id:registration._id});
  }catch(err){res.status(500).json({error:"Failed to register"});}
});

// ---------------- Google Pay Notification ----------------
app.post("/api/gpay-notification",async(req,res)=>{
  try{
    const {registrationId,amountPaid,payerName,transactionId}=req.body;
    if(!registrationId || !amountPaid) return res.status(400).json({error:"registrationId and amountPaid required"});
    const registration=await Registration.findByIdAndUpdate(
      registrationId,
      {amountPaid,paymentStatus:"completed",payerName,transactionId},
      {new:true}
    );
    console.log(`✅ Payment Updated: ${payerName}, TxID: ${transactionId}, Amount: ${amountPaid}`);
    res.json({success:true,registration});
  }catch(err){console.error(err);res.status(500).json({error:"Failed to update payment"});}
});

// ---------------- Serve Frontend ----------------
app.use(express.static(path.join(__dirname,"public")));
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

// ---------------- Start Server ----------------
const PORT=5000;
app.listen(PORT,()=>console.log(`🚀 Server running at http://localhost:${PORT}`));
