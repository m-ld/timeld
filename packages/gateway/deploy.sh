#!/bin/bash

# 1st (required) arg is app name
APP=${1:-timeld}
# 2nd arg is app suffix, defaults to git branch name
SUFFIX=${2:-$(git branch --no-color --show-current)}
# 3rd arg is "genesis" for genesis (2nd arg must be given)
GENESIS=$3

# No suffix on app name if 'main'
if [[ $SUFFIX != 'main' ]]; then
  APP+="-$SUFFIX"
fi

if [[ $APP == 'timeld' ]]; then
  GATEWAY='timeld.org'
else
  GATEWAY="$APP.fly.dev"
fi

CMD=(flyctl deploy -a "$APP" -e TIMELD_GATEWAY_GATEWAY="$GATEWAY")

if [[ $GENESIS == 'genesis' ]]; then
  CMD+=(-e TIMELD_GATEWAY_GENESIS=true)
fi

echo "${CMD[@]}"
read -r -p 'Run it? y/n ' SURE
if [ "$SURE" = 'y' ]; then
  if [[ $GENESIS == 'genesis' ]]; then
    node secrets.mjs | flyctl secrets import -a "$APP" --stage
  fi
  "${CMD[@]}"
fi
