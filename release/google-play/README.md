# Caveman Vs Dragon — Google Play Version 1

Release target:

- Package ID: `com.team2go.cavemanvsdragon`
- Version name: `1.0.0`
- Version code: `1`
- Target SDK: Android 16 / API 36
- Artifact: signed Android App Bundle (`.aab`)
- Initial channel: Google Play internal testing

## Required protected GitHub secrets

Never commit the upload keystore or passwords. Add these in the repository's
GitHub Actions secrets:

- `CVD_UPLOAD_KEYSTORE_BASE64`
- `CVD_UPLOAD_KEYSTORE_PASSWORD`
- `CVD_UPLOAD_KEY_ALIAS`
- `CVD_UPLOAD_KEY_PASSWORD`

`CVD_UPLOAD_KEYSTORE_BASE64` is the single-line base64 representation of the
binary upload keystore. Store an encrypted backup of the original keystore and
its credentials outside GitHub.

## Build procedure

1. Open **Actions → Build Caveman Vs Dragon Android → Run workflow**.
2. Select the approved release commit or `MainLevel2` after merge.
3. Enter version code `1` and version name `1.0.0`.
4. Enable **Build the signed Google Play app bundle**.
5. Download `Caveman-Vs-Dragon-Play-v1.0.0` from the completed run.
6. Verify the included SHA-256 checksum before uploading the `.aab`.

Every later Google Play upload must use a higher version code.

## Release gates

- [ ] All unit tests and production web build pass.
- [ ] Signed release AAB workflow passes from the approved commit.
- [ ] Install Play-generated APKs through Internal testing on at least one
      phone and one tablet or large-screen emulator.
- [ ] Test touch controls, controller input, vibration, audio balance,
      foreground/background audio, rotation, all levels, score submission,
      local/global leaderboards, offline startup, and update installation.
- [ ] Publish and verify the privacy-policy URL.
- [ ] Complete Data Safety, Content Rating, Target Audience, App Access, Ads,
      and Government Apps declarations accurately.
- [ ] Upload phone screenshots and feature graphic.
- [ ] Complete the required closed test if the Play developer account is a
      personal account created after 13 November 2023.

