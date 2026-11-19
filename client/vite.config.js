import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development, proxy /api to the backend (port 3000) so the client needs no CORS handling or hardcoded URLs.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        proxy: { '/api': 'http://localhost:3000' },
    },
});
