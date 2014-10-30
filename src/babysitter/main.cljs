(ns decide.babysitter
  "node script to monitor running experiments"
  (:use [decide.core :only [version config mail format console]])
  (:require [decide.mongo :as mongo]
            [clojure.string :as str]
            [cljs.nodejs :as node]))

;; things the babysitter monitors (for each subject / controller)
;;
;; 1. hopper malfunctions (checks beam break events against hopper events)
;; 2. unexpected disconnections / program failures
;; 3. number of trials and feed events over some window
;; 4. daily statistics for each subject - running avg and std dev

;; how to keep track of state in this paradigm? Atoms and/or mongodb. DB has
;; major advantage of maintaining state if program exits. Can it be the only
;; place state lives?

;; the state of the babysitter should be organized by subject. Some messages
;; won't have subject information, so they need to be matched by controller
;; name. We could babysit controllers and subjs separately, except that a
;; specific user needs to be notified when there's a hardware failure.

;; There are really two parts to this process. One is to digest state-changed
;; and msg messages to update state. The other is to analyze the state
;; and notify the user if there are problems. Conceivably the analysis could be
;; split out into a separate program that operates directly on the database, in
;; which case this process would only need to do tasks 1 and 2 above.

(def sock-cli (js/require "socket.io-client"))

(def prog-name "decide-babysitter")
(def subjs (atom nil))

(defn- prog-comment-data
  "Returns useful information from program startup/shutdown message"
  [msg]
  (let [msg (js->clj msg :keywordize-keys true)
        data (:data msg)]
    {:subject (:subject data)
     :controller (-> msg :addr (str/split #"\.") (first))
     :program (:program data)
     :start-time (:time msg)
     :user (-> data :params :user)}))

(defn- update-subject [subject query]
  (mongo/update!
   @subjs {:subject subject} query
   (fn [err]
     (when err (.error console "error updating subject record in database" err)))))

(defn- drop-subject
  "Stops monitoring a subject (removes controller from database entry)"
  [subject-data]
  (let [subject (:subject subject-data)]
    (.info console (format
                           ))
    (update-subject subject {:$unset {:program 1}})))

(defn- duplicate-expt-error [subject msg subject-data]
  (.error console "%s: duplicate experiments!" subject)
  ;; stop monitoring while the user figures this out
  (update-subject subject {:$unset {:program 1}})
  (let [subj (str "Multiple experiments running for " subject)
        msg (format (str "'%s' was started for %s on %s, but '%s' was running for"
                         " that subject already on %s. Stop both and restart one.")
                    (:program msg) subject (:controller msg)
                    (:program subject-data) (:controller subject-data))]
    (mail prog-name (:user subject-data) subj msg)))

(defn- add-subject
  "Starts monitoring subject"
  [subject-data]
  (let [subject (:subject subject-data)]
    (.info console (format "%s: started running %s on %s"
                           subject (:program subject-data) (:controller subject-data)))
    ;; check for existing record
    (mongo/find-one
     @subjs
     {:subject subject}
     (fn [result]
       (if-not (nil? (:program result))
         (duplicate-expt-error subject subject-data result)
         (update-subject subject {:$set subject-data}))))))

(defn- process-trial
  [trial]
  (.debug console trial)
  (case (aget trial "data" "comment")
    "starting" (add-subject (prog-comment-data trial))
    "stopping" (drop-subject (prog-comment-data trial))))

(defn process-event
  [event]
  #_(.log console "pub" "state-changed" event))

(defn- connect-to-host []
  (let [uri (str "http://" (:addr_ext config) ":" (:port_ext config) "/")
        socket (.connect sock-cli uri (clj->js {:transports ["websocket"]}))]
    (-> socket
        (.on "connect"
               #(.info console "connected to decide-host at" (aget socket "io" "uri")))
        (.on "disconnect" #(.warn console "lost connection to decide-host"))
        (.on "state-changed" process-event)
        (.on "msg" process-trial))))

(defn- main [& args]
  (.info console "this is decide-babysitter, version" version)
  (mongo/connect (:log_db config)
                 (fn [err db]
                   (when err
                     (.error console "unable to connect to log database at " (:log_db config))
                     (.exit node/process -1))
                   (.info console "connected to log database")

                   (connect-to-host))))

(set! *main-cli-fn* main)
