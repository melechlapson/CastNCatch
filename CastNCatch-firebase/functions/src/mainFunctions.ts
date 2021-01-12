//NOTE: we are using both Firebase Database solutions (Realtime Database and Cloud Firestore). The code in this file
//can be confusing because the databases have different APIs. Make sure you understand which database any given block
//of code is working with and how to use that database.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Log in and obtain a custom token
 */
export const getToken = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const uid:string = context.auth.uid;

    return admin.auth().createCustomToken(uid)
        .then(function(customToken:string) {
            return customToken;
        })
        .catch(function(error) {
            console.log('Error creating custom token:', error);
            return { error: "A server error occurred."};
        });
});

export const getRankString = (rank:number):string => {
    const lastDigit:number = rank % 10;
    if (lastDigit === 3) return rank + "rd";
    else if (lastDigit === 2) return rank + "nd";
    else if (lastDigit === 1) return rank + "st";
    else return rank + "th";
}

export const addCoinsAsync = async(userID:string, value:number) : Promise<boolean> => {
    const coinsRef = await admin.database().ref('users').child(userID).child('coins');

    await coinsRef.transaction((data) => {
        let coins:number = (data ? data : 0);
        coins += value;
        if (isNaN(coins) || coins < 0) {
            console.error('Tried to write negative or NaN coins to ' + userID);
            console.log("added coins: " + value + ", total: " + coins);
            coins = 0;
        }
        return coins;
    });

    return true;
}

export const getDisplayNameAsync = async(userID:string) : Promise<string> => {
    const displayNameSnapshot = await admin.database().ref('users').child(userID).child('displayName').once('value');
    const displayName = displayNameSnapshot.exists() ? displayNameSnapshot.val() : "Player";
    return displayName;
}

export const gimmeCoins = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const userID:string = context.auth.uid;

    if (!userID.startsWith("j2yDPX")) return "You're not allowed to do this!"; //only allow kevin's test account to do this

    return addCoinsAsync(userID, 111).then((result) => {
        return "Coins added!";
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });

});