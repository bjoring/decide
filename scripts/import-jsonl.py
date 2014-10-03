#!/bin/env python
# -*- coding: utf-8 -*-
# -*- mode: python -*-
"""Script to import jsonl files into mongodb

Make sure to add unique indices to your collections to avoid importing duplicates:

db.events.ensureIndex({"time":1, "addr": 1}, {unique: true})
db.trials.ensureIndex({"time":1, "subject": 1}, {unique: true})

However, you should probably make the event index non-unique afterwards, as in
some cases events may have the same time and address.

Copyright (C) 2014 Dan Meliza <dmeliza@gmail.com>
Created Wed Oct  1 14:38:34 2014

"""

# python 3 compatibility
from __future__ import absolute_import
from __future__ import print_function
from __future__ import division
from __future__ import unicode_literals

import pymongo

def jsonl_seq(c):
    """Yields records from a sequence of json strings"""
    import json
    for i,line in enumerate(c):
        try:
            yield json.loads(line)
        except ValueError as e:
            print("error parsing line (%d) %s: %s" % (i, line, e))

def main(argv=None):
    import argparse

    p = argparse.ArgumentParser(description="Import jsonl file into mongodb collection")
    p.add_argument("--uri", help="uri of database server",
                   default="mongodb://localhost:27017")
    p.add_argument("--db", help="name of database", default="decide")
    p.add_argument("collection", help="name of collection in which to store records")
    p.add_argument("jsonl", help="path of file to read and import")

    args = p.parse_args(argv)

    conn = pymongo.MongoClient(args.uri)
    coll = conn[args.db][args.collection]

    with open(args.jsonl,"rU") as fp:
        ndoc = ndup = 0
        # batch insert would be faster, but this way we get info on # of duplicates
        for js in jsonl_seq(fp):
            try:
                coll.insert(js)
            except pymongo.errors.DuplicateKeyError:
                ndup += 1
            else:
                ndoc += 1

        print("inserted %d records (%d duplicates) into %s" % (ndoc, ndup, args.collection))


if __name__ == '__main__':
    main()

# Variables:
# End:
