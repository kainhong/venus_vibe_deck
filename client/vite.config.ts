import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server config. In production the Node server serves the built client.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
