import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {sendCloudMessageAsync} from "./notificationFunctions";

export const searchUsers = functions.https.onCall((data, context) => {
    if (!context.auth) return "Unauthorized."; //no user ID or not authenticated
    if (!data.search) return "Search string is required.";

    const userID:string = context.auth.uid;
    const search:string = data.search;

    return searchUsersAsync(userID, search).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return "A server error occurred.";
    });
});

export const searchUsersAsync = async (userID:string, search:string) : Promise<admin.database.DataSnapshot> => {
    const collectionRef = admin.database().ref('users');
    const searchLower = search.toLowerCase();
    const result = await collectionRef.orderByChild("searchName").startAt(searchLower).endAt(searchLower + "z").once('value');
    return result;
};


export const sendFriendRequest = functions.https.onCall((data, context) => {
    if (!context.auth) return "Unauthorized."; //no user ID or not authenticated
    if (!data.recipientID) return "Recipient ID is required.";

    const userID:string = context.auth.uid;
    const recipientID:string = data.recipientID;

    return createFriendRequestAsync(userID, recipientID).then((response) => {
        return response;
    }, function(error) {
        console.error(error);
        return "A server error occurred.";
    });
});

export const createFriendRequestAsync = async (userID:string, recipientID:string) : Promise<string> => {
    const collectionRef = admin.database().ref('friendRequests');
    const ref = collectionRef.child(recipientID).child(userID);
    const value = await ref.once('value');

    const sender = await admin.database().ref("users").child(userID).once('value');
    if (!sender.exists()) return "Unrecognized user.";

    //reject if we already have a pending request for this user
    if (value.exists()) {
        const dismissed:boolean = value.child("dismissed").val();
        if (!dismissed) return "You already have a pending friend request for this user.";
    }

    const displayName:string = sender.child("displayName").val();

    //note we add a senderName field here so we can display that in a "pending friend requests" list in the app without
    // having to perform separate queries to get the user names of each person who has sent us a request
    await ref.set({
        senderName: displayName,
        dismissed: false,
        date: new Date().toISOString()
    });

    await sendCloudMessageAsync(recipientID, "You received a friend request from " + displayName, "friendRequests", userID);

    return "Request sent.";
};

export const acceptFriendRequest = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.senderID) return { error: "Sender ID is required." }

    const userID:string = context.auth.uid;
    const senderID:string = data.senderID;

    return acceptFriendRequestAsync(userID, senderID).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const acceptFriendRequestAsync = async (userID:string, senderID:string) : Promise<any> => {
    const collectionRef = admin.database().ref('friendRequests');
    const ref = collectionRef.child(userID).child(senderID);

    //find the pending request that we're accepting
    const entry = await ref.once('value');
    if (!entry.exists()) return { error: "Unable to find friend request" };

    //make User a friend of Sender, and Sender a friend of User
    await addFriend(userID, senderID);
    await addFriend(senderID, userID);

    await ref.update({
        dismissed: true
    });

    return { result: "Success" };
};

/**
 * Add the second user to the friend list of the first user
 * @param userID    User who's friend list we're adding to
 * @param friendID  User who will be added to the friend list
 */
export const addFriend = async (userID:string, friendID:string) : Promise<boolean> => {
    const collectionRef = admin.database().ref('friends');
    const ref = collectionRef.child(userID);

    //get the array containing the user's current list of friends
    const friends = await ref.once('value');
    let array:Array<string> = [];
    if (friends.exists()) array = friends.val();
    if (!array) array = [];
    //add the new friend if not already in the array
    if (!array.includes(friendID)) {
        array.push(friendID);
        await ref.set(array);
        return true;
    }
    //return false if the friend was already in our friend list
    return false;
}

export const dismissFriendRequest = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.senderID) return { error: "Sender ID is required." }

    const userID:string = context.auth.uid;
    const senderID:string = data.senderID;

    return dismissFriendRequestAsync(userID, senderID).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const dismissFriendRequestAsync = async (userID:string, senderID:string) : Promise<any> => {
    const collectionRef = admin.database().ref('friendRequests');
    const ref = collectionRef.child(userID).child(senderID);

    const entry = await ref.once('value');
    if (!entry.exists()) return { error: "Unable to find friend request." };

    await ref.update({
        dismissed: true
    });

    return { result: "Success" };
};