import React, {
  createContext,
  useState,
  useEffect
} from "react";
import { FASTAPI_API_URL } from "../config";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Read the saved login synchronously so protected pages don't redirect to /login on refresh
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  });

  // =========================
  // RESTORE LOGGED-IN USER
  // =========================
  useEffect(() => {
    const savedUser = localStorage.getItem("user");

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error(
          "Failed to parse user from localStorage",
          error
        );

        localStorage.removeItem("user");
      }
    }
  }, []);

  // =========================
  // LOGIN
  // =========================
  const login = async (email, password) => {
    try {
      const res = await fetch(
        `${FASTAPI_API_URL}/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error:
            data.detail ||
            data.error ||
            "Login failed"
        };
      }

      if (data.success) {
        setUser(data.user);

        localStorage.setItem(
          "user",
          JSON.stringify(data.user)
        );

        return {
          success: true,
          user: data.user
        };
      }

      return {
        success: false,
        error:
          data.detail ||
          data.error ||
          "Login failed"
      };

    } catch (error) {
      console.error("Login error:", error);

      return {
        success: false,
        error: "Unable to connect to server"
      };
    }
  };

  // =========================
  // SIGNUP
  // =========================
  const signup = async (studentData) => {
    try {
      const res = await fetch(
        `${FASTAPI_API_URL}/students`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(studentData)
        }
      );

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error:
            data.detail ||
            data.error ||
            "Signup failed"
        };
      }

      // FastAPI returns student data directly
      if (data.student_id) {
        setUser(data);

        localStorage.setItem(
          "user",
          JSON.stringify(data)
        );

        return {
          success: true,
          user: data
        };
      }

      return {
        success: false,
        error:
          data.detail ||
          data.error ||
          "Signup failed"
      };

    } catch (error) {
      console.error("Signup error:", error);

      return {
        success: false,
        error: "Unable to connect to server"
      };
    }
  };

  // =========================
  // LOGOUT
  // =========================
  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  // =========================
  // CONTEXT
  // =========================
  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};