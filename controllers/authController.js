// controllers/authController.js
// Handles register, login, token refresh and logout

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL  = '15m';   // short-lived
const REFRESH_TOKEN_TTL = '30d';   // long-lived
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

const signAccessToken = (user) =>
    jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_TTL }
    );

const signRefreshToken = (user) =>
    jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_TTL }
    );

// ─── Register ───────────────────────────────────────────────────────────────

export const register = async (req, res) => {
    const { name, email, password } = req.body;

    // --- Validation ---
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Formato de email inválido.' });
    }

    try {
        // Check duplicate
        const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Insert user
        const result = await query(
            `INSERT INTO users (name, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, profile_pic_id, created_at`,
            [name?.trim() || null, email.toLowerCase(), hashedPassword]
        );

        const user = result.rows[0];

        // Issue tokens
        const accessToken  = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
        await query(
            `INSERT INTO refresh_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, refreshToken, expiresAt]
        );

        return res.status(201).json({
            message: 'Cuenta creada exitosamente.',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profilePicId: user.profile_pic_id,
                createdAt: user.created_at,
            }
        });
    } catch (err) {
        console.error('❌ Register error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ─── Login ──────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    try {
        const result = await query(
            'SELECT id, name, email, password, profile_pic_id, created_at FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            // Generic message to prevent user enumeration
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        // Issue tokens
        const accessToken  = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
        await query(
            `INSERT INTO refresh_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, refreshToken, expiresAt]
        );

        return res.status(200).json({
            message: 'Inicio de sesión exitoso.',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profilePicId: user.profile_pic_id,
                createdAt: user.created_at,
            }
        });
    } catch (err) {
        console.error('❌ Login error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ─── Refresh Token ───────────────────────────────────────────────────────────

export const refreshToken = async (req, res) => {
    const { refreshToken: token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Refresh token requerido.' });
    }

    try {
        // Verify signature
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

        // Check it exists and is not expired in DB
        const stored = await query(
            `SELECT id, user_id, expires_at FROM refresh_tokens
             WHERE token = $1 AND expires_at > NOW()`,
            [token]
        );

        if (stored.rows.length === 0) {
            return res.status(401).json({ error: 'Refresh token inválido o expirado.' });
        }

        // Rotate: delete old, issue new (token rotation = better security)
        await query('DELETE FROM refresh_tokens WHERE id = $1', [stored.rows[0].id]);

        const userResult = await query(
            'SELECT id, name, email, profile_pic_id FROM users WHERE id = $1',
            [decoded.id]
        );
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado.' });
        }
        const user = userResult.rows[0];

        const newAccessToken  = signAccessToken(user);
        const newRefreshToken = signRefreshToken(user);

        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
        await query(
            `INSERT INTO refresh_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, newRefreshToken, expiresAt]
        );

        return res.status(200).json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        console.error('❌ Refresh error:', err.message);
        return res.status(401).json({ error: 'Refresh token inválido.' });
    }
};

// ─── Logout ─────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
    const { refreshToken: token } = req.body;

    if (token) {
        // Delete this specific session only (supports multi-device)
        await query('DELETE FROM refresh_tokens WHERE token = $1', [token]).catch(() => {});
    }

    return res.status(200).json({ message: 'Sesión cerrada.' });
};

// ─── Get current user (protected) ───────────────────────────────────────────

export const getMe = async (req, res) => {
    try {
        const result = await query(
            'SELECT id, name, email, profile_pic_id, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const user = result.rows[0];
        return res.status(200).json({
            id: user.id,
            name: user.name,
            email: user.email,
            profilePicId: user.profile_pic_id,
            createdAt: user.created_at,
        });
    } catch (err) {
        console.error('❌ getMe error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};
