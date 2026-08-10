# Android release signing

Release APKs for PlainList are signed with a local keystore. The keystore and credentials **must not** be committed to git.

## Generate a keystore (one-time)

From this directory:

```bash
PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
keytool -genkeypair -v \
  -keystore plainlist-release.jks \
  -alias plainlist \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS \
  -storepass "$PASS" \
  -keypass "$PASS" \
  -dname "CN=PlainList, OU=Dev, O=PlainList, L=Unknown, ST=Unknown, C=CN"
cp keystore.properties.example keystore.properties
# Edit keystore.properties: set storePassword and keyPassword to $PASS
```

Or copy `keystore.properties.example` to `keystore.properties` and fill in real values after generating the JKS with your chosen password.

Gradle reads `keystore.properties` when present (`apps/web/android/app/build.gradle`). Without it, `assembleRelease` still runs but produces an unsigned release APK.

## Backup (required)

If you lose the keystore or passwords, you **cannot** publish updates to the same `applicationId` (`com.plainlist.app`) for users who already installed a signed build. The same keystore is required for a future Play Store upload.

Back up securely and offline:

- `plainlist-release.jks`
- `keystore.properties` (contains store/key passwords)

Store copies in a password manager, encrypted backup, or other secure location only you control.

## Never commit

These paths are gitignored:

- `*.jks`, `*.keystore`
- `keystore.properties`

Only `keystore.properties.example` and this README are tracked. Do not add real passwords or keystore files to the repository.
