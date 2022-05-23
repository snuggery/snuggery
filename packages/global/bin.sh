#!/usr/bin/env bash

set -e

if readlink -f "$0" >/dev/null 2>&1; then
	# GNU readlink is installed (available on all GNU/Linux distributions as part of GNU's coreutils)
	rp=$(readlink -f -- "$0")
elif command -v python >/dev/null 2>&1; then
	# Fall back to python (pre-installed on macOS)
	# cspell:disable-next-line
	rp=$(python -c 'import os,sys;print(os.path.realpath(os.path.expanduser(sys.argv[1])))' "$0")
elif command -v perl >/dev/null 2>&1; then
	# Fall back to perl (also pre-installed on macOS)
	# cspell:disable-next-line
	rp=$(perl -MCwd -e 'print Cwd::abs_path shift' "$0")
else
	# Nothing to fall back to
	echo 'sn: GNU readlink, python, or perl are required' >&2
	exit 1
fi

dir=$(dirname -- "$rp")

exec node --require "$dir/silence.js" --experimental-loader "$dir/.pnp.loader.mjs" "$dir/bin.js" "$@"
