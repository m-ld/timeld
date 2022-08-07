#!/bin/bash

VERSION=${1?:Version argument required}
BRANCH=$(git branch --no-color --show-current)

! [[ $BRANCH == 'main' ]]; NOT_MAIN=$?
! [[ $VERSION == pre* ]]; NOT_PRE=$?

if  [[ $NOT_MAIN -eq $NOT_PRE ]]; then
  echo Prerelease on main or non-prerelease on non-main!
  exit 1
fi

TAG='latest'
if [[ $NOT_MAIN ]]; then
  TAG="$BRANCH"
  PRE_ID="$BRANCH"
fi

npm run test

echo Bumping the version of all packages in the monorepo
npm version "$VERSION" -ws --preid "$PRE_ID"

echo Updating dependencies to bumped version
COMMON_VER=$(npm run ver -w packages/common -s)
npm i timeld-common@"$COMMON_VER" \
  -w packages/cli \
  -w packages/gateway

echo Versioning the top-level project
npm version "$VERSION" --preid "$PRE_ID" --force

echo Publishing packages as "$TAG"
npm publish -ws --tag "$TAG"
git push