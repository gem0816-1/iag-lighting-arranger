import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    license: { fileName: 'THIRD_PARTY_NOTICES.md' },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'theme', test: /node_modules[\\/](@ant-design[\\/]cssinjs(?:-utils)?|stylis)[\\/]/ },
          ],
        },
      },
    },
  },
});
