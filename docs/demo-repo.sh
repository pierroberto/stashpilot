#!/usr/bin/env bash
# Creates a throwaway Git repository with a realistic set of stashes for the README demo.
# Usage: bash docs/demo-repo.sh <target-dir>
set -euo pipefail

dir="${1:?usage: demo-repo.sh <target-dir>}"
rm -rf "$dir"
mkdir -p "$dir"
cd "$dir"

git init -q -b main
git config user.email dev@example.com
git config user.name Dev
git config commit.gpgsign false

mkdir -p src/auth src/api src/ui
printf 'export function login(user) {\n  return api.post("/login", user);\n}\n' > src/auth/login.ts
printf 'export const session = {};\n' > src/auth/session.ts
printf 'export async function fetchUser(id) {\n  return http.get(`/users/${id}`);\n}\n' > src/api/users.ts
printf 'export function Header() {\n  return <h1>App</h1>;\n}\n' > src/ui/Header.tsx
printf '{ "name": "acme-web", "version": "1.4.0" }\n' > package.json
git add .
git commit -q -m init

now=$(date +%s)
stash_at() {
  local ts="@$1 +0000"
  shift
  GIT_COMMITTER_DATE="$ts" GIT_AUTHOR_DATE="$ts" git stash push -q "$@"
}

# 3 weeks old, on a branch that was deleted afterwards
git checkout -q -b spike/graphql
printf 'export async function fetchUser(id) {\n  return gql`query { user(id: ${id}) { name } }`;\n}\n' > src/api/users.ts
printf 'export const schema = `type User { name: String }`;\n' > src/api/schema.ts
git add src/api/schema.ts
stash_at $((now - 86400 * 23)) -m "graphql experiment, revisit after v2"
git checkout -q main
git branch -q -D spike/graphql

# 3 days old, with an untracked file
git checkout -q -b feature/oauth
printf 'export function login(user) {\n  return oauth.authorize({ provider: "github", user });\n}\n' > src/auth/login.ts
printf 'export const session = { refresh: true };\n' > src/auth/session.ts
printf 'export const oauth = { clientId: process.env.GH_CLIENT_ID };\n' > src/auth/oauth.ts
stash_at $((now - 86400 * 3)) -u -m "oauth: half-done token refresh"
git checkout -q main

# 5 hours old, no message
printf 'export function Header() {\n  return <h1 className="title">App</h1>;\n}\n' > src/ui/Header.tsx
stash_at $((now - 3600 * 5))

# 40 minutes old
git checkout -q -b fix/login-redirect
printf 'export function login(user) {\n  const res = api.post("/login", user);\n  window.location.assign(res.redirect ?? "/");\n  return res;\n}\n' > src/auth/login.ts
printf '{ "name": "acme-web", "version": "1.4.1" }\n' > package.json
stash_at $((now - 60 * 40)) -m "debug logging for redirect loop"
git checkout -q main
