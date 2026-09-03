import { cloudflare } from '@cloudflare/vite-plugin';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// Bindings come from wrangler.jsonc, so this builds and deploys on our own
// Cloudflare account. The cloudflare() plugin is imported statically because
// vinext-cloudflare reads this file's source to confirm it is present.
export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
});
