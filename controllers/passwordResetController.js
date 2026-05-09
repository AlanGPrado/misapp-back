import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { query } from '../db/index.js';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Forgot Password ─────────────────────────────────────────────────────────

export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email es requerido.' });
    }

    try {
        const result = await query('SELECT id, name FROM users WHERE email = $1', [email.toLowerCase()]);

        if (result.rows.length === 0) {
            // Don't reveal if email exists for security, just say we sent it if user exists
            return res.status(200).json({ message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
        }

        const user = result.rows[0];

        // Generate token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour

        // Save to DB
        await query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
            [tokenHash, expiresAt, user.id]
        );

        // Send Email
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}&email=${email}`;

        const { data, error } = await resend.emails.send({
            from: 'Misapp <onboarding@resend.dev>',
            to: [email],
            subject: 'Restablecer tu contraseña - Misapp',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #ff4d3d;">Restablecer Contraseña</h2>
                    <p>Hola ${user.name || 'Creyente'},</p>
                    <p>Has solicitado restablecer tu contraseña. Haz clic en el botón de abajo para continuar:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #ff4d3d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Restablecer Contraseña</a>
                    </div>
                    <p>Este enlace expirará en 1 hora.</p>
                    <p>Si no solicitaste esto, puedes ignorar este correo.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999;">Misapp - Tu comunidad de fe.</p>
                </div>
            `,
        });

        if (error) {
            console.error('❌ Resend error:', error);
            return res.status(500).json({ error: 'Error al enviar el correo.' });
        }

        return res.status(200).json({ message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
    } catch (err) {
        console.error('❌ Forgot Password error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ─── Reset Password ──────────────────────────────────────────────────────────

export const resetPassword = async (req, res) => {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const result = await query(
            'SELECT id FROM users WHERE email = $1 AND reset_password_token = $2 AND reset_password_expires > NOW()',
            [email.toLowerCase(), tokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Token inválido o expirado.' });
        }

        const userId = result.rows[0].id;
        const hashedPassword = await bcrypt.hash(password, 12);

        // Update password and clear token
        await query(
            'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
            [hashedPassword, userId]
        );

        return res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
    } catch (err) {
        console.error('❌ Reset Password error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};
