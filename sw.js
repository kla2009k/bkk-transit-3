// Service worker — app shell cache-first, data network-first (PWA offline).
const CORE = 'bkk3d-core-v14'; // bump on shell changes — activate clears old caches
const DATA = 'bkk3d-data-v14';
const SHELL = [
  './', 'index.html', 'css/style.css', 'icon.svg', 'manifest.json',
  'js/app.js', 'js/city.js', 'js/planner.js', 'js/service.js',
  'js/theme.js', 'js/ridership.js', 'js/firstride.js', 'js/pages.js',
  'js/journey.js', 'js/places.js', 'js/place-ui.js',
  'vendor/three/three.module.js',
  'vendor/three/addons/controls/OrbitControls.js',
  'vendor/three/addons/postprocessing/EffectComposer.js',
  'vendor/three/addons/postprocessing/RenderPass.js',
  'vendor/three/addons/postprocessing/ShaderPass.js',
  'vendor/three/addons/postprocessing/MaskPass.js',
  'vendor/three/addons/postprocessing/Pass.js',
  'vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/shaders/CopyShader.js',
  'vendor/three/addons/shaders/LuminosityHighPassShader.js',
  'vendor/three/addons/shaders/OutputShader.js',
  'vendor/three/addons/renderers/CSS2DRenderer.js',
  'vendor/three/addons/utils/BufferGeometryUtils.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CORE && k !== DATA).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // fonts etc. go to network
  if (url.pathname.includes('/data/')) {
    // data: network-first, fall back to cache when offline
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(DATA).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // shell: cache-first
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request))
    );
  }
});
