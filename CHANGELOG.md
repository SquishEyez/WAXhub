# Changelog

## 2.1.0

### New
- **Rescue & recover**: scans 34 places across 27 WAX contracts for value still held for an account and returns it in one tap (batched where possible). See [CONTRACTS.md](CONTRACTS.md).
- **Contract console**: call any action on any contract with forms generated from the ABI, or browse any table. Includes ready-made tasks, per-field help and high-risk action guards.
- **Guided Creator studio**: collection → schema → template → mint → sell, with explainers, presets, previews, airdrop minting and a NeftyBlocks drop builder.
- **Linux desktop app** (AppImage and .deb).
- Plain-English error messages with one-tap fixes, explorer links on every transaction, account menu, Android back-button support, first-run intro and offline banner.

### Fixed
- Drops tab showed mostly old test drops, and collection search didn't work. It now shows live, claimed drops and searches by partial collection name.
- NeftyBlocks pack results were never found, and only the first item was claimed.
- AtomicHub pack claims were sent without roll IDs.
- Older unclaimed packs and Alcor orders weren't listed.
- Tapping the account chip signed you out straight away.
- On tablets and desktop the top bar was cut off.

### Security
- Release APK: WebView remote debugging and mixed content are disabled. New release signing key.
