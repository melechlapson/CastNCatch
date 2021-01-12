/**
 * Create a new hourly challenge with randomized parameters
 */
import * as admin from "firebase-admin";
import * as functions from 'firebase-functions';
import {addCoinsAsync, getRankString} from "./mainFunctions";
import {saveNotificationAsync} from "./notificationFunctions";

export const createHourlyChallenge = async () : Promise<admin.database.Reference> => {
    //pick a random location
    const locations = await admin.database().ref('/locations').once('value');
    const locationKeys: Array<string> = new Array<string>();
    locations.forEach(function (childSnapshot: admin.database.DataSnapshot) {
        if (childSnapshot.key) locationKeys.push(childSnapshot.key);
    });
    const maxIndex:number = Math.min(locationKeys.length, 10);
    let index: number = Math.floor(Math.random() * maxIndex);
    const location: string = locationKeys[index];

    //pick a random goal
    const goals : Array<string> = ["Fish", "Weight" /*, "FishAndWeight"*/];
    index = Math.floor(Math.random() * goals.length);
    const goal : string = goals[index];

    //pick a random multiple of 5 between 50 and 100 for max reward
    //picks a number between 10 and 20 to multiply by
    const coinMultiple : number = Math.floor(Math.random() * 10) + 10;
    const maxReward : number = coinMultiple * 5

    //set endDate ~24 after current date time
    const endDate: Date = new Date();
    endDate.setHours(23, 59, 59);

    //default description for challenges, "", empty string for normal challenges
    const customText : string = "";

    //write new challenge to DB
    const challenge = {
        duration: 2 * 60, //gameplay duration in seconds
        startDate: new Date().toISOString(),
        endDate: endDate.toISOString(),
        location: location,
        goal: goal,
        maxReward: maxReward, //coins awarded to first place
        completed: false,
        customText: customText
    };
    return await admin.database().ref('/challenges/hourly/').push(challenge);
};


/**
 * Get a list of active challenges, organized by category and sorted by end date
 */
export const getChallenges = functions.https.onCall((data, context) => {
    return getChallengesAsync().then((map) => {
        const resultObject = {
            "hourly" : map.get("hourly")
        }
        return JSON.stringify(resultObject);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

/**
 * Load challenges from the database and return them in a map, organized by category
 */
export const getChallengesAsync = async () : Promise<Map<string, admin.database.DataSnapshot>> => {
    const now:string = new Date().toISOString();
    //get challenges from database. we filter by end date so expired challenges are not returned.
    const hourly = await admin.database().ref('challenges/hourly').orderByChild("endDate").startAt(now).once('value');

    //put challenges into a map
    const map :Map<string, admin.database.DataSnapshot> = new Map<string, admin.database.DataSnapshot>();
    map.set("hourly", hourly);
    return map;
};

/**
 * Retrieve the current player's score for a particular challenge. Returns a JSON object.
 */
export const getChallengeScore = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const challengeID:string = data.challengeID;
    const userID:string = context.auth.uid;

    return getChallengeScoreAsync(challengeID, userID).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred"};
    });
});

/**
 * Retrieve the scores for a particular challenge. Returns a JSON object.
 */
export const getChallengeScores = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const challengeID:string = data.challengeID;
    const userID:string = context.auth.uid;

    return getChallengeScoresAsync(challengeID, userID).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred"};
    });
});

/**
 * Get the score for an individual player on a particular challenge
 * @param userID
 * @param challengeID
 */
export const getChallengeScoreAsync = async (challengeID:string, userID:string) : Promise<any> => {
    //get challenge from database and confirm it hasn't expired
    const challenge = await admin.database().ref('challenges/hourly').child(challengeID).once('value');
    if (challenge === null || !challenge.exists()) return { error: "Unrecognized challenge." };

    const existingScore = await admin.database().ref('challengesScores/' + challengeID).child(userID).once('value');
    if (existingScore !== null && existingScore.exists()) {
        const val = existingScore.val();
        val["playerID"] = userID;
        return val;
    }

    return {};
};

/**
 * Get the scores for the first 50 players on a particular challenge, as well as the score for a specific player if given
 * @param challengeID   Key of the challenge
 * @param userID [Optional] ID of a player to retrieve the score for, in case they aren't in the top 50
 */
export const getChallengeScoresAsync = async (challengeID:string, userID:string = "") : Promise<any> => {
    //get challenge from database and confirm it hasn't expired
    //TODO: what if it isn't an hourly challenge?
    const challenge = await admin.database().ref('challenges/hourly').child(challengeID).once('value');
    if (challenge === null || !challenge.exists()) return { error: "Unrecognized challenge." };
    let key:string = "";
    if (challenge.child("goal").val() === "Fish") key = "fishCaught";
    else key = "totalWeight"; //TODO: "fishAndWeight"

    //grab top 50 scores
    const scores = await admin.database().ref('challengesScores/' + challengeID).orderByChild(key).limitToLast(50).once('value');
    //grab our score separately in case we aren't in top 50
    if (userID) {
        const individualScore = await admin.database().ref('challengesScores/' + challengeID).child(userID).once('value');
        return {
            scores: scores,
            individualScore: individualScore
        }
    } else {
        return {
            scores: scores
        }
    }
};

