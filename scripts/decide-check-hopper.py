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
import operator
import collections

try:
    import urllib.parse as urlparse
except ImportError:
    import urlparse

def read_jsonl(filename):
    """Reads a jsonl file and returns an iterator over the records"""
    import json
    with open(filename, "rU") as fp:
        for line in fp:
            yield json.loads(line)


def send_email(to, subj, msg):
    import socket
    import smtplib
    from email.mime.text import MIMEText
    msg = MIMEText(msg)
    msg['Subject'] = subj
    msg['From'] = "{0}@{1}".format("decide-check-hopper", socket.gethostname())
    msg['To'] = to
    s = smtplib.SMTP("127.0.0.1")
    s.send_message(msg)
    s.quit()


def get_collection(uri, collection):
    """Connects to mongodb database at uri and returns collection"""
    from pymongo import MongoClient
    uparsed = urlparse.urlparse(uri)
    client = MongoClient(uri)
    db = client[uparsed.path[1:]]
    return db[collection]


def get_recent_events(coll, cutoff):
    """Queries coll for events that occurred after cutoff and returns cursor"""
    return coll.find({"time": {"$gt": cutoff}})


def extract_hopper_events(seq):
    """Iterates events in seq and extracts hopper-related ones"""
    for event in seq:
        addr = event["addr"]
        try:
            controller, component = addr.split(".")
        except ValueError:
            controller, component = (None, addr)
        if "feeding" in event:
            yield {"controller": controller,
                   "component": component,
                   "feeding": event["feeding"],
                   "time": event["time"]}
        elif component == "hopper":
            yield {"controller": controller,
                   "component": component,
                   "hopper": event["up"],
                   "time": event["time"]}

def check_hopper_events(coll):
    seq = iter(coll)
    for event in seq:
        if "feeding" in event:
            try:
                nxt = next(seq)
            except StopIteration:
                return
            else:
                out = {"hopper": event["component"].split("_")[1],
                       "time": event["time"],
                       "error": "none"}
                if not ("hopper" in nxt and nxt["hopper"] == event["feeding"]):
                    out["error"] = "raise" if event["feeding"] else "lower"
                yield out


def group_by(f, coll):
    """Returns a map of the elements of coll keyed by the result of
    f on each element. The value at each key will be a vector of the
    corresponding elements, in the order they appeared in coll."""
    ret = collections.defaultdict(list)
    for el in coll:
        ret[f(el)].append(el)
    return ret


if __name__ == '__main__':
    p = argparse.ArgumentParser(description="check event log for hopper errors")
    p.add_argument("-f", "--file",
                   help="parse .jsonl file instead of connecting to database")
    p.add_argument("-m", "--minutes",
                   help="the number of minutes before now to analyze",
                   default=60, type=int)
    p.add_argument("-d", "--database",
                   help="the uri of the mongdob database with the event log",
                   default="mongodb://localhost:27017/decide")
    p.add_argument("-c", "--collection",
                   help="the collection with the event log", default="events")
    p.add_argument("-s", "--subjects",
                   help="the collection with subject information", default="subjects")
    p.add_argument("-e", "--send-email",
                   help="if true, sends email to responsible party",
                   action="store_true")
    p.add_argument("--max-errors",
                   help="the maximum number of errors to tolerate before sending an email",
                   type=int, default=2)
    opts = p.parse_args()

    now = datetime.datetime.utcnow()
    cutoff = now - datetime.timedelta(minutes=opts.minutes)

    if opts.file is not None:
        events = extract_hopper_events(read_jsonl(opts.file))
    else:
        coll = get_collection(opts.database, opts.collection)
        events = extract_hopper_events(get_recent_events(coll, cutoff))

    fmt = "{0!s:10}   {1!s:6}   {2:6}   {3}"
    header = ["Feeder Summary",
              "{0:%Y-%b-%d %H:%M:%S} to {1:%Y-%b-%d %H:%M:%S}\n".format(cutoff, now),
              fmt.format("controller", "feeder", "error", "count"),
              ("-" * 35)]

    print("\n".join(header))
    for controller, ops in group_by(operator.itemgetter("controller"), events).items():
        feed_ops = check_hopper_events(ops)
        counts = collections.Counter(map(operator.itemgetter("hopper", "error"), feed_ops))
        total_errors = sum(v for k,v in counts.items() if k[0]!='none')
        total_feeds = sum(v for k,v in counts.items() if k[0]=='none')
        msg = []
        for (hop, err) in sorted(counts.keys()):
            msg.append(fmt.format(controller, hop, err, counts[(hop, err)]))
        print("\n".join(msg))

        if opts.send_email and total_errors >= opts.max_errors:
            subjs = get_collection(opts.database, opts.subjects)
            subj = subjs.find_one({"controller": controller})
            if subj and subj.get("running", False) and subj.get("user", None) is not None:
                send_email(subj["user"], "hopper issues on {0}".format(controller),
                           "\n".join(header + msg))
                print("- sent email about {0} to {1}".format(controller, subj["user"]))
