#!/usr/bin/env python3
"""Configure a generated Capacitor Android app for a signed Play release."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def replace_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE)
    if count != 1:
        raise ValueError(f"{label}: expected exactly one match, found {count}")
    return updated


def configure_gradle(source: str, version_code: int, version_name: str) -> str:
    if version_code < 1:
        raise ValueError("versionCode must be a positive integer")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version_name):
        raise ValueError("versionName must use semantic versioning, for example 1.0.0")

    source = replace_once(
        source,
        r"^(\s*)versionCode\s+\d+\s*$",
        rf"\g<1>versionCode {version_code}",
        "versionCode",
    )
    source = replace_once(
        source,
        r'^(\s*)versionName\s+["\'][^"\']+["\']\s*$',
        rf'\g<1>versionName "{version_name}"',
        "versionName",
    )

    signing_config = """
    signingConfigs {
        release {
            storeFile file(System.getenv("CVD_UPLOAD_KEYSTORE_PATH"))
            storePassword System.getenv("CVD_UPLOAD_KEYSTORE_PASSWORD")
            keyAlias System.getenv("CVD_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("CVD_UPLOAD_KEY_PASSWORD")
        }
    }

"""
    source = replace_once(
        source,
        r"^(\s*)buildTypes\s*\{",
        signing_config + r"\g<1>buildTypes {",
        "buildTypes",
    )
    source = replace_once(
        source,
        r"(release\s*\{)",
        r"\1\n            signingConfig signingConfigs.release",
        "release build type",
    )
    return source


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gradle-file", type=Path, required=True)
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--version-name", required=True)
    args = parser.parse_args()

    source = args.gradle_file.read_text()
    updated = configure_gradle(source, args.version_code, args.version_name)
    args.gradle_file.write_text(updated)


if __name__ == "__main__":
    main()
