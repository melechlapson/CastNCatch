# CastNCatch Firebase Functions

## Overview

This project contains [Cloud Functions](https://firebase.google.com/docs/functions) for Google Firebase, for use in the CastNCatch project. The functions are written in [TypeScript](https://www.typescriptlang.org/). 

## Editing the functions

### Requirements

See also https://firebase.google.com/docs/functions/get-started

- Install [Node.js](https://nodejs.org/en/) and [npm](https://www.npmjs.com/)
- Install a JavaScript IDE that supports TypeScript, ideally one that also supports NPM and Node integration (such as [WebStorm](https://www.jetbrains.com/webstorm/) )
- If necessary, install the Firebase CLI globally: `npm install -g firebase-tools`

### Setup

1. Clone the project onto your computer
2. Install the NPM packages: On the command line, run `npm install`
3. On the command line, run `firebase login` to link the project directory to Firebase

### Deploying

1. On the command line, run the `use` command to select a deployment target:

    * master server: `firebase use default`
    * dev server: `firebase use dev`

2. On the command line, run `firebase deploy --only functions`. This will validate the code and then upload it to Firebase

## Misc

### Database indexes

Any queries that will be filtered or sorted by a particular key should be indexed. Indexes are defined in the Realtime Database rules.

For example, Hourly Challenges are filtered and sorted by their "endDate" field. We define a corresponding index in the database rules:

    {
      "rules": {
        "challenges": {
          "hourly" : {
            ".indexOn": ["endDate"]
          }
        }
      }
    }

For further information, see https://firebase.google.com/docs/database/security/indexing-data