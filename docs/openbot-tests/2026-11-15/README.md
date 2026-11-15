# OpenBot access test — 2026-11-15

This directory contains a synthetic Node.js fixture for validating branch write access and a reviewable draft pull request. It does not change CizyCRM behavior.

Run the fixture from this directory:

```sh
node --test health.test.mjs
```

The `health.mjs` and `health.test.mjs` files are byte-for-byte copies of the local `engineering-smoke-001` fixture.
