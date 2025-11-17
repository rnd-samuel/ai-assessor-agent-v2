// backend/src/routes/auth.routes.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../services/db';

const router = Router();

// POST /api/auth/login (FR-AUTH-001)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({ message: "Email and password are required." });
    }

    // --- 1. Find the User (REAL) ---
    const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      // (U2) "E-mail or Password is incorrect"
      return res.status(401).send({ message: "Invalid credentials" });
    }

    // --- 2. Compare the Password ---
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordMatch) {
      // (U2) "E-mail or Password is incorrect"
      return res.status(401).send({ message: "Invalid credentials" });
    }

    // --- 3. Create JWT Token ---
    const jwtSecret = process.env.JWT_SECRET || 'YOUR_DEFAULT_SECRET_KEY';

    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, // (FR-AUTH-001)
        name: user.name
      },
      jwtSecret,
      { expiresIn: '8h' } // Lengthened session
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

// --- /register route to create our admin user ---
// We'll use this ONCE to create our user, then we can remove it.
router.post('/register', async (req, res) => {
  const { email, password, role, name } = req.body;
  if (!email || !password || !role || !name) {
    return res.status(400).send({ message: "Email, password, role, and name are required." });
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
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).send({ message: "User likely already exists." });
  }
});

export default router;