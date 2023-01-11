#!/bin/bash

VERSION=${1?:Version argument required}
BRANCH=$(git branch --no-color --show-current)

! [[ $BRANCH == 'main' ]]
NOT_MAIN=$?
! [[ $VERSION == pre* ]]
NOT_PRE=$?

if [[ $NOT_MAIN -eq $NOT_PRE ]]; then
  echo Prerelease on main or non-prerelease on non-main!
  exit 1
fi

TAG=latest
if [[ $NOT_MAIN -eq 0 ]]; then
  TAG="$BRANCH"
  PRE_ID="$BRANCH"
fi

if npm run test; then
  read -r -p "Version $VERSION, tag $TAG, preid $PRE_ID OK? [Enter]"

  echo Bumping the version of all packages in the monorepo
  if npm version "$VERSION" -ws --preid "$PRE_ID" &&
    # Install gateway extension packages
    npm i timeld-tiki@"$(npm run ver -w packages/tiki -s)" \
      timeld-prejournal@"$(npm run ver -w packages/prejournal -s)" \
      timeld-caldav@"$(npm run ver -w packages/caldav -s)" \
      -w packages/gateway &&
    # Install common to all dependents
    npm i timeld-common@"$(npm run ver -w packages/common -s)" \
      -w packages/caldav \
      -w packages/cli \
      -w packages/gateway \
      -w packages/prejournal \
      -w packages/tiki &&
    git commit -am "version-packages"; then

    echo Versioning the top-level project and publishing packages as "$TAG"
    npm version "$VERSION" --preid "$PRE_ID" --force &&
      npm publish -ws --tag "$TAG" &&
      git push origin "v$(npm run ver -s)" &&
      git push
  fi
fi
