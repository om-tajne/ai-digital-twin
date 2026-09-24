require('dotenv').config({ path: '../.env' });

const crypto = require('crypto');

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!secret) {
  console.log('RAZORPAY_WEBHOOK_SECRET is missing');
  process.exit(1);
}

const payload = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_test_123",
        order_id: "order_test_123",
        amount: 50000,
        currency: "INR",
        status: "captured"
      }
    }
  }
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

console.log("Sending signed test webhook...");

fetch("https://delicacy-repossess-hut.ngrok-free.dev/api/payment/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-razorpay-signature": signature
  },
  body: payload
})
  .then(async (response) => {
    console.log("HTTP Status:", response.status);
    console.log("Response:", await response.text());
  })
  .catch((error) => {
    console.error("Request failed:", error.message);
  });