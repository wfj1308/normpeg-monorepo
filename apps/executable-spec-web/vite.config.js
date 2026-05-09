import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
export default defineConfig({
    plugins: [react()],
    css: {
        postcss: {
            plugins: [tailwindcss(), autoprefixer()]
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    var contains = function (value, token) { return value.indexOf(token) !== -1; };
                    if (!contains(id, 'node_modules')) {
                        return undefined;
                    }
                    if (contains(id, 'react/') || contains(id, 'react-dom/') || contains(id, 'scheduler/')) {
                        return 'vendor-react';
                    }
                    if (contains(id, 'mathjs/')) {
                        return 'vendor-mathjs';
                    }
                    if (contains(id, 'jszip/')) {
                        return 'vendor-jszip';
                    }
                    if (contains(id, 'js-yaml/')) {
                        return 'vendor-yaml';
                    }
                    if (contains(id, 'react-markdown/') ||
                        contains(id, 'remark-') ||
                        contains(id, 'rehype-') ||
                        contains(id, '/unified/') ||
                        contains(id, '/micromark') ||
                        contains(id, '/mdast-') ||
                        contains(id, '/hast-')) {
                        return 'vendor-markdown';
                    }
                    return 'vendor-misc';
                }
            }
        }
    },
    server: {
        host: '127.0.0.1',
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8091',
                changeOrigin: true
            },
            '/health': {
                target: 'http://127.0.0.1:8091',
                changeOrigin: true
            }
        }
    }
});
