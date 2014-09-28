(ns decide.mongo
  "interface to mongodb")

(def mongodb (js/require "mongodb"))

(def ^:export Db (aget mongodb "Db"))
(def ^:export Server (aget mongodb "Server"))
(def ^:export Collection (aget mongodb "Collection"))
(def ^:export ObjectID (aget mongodb "ObjectID"))

(defn connect
  ([host port db callback]
     (let [server (Server. host port)]
       (.open (Db. db server) callback)))
  ([host db callback]
     (connect host 27017 db callback))
  ([db callback]
     (connect "localhost" db callback)))

(defn collection [db coll]
  (Collection. db coll))

(defn save! [coll doc]
  (let [doc (clj->js doc)]
    (.save coll doc)))