/**
 * Submit score for a challenge. Returns a user-friendly string describing the result of the operation.
 */
export const submitChallengeScore = functions.https.onCall((data, context) => {
    if (!context.auth) return "Error: Unauthorized"; //no user ID or not authenticated

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;
    const fishCaught:number = parseInt(data.fishCaught);
    const totalWeight:number = parseFloat(data.totalWeight);

    return saveChallengeScoreAsync(userID, challengeID, fishCaught, totalWeight).then((response) => {
        return response;
    }, function(error) {
        console.error(error);
        return "A server error occurred";
    });
});

export const saveChallengeScoreAsync = async (userID:string, challengeID:string, fishCaught:number, totalWeight:number) : Promise<string> => {
    const now:Date = new Date();

    //get challenge from database and confirm it hasn't expired
    //TODO: what if it isn't an hourly challenge?
    const challenge = await admin.database().ref('challenges/hourly').child(challengeID).once('value');
    if (challenge === null || !challenge.exists()) return "Error: Unrecognized challenge.";
    const endDate:Date = new Date(challenge.child("endDate").val());
    if (endDate < now) return "Error: This challenge has expired.";

    //retrieve existing score from DB, if any
    const existingScore = await admin.database().ref('challengesScores/' + challengeID).child(userID).once('value');
    if (existingScore && existingScore.exists()) {
        return "Error: You have already submitted a score for this challenge.";
    }

    //retrieve user from DB
    const user = await admin.database().ref('users').child(userID).once('value');
    if (user === null || !user.exists()) return "Error: Unrecognized user";

    //write new score to DB
    const score = {
        playerName: user.child("displayName").val(),
        fishCaught: fishCaught,
        totalWeight: totalWeight,
        date: new Date().toISOString()
    };
    await admin.database().ref('challengesScores/' + challengeID).child(userID).set(score);

    return "Score saved";
};

export const scoreCompletedChallengesAsync = async () : Promise<string> => {
    const incompleteChallenges = await admin.database().ref("challenges/hourly").orderByChild('completed').endAt(false).once('value');
    console.log("Found " + incompleteChallenges.numChildren() + " incomplete challenges");
    const now:Date = new Date();

    const toProcess:Array<admin.database.DataSnapshot> = new Array<admin.database.DataSnapshot>();

    if (incompleteChallenges.exists()) {
        incompleteChallenges.forEach(challenge => {
            toProcess.push(challenge);
        });
    }

    const promises:Array<Promise<string>> = new Array<Promise<string>>();

    //process scores and award coins for challenges. we now limit this to 2 challenges at a time so the function
    //doesn't time out
    let processed = 0;
    for (let i:number = 0; i < toProcess.length; i++) {
        const challenge = toProcess[i];

        const endDateString:string = challenge.child("endDate").val();
        const date:Date = new Date(endDateString);
        if (date < now && challenge.key) {
            const promise:Promise<string> = awardChallengeCoinsAsync(challenge.key);
            promises.push(promise);
            promise.then(
                (result) => {
                    console.log(result)
                }, (error) => {
                    console.error(error);
                });
            processed++;
            if (processed >= 2) break;
        }
    }
    await Promise.all(promises);

    console.log("Awarded coins for " + processed + " challenges");

    return "Success";
}

export const awardChallengeCoinsAsync = async (challengeID:string) : Promise<string> => {
    //TODO: what if it isn't an hourly challenge?
    const challengeRef = admin.database().ref('challenges/hourly').child(challengeID);
    const challenge = await challengeRef.once('value');
    if (challenge === null || !challenge.exists()) return "Error: Unrecognized challenge " + challengeID;

    let key:string = "";
    if (challenge.child("goal").val() === "Fish") key = "fishCaught";
    else key = "totalWeight"; //TODO: "fishAndWeight";

    const maxReward:number = challenge.child('maxReward').val();

    const scoresRef = admin.database().ref('challengesScores/' + challengeID);

    //grab scores
    const scores = await scoresRef.orderByChild(key).once('value');
    if (scores === null || !scores.exists()) {
        await challengeRef.update({
            completed: true
        });
        return "No scores for challenge " + challengeID;
    }

    //scan through all scores to find high score
    let highScoreValue:number = 1; //don't use 0 as default because that could cause divide-by-zero errors
    scores.forEach((entry:admin.database.DataSnapshot) => {
        if (entry.exists() && entry.child(key).exists()) {
            const val = parseFloat(entry.child(key).val()); //scores may have been saved as strings
            if (val > highScoreValue) highScoreValue = val;
        }
    });

    let rank:number = scores.numChildren();
    const promises:Array<Promise<string>> = new Array<Promise<string>>();
    //for each participating player, create an async task to calculate the player's score and award coins
    scores.forEach((entry:admin.database.DataSnapshot) => {
        promises.push(updateScoreAsync(challengeID, entry, scoresRef, key, highScoreValue, maxReward, rank));
        rank--;
    });
    //wait for all of the async tasks to complete
    await Promise.all(promises);

    await challengeRef.update({
        completed: true
    });

    return "Coins awarded for challenge " + challengeID;
}

