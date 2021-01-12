// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
// // https://firebase.google.com/docs/functions/get-started?authuser=0

import 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export * from './mainFunctions';
export * from './challengeFunctions';
export * from './friendFunctions';
export * from './friendChallengeFunctions';
export * from './lootboxFunctions';
export * from './notificationFunctions';
export * from './scheduledFunctions';
export * from './statsFunctions';
export * from './adminFunctions';
export * from './leaderboardFunctions';
export * from './proTournamentFunctions';