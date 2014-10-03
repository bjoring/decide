(ns decide.babysitter
  "node script to monitor running experiments"
  (:use [decide.core :only [version config mail format console]])
  (:require [decide.mongo :as mongo]
            [clojure.string :as str]
            [cljs.nodejs :as node]))

;; things the babysitter monitors (for each subject / controller)
;;
;; - hopper malfunctions (checks beam break events against hopper events)
;; - unexpected disconnections / program failures
;; - number of trials and feed events over some window
;; - daily statistics for each subject - running avg and std dev

;; how to keep track of state in this paradigm? Atoms and/or mongodb. DB has
;; major advantage of maintaining state if program exits. Can it be the only
;; place state lives?

;; the state of the babysitter should be organized by subject. Some messages
;; won't have subject information, so they need to be matched by controller
;; name. We could babysit controllers and subjects separately, except that a
;; specific user needs to be notified when there's a hardware failure.

;; There are really two parts to this process. One is to digest state-changed
;; and trial-data messages to update state. The other is to analyze the state
;; and notify the user if there are problems.

(def sock-cli (js/require "socket.io-client"))

(def prog-name "decide-babysitter")
(def subjects (atom {}))

(defn- prog-start-data
  "Returns useful information from program startup message"
  [trial-data]
  (let [data (:data trial-data)]
    {:subject (:subject data)
     :controller (-> trial-data :addr (str/split #"\.") (first))
     :program (:program data)
     :user (-> data :params :user)}))

(defn process-event
  [event]
  #_(.log console "pub" "state-changed" event))

(defn- drop-subject
  "Stops monitoring a subject"
  [subject]
  (when-let [subject-data (get @subjects subject)]
    (.info console "%s: stopped monitoring" subject (:program subject-data))
    ;; TODO update database
    (swap! subjects dissoc subject)))

(defn- duplicate-subject-error [subject trial-data subject-data]
  (.error console "%s: duplicate experiments!" subject)
  ;; stop monitoring while the user figures this out
  (drop-subject subject)
  (let [subj (str "Multiple experiments running for " subject)
        msg (format (str "'%s' was started for %s on %s, but '%s' was running for"
                         " that subject already on %s. Stop both and restart one.")
                    (:program trial-data) subject (:controller trial-data)
                    (:program subject-data) (:controller subject-data))]
    (mail prog-name (:user subject-data) subj msg)))

(defn- add-subject
  "Starts monitoring subject"
  [trial-data]
  (let [subject-data (prog-start-data trial-data)
        subject (:subject subject-data)]
    (.info console (format "%s: started monitoring (running %s on %s)"
                           subject (:program subject-data) (:controller subject-data)))
    (.debug console (clj->js subject-data))
    (if-let [old-data (get @subjects subject)]
      (duplicate-subject-error subject subject-data old-data)
      (swap! subjects assoc subject subject-data))))

;; monitoring trial and feed events. Lots of ways to do this. One thought is to
;; bin events by hour over the course of the day. We could also just run queries
;; on the database at intervals and dynamically calculate the statistics.
(defn- update-subject
  "Update subject data with trial data"
  [trial-data]
  (let [subject (-> trial-data :data :subject)
        subject-data (get @subjects subject)]
    (when subject-data
      (.debug console "updating data for" subject))))

(defn- process-trial
  [trial]
  (let [trial (js->clj trial :keywordize-keys true)]
    (cond
     (-> trial :data :comment (= "starting")) (add-subject trial)
     (-> trial :data :comment (= "stopping")) (drop-subject (:subject trial))
     :else (update-subject trial))))

(defn- connect-to-host []
  (let [uri (str "http://" (:addr_ext config) ":" (:port_ext config) "/")
        socket (.connect sock-cli uri (clj->js {:transports ["websocket"]}))]
    (-> socket
        (.on "connect"
               #(.info console "connected to decide-host at" (aget socket "io" "uri")))
        (.on "disconnect" #(.warn console "lost connection to decide-host"))
        (.on "state-changed" process-event)
        (.on "trial-data" process-trial))))

(defn- main [& args]
  (.info console "this is decide-babysitter, version" version)
  (mongo/connect
   (:log_db config)
   (fn [err db]
     (if err
       (do
         (.error console "unable to connect to log database at " (:log_db config))
         (.exit node/process -1))
       (do
         (.info console "connected to log database")
         #_(reset! subjects (mongo/collection db "subjects"))
         (connect-to-host))))))

(set! *main-cli-fn* main)
