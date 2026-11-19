// src/roundToken.js
//
// What a round compares (which two players, which stat) is not stored in the database.
// It is signed and handed to the client, and when the client sends it back unchanged
// we verify with the same key that nobody tampered with it.
// That way the server never has to remember which runs are in progress.
//
// This is a simplified, hand-rolled take on JWT (a real JWT also has a header and standard claims);
// it keeps only the core sign-and-verify idea and avoids adding another dependency.
//
// The secret is passed in by the caller: in a Worker, environment variables arrive in each request's
// env rather than in a global process.env.

import crypto from 'node:crypto';

// How long a token stays valid; older tokens are rejected so they can't be replayed later.
const TOKEN_TTL_MS = 10 * 60 * 1000;

function sign(secret, payloadBase64) {
    return crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
}

/**
 * Packs a round into one string: the payload plus its signature, joined by a dot.
 * The payload is only base64, so anyone can read it. Never put the correct answer in it:
 * only public information such as the two player ids, the mode and the streak.
 * The server compares the stats again when the guess arrives.
 * The signature prevents tampering; it does not keep anything secret.
 */
export function signRoundToken(secret, payload) {
    if (!secret) throw new Error('ROUND_TOKEN_SECRET is not set');
    const payloadBase64 = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
    return `${payloadBase64}.${sign(secret, payloadBase64)}`;
}

/**
 * Verifies and decodes a round token. Returns null for anything malformed, wrongly signed or expired,
 * and leaves it to the caller to decide how to respond (usually a 400).
 * On success the result also carries the signature, used to mark the token as used.
 */
export function verifyRoundToken(secret, token) {
    if (!secret || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;

    // Compare signatures with timingSafeEqual rather than ===, so timing differences
    // can't be used to work out what the correct signature looks like.
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(sign(secret, payloadBase64));
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    try {
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
        if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
        return { ...payload, signature };
    } catch {
        return null;
    }
}
