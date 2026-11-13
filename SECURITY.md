# Security policy

## What WAX Hub can and can't do

- WAX Hub **never handles private keys or seed phrases**. Signing happens in WAX Cloud Wallet or Anchor.
- Every transaction is shown to you before your wallet asks you to approve it.
- The Android app only requests the `INTERNET` and `ACCESS_NETWORK_STATE` permissions. Release builds disable WebView remote debugging and plain-HTTP traffic.
- The Linux app shows the interface in a sandboxed window with no Node.js access. It serves its own files only on `127.0.0.1`, opens other websites in your normal browser, and only allows pop-up windows for wallet sign-in.

## Verifying a download

Each release includes `SHA256SUMS.txt`. The Android APK is signed with the maintainer's release key, whose certificate SHA-256 fingerprint is published in the release notes. Android refuses to update an installed copy with an APK signed by a different key.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository instead.
Include steps to reproduce, and the affected version and platform. You'll get a reply as soon as possible.

Never send anyone your private keys, seed phrase or wallet password, including the maintainers.
