import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';

export async function authenticate(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user || !user.active) return res.status(401).json({ message: 'This account is no longer active.' });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    return next(error);
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}
