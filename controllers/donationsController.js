// controllers/donationsController.js
// Handles in-app purchase verification and premium status management.
// Designed to be "API-key ready": paste your Google Play / App Store server key
// into the env vars below and the verification will be activated.

import { query } from '../db/index.js';

// ─── ENV vars (fill these when you have your API keys) ─────────────────────
// Google Play: Service-account JSON key path, or base64-encoded JSON
const GOOGLE_PLAY_KEY    = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || null;
// App Store: Shared secret from App Store Connect > App > In-App Purchases
const APP_STORE_SECRET   = process.env.APP_STORE_SHARED_SECRET || null;
const APP_STORE_PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APP_STORE_SB_URL   = 'https://sandbox.itunes.apple.com/verifyReceipt';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Verify a Google Play purchase using the Google Play Developer API.
 * Requires: googleapis npm package + GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var.
 *
 * @param {string} packageName   - e.g. "com.misas.app"
 * @param {string} productId     - e.g. "premium_lifetime"
 * @param {string} purchaseToken - token from the Play billing library
 */
const verifyGooglePlay = async (packageName, productId, purchaseToken) => {
    if (!GOOGLE_PLAY_KEY) {
        // ⚠️  API key not configured yet – bypass verification (dev mode)
        console.warn('[donations] Google Play key not configured. Bypassing verification (dev mode).');
        return { verified: true, devMode: true };
    }

    try {
        // Dynamic import so the package is optional
        const { google } = await import('googleapis');
        const credentials = JSON.parse(
            Buffer.from(GOOGLE_PLAY_KEY, 'base64').toString('utf-8')
        );
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });
        const androidpublisher = google.androidpublisher({ version: 'v3', auth });
        const res = await androidpublisher.purchases.products.get({
            packageName,
            productId,
            token: purchaseToken,
        });
        // purchaseState 0 = purchased
        return { verified: res.data.purchaseState === 0, data: res.data };
    } catch (err) {
        console.error('[donations] Google Play verification error:', err.message);
        return { verified: false, error: err.message };
    }
};

/**
 * Verify an Apple App Store receipt.
 * Requires: APP_STORE_SHARED_SECRET env var.
 *
 * @param {string} receiptData - base64-encoded receipt from StoreKit
 */
const verifyAppStore = async (receiptData) => {
    if (!APP_STORE_SECRET) {
        console.warn('[donations] App Store secret not configured. Bypassing verification (dev mode).');
        return { verified: true, devMode: true };
    }

    const body = JSON.stringify({ 'receipt-data': receiptData, password: APP_STORE_SECRET });

    const tryVerify = async (url) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        return res.json();
    };

    try {
        let data = await tryVerify(APP_STORE_PROD_URL);
        // Status 21007 means this is a sandbox receipt
        if (data.status === 21007) {
            data = await tryVerify(APP_STORE_SB_URL);
        }
        // Status 0 = valid
        return { verified: data.status === 0, data };
    } catch (err) {
        console.error('[donations] App Store verification error:', err.message);
        return { verified: false, error: err.message };
    }
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /donations/verify-purchase
 * Body: { platform, productId, purchaseToken?, receiptData?, packageName? }
 *
 * Verifies the purchase with the appropriate store and, if valid,
 * sets is_premium = true for the authenticated user.
 */
export const verifyPurchase = async (req, res) => {
    const userId = req.user.id;
    const { platform, productId, purchaseToken, receiptData, packageName } = req.body;

    if (!platform || !productId) {
        return res.status(400).json({ error: 'Se requieren platform y productId.' });
    }

    let verification = { verified: false };

    try {
        if (platform === 'android') {
            if (!purchaseToken || !packageName) {
                return res.status(400).json({ error: 'Se requieren purchaseToken y packageName para Android.' });
            }
            verification = await verifyGooglePlay(packageName, productId, purchaseToken);
        } else if (platform === 'ios') {
            if (!receiptData) {
                return res.status(400).json({ error: 'Se requiere receiptData para iOS.' });
            }
            verification = await verifyAppStore(receiptData);
        } else {
            return res.status(400).json({ error: 'Platform debe ser "android" o "ios".' });
        }

        if (!verification.verified) {
            console.warn(`[donations] Purchase NOT verified for user ${userId}:`, verification.error);
            return res.status(402).json({ error: 'No se pudo verificar la compra.', details: verification.error });
        }

        // ✅ Purchase verified – record it and grant premium
        await query(
            `INSERT INTO donations (user_id, platform, product_id, purchase_token, receipt_data, verified_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, purchase_token) DO NOTHING`,
            [userId, platform, productId, purchaseToken || null, receiptData || null]
        );

        await query(
            `UPDATE users SET is_premium = TRUE, updated_at = NOW() WHERE id = $1`,
            [userId]
        );

        console.log(`✅ [donations] User ${userId} is now PREMIUM (${platform})`);

        return res.status(200).json({
            message: 'Compra verificada. ¡Bienvenido a Premium!',
            isPremium: true,
            devMode: verification.devMode || false,
        });
    } catch (err) {
        console.error('[donations] verifyPurchase error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

/**
 * GET /donations/status
 * Returns the current premium status of the authenticated user.
 */
export const getPremiumStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await query(
            'SELECT is_premium FROM users WHERE id = $1',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        return res.status(200).json({ isPremium: result.rows[0].is_premium ?? false });
    } catch (err) {
        console.error('[donations] getPremiumStatus error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

/**
 * POST /donations/restore
 * Restore purchases: re-checks DB history and re-grants premium if applicable.
 */
export const restorePurchases = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await query(
            `SELECT id FROM donations WHERE user_id = $1 AND verified_at IS NOT NULL LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron compras anteriores.' });
        }

        await query(
            `UPDATE users SET is_premium = TRUE, updated_at = NOW() WHERE id = $1`,
            [userId]
        );

        return res.status(200).json({
            message: 'Compras restauradas exitosamente.',
            isPremium: true,
        });
    } catch (err) {
        console.error('[donations] restorePurchases error:', err.message);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};
