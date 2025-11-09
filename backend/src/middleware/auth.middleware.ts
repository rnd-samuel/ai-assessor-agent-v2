// backend/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend the default Express Request type to include our user property
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * (FR-AUTH-002)
 * This middleware reads the JWT from the Authorization header,
 * verifies it, and attaches the user's payload (userId, role) to req.user.
 */
export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  // The header looks like: "Bearer YOUR_TOKEN_HERE"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // (FR-AUTH-003) No token, forbidden
    return res.status(401).send({ message: "No token provided." });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("JWT_SECRET is not defined!");
    return res.status(500).send({ message: "Server configuration error." });
  }

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      // Token is invalid or expired
      return res.status(403).send({ message: "Invalid token." });
    }

    // Token is valid! Attach the user payload to the request object
    req.user = user as { userId: string, role: string };

    // Move to the next function (the actual endpoint)
    next();
  });
};

/**
 * (FR-AUTH-002 / FR-AUTH-003)
 * This middleware factory checks if the user (attached by authenticateToken)
 * has one of the required roles.
 * * Usage: authorizeRole('Admin')
 * Usage: authorizeRole('Admin', 'Project Manager')
 */
export const authorizeRole = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      // This should technically never happen if authenticateToken runs first
      return res.status(401).send({ message: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // User is logged in, but doesn't have the right role
      return res.status(403).send({ message: "Forbidden: You do not have the required role." });
    }

    // User has the correct role, proceed
    next();
  };
};