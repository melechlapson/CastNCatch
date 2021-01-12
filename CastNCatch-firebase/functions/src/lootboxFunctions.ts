import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const openLootBox = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const userID:string = context.auth.uid;

    return openLootBoxAsync(userID).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const openLootBoxAsync = async (userID:string) : Promise<any> => {
    const user = await getUserAsync(userID);
    if (user === null || !user.exists()) return { error: "Invalid user ID." };

    //make sure user has at least one loot box
    let count:number = 0;
    if (user.child("lootBoxes").exists()) count = user.child("lootBoxes").val();
    if (count <= 0) return { error: "You don't have any loot boxes." };

    const unlocks:Set<string> = new Set<string>();

    const unlocksRef = admin.database().ref('userItemUnlocks').child(userID);

    //get list of items the user has already unlocked
    const unlocksSnapshot = await unlocksRef.once('value');
    if (unlocksSnapshot !== null && unlocksSnapshot.exists()) {
        unlocksSnapshot.forEach((child) => {
            if (child.key) unlocks.add(child.key);
        });
    }

    //cross-reference full list of items to build list of all items that the user owns
    //TODO:    this is inefficient because it pulls all item data from the database. We only need the keys, but I
    //TODO:    don't think there's a way to pull just the keys
    const options:Array<string> = new Array<string>();
    const itemsSnapshot = await admin.database().ref("items").once('value');
    itemsSnapshot.forEach((child) => {
        child.forEach((item) => {
            if (item.key && !unlocks.has(item.key)) {
                options.push(item.key);
            }
        })
    });

    if (options.length === 0) return { error: "You already own all of the gear!" }

    //pick a random new item from the list of items the player doesn't own yet
    const newItem:string = options[Math.floor(Math.random() * options.length)];
    count--;

    //mark item as unlocked in DB
    await unlocksRef.child(newItem).set({
        isEquipped: false
    });

    //update loot box count in DB
    await admin.database().ref('users').child(userID).update( { lootBoxes: count});

    return {
        item: newItem,
        lootBoxes: count
    }
};

export const getUserAsync = async (userID:string) : Promise<admin.database.DataSnapshot> => {
    const ref = admin.database().ref('users').child(userID);
    const user = await ref.once('value');
    return user;
};

export const buyLootBox = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const userID:string = context.auth.uid;

    return buyLootBoxAsync(userID).then((response) => {
        return JSON.stringify(response);
    }, function(error: any) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

const lootBoxPrice:number = 100;

export const buyLootBoxAsync = async (userID:string) : Promise<any> => {
    const user = await getUserAsync(userID);
    if (user === null || !user.exists()) return { error: "Invalid user ID." };

    let count:number = 0;
    if (user.child("lootBoxes").exists()) count = user.child("lootBoxes").val();

    //make sure we have enough coins, then subtract price of lootbox
    let coins:number = 0;
    if (user.child("coins").exists()) coins = user.child("coins").val();
    if (coins < lootBoxPrice) return { error: "You don't have enough coins." };
    coins -= lootBoxPrice;

    //add new lootbox
    count++;

    //update DB
    const obj = {
        lootBoxes: count,
        coins: coins
    };
    await admin.database().ref('users').child(userID).update(
        obj
    );

    return obj;
};