---
name: PWA Expo build boundary
description: Non-obvious dependencies that must remain for the static Expo Web export
---

The public artifact is edu-web, but its production bundle is still generated
from the internal Expo Router source kept under the workspace. Removing the
source artifact metadata is safe; removing the source package or its Expo
toolchain is not safe until the app is fully migrated to a standalone web
implementation.

The workspace also needs a local shell-quote stub and pnpm override because the
package firewall can block the registry version while resolving React Native.

**Why:** A cleanup that removed the internal source or the local dependency
stub made lockfile installation fail even though the PWA build code itself was
unchanged.

**How to apply:** Keep only edu-web registered and running publicly, but retain
the internal Expo source and the firewall workaround until a separate
standalone-web migration is completed.