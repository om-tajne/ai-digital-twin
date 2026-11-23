const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../db');

let razorpay;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn('⚠️ Razorpay keys are missing. Payment features will not work.');
}

// ============================================================
// CREATE RAZORPAY ORDER
// ============================================================
const createOrder = async (req, res) => {
  try {
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({
        success: false,
        message: 'student_id is required',
      });
    }

    if (!razorpay) {
      // Development / test fallback when Razorpay keys are not set
      const mockOrderId = `order_test_${Date.now()}`;
      await db.query(
        `
        INSERT INTO payments (
          payment_id,
          student_id,
          razorpay_order_id,
          amount,
          currency,
          status
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          'created'
        )
        `,
        [student_id, mockOrderId, 49900, 'INR']
      );

      return res.status(200).json({
        success: true,
        orderId: mockOrderId,
        amount: 49900,
        currency: 'INR',
        keyId: 'rzp_test_devMode',
        mockMode: true,
      });
    }

    // Create Razorpay order
    const options = {
      amount: 49900, // ₹499 in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Save payment/order in database
    await db.query(
      `
      INSERT INTO payments (
        payment_id,
        student_id,
        razorpay_order_id,
        amount,
        currency,
        status
      )
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5
      )
      `,
      [
        student_id,
        order.id,
        order.amount,
        order.currency,
        'created',
      ]
    );

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to create Razorpay order',
      error: error.message,
    });
  }
};


// ============================================================
// VERIFY RAZORPAY PAYMENT
// ============================================================
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: 'Payment details are required',
      });
    }

    // Verify signature
    if (process.env.RAZORPAY_KEY_SECRET) {
      const generatedSignature = crypto
        .createHmac(
          'sha256',
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed',
        });
      }
    }

    // Update payment in database
    const result = await db.query(
      `
      UPDATE payments
      SET
        razorpay_payment_id = $1,
        razorpay_signature = $2,
        status = $3,
        updated_at = NOW()
      WHERE razorpay_order_id = $4
      RETURNING *
      `,
      [
        razorpay_payment_id,
        razorpay_signature,
        'paid',
        razorpay_order_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment order not found in database',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and saved successfully',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });

  } catch (error) {
    console.error('Payment verification error:', error);

    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message,
    });
  }
};


// ============================================================
// RAZORPAY WEBHOOK HANDLER
// ============================================================
const handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
    }
    const signature = req.headers['x-razorpay-signature'];
    
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing signature' });
    }

    const body = req.rawBody ? req.rawBody : JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body;

    if (event.event === 'payment.captured' || event.event === 'payment.authorized') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;
      
      const updateRes = await db.query(
        `UPDATE payments
         SET status = $1, razorpay_payment_id = $2, updated_at = NOW()
         WHERE razorpay_order_id = $3
         RETURNING student_id`,
        ['paid', paymentId, orderId]
      );
      
      if (updateRes.rows.length > 0) {
        const studentId = updateRes.rows[0].student_id;
        await db.query(
          `UPDATE students
           SET is_pro = TRUE
           WHERE student_id = $1`,
          [studentId]
        );
      }
    } else if (event.event === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      
      const updateRes = await db.query(
        `UPDATE payments
         SET status = $1, updated_at = NOW()
         WHERE razorpay_order_id = $2
         RETURNING student_id`,
        ['failed', orderId]
      );
      
      if (updateRes.rows.length > 0) {
         const studentId = updateRes.rows[0].student_id;
         await db.query(
           `UPDATE students
            SET is_pro = FALSE
            WHERE student_id = $1`,
           [studentId]
         );
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed', error: error.message });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  handleWebhook,
};