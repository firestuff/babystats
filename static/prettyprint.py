#!/usr/bin/python2.7

import json
import sys

json.dump(
    json.load(sys.stdin), sys.stdout,
    sort_keys=True, indent=4, separators=(',', ': '))
print
