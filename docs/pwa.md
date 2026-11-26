# Installable UniMarket

- Open the deployed HTTPS site, or `http://localhost:3000` on the development computer.
- Install from the landing page or Settings when the browser offers a native install prompt. On iPhone, use Safari's Share menu and Add to Home Screen. Other browsers may offer a menu option or a shortcut rather than a full PWA. Firefox desktop does not need to support installation to use the site.
- A phone cannot access your computer's `localhost`. Use an approved HTTPS deployment for physical phone testing. Do not publish a development server or credentials to the internet.
- After the service worker has installed, disconnect the network and reload a marketplace page. The generic offline page should appear. Reconnect and select Try again.
- No authenticated HTML, API response, uploaded photo, message or transaction is stored in service-worker Cache Storage. Only offline.html and the public app icons are precached. The worker ignores all API requests. Ordinary browser storage (such as local listing drafts) is unchanged.
- Updates use the standard service-worker lifecycle. Close all open UniMarket tabs/windows and reopen to activate a waiting version. Bump the cache version in `public/sw.js` when changing the offline fallback/assets.
- This is not background synchronisation or a native app store release. Transactions, listing creation and messaging require connectivity.
