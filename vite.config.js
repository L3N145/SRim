import { defineConfig } from 'vite';
export default defineConfig({
    // Relative paths allow the same build to work at / and /<repository>/.
    base: './',
    server: {
        host: true,
        port: 5173,
    },
    preview: {
        host: true,
        port: 4173,
    },
});
