(ns decide.core
  (:require [decide.json :as json]
            [goog.string :as gstring]
            [goog.string.format]))

(def os (js/require "os"))
(def path (js/require "path"))
(def console (js/require "../lib/log"))
(def mailer (.createTransport (js/require "nodemailer")))

(def version "1.0.0-alpha.3")                   ; TODO get this from project.clj
(defn config-path [name] (.resolve path js/__dirname ".." "config" name))

(def config (json/read-json (config-path "host-config.json")))

(defn mail [from to subject message]
  (.sendMail mailer (js-obj "from" (str from "@" (.hostname os))
                            "to" to
                            "subject" subject
                            "text" message)
             (fn [err info]
               (when err (.error console "unable to send email:" err)))))

(defn format [fmt & args]
  (apply gstring/format fmt args))
