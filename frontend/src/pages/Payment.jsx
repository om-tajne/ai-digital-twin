import { useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";

    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
};

function Payment() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handlePayment = async () => {
    try {
      setLoading(true);
      setMessage("");

      // Get logged-in student
      const storedUser = localStorage.getItem("user");

      if (!storedUser) {
        setMessage("Please login first.");
        setLoading(false);
        return;
      }

      const user = JSON.parse(storedUser);

      const studentId =
        user.student_id ||
        user.studentId ||
        user.id ||
        user.user?.student_id;

      if (!studentId) {
        console.error("User data:", user);
        setMessage("Student ID not found. Please login again.");
        setLoading(false);
        return;
      }

      // Load Razorpay Checkout
      const razorpayLoaded = await loadRazorpayScript();

      if (!razorpayLoaded) {
        setMessage("Razorpay Checkout failed to load.");
        setLoading(false);
        return;
      }

      // Create order from Node backend
      const response = await fetch(
        `${API_BASE_URL}/payment/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            student_id: studentId,
          }),
        }
      );

      const orderData = await response.json();

      if (!response.ok || !orderData.success) {
        throw new Error(
          orderData.message || "Failed to create payment order"
        );
      }

      if (orderData.mockMode) {
        // Immediate local test checkout verification
        const verifyResponse = await fetch(
          `${API_BASE_URL}/payment/verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              razorpay_order_id: orderData.orderId,
              razorpay_payment_id: `pay_test_${Date.now()}`,
              razorpay_signature: "mock_signature_dev",
            }),
          }
        );

        const verifyData = await verifyResponse.json();
        if (verifyResponse.ok && verifyData.success) {
          setMessage("Payment successful and Pro Plan activated! 🎉 (Test Mode)");
        } else {
          setMessage(verifyData.message || "Payment verification failed.");
        }
        setLoading(false);
        return;
      }

      // Razorpay Checkout options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "AI Digital Twin",
        description: "Pro Plan",
        order_id: orderData.orderId,

        handler: async function (paymentResponse) {
          try {
            // Send payment details to backend for verification
            const verifyResponse = await fetch(
              `${API_BASE_URL}/payment/verify`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(paymentResponse),
              }
            );

            const verifyData = await verifyResponse.json();

            if (verifyResponse.ok && verifyData.success) {
              setMessage("Payment successful and verified! 🎉");
            } else {
              setMessage(
                verifyData.message || "Payment verification failed."
              );
            }
          } catch (error) {
            console.error("Verification error:", error);
            setMessage("Payment verification failed.");
          }
        },

        modal: {
          ondismiss: function () {
            setMessage("Payment window closed.");
          },
        },

        theme: {
          color: "#0F172A",
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on("payment.failed", function (response) {
        console.error("Payment failed:", response.error);
        setMessage(
          response.error?.description || "Payment failed."
        );
      });

      razorpay.open();
    } catch (error) {
      console.error("Payment error:", error);
      setMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="container py-5"
      style={{ minHeight: "80vh" }}
    >
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div
            className="card shadow-lg border-0"
            style={{
              backgroundColor: "#0F172A",
              color: "white",
              borderRadius: "16px",
            }}
          >
            <div className="card-body text-center p-5">
              <h2 className="mb-3">🚀 AI Digital Twin Pro</h2>

              <p className="text-light mb-4">
                Unlock premium features with the Pro Plan.
              </p>

              <h1 className="mb-4">₹499</h1>

              <button
                className="btn btn-primary btn-lg px-5"
                onClick={handlePayment}
                disabled={loading}
              >
                {loading ? "Processing..." : "Pay ₹499"}
              </button>

              {message && (
                <div className="alert alert-info mt-4 mb-0">
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Payment;