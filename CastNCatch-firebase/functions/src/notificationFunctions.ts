import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import MulticastMessage = admin.messaging.MulticastMessage;
import Notification = admin.messaging.Notification;

export const dismissNotification = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.notificationID) return { error: "Notification ID is required." }

    const userID:string = context.auth.uid;
    const notificationID:string = data.notificationID;

    return dismissNotificationAsync(userID, notificationID).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

/**
 * Dismiss the given notification for the given user
 * @param userID            User who is dismissing the notification
 * @param notificationID    ID of the notification
 */
export const dismissNotificationAsync = async (userID:string, notificationID:string) : Promise<any> => {
    const collectionRef = admin.database().ref('notifications').child(userID);
    const ref = collectionRef.child(notificationID);

    const entry = await ref.once('value');
    if (!entry.exists()) return { error: "Unable to find notification." };

    await ref.remove();

    return { result: "Success" };
};

export const dismissNotifications = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.ids) return { error: "Request missing notification IDs." }

    const userID:string = context.auth.uid;
    const ids:string = data.ids;

    const idArray:Array<string> = JSON.parse(ids);

    return dismissNotificationsAsync(userID, idArray).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

/**
 * Dismiss multiple notifications at once
 * @param userID    User who is dismissing the notifications
 * @param ids       IDs of the notifications to dismiss
 */
export const dismissNotificationsAsync = async (userID:string, ids:Array<string>) : Promise<any> => {
    //start all of the async tasks to dismiss the individual notifications
    const promises:Array<Promise<any>> = new Array<Promise<any>>();
    for (let i = 0; i < ids.length; i++) {
        promises.push(dismissNotificationAsync(userID, ids[i]));
    }
    //wait for all of the async tasks to finish
    await Promise.all(promises);

    return { result: "Success" };
};

/**
 * Save a notification to the database
 * @param userID    ID of the user who will receive the notification
 * @param message   Message body of the notification
 * @param category  Category of the notification
 * @param data      Any supplementary data, such as the database key/ID of a relevant document
 */
export const saveNotificationAsync = async (userID:string, message:string, category:string, data:string) : Promise<void> => {
    await admin.database().ref('notifications').child(userID).push({
        category: category,
        message: message,
        date: new Date().toISOString(),
        dismissed: false,
        data: data
    });

    await sendCloudMessageAsync(userID, message, category, data);
}

/**
 * Send a cloud message (push notification) to the given user, if they are registered for cloud messaging
 * @param userID    ID of the user the message is for
 * @param message   The message body
 * @param category  Notification category
 * @param data      Supplementary data
 */
export const sendCloudMessageAsync = async (userID:string, message:string, category:string, data:string) : Promise<void> => {
    //try to get the user's FCM registration token from the database, if it exists
    const fcmRegTokens = await admin.database().ref('fcmRegistrationTokens').child(userID).once('value');
    if (fcmRegTokens && fcmRegTokens.exists()) {
        const tokens:Array<string> = fcmRegTokens.val();
        //we found registration tokens; send message to each device registered to this user
        if (tokens && tokens.length > 0) {
            const notification:Notification = {
                body: message
            }

            const cloudMessage:MulticastMessage = {
                tokens: tokens,
                notification: notification,
                data: {
                    category: category,
                    data: data
                }
            }

            await admin.messaging().sendMulticast(cloudMessage);
        }
    }
}

/**
 * Set a Firebase Cloud Messaging (FCM) registration token for the user. The registration token is used to send messages
 * to this specific user's devices. We support multiple registration tokens per user, in case they play on multiple
 * devices.
 */
export const setFCMRegistrationToken = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated
    if (!data.token) return { error: "Registration token missing from request." }

    const userID:string = context.auth.uid;
    const token:string = data.token;

    return saveFCMRegistrationTokenAsync(userID, token).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

/**
 * Add the given FCM registration token to the given user's list of tokens, if it is not already present.
 * @param userID
 * @param token
 */
export const saveFCMRegistrationTokenAsync = async (userID:string, token:string) : Promise<any> => {
    const ref = admin.database().ref('fcmRegistrationTokens').child(userID);
    const snapshot = await ref.once('value');
    let tokens:Array<string>;
    if (snapshot && snapshot.exists()) {
        tokens = snapshot.val();
    } else {
        tokens = new Array<string>();
    }

    if (tokens.includes(token)) {
        return { result: "FCM reg. token already exists" };
    } else {
        tokens.push(token);
        //if user has more than 5 FCM tokens saved, discard oldest
        while (tokens.length > 5) {
            tokens.splice(0, 1);
        }
        await ref.set(tokens);
        return { result: "FCM reg. token saved" }
    }

}