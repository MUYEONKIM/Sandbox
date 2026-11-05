import { defineConfig } from 'vite';

// base를 상대 경로로 두면 GitHub Pages처럼 하위 경로에 배포해도 동작한다.
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
});
