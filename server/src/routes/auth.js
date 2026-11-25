import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const user = await User.findOne({ email });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '12h' });
    return res.json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ id: String(req.user._id), name: req.user.name, email: req.user.email, role: req.user.role });
});

export default router;
