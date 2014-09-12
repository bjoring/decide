#!/usr/bin/env python
# -*- coding: utf-8 -*-
# -*- mode: python -*-
"""checks event log for whether hoppers are activating correctly

Copyright (C) 2014 Dan Meliza <dmeliza@gmail.com>
Created Thu Sep 11 14:02:23 2014
"""

# python 3 compatibility
from __future__ import absolute_import
from __future__ import print_function
from __future__ import division
from __future__ import unicode_literals

import argparse
import datetime

def read_jsonl(filename):
    """Reads a jsonl file and returns an iterator over the records"""
    import json
    with open(filename, "rU") as fp:
        for line in fp:
            yield json.loads(line)

def feeder_rec_p(rec):
    try:
        addr = rec["addr"]
        return addr.startswith("feeder") or addr == "hopper"
    except KeyError:
        return False



if __name__ == '__main__':
    p = argparse.ArgumentParser(description="check event log for feeding and hopper events")
    p.add_argument("filename", help="the event log (jsonl) to parse")
    opts = p.parse_args()

    feedings = failures = bounces = 0
    feeding = False
    last_hopper = None
    hopper_up = False
    last_hopper_up_time = None
    # test for a variety of failures and successes
    # 1. feeder is activated but hopper is already up - failure to come down
    # 2. feeder is deactivated but hopper is not up - failure to rise
    # 3. hopper goes down but feeder is still active - "bounce" error
    for record in filter(feeder_rec_p, read_jsonl(opts.filename)):
        t = record["time"]
        ts = datetime.datetime.fromtimestamp(t / 1000)
        if "feeding" in record:
            feeding = record["feeding"]
            if feeding and hopper_up:
                print("%s: error lowering %s" % (ts, last_hopper))
                failures += 1
            elif not feeding and not hopper_up:
                print("%s: error raising %s" % (ts, last_hopper))
                failures += 1
            if feeding:
                last_hopper = record["addr"].split("_")[1]
                feedings += 1
        elif record["addr"] == "hopper":
            hopper_up = record["up"]
            if not hopper_up and feeding:
                print("%s: error switch bounce %s (%f ms)" %
                      (ts, last_hopper, t - last_hopper_up_time))
                bounces += 1
            if hopper_up:
                last_hopper_up_time = t

    print("feed events: %d, failures: %d, bounces: %d" % (feedings, failures, bounces))
# Variables:
# End:
