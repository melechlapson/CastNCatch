import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {addCoinsAsync, getDisplayNameAsync} from "./mainFunctions";
import {saveNotificationAsync} from "./notificationFunctions";

const db = admin.firestore();

class FriendChallenge {
    key : string;
    data: admin.firestore.DocumentData;
    constructor(key:string, data: admin.firestore.DocumentData) {
        this.key = key;
        this.data = data;
    }
};

class FriendChallengeScore {
    playerID:string;
    playerName:string;
    fishCaught:number;
    totalWeight:number;
    date:string;

    constructor(playerID:string, playerName:string, fishCaught:number, totalWeight:number, date:string) {
        this.playerID = playerID;
        this.playerName = playerName;
        this.fishCaught = fishCaught;
        this.totalWeight = totalWeight;
        this.date = date;
    }
}

export const sendFriendChallenge = functions.https.onCall((data, context) => {
    if (!context.auth) return "Error: Unauthorized."; //no user ID or not authenticated
    if (!data.wager) return "Error: Challenge must include a wager.";

    const userID:string = context.auth.uid;
    const friendID:string = data.friendID;
    const wager:number = parseInt(data.wager);

    return newCreateFriendChallengeAsync(userID, friendID, wager).then((result) => {
        return result;
    }, function(error) { //something went wrong when creating a new friend challenge
        console.error(error);
        return { error: "A server error occurred."};
    });
});

/**
 * Create a new friend challenge with randomized parameters
 */
//TODO: eventually let user who created the challenge choose parameters?
export const newCreateFriendChallengeAsync = async (userID:string, friendID:string, wager:number) : Promise<string> => {
    //don't let user create a new challenge if there is already an active challenge
    const existing = await getFriendChallengeAsync(userID, friendID);
    if (!existing.empty) {
        return "Error: You already have an active challenge pending for this friend.";
    }

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
    const goals : Array<string> = ["Fish", "Weight" /*, "FishAndWeight" */];
    index = Math.floor(Math.random() * goals.length);
    const goal : string = goals[index];

    //write new challenge to DB
    const newDoc = await db.collection("friendChallenges").add(
        {
            challenger: userID,
            recipient: friendID,
            duration: 2 * 60, //gameplay duration in seconds
            startDate: new Date().toISOString(),
            location: location,
            goal: goal,
            wager: wager, //coins awarded to first place,
            accepted: false,
            completed: false,
            scores: []
        }
    );

    //create notification
    const displayName = await getDisplayNameAsync(userID);
    const category:string = "challengeRequests";
    const message:string = "You received a challenge from " + displayName;
    await saveNotificationAsync(friendID, message, category, newDoc.id);

    return "Challenge request sent.";
};

/**
 * Challenge a friend
 */
    //TODO: remove this function shortly after wager is removed from game
export const challengeFriend = functions.https.onCall((data, context) => {
        if (!context.auth) return "Error: Unauthorized."; //no user ID or not authenticated
        if (!data.wager) return "Error: Challenge must include a wager.";

        const userID:string = context.auth.uid;
        const friendID:string = data.friendID;
        const wager:number = parseInt(data.wager);

        return createFriendChallengeAsync(userID, friendID, wager).then((result) => {
            return result;
        }, function(error) { //something went wrong when creating a new friend challenge
            console.error(error);
            return { error: "A server error occurred."};
        });
    });

/**
 * Create a new friend challenge with randomized parameters
 */
//TODO: eventually let user who created the challenge choose parameters?
export const createFriendChallengeAsync = async (userID:string, friendID:string, wager:number) : Promise<string> => {

    //don't let user create a new challenge if there is already an active challenge
    const existing = await getFriendChallengeAsync(userID, friendID);
    if (!existing.empty) {
        return "Error: You already have an active challenge pending for this friend.";
    }

    //deduct the wager from our coin balance; winner will get back 2x the wager
    const coinsRef = await admin.database().ref('users').child(userID).child('coins');
    const coinsSnapshot = await coinsRef.once('value');
    let coins:number = (coinsSnapshot.exists() ? coinsSnapshot.val() : 0);
    if (coins < wager) return "You don't have enough coins to make this wager.";
    coins -=  wager;
    await coinsRef.set(coins);


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
    const goals : Array<string> = ["Fish", "Weight" /*, "FishAndWeight" */];
    index = Math.floor(Math.random() * goals.length);
    const goal : string = goals[index];

    //write new challenge to DB
    const newDoc = await db.collection("friendChallenges").add(
        {
            challenger: userID,
            recipient: friendID,
            duration: 3 * 60, //gameplay duration in seconds
            startDate: new Date().toISOString(),
            location: location,
            goal: goal,
            wager: wager, //coins awarded to first place,
            accepted: false,
            completed: false,
            scores: []
        }
    );

    //create notification
    const displayName = await getDisplayNameAsync(userID);
    const category:string = "challengeRequests";
    const message:string = "You received a challenge from " + displayName;
    await saveNotificationAsync(friendID, message, category, newDoc.id);

    return "Challenge request sent.";
};

