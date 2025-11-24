// backend/src/routes/auth.routes.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../services/db';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /api/auth/login (FR-AUTH-001)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({ message: "Email and password are required." });
    }

    // --- 1. Find the User ---
    const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).send({ message: "Invalid credentials" });
    }

    // --- 2. Compare the Password ---
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordMatch) {
      return res.status(401).send({ message: "Invalid credentials" });
    }

    // --- 3. Create JWT Token ---
    const jwtSecret = process.env.JWT_SECRET || 'YOUR_DEFAULT_SECRET_KEY';

    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, 
        name: user.name
      },
      jwtSecret,
      { expiresIn: '8h' }
    );

    // --- 4. Send Response ---
    res.status(200).send({
      message: "Login successful",
      token: token,
      userId: user.id,
      role: user.role,
      name: user.name
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// --- (SECURED) Register Route ---
// Requires ADMIN_INVITE_CODE in body to create an account.
router.post('/register', async (req, res) => {
  const { email, password, role, name, inviteCode } = req.body;
  
  if (!email || !password || !role || !name) {
    return res.status(400).send({ message: "Email, password, role, and name are required." });
  }

  // SECURITY CHECK
  if (inviteCode !== process.env.ADMIN_INVITE_CODE) {
    return res.status(403).send({ message: "Invalid invite code." });
  }

  try {
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save to DB
    const newUser = await query(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id, email, role, name",
      [email.toLowerCase(), passwordHash, role, name]
    );

    res.status(201).send(newUser.rows[0]);
  } catch (error: any) {
    console.error("Registration error:", error);
    if (error.code === '23505') { // Unique violation code for Postgres
        return res.status(409).send({ message: "User already exists." });
    }
    res.status(500).send({ message: "Internal server error." });
  }
});

// --- Forgot Password Route (AUTH-1.2) ---
// Stubs the logic by printing a reset token to the console (for MVP).
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send({ message: "Email is required" });

  try {
    const result = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const resetToken = uuidv4();
      // Expires in 1 hour
      const expiry = new Date(Date.now() + 3600000); 

      // Save token to DB
      await query(
        "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3",
        [resetToken, expiry.toISOString(), user.id]
      );

      // MOCK EMAIL SENDING
      console.log(`\n[AUTH] ---------------------------------------------------`);
      console.log(`[AUTH] Password reset requested for: ${email}`);
      console.log(`[AUTH] Link: http://localhost:5173/reset-password?token=${resetToken}`);
      console.log(`[AUTH] ---------------------------------------------------\n`);
    }

    res.send({ message: "If an account exists, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// POST /api/auth/reset-password
// TODO: Send real e-mail to user
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).send({ message: "Token and new password are required." });
  }

  try {
    // 1. Find user with valid token
    const result = await query(
      `SELECT id FROM users 
       WHERE reset_token = $1 
         AND reset_token_expiry > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send({ message: "Invalid or expired reset token." });
    }

    const user = result.rows[0];

    // 2. Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // 3. Update user and clear token
    await query(
      `UPDATE users 
       SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL 
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.send({ message: "Password updated successfully. Please log in." });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

export default router;