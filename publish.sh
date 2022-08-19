#!/bin/bash

VERSION=${1?:Version argument required}
BRANCH=$(git branch --no-color --show-current)

! [[ $BRANCH == 'main' ]]; NOT_MAIN=$?
! [[ $VERSION == pre* ]]; NOT_PRE=$?

if  [[ $NOT_MAIN -eq $NOT_PRE ]]; then
  echo Prerelease on main or non-prerelease on non-main!
  exit 1
fi

TAG=latest
if [[ $NOT_MAIN -eq 0 ]]; then
  TAG="$BRANCH"
  PRE_ID="$BRANCH"
fi

npm run test

echo Bumping the version of all packages in the monorepo
npm version "$VERSION" -ws --preid "$PRE_ID"

echo Updating dependencies to bumped versions
npm i timeld-common@"$(npm run ver -w packages/common -s)" \
  -w packages/cli \
  -w packages/gateway \
  -w packages/prejournal \
  -w packages/tiki
npm i timeld-prejournal@"$(npm run ver -w packages/prejournal -s)" \
  -w packages/gateway
npm i timeld-tiki@"$(npm run ver -w packages/tiki -s)" \
  -w packages/gateway
git commit -am "version-packages"

echo Versioning the top-level project
npm version "$VERSION" --preid "$PRE_ID" --force

echo Publishing packages as "$TAG"
npm publish -ws --tag "$TAG"
git push