import { defineConfig } from 'vite';

// base를 상대 경로로 두면 GitHub Pages처럼 하위 경로에 배포해도 동작한다.
export default defineConfig({
  base: './',
  // public 그림 주소 뒤에 붙여 배포마다 새로 받게 하는 값(src/assetUrl.ts)
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: { port: 5173, strictPort: true },
});
