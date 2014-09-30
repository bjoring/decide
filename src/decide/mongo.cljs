(ns decide.mongo
  "interface to mongodb")

(def mongodb (js/require "mongodb"))

(def ^:export Client (aget mongodb "MongoClient"))
(def ^:export Collection (aget mongodb "Collection"))
(def ^:export ObjectID (aget mongodb "ObjectID"))

(defn connect
  [uri callback]
  (.connect Client uri callback))

(defn collection [db coll]
  (Collection. db coll))

(defn save!
  ([coll doc]
     (let [doc (clj->js doc)]
       (.save coll doc)))
  ([coll doc callback]
     (let [doc (clj->js doc)
           opts (js-obj "journal" true)]
       (.save coll doc opts callback))))
