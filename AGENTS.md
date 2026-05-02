# Agent Instructions

## Bumping the version

When the user asks to bump or update the version, update it in all three of these files:

- `package.json` — `"version"` field
- `src-tauri/tauri.conf.json` — `"version"` field
- `src-tauri/Cargo.toml` — `version` field under `[package]`