export const getFriendChallengeAsync = async (userID:string, friendID:string) : Promise<admin.firestore.QuerySnapshot> => {
    const collectionRef = db.collection('friendChallenges');

    //get challenges from database. make sure these fields are indexed or this query ends up taking forever
    const createdChallenges = await collectionRef
        .where('challenger', '==', userID)
        .where('recipient', '==', friendID)
        .where('completed', '==', false)
        .get();

    return createdChallenges;
};



export const acceptFriendChallenge = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.challengeID) return { error: "Challenge ID is required." };

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;

    return acceptFriendChallengesAsync(userID, challengeID, true).then((result) => {
        return JSON.stringify(result);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const sendAcceptFriendChallenge = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.challengeID) return { error: "Challenge ID is required." };

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;

    return acceptFriendChallengesAsync(userID, challengeID, false).then((result) => {
        return JSON.stringify(result);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const acceptFriendChallengesAsync = async (userID:string, challengeID:string, deduct:boolean) : Promise<any> => {
    const collectionRef = db.collection('friendChallenges');
    const doc = await collectionRef.doc(challengeID).get();
    if (!doc.exists) return { error: "Invalid challenge ID."};
    const data = doc.data();
    if (!data) return { error: "Invalid or empty document."};
    if (data.recipient !== userID) return { error: "You are not the intended recipient of this challenge."};

    const wager:number = data.wager;

    if (deduct) {
        //deduct the wager from our coin balance; winner will get back 2x the wager
        const coinsChanged = await addCoinsAsync(userID, -wager);
        if (!coinsChanged) return { error: "You don't have enough coins to match the wager." };
    }

    await doc.ref.update({
        accepted: true
    });

    //create notification
    const challengerID:string = data.challenger;
    const displayName:string = await getDisplayNameAsync(userID);
    const category:string = "challengeRequests";
    const message:string = displayName + " accepted your challenge!";
    await saveNotificationAsync(challengerID, message, category, challengeID);

    return { result: "Success" };
}

export const declineFriendChallenge = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.challengeID) return { error: "Challenge ID is required." };

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;

    return declineFriendChallengesAsync(userID, challengeID, true).then((result) => {
        return JSON.stringify(result);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const sendDeclineFriendChallenge = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.challengeID) return { error: "Challenge ID is required." };

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;

    return declineFriendChallengesAsync(userID, challengeID, false).then((result) => {
        return JSON.stringify(result);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const declineFriendChallengesAsync = async (userID:string, challengeID:string, deduct: boolean) : Promise<any> => {
    const collectionRef = db.collection('friendChallenges');
    const doc = await collectionRef.doc(challengeID).get();
    if (!doc.exists) return { error: "Invalid challenge ID."};
    const data = doc.data();
    if (!data) return { error: "Invalid or empty document."};
    if (data.recipient !== userID) return { error: "You are not the intended recipient of this challenge."};

    const challengerID:string = data.challenger;
    const wager:number = data.wager;

    if (deduct) {
        //restore the wager to the challenger's coin balance
        await addCoinsAsync(challengerID, wager);
    }

    //delete the challenge since it was rejected
    await doc.ref.delete();

    //notify challenger that the challenge was declined
    const displayName:string = await getDisplayNameAsync(userID);
    await saveNotificationAsync(challengerID, displayName + " declined your challenge.", "challengeRequests", "");

    return { result: "Success" };
}

export const getFriendChallenge = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.challengeID) return { error: "Challenge ID is required." };

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;

    return getFriendChallengeByIDAsync(userID, challengeID).then((snapshot) => {
        return JSON.stringify(snapshot);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const getFriendChallengeByIDAsync = async (userID:string, challengeID:string) : Promise<any> => {
    const docRef = db.collection('friendChallenges').doc(challengeID);
    const doc = await docRef.get();
    if (!doc.exists) return { error: "Invalid challenge ID." };

    const data = doc.data();
    if (!data) return { error: "Invalid challenge data."};
    if (data.challenger !== userID && data.recipient !== userID) return { error: "You don't have permission to view this challenge." };

    return data;
};

/**
 * Get a list of active friend challenges involving the current user, organized by category and sorted by end date
 */
export const getFriendChallenges = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const userID:string = context.auth.uid;

    return getFriendChallengesAsync(userID).then((map) => {
        const resultObject = {
            "created" : map.get("created"),
            "received" : map.get("received"),
        }
        return JSON.stringify(resultObject);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const getFriendChallengesAsync = async (userID:string) : Promise<Map<string, FriendChallenge[]>> => {
    const collectionRef = db.collection('friendChallenges');

    //get challenges from database
    const createdChallenges = await collectionRef
        .where('challenger', '==', userID)
        .where('completed', '==', false)
        .get();
    const receivedChallenges = await collectionRef
        .where('recipient', '==', userID)
        .where('completed', '==', false)
        .get();

    //put challenges into a map
    const map :Map<string, FriendChallenge[]> = new Map<string, FriendChallenge[]>();
    //convert challenge documents into array of FriendChallenges
    map.set("created", createdChallenges.docs.map(doc => new FriendChallenge(doc.id, doc.data())));
    map.set("received", receivedChallenges.docs.map(doc => new FriendChallenge(doc.id, doc.data())));

    //final result looks like this:
    //{
    //  "created": {
    //      [
    //          {
    //              "key": "abc123",
    //              "data": {
    //                  "completed": false,
    //                  "duration": 180,
    //                  "location": 17,
    //                  ...
    //              },
    //          },
    //          {
    //              "key": "def456",
    //              "data": {
    //                  ...
    //              }
    //          }
    //      ]
    //  },
    //  "received": {
    //      ...
    //  }
    //}

    return map;
};

/**
 * Submit score for a friend challenge. Returns a user-friendly string describing the result of the operation.
 */
export const submitFriendChallengeScore = functions.https.onCall((data, context) => {
    if (!context.auth) return "Error: Unauthorized"; //no user ID or not authenticated

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;
    const fishCaught:number = data.fishCaught;
    const totalWeight:number = data.totalWeight;

    return saveFriendChallengeScoreAsync(userID, challengeID, fishCaught, totalWeight, true).then((response) => {
        return response;
    }, function(error) {
        console.error(error);
        return "A server error occurred";
    });
});

/**
 * Submit score for a friend challenge. Returns a user-friendly string describing the result of the operation.
 */
export const sendFriendChallengeScore = functions.https.onCall((data, context) => {
    if (!context.auth) return "Error: Unauthorized"; //no user ID or not authenticated

    const userID:string = context.auth.uid;
    const challengeID:string = data.challengeID;
    const fishCaught:number = data.fishCaught;
    const totalWeight:number = data.totalWeight;

    return saveFriendChallengeScoreAsync(userID, challengeID, fishCaught, totalWeight, false).then((response) => {
        return response;
    }, function(error) {
        console.error(error);
        return "A server error occurred";
    });
});

export const saveFriendChallengeScoreAsync = async (userID:string, challengeID:string, fishCaught:number, totalWeight:number, deduct: boolean) : Promise<string> => {
    //get challenge from database
    const docRef = db.collection('friendChallenges').doc(challengeID);
    const challenge = await docRef.get();
    if (!challenge || !challenge.exists) return "Error: Unrecognized challenge.";

    const data = challenge.data();
    if (!data) return "Error: Invalid challenge data.";
    if (!data.accepted) return "Error: this challenge has not been accepted";
    const scores:Array<FriendChallengeScore> = data.scores;

    //retrieve existing score, if any
    const existingScore = scores.find((element) => {
        return element.playerID === userID;
    });
    if (existingScore) {
        return "Error: You have already submitted a score for this challenge.";
    }

    //retrieve user from DB
    const user = await admin.database().ref('users').child(userID).once('value');
    if (user === null || !user.exists() || !user.key) return "Error: Unrecognized user.";

    //update score in DB
    const score = {
        playerID: user.key,
        playerName: user.child("displayName").val(),
        fishCaught: fishCaught,
        totalWeight: totalWeight,
        date: new Date().toISOString(),
    };

    scores.push( new FriendChallengeScore(user.key, user.child("displayName").val(), fishCaught,
        totalWeight, new Date().toISOString()));

    await docRef.update({
        scores: admin.firestore.FieldValue.arrayUnion(score),
        completed: scores.length === 2
    });

    await scoreCompletedFriendChallengeAsync(challenge, scores, deduct);

    return "Score saved";
};

export const scoreCompletedFriendChallengeAsync = async (challenge:DocumentSnapshot,
                                                         scores:Array<FriendChallengeScore>, deduct: boolean) : Promise<void> =>
{
    const data = challenge.data();

    if (!data || scores.length < 2) return;

    const wager:number = data.wager;

    let score1:number = 0;
    let score2:number = 0;
    let winnerID:string = "";
    let loserID:string = "";
    if (data.goal === "Fish") {
        score1 = scores[0].fishCaught;
        score2 = scores[1].fishCaught;
    } else {
        score1 = scores[0].totalWeight;
        score2 = scores[1].totalWeight;
    }
    if (score1 > score2) {
        winnerID = scores[0].playerID;
        loserID = scores[1].playerID;
    } else if (score2 > score1) {
        winnerID = scores[1].playerID;
        loserID = scores[0].playerID;
    } else {
        const message:string = "Friend challenge was a draw!";
        const category:string = "friendChallengeResults";
        if (deduct === true) {
            await addCoinsAsync(scores[0].playerID, wager);
            await addCoinsAsync(scores[1].playerID, wager);
        }
        await saveNotificationAsync(scores[0].playerID, message, category, challenge.id);
        await saveNotificationAsync(scores[1].playerID, message, category, challenge.id);
        return;
    }

    await addCoinsAsync(winnerID, wager);
    await saveNotificationAsync(winnerID, "You won the friend challenge and received " + wager + " coins.", "friendChallengeResults", challenge.id);

    await saveNotificationAsync(loserID, "You lost the friend challenge and received no coins.", "friendChallengeResults", challenge.id);
}