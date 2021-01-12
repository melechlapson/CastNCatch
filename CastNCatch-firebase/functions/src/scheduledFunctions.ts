import * as functions from 'firebase-functions';
import {createHourlyChallenge, scoreCompletedChallengesAsync} from "./challengeFunctions";
import {updateLeaderboard} from "./leaderboardFunctions";

const longFunctionOps : functions.RuntimeOptions = {
    timeoutSeconds: 300,
    memory: '512MB'
};

/**
 * Create a new hourly challenge every 4 hours that lasts until the end of the day
 */
export const scheduleCreateHourlyChallenge = functions.pubsub.schedule("every 4 hours from 00:00 to 20:00").timeZone("Etc/UTC").onRun((context) => {
    createHourlyChallenge().then((promise) => {
        console.log("Hourly challenge created");
    }, function(error) {
        console.error(error);
    });
});

/**
 * Award coins for hourly challenges
 */
export const scoreHourlyChallenges = functions.runWith(longFunctionOps).pubsub.schedule("every 15 minutes from 00:00 to 23:00").timeZone("Etc/UTC").onRun((context) => {
    scoreCompletedChallengesAsync().then((promise) => {
        console.log("*********** Scores awarded for expired challenges *************");
    }, function(error) {
        console.error(error);
    });
    return null;
});

/**
 * Award coins for hourly challenges
 */
export const scoreProTournaments = functions.runWith(longFunctionOps).pubsub.schedule("every 15 minutes from 00:00 to 23:00").timeZone("Etc/UTC").onRun((context) => {
    scoreCompletedChallengesAsync().then((promise) => {
        console.log("*********** Scores awarded for expired challenges *************");
    }, function(error) {
        console.error(error);
    });
    return null;
});

/**
 * Update the leaderboard every 30 minutes
 */
export const scheduleUpdateLeaderboard = functions.runWith(longFunctionOps).pubsub.schedule("every 30 minutes").timeZone("Etc/UTC").onRun((context) => {
    updateLeaderboard().then((promise) => {
        console.log("Leaderboard updated");
    }, function(error) {
        console.error(error);
    });
});