export const updateScoreAsync = async (challengeID:string, entry:admin.database.DataSnapshot,
                                       scoresRef:admin.database.Reference, key:string, highScoreValue:number,
                                       maxReward:number, rank:number) : Promise<string> =>
{
    if (entry.key) {
        const userID:string = entry.key;

        const valueSnapshot = entry.child(key);
        let value:number = 0;
        if (valueSnapshot.exists()) value = valueSnapshot.val();
        let ratio: number = value / highScoreValue;
        if (isNaN(ratio) || ratio < 0) ratio = 0;
        if (ratio > 1) {
            console.error("Calculated score ratio of greater than 1! Challenge: " + challengeID + ", User: " + userID + ", Score: " + value + ", Highest score: " + highScoreValue + ", max reward: " + maxReward);
            ratio = 1;
        }
        const reward: number = Math.round(ratio * maxReward);

        //save the coins that the player earned to their score data
        await scoresRef.child(userID).update({
            coins: reward
        });

        //update their coins
        await addCoinsAsync(userID, reward);

        if (reward > 0) {
            const rankString:string = getRankString(rank);
            const category:string = "challengeResults";
            const message:string = "You received " + reward + " coins for placing " + rankString + " in a challenge.";
            await saveNotificationAsync(userID, message, category, challengeID);
        }

        return "Success";
    }
    return "Invalid database entry";
}

/*
export const DEBUG_testScoring = functions.https.onRequest((req, res) => {
    const challengeID:string = req.query.challengeID;
    if (!challengeID) res.send("Missing challenge ID");

    return testScoringAsync(challengeID).then((response) => {
        res.send(response);
    }, function(error) {
        console.error(error);
        res.send("A server error occurred");
    });
});

export const testScoringAsync = async (challengeID:string) : Promise<string> => {
    const challengeRef = admin.database().ref('challenges/hourly').child(challengeID);
    const challenge = await challengeRef.once('value');
    if (challenge === null || !challenge.exists()) return "Error: Unrecognized challenge " + challengeID;

    let key: string = "";
    if (challenge.child("goal").val() === "Fish") key = "fishCaught";
    else key = "totalWeight";

    const scoresRef = admin.database().ref('challengesScores/' + challengeID);
    //grab scores
    const scores = await scoresRef.orderByChild(key).once('value');
    if (scores === null || !scores.exists()) {
        await challengeRef.update({
            completed: true
        });
        return "No scores for challenge " + challengeID;
    }
    //grab high score separately
    const highScoreQueryResult = await scoresRef.orderByChild(key).limitToLast(1).once('value');
    if (highScoreQueryResult === null || !highScoreQueryResult.exists() || highScoreQueryResult.numChildren() === 0) return "Unable to read high score for " + challengeID;
    let highScoreValue: number = 0;
    highScoreQueryResult.forEach(snapshot => {
        if (snapshot.exists() && snapshot.child(key).exists()) {
            if (snapshot.child(key).val() > highScoreValue) highScoreValue = snapshot.child(key).val();
        }
    });
    const altHighScoreQueryResult = await scoresRef.orderByChild(key).limitToFirst(1).once('value');
    if (altHighScoreQueryResult === null || !altHighScoreQueryResult.exists() || altHighScoreQueryResult.numChildren() === 0) return "Unable to read high score for " + challengeID;
    let altHighScoreValue: number = 0;
    altHighScoreQueryResult.forEach(snapshot => {
        if (snapshot.exists() && snapshot.child(key).exists()) {
            if (snapshot.child(key).val() > altHighScoreValue) altHighScoreValue = snapshot.child(key).val();
        }
    });
    let trueHighScoreValue:number = 0;
    scores.forEach((entry:admin.database.DataSnapshot) => {
        if (entry.exists() && entry.child(key).exists()) {
            const val = parseFloat(entry.child(key).val());
            console.log(entry.key + ", " + val + ", " + val + " > " + trueHighScoreValue + " = " + (val > trueHighScoreValue));
            if (val > trueHighScoreValue) trueHighScoreValue = val;
        }
    });

    console.log("****************************************");
    console.log("high score value: " + highScoreValue);
    console.log("alt high score value: " + altHighScoreValue);
    console.log("true high score value: " + trueHighScoreValue);

    return "Done: " + highScoreValue + ", " + altHighScoreValue + ", " + trueHighScoreValue;
}
*/

/*
export const DEBUG_scoreChallenges = functions.https.onRequest((req, res) => {
    return scoreCompletedChallengesAsync().then((promise) => {
        res.status(200).send("Success");
    }, function(error) {
        console.error(error);
        res.status(500).send(error);
    });
});
 